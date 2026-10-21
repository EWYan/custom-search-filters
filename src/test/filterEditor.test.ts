import * as assert from 'assert';
import * as vscode from 'vscode';
import { SearchFilter, filterKey } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

function filter(name: string, include = 'src/**/*', exclude = ''): SearchFilter {
	return { name, include, exclude, scope: 'global' };
}

function editorFixture(options: Parameters<typeof createExtensionFixture>[0]) {
	const fixture = createExtensionFixture(options);
	fixture.load<typeof import('../storage/pinnedFilters')>('storage/pinnedFilters').initPinnedFilters(fixture.context);
	fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
	return fixture;
}

suite('Filter editor', () => {
	test('keeps brace expressions intact when removing patterns with the checklist', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target', '**/*.{ts,js},**/*.md')] } });
		fixture.picks.push('target', 'include', 'keep', ['**/*.{ts,js}'], 'save');
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.choices[3].map(item => item.label), ['**/*.{ts,js}', '**/*.md']);
		assert.strictEqual((fixture.settings.get('globalFilters') as SearchFilter[])[0].include, '**/*.{ts,js}');
	});

	test('changes a single field without prompting for the others', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.picks.push('target', 'exclude', 'save');
		fixture.inputs.push('**/*.log');
		await fixture.runCommand('editFilter');
		assert.strictEqual(fixture.inputBoxes.length, 1);
		assert.strictEqual(fixture.inputBoxes[0].value, '');
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('target', 'src/**/*', '**/*.log')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { target: true });
	});

	test('marks modified fields in the editor menu', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.picks.push('target', 'include', 'discard');
		fixture.inputs.push('lib/**/*');
		await fixture.runCommand('editFilter');
		const menu = fixture.choices.at(-1)!.filter(item => item.action) as vscode.QuickPickItem[];
		assert.deepStrictEqual(menu.map(item => Boolean(item.description?.endsWith('● modified'))), [false, true, false, false, false, false, false, false]);
		assert.strictEqual(menu.at(-1)!.label, '$(discard) Discard Changes');
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('removes individual patterns with a checklist', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target', 'a/**/*, b/**/*,c/**/*')] } });
		fixture.picks.push('target', 'include', 'keep', ['a/**/*', 'c/**/*'], 'save');
		await fixture.runCommand('editFilter');
		assert.strictEqual(fixture.inputBoxes.length, 0);
		const saved = fixture.settings.get('globalFilters') as SearchFilter[];
		assert.strictEqual(saved[0].include, 'a/**/*,c/**/*');
	});

	test('offers text editing for a list of patterns', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target', 'a/**/*,b/**/*')] } });
		fixture.picks.push('target', 'include', 'text', 'save');
		fixture.inputs.push('a/**/*,b/**/*,c/**/*');
		await fixture.runCommand('editFilter');
		assert.strictEqual(fixture.inputBoxes[0].value, 'a/**/*,b/**/*');
		const saved = fixture.settings.get('globalFilters') as SearchFilter[];
		assert.strictEqual(saved[0].include, 'a/**/*,b/**/*,c/**/*');
	});

	test('renames in place and keeps the disabled state', async () => {
		const fixture = editorFixture({ settings: {
				globalFilters: [filter('first'), filter('second'), filter('third')],
				globalFiltersEnabled: { second: false }
			} });
		fixture.picks.push('second', 'name', 'save');
		fixture.inputs.push('  renamed  ');
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('first'), filter('renamed'), filter('third')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { first: true, renamed: false, third: true });
		assert.deepStrictEqual(fixture.updates, ['globalFiltersEnabled', 'globalFilters'], 'A rename must be a single save');
	});

	test('validates names as they are typed', async () => {
		const fixture = editorFixture({
			settings: { globalFilters: [filter('first'), filter('second')] },
			workspaceFilters: [filter('project')]
		});
		fixture.picks.push('second', 'name', undefined);
		fixture.inputs.push(undefined);
		await fixture.runCommand('editFilter');
		const validate = fixture.inputBoxes[0].validateInput!;
		assert.match(String(validate('first')), /already exists in this global scope/);
		assert.match(String(validate('   ')), /cannot be empty/);
		assert.strictEqual(validate('second'), null);
		assert.strictEqual(validate('project'), null, 'Names only conflict within the same scope');
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('toggles a workspace filter off and writes it to the project file', async () => {
		const fixture = editorFixture({ workspaceFilters: [filter('project')] });
		fixture.picks.push('project', 'enabled', 'save');
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.workspaceWrites, [[{ ...filter('project'), scope: 'workspace', enabled: false }]]);
	});

	test('treats toggling twice as no change', async () => {
		const fixture = editorFixture({ workspaceFilters: [filter('project')] });
		fixture.picks.push('project', 'enabled', 'enabled', 'save');
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.workspaceWrites, []);
		assert.match(fixture.messages.at(-1)!, /No changes made/);
	});

	test('asks before discarding changes on Escape and returns to the menu when declined', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.picks.push('target', 'exclude', undefined, 'save');
		fixture.inputs.push('**/*.log');
		await fixture.runCommand('editFilter');
		assert.ok(fixture.messages.some(message => /Discard unsaved changes/.test(message)));
		const saved = fixture.settings.get('globalFilters') as SearchFilter[];
		assert.strictEqual(saved[0].exclude, '**/*.log');
	});

	test('discards changes on Escape after confirmation', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.selection.warning = 'Discard';
		fixture.picks.push('target', 'exclude', undefined);
		fixture.inputs.push('**/*.log');
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('keeps the original value when a field prompt is dismissed', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target', 'src/**/*', '**/*.log')] } });
		fixture.picks.push('target', 'exclude', 'save');
		fixture.inputs.push(undefined);
		await fixture.runCommand('editFilter');
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('lists disabled filters in the edit command so they can be enabled again', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('hidden')], globalFiltersEnabled: { hidden: false } } });
		fixture.picks.push('hidden', 'enabled', 'save');
		await fixture.runCommand('editFilter');
		assert.match(String((fixture.choices[0][0] as vscode.QuickPickItem).description), /Disabled/);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { hidden: true });
	});
});

suite('Filter editor from the search list', () => {
	test('opens the editor from the edit button and searches with the saved filter', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		await fixture.runCommand('selectAndSearch');
		const item = fixture.picker.items.find(entry => entry.filter?.name === 'target')!;
		assert.deepStrictEqual(item.buttons?.map(button => button.tooltip), ['Pin filter (add it to every search)', 'Edit filter', 'Delete filter']);
		fixture.picks.push('include', 'saveAndSearch');
		fixture.inputs.push('lib/**/*');
		await fixture.picker.triggerItemButton!({ item, button: item.buttons![1] });
		assert.strictEqual((fixture.settings.get('globalFilters') as SearchFilter[])[0].include, 'lib/**/*');
		assert.strictEqual(fixture.executed.length, 1);
		assert.strictEqual(fixture.executed[0].command, 'workbench.action.findInFiles');
		assert.deepStrictEqual(
			(fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude,
			'lib/**/*'
		);
		assert.strictEqual(fixture.picker.created, 1, 'The list stays closed after searching');
	});

	test('reopens the search list after saving', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('target')] } });
		await fixture.runCommand('selectAndSearch');
		const item = fixture.picker.items.find(entry => entry.filter?.name === 'target')!;
		fixture.picks.push('name', 'save');
		fixture.inputs.push('renamed');
		await fixture.picker.triggerItemButton!({ item, button: item.buttons![1] });
		assert.strictEqual(fixture.picker.created, 2);
		assert.deepStrictEqual(fixture.picker.items.map(entry => entry.filter?.name), ['All Workspace Files', 'renamed']);
		assert.deepStrictEqual(fixture.executed, []);
	});
});

suite('Pinning from the search list and the editor', () => {
	test('renames and unpins an already pinned filter in the same save', async () => {
		const original = filter('first');
		const fixture = editorFixture({
			settings: { globalFilters: [original] },
			workspaceState: { pinnedFilterKeys: [filterKey(original)] }
		});
		try {
			fixture.picks.push('pinned', 'name', 'saveAndSearch');
			fixture.inputs.push('renamed');
			const editor = fixture.load<typeof import('../filterEditor')>('filterEditor');
			const result = await editor.editFilterInteractively(original);
			assert.strictEqual(result.outcome, 'saveAndSearch');
			assert.strictEqual(result.filter.name, 'renamed');
			assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), []);
			assert.deepStrictEqual((fixture.settings.get('globalFilters') as SearchFilter[]).map(entry => entry.name), ['renamed']);
		} finally { fixture.dispose(); }
	});

	test('pins and unpins from the search list without closing it', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('base', '', '**/dist/**'), filter('source', 'src/**/*')] } });
		await fixture.runCommand('selectAndSearch');
		const picker = fixture.picker as unknown as { placeholder: string };
		let base = fixture.picker.items.find(entry => entry.filter?.name === 'base')!;
		await fixture.picker.triggerItemButton!({ item: base, button: base.buttons![0] });
		base = fixture.picker.items.find(entry => entry.filter?.name === 'base')!;
		assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), [filterKey(filter('base'))]);
		assert.strictEqual(base.buttons![0].tooltip, 'Unpin filter');
		assert.strictEqual(base.label, '$(globe) base (Global)  $(pinned)');
		assert.match(String(base.description), /^Pinned · /);
		assert.strictEqual(picker.placeholder, 'Select a custom search filter to apply with 1 pinned filter');
		assert.strictEqual(fixture.picker.created, 1);
		assert.deepStrictEqual(fixture.updates, []);

		await fixture.picker.triggerItemButton!({ item: base, button: base.buttons![0] });
		assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), []);
		assert.strictEqual(picker.placeholder, 'Select a custom search filter to apply');
		assert.deepStrictEqual(fixture.executed, []);
	});

	test('toggles the pin in the editor and applies it only on save', async () => {
		const fixture = editorFixture({ settings: { globalFilters: [filter('base', '', '**/dist/**')] } });
		const editor = fixture.load<typeof import('../filterEditor')>('filterEditor');
		const target = { ...filter('base', '', '**/dist/**'), enabled: true };

		fixture.picks.push('pinned', 'discard');
		assert.strictEqual((await editor.editFilterInteractively(target)).outcome, 'cancelled');
		const menu = fixture.choices.at(-1)!;
		assert.strictEqual(menu.find(item => item.action === 'pinned')!.description, 'Yes  ● modified');
		assert.strictEqual(menu.at(-1)!.label, '$(discard) Discard Changes');
		assert.strictEqual(fixture.workspaceState.get('pinnedFilterKeys'), undefined);

		fixture.picks.push('pinned', 'name', 'save');
		fixture.inputs.push('renamed');
		assert.strictEqual((await editor.editFilterInteractively(target)).outcome, 'saved');
		assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), [filterKey(filter('renamed'))]);
		assert.deepStrictEqual((fixture.settings.get('globalFilters') as SearchFilter[]).map(entry => entry.name), ['renamed']);

		const updates = fixture.updates.length;
		fixture.picks.push('pinned', 'save');
		assert.strictEqual((await editor.editFilterInteractively({ ...target, name: 'renamed' })).outcome, 'saved');
		assert.deepStrictEqual(fixture.workspaceState.get('pinnedFilterKeys'), []);
		assert.strictEqual(fixture.updates.length, updates);
	});
});
