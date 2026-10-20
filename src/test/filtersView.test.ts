import * as assert from 'assert';
import * as vscode from 'vscode';
import { FiltersView, FilterNode } from '../filtersView';
import { SearchFilter, combineFilters, filterKey, splitPatterns } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

function filter(name: string, include = 'src/**/*', exclude = ''): SearchFilter {
	return { name, include, exclude, scope: 'global' };
}

function leaves(panel: FiltersView): Extract<FilterNode, { kind: 'filter' }>[] {
	return panel.getChildren().flatMap(node => panel.getChildren(node)).filter((node): node is Extract<FilterNode, { kind: 'filter' }> => node.kind === 'filter');
}

async function withPanel(options: Parameters<typeof createExtensionFixture>[0], run: (fixture: ReturnType<typeof createExtensionFixture>, panel: FiltersView) => Promise<void>) {
	const fixture = createExtensionFixture(options);
	const Panel = fixture.load<typeof import('../filtersView')>('filtersView').FiltersView;
	const panel = new Panel(fixture.context);
	fixture.context.subscriptions.push(panel);
	try { await panel.refresh(); await run(fixture, panel); } finally { fixture.dispose(); }
}

function refreshed(panel: FiltersView, trigger: () => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { subscription.dispose(); reject(new Error('Panel did not refresh')); }, 1500);
		const subscription = panel.onDidChangeTreeData(() => {
			clearTimeout(timer); subscription.dispose(); resolve();
		});
		trigger();
	});
}

suite('Combining filter rules', () => {
	test('preserves OR semantics when rooted and plain global includes are combined', () => {
		const fixture = createExtensionFixture();
		const result = fixture.load<typeof import('../model/searchPatterns')>('model/searchPatterns')
			.combineForSearch([filter('rooted', './src/**/*'), filter('typescript', '**/*.ts')]);
		assert.strictEqual(result.include, './src/**/*,./**/*.ts');
		fixture.dispose();
	});

	test('reports global include/exclude overlaps after qualifying multi-root includes', () => {
		const fixture = createExtensionFixture({ extraWorkspaceFolderNames: ['other'] });
		const result = fixture.load<typeof import('../model/searchPatterns')>('model/searchPatterns')
			.combineForSearch([filter('typescript', '**/*.ts', '**/*.ts')]);
		assert.deepStrictEqual(result.conflicts, ['./fixture/**/*.ts', './other/**/*.ts']);
		assert.strictEqual(result.exclude, '**/*.ts');
		fixture.dispose();
	});

	test('splits only top-level commas and preserves nested braces and character classes', () => {
		assert.deepStrictEqual(splitPatterns('**/*.{ts,js}, {src,{lib,test}}/**, file[,]name, src/[[]id[]]/**, ,'), [
			'**/*.{ts,js}', '{src,{lib,test}}/**', 'file[,]name', 'src/[[]id[]]/**'
		]);
	});

	test('merges includes and excludes independently without mutating filters', () => {
		const input = [filter('a', 'src/**, **/*.{ts,js}', 'dist/**'), filter('b', 'src/**,test/**', 'dist/**,**/*.log')];
		const before = JSON.stringify(input);
		assert.deepStrictEqual(combineFilters(input), {
			name: 'Selected filters', scope: 'global', include: 'src/**,**/*.{ts,js},test/**', exclude: 'dist/**,**/*.log', conflicts: []
		});
		assert.strictEqual(JSON.stringify(input), before);
	});

	test('exclusion-only rules do not broaden includes and disabled rules are ignored', () => {
		const result = combineFilters([filter('source'), filter('exclude', '', '**/node_modules/**'), { ...filter('disabled', '**/*'), enabled: false }]);
		assert.strictEqual(result.include, 'src/**/*');
		assert.strictEqual(result.exclude, '**/node_modules/**');
	});

	test('keeps overlapping rules in both lists and reports the conflict', () => {
		const result = combineFilters([filter('include', 'src/**'), filter('exclude', '', 'src/**')]);
		assert.strictEqual(result.include, 'src/**');
		assert.strictEqual(result.exclude, 'src/**');
		assert.deepStrictEqual(result.conflicts, ['src/**']);
		assert.strictEqual(combineFilters([]).include, '');
		assert.strictEqual(combineFilters([]).exclude, '');
	});
});

suite('Persistent Filters panel', () => {
	test('edits a checked project filter from the panel and retains its scope when searching', async () => {
		await withPanel({ workspaceFilters: [filter('project')], extraWorkspaceFolderNames: ['other'] }, async (fixture, panel) => {
			await panel.setChecked([[leaves(panel)[0], vscode.TreeItemCheckboxState.Checked]]);
			fixture.picks.push('name', 'save');
			fixture.inputs.push('renamed');
			await fixture.runCommand('editPanelFilter', leaves(panel)[0]);
			const renamed = leaves(panel)[0];
			assert.strictEqual(renamed.filter.name, 'renamed');
			assert.strictEqual(panel.getTreeItem(renamed).checkboxState, vscode.TreeItemCheckboxState.Checked);
			fixture.picks.push('include', 'saveAndSearch');
			fixture.inputs.push('lib/**/*');
			await fixture.runCommand('editPanelFilter', renamed);
			assert.strictEqual((fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude, './fixture/lib/**/*');
		});
	});

	test('checkboxes persist independently and only Apply invokes search', async () => {
		await withPanel({ settings: { globalFilters: [filter('source'), filter('logs', '', '**/*.log')] } }, async (fixture, panel) => {
			const nodes = leaves(panel);
			fixture.checkboxChange.fire({ items: nodes.map(node => [node, vscode.TreeItemCheckboxState.Checked]) });
			await panel.refresh();
			assert.ok(nodes.every(node => panel.getTreeItem(node).checkboxState === vscode.TreeItemCheckboxState.Checked));
			assert.strictEqual((fixture.workspaceState.get('selectedFilterKeys') as string[]).length, 2);
			assert.deepStrictEqual(fixture.updates, []);
			assert.deepStrictEqual(fixture.workspaceWrites, []);
			assert.strictEqual(fixture.executed.length, 0);
			await fixture.runCommand('applySelectedFilters');
			assert.deepStrictEqual(fixture.executed, [{ command: 'workbench.action.findInFiles', args: [{
				filesToInclude: 'src/**/*', filesToExclude: '**/*.log', triggerSearch: true, showIncludesExcludes: true
			}] }]);
			await fixture.runCommand('showFilters');
			assert.strictEqual(fixture.executed.at(-1)!.command, 'custom-search-filters.filters.focus');
		});
	});

	test('restores checked filters on activation without changing search or enabled states', async () => {
		const active = filter('same');
		const hidden = filter('hidden');
		await withPanel({
			settings: { globalFilters: [active, hidden], globalFiltersEnabled: { hidden: false } },
			workspaceState: { selectedFilterKeys: [filterKey(active), filterKey(hidden), 'missing'] }
		}, async (fixture, panel) => {
			const [shown, disabled] = leaves(panel);
			assert.strictEqual(panel.getTreeItem(shown).checkboxState, vscode.TreeItemCheckboxState.Checked);
			assert.strictEqual(panel.getTreeItem(disabled).checkboxState, undefined);
			assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), [filterKey(active)]);
			assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { hidden: false });
			assert.strictEqual(fixture.executed.length, 0);
		});
	});

	test('clear selection waits for Apply before clearing the search path fields', async () => {
		await withPanel({ settings: { globalFilters: [filter('source')] } }, async (fixture, panel) => {
			await panel.setChecked([[leaves(panel)[0], vscode.TreeItemCheckboxState.Checked]]);
			await fixture.runCommand('clearFilterSelection');
			assert.strictEqual(fixture.executed.length, 0);
			await panel.apply();
			assert.deepStrictEqual(fixture.executed[0].args, [{ filesToInclude: '', filesToExclude: '', triggerSearch: true, showIncludesExcludes: true }]);
		});
	});

	test('distinguishes names across scopes and workspace roots, resolving paths when applying', async () => {
		await withPanel({
			settings: { globalFilters: [filter('same', '**/*.ts')] }, workspaceFilters: [filter('same')],
			extraWorkspaceFolderNames: ['other'], extraWorkspaceFilters: [filter('same', 'lib/**/*')]
		}, async (fixture, panel) => {
			const nodes = leaves(panel);
			assert.strictEqual(new Set(nodes.map(node => panel.getTreeItem(node).id)).size, 3);
			await panel.setChecked(nodes.map(node => [node, vscode.TreeItemCheckboxState.Checked]));
			await panel.apply();
			assert.strictEqual((fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude, './fixture/**/*.ts,./other/**/*.ts,./fixture/src/**/*,./other/lib/**/*');
			assert.deepStrictEqual(fixture.workspaceWrites, []);
		});
	});

	test('retains a selection on rename, then removes disabled and deleted selections', async () => {
		await withPanel({ settings: { globalFilters: [filter('first'), filter('second')] } }, async (fixture, panel) => {
			await panel.setChecked(leaves(panel).map(node => [node, vscode.TreeItemCheckboxState.Checked]));
			const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
			await repository.saveFilter(filter('renamed'), undefined, 'first');
			await panel.refresh();
			assert.strictEqual(panel.getTreeItem(leaves(panel)[0]).checkboxState, vscode.TreeItemCheckboxState.Checked);
			assert.ok((fixture.workspaceState.get('selectedFilterKeys') as string[]).includes(filterKey(filter('renamed'))));
			await repository.saveFilter({ ...filter('renamed'), enabled: false });
			await repository.deleteFilter(filter('second'));
			await panel.refresh();
			assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), []);
		});
	});

	test('updates on external settings and workspace file changes', async () => {
		await withPanel({ settings: { globalFilters: [filter('global')] }, workspaceFilters: [filter('project')] }, async (fixture, panel) => {
			await panel.setChecked(leaves(panel).map(node => [node, vscode.TreeItemCheckboxState.Checked]));
			fixture.settings.set('globalFilters', [filter('global', 'changed/**/*')]);
			await refreshed(panel, () => fixture.configurationChange.fire({ affectsConfiguration: section => section === 'custom-search-filters' }));
			assert.strictEqual(leaves(panel)[0].filter.include, 'changed/**/*');
			fixture.workspaceData.set(fixture.folder.uri.toString(), []);
			await refreshed(panel, () => fixture.watchers[0].change.fire(vscode.Uri.joinPath(fixture.folder.uri, '.vscode/custom-search-filters.json')));
			assert.deepStrictEqual(leaves(panel).map(node => node.filter.name), ['global']);
			assert.strictEqual((fixture.workspaceState.get('selectedFilterKeys') as string[]).length, 1);
		});
	});

	test('removes selections for closed roots and replaces file watchers', async () => {
		await withPanel({ workspaceFilters: [filter('local')], extraWorkspaceFolderNames: ['other'], extraWorkspaceFilters: [filter('other')] }, async (fixture, panel) => {
			await panel.setChecked(leaves(panel).map(node => [node, vscode.TreeItemCheckboxState.Checked]));
			const removed = fixture.workspaceFolders.splice(1, 1);
			await refreshed(panel, () => fixture.workspaceChange.fire({ added: [], removed }));
			assert.deepStrictEqual(leaves(panel).map(node => node.filter.name), ['local']);
			assert.ok(fixture.watchers[0].disposed && fixture.watchers[1].disposed);
			assert.strictEqual((fixture.workspaceState.get('selectedFilterKeys') as string[]).length, 1);
		});
	});

	test('serializes rapid changes and shows include/exclude overlap in the preview', async () => {
		await withPanel({ settings: { globalFilters: [filter('source'), filter('exclude', '', 'src/**/*')] } }, async (fixture, panel) => {
			const nodes = leaves(panel);
			await Promise.all(nodes.map(node => panel.setChecked([[node, vscode.TreeItemCheckboxState.Checked]])));
			const warning = panel.getChildren().find(node => node.kind === 'preview' && node.warning);
			assert.ok(warning);
			assert.strictEqual((fixture.workspaceState.get('selectedFilterKeys') as string[]).length, 2);
			await panel.apply();
			const args = fixture.executed[0].args[0] as { filesToInclude: string; filesToExclude: string };
			assert.strictEqual(args.filesToInclude, 'src/**/*');
			assert.strictEqual(args.filesToExclude, 'src/**/*');
		});
	});
});
