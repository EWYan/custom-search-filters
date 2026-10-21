import * as assert from 'assert';
import * as vscode from 'vscode';
import type { FilterNode, FiltersView } from '../filtersView';
import { ALL_WORKSPACE_FILES } from '../model/builtinFilters';
import { SearchFilter, filterKey, isBuiltinFilter } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

type Fixture = ReturnType<typeof createExtensionFixture>;
type Options = Parameters<typeof createExtensionFixture>[0];

async function withExtension(options: Options, run: (fixture: Fixture, panel: FiltersView) => Promise<void>): Promise<void> {
	const fixture = createExtensionFixture(options);
	try {
		await fixture.load<typeof import('../extension')>('extension').activate(fixture.context);
		await run(fixture, fixture.tree.provider as FiltersView);
	} finally { fixture.dispose(); }
}

function nodes(panel: FiltersView): Extract<FilterNode, { kind: 'filter' }>[] {
	return panel.getChildren().flatMap(group => panel.getChildren(group))
		.filter((node): node is Extract<FilterNode, { kind: 'filter' }> => node.kind === 'filter');
}

function builtinNode(panel: FiltersView): Extract<FilterNode, { kind: 'filter' }> {
	return nodes(panel).find(node => isBuiltinFilter(node.filter))!;
}

const userFilter: SearchFilter = { name: 'TypeScript', scope: 'global', include: '*.ts', exclude: '**/dist/**' };

suite('Built-in All Workspace Files filter', () => {
	for (const settings of [{}, { globalFilters: [] }]) {
		test(`is marked, unchecked, and unpinned with ${'globalFilters' in settings ? 'an explicitly empty list' : 'no configured filters'}`, async () => {
			await withExtension({ settings }, async (fixture, panel) => {
				const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
				assert.deepStrictEqual(await repository.loadAllFilters(), []);
				assert.strictEqual(nodes(panel).length, 1);
				assert.strictEqual(panel.getChildren()[0].kind, 'group');
				const item = panel.getTreeItem(builtinNode(panel));
				assert.strictEqual(item.label, 'All Workspace Files');
				assert.strictEqual(item.description, 'Built-in');
				assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'globe');
				assert.strictEqual(item.contextValue, 'searchFilter.builtin');
				assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
				assert.match(String(item.tooltip), /read-only/);
				assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), []);
				assert.strictEqual(fixture.workspaceState.get('pinnedFilterKeys'), undefined);
				assert.strictEqual(fixture.executed.length, 0);
				assert.deepStrictEqual(fixture.updates, []);
				assert.deepStrictEqual(fixture.workspaceWrites, []);
				assert.deepStrictEqual(Object.fromEntries(fixture.settings), settings);

				await fixture.runCommand('selectAndSearch');
				const [choice] = fixture.picker.items;
				assert.strictEqual(fixture.picker.items.length, 1);
				assert.strictEqual(choice.label, '$(globe) All Workspace Files');
				assert.strictEqual(choice.description, 'Built-in · Global');
				assert.strictEqual(choice.detail, undefined);
				assert.strictEqual(fixture.picker.activeItems[0], choice);
				assert.deepStrictEqual(choice.buttons!.map(button => button.tooltip), ['Pin filter (add it to every search)']);
				fixture.picker.selectedItems = [choice];
				await fixture.picker.acceptHandler!();
				assert.deepStrictEqual(fixture.executed[0].args, [{ filesToInclude: '**/*', filesToExclude: '', triggerSearch: true, showIncludesExcludes: true }]);
			});
		});
	}

	test('isolates identity and enabled state from a same-name user filter and ignores stored built-in metadata', async () => {
		const sameName = { ...userFilter, name: ALL_WORKSPACE_FILES.name, builtinId: 'all-workspace-files' };
		await withExtension({ settings: { globalFilters: [sameName], globalFiltersEnabled: { [sameName.name]: false } } }, async (fixture, panel) => {
			const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
			const [builtin, stored] = await repository.loadSearchFilters();
			assert.ok(isBuiltinFilter(builtin));
			assert.ok(!isBuiltinFilter(stored));
			assert.strictEqual(stored.enabled, false);
			assert.strictEqual(builtin.enabled, true);
			assert.notStrictEqual(filterKey(builtin), filterKey(stored));
			assert.strictEqual(filterKey({ ...builtin, name: 'Display name changed' }), filterKey(builtin));
			assert.strictEqual(repository.hasNameConflict([builtin], builtin.name, 'global'), false);
			assert.strictEqual(new Set(nodes(panel).map(node => panel.getTreeItem(node).id)).size, 2);
			await panel.setChecked([[builtinNode(panel), vscode.TreeItemCheckboxState.Checked]]);
			await repository.deleteFilter(stored);
			await panel.refresh();
			assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
			assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), [filterKey(builtin)]);
			assert.strictEqual(panel.getTreeItem(builtinNode(panel)).checkboxState, vscode.TreeItemCheckboxState.Checked);
		});
	});

	test('restores built-in selections independently and combines all files with pinned exclusions', async () => {
		const exclusion: SearchFilter = { name: 'Exclude build', scope: 'global', include: '', exclude: '**/dist/**' };
		const settings = { globalFilters: [exclusion] };
		let restored: Record<string, unknown> = {};
		await withExtension({ settings }, async (fixture, panel) => {
			await panel.pin(nodes(panel).find(node => node.filter.name === exclusion.name)!, true);
			await panel.setChecked([[builtinNode(panel), vscode.TreeItemCheckboxState.Checked]]);
			await panel.apply();
			assert.deepStrictEqual(fixture.executed[0].args, [{ filesToInclude: '**/*', filesToExclude: '**/dist/**', triggerSearch: true, showIncludesExcludes: true }]);
			assert.deepStrictEqual(fixture.updates, []);
			assert.deepStrictEqual(fixture.workspaceWrites, []);
			restored = Object.fromEntries(fixture.workspaceState);
		});
		await withExtension({ settings, workspaceState: restored }, async (fixture, panel) => {
			assert.strictEqual(panel.getTreeItem(builtinNode(panel)).checkboxState, vscode.TreeItemCheckboxState.Checked);
			assert.strictEqual(fixture.executed.length, 0);
			await panel.clear();
			assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), []);
			assert.strictEqual(nodes(panel).length, 2);
		});
	});

	test('pins from the search list, keeps the built-in marker, and broadens searches across workspace roots', async () => {
		let restored: Record<string, unknown> = {};
		await withExtension({ settings: { globalFilters: [userFilter] }, extraWorkspaceFolderNames: ['other'] }, async (fixture, panel) => {
			await panel.setChecked([[builtinNode(panel), vscode.TreeItemCheckboxState.Checked]]);
			await fixture.runCommand('selectAndSearch');
			const choice = fixture.picker.items.find(item => item.filter && isBuiltinFilter(item.filter))!;
			assert.strictEqual(fixture.picker.items[0], choice, 'Keep the built-in in the first row');
			assert.strictEqual(fixture.picker.activeItems[0].filter?.name, userFilter.name, 'Initially highlight a user filter');
			fixture.picker.activeItems = [choice];
			await fixture.picker.triggerItemButton!({ item: choice, button: choice.buttons![0] });
			await panel.refresh();
			const pinnedChoice = fixture.picker.items.find(item => item.filter && isBuiltinFilter(item.filter))!;
			assert.match(pinnedChoice.label!, /All Workspace Files.*\$\(pinned\)/);
			assert.strictEqual(pinnedChoice.description, 'Pinned · Built-in · Global');
			assert.strictEqual(pinnedChoice.detail, undefined);
			assert.strictEqual(fixture.picker.activeItems[0], pinnedChoice, 'Preserve intentional focus when pinning');
			assert.deepStrictEqual(pinnedChoice.buttons!.map(button => button.tooltip), ['Unpin filter']);
			const item = panel.getTreeItem(builtinNode(panel));
			assert.strictEqual(item.description, 'Built-in');
			assert.strictEqual(item.contextValue, 'searchFilter.builtin.pinned');
			assert.strictEqual(item.checkboxState, undefined);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'pinned');
			assert.deepStrictEqual(fixture.workspaceState.get('selectedFilterKeys'), []);
			await fixture.load<typeof import('../searchUi')>('searchUi').runSearch(userFilter);
			const args = fixture.executed.at(-1)!.args[0] as { filesToInclude: string; filesToExclude: string };
			assert.ok(args.filesToInclude.includes('./fixture/**/*'));
			assert.ok(args.filesToInclude.includes('./other/**/*'));
			assert.strictEqual(args.filesToExclude, '**/dist/**');
			assert.deepStrictEqual(fixture.updates, []);
			restored = Object.fromEntries(fixture.workspaceState);
		});
		await withExtension({ settings: { globalFilters: [] }, workspaceState: restored }, async (fixture, panel) => {
			assert.strictEqual(panel.getTreeItem(builtinNode(panel)).contextValue, 'searchFilter.builtin.pinned');
			await panel.clear();
			await panel.apply();
			assert.strictEqual((fixture.executed.at(-1)!.args[0] as { filesToInclude: string }).filesToInclude, '**/*');
			await fixture.runCommand('unpinFilter', builtinNode(panel));
			assert.strictEqual(panel.getTreeItem(builtinNode(panel)).checkboxState, vscode.TreeItemCheckboxState.Unchecked);
			assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), []);
		});
	});

	test('hides mutation entry points and refuses direct edits or persistence of built-ins', async () => {
		await withExtension({ settings: { globalFilters: [userFilter] } }, async (fixture, panel) => {
			for (const command of ['editFilter', 'deleteFilter', 'addFolderToInclude']) {
				fixture.picks.push(undefined);
				await fixture.runCommand(command, vscode.Uri.joinPath(fixture.folder.uri, 'src'));
				assert.ok(fixture.choices.at(-1)!.some(item => item.filter?.name === userFilter.name));
				assert.ok(fixture.choices.at(-1)!.every(item => !item.filter || !isBuiltinFilter(item.filter)));
			}
			const choicesBefore = fixture.choices.length;
			await fixture.runCommand('editPanelFilter', builtinNode(panel));
			const result = await fixture.load<typeof import('../filterEditor')>('filterEditor').editFilterInteractively(ALL_WORKSPACE_FILES);
			assert.strictEqual(result.outcome, 'cancelled');
			assert.strictEqual(fixture.choices.length, choicesBefore);
			const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
			await assert.rejects(repository.saveFilter({ ...ALL_WORKSPACE_FILES, include: '*.ts' }), /read-only/);
			await assert.rejects(repository.deleteFilter(ALL_WORKSPACE_FILES), /read-only/);
			assert.deepStrictEqual(fixture.settings.get('globalFilters'), [userFilter]);
			assert.deepStrictEqual(fixture.updates, []);
			assert.deepStrictEqual(fixture.workspaceWrites, []);
		});
	});

	test('keeps user saves and deletions separate from the built-in definition', async () => {
		await withExtension({ settings: { globalFilters: [] } }, async (fixture, panel) => {
			const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
			await repository.saveFilter(userFilter);
			assert.deepStrictEqual(fixture.settings.get('globalFilters'), [userFilter]);
			assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { TypeScript: true });
			await repository.deleteFilter(userFilter);
			await panel.refresh();
			assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
			assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), {});
			assert.strictEqual(nodes(panel).length, 1);
			assert.ok(builtinNode(panel));
		});
	});
});
