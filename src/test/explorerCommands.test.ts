import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { suggestFilterName } from '../explorerCommands';
import { SearchFilter, applyPatterns } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

function filter(name: string, include = 'src/**/*', exclude = ''): SearchFilter {
	return { name, include, exclude, scope: 'global' };
}

function explorerFixture(options: Parameters<typeof createExtensionFixture>[0]) {
	const fixture = createExtensionFixture(options);
	fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
	return fixture;
}

suite('Pattern merging', () => {
	test('appends without duplicates and replaces on request', () => {
		const base = filter('f', 'a/**/*');
		assert.strictEqual(applyPatterns(base, 'include', ['a/**/*', 'b/**/*'], 'append').filter.include, 'a/**/*,b/**/*');
		assert.strictEqual(applyPatterns(base, 'include', ['b/**/*'], 'replace').filter.include, 'b/**/*');
		assert.strictEqual(applyPatterns(base, 'include', ['a/**/*'], 'append').changed, false);
	});

	test('treats patterns already present with different spacing as unchanged', () => {
		const spaced = filter('f', 'a/**/*, b/**/*');
		const change = applyPatterns(spaced, 'include', ['b/**/*'], 'append');
		assert.strictEqual(change.changed, false);
		assert.strictEqual(change.filter.include, 'a/**/*, b/**/*');
		assert.strictEqual(applyPatterns(spaced, 'include', ['a/**/*', 'b/**/*'], 'replace').changed, false);
	});

	test('moves identical patterns out of the opposite list', () => {
		const change = applyPatterns(filter('f', 'src/**/*, lib/**/*', '**/*.log'), 'exclude', ['src/**/*'], 'append');
		assert.deepStrictEqual(change.moved, ['src/**/*']);
		assert.strictEqual(change.filter.include, 'lib/**/*');
		assert.strictEqual(change.filter.exclude, '**/*.log,src/**/*');
		assert.strictEqual(change.changed, true);
	});

	test('leaves the opposite list untouched when nothing overlaps', () => {
		const change = applyPatterns(filter('f', ' src/**/* ', ''), 'exclude', ['dist/**/*'], 'append');
		assert.strictEqual(change.filter.include, ' src/**/* ');
		assert.deepStrictEqual(change.moved, []);
	});
});

suite('Filter name suggestions', () => {
	const folder = { name: 'app', index: 0, uri: vscode.Uri.file('/app') };
	test('uses folder names, the workspace folder for its root, and file types', () => {
		assert.strictEqual(suggestFilterName('folder', 'include', ['src/utils/**/*'], folder), 'utils');
		assert.strictEqual(suggestFilterName('folder', 'include', ['./frontend/**/*'], folder), 'frontend');
		assert.strictEqual(suggestFilterName('folder', 'exclude', ['**/*'], folder), 'Exclude app');
		assert.strictEqual(suggestFilterName('folder', 'include', ['a/**/*', 'b/**/*', 'c/**/*', 'd/**/*'], folder), 'a + b + c +1');
		assert.strictEqual(suggestFilterName('fileType', 'exclude', ['**/*.ts', '**/*.js'], folder), 'Exclude *.ts + *.js files');
	});
});

suite('Explorer add to filter', () => {
	for (const mutation of ['edit', 'delete'] as const) {
		test(`does not undo a later ${mutation} from an old notification`, async () => {
			const fixture = explorerFixture({ settings: { globalFilters: [filter('target')] } });
			let click!: (action: string | undefined) => void;
			fixture.selection.info = new Promise(resolve => { click = resolve; });
			fixture.picks.push('target');
			const operation = fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'test'));
			try {
				for (let i = 0; i < 50 && fixture.messages.length === 0; i++) { await new Promise(resolve => setImmediate(resolve)); }
				assert.ok(fixture.messages.some(message => message.startsWith('Added')));
				const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
				const edited = filter('target', 'src/**/*,test/**/*', '**/*.secret');
				if (mutation === 'edit') { await repository.saveFilter(edited); }
				else { await repository.deleteFilter(filter('target')); }
				fixture.selection.info = undefined;
				click('Undo');
				await operation;
				assert.deepStrictEqual(fixture.settings.get('globalFilters'), mutation === 'edit' ? [edited] : []);
				assert.match(fixture.messages.at(-1)!, /Cannot undo/);
			} finally { click(undefined); await operation; fixture.dispose(); }
		});
	}

	test('stores project folder patterns portably and resolves them for the current workspace', async () => {
		const fixture = explorerFixture({ extraWorkspaceFolderNames: ['other'] });
		fixture.picks.push('new', 'workspace');
		fixture.inputs.push('project');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		const saved = fixture.workspaceWrites[0] as SearchFilter[];
		assert.strictEqual(saved[0].include, './src/**/*');
		const [project] = await fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		await fixture.load<typeof import('../searchUi')>('searchUi').runSearch(project);
		assert.strictEqual((fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude, './fixture/src/**/*');
		const single = explorerFixture({ workspaceFilters: saved });
		const [reopened] = await single.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		await single.load<typeof import('../searchUi')>('searchUi').runSearch(reopened);
		assert.strictEqual((single.executed[0].args[0] as { filesToInclude: string }).filesToInclude, './src/**/*');
	});

	test('qualifies project patterns in a workspace file containing just one root', async () => {
		const fixture = explorerFixture({ workspaceFilters: [filter('project')], workspaceFile: true });
		const [project] = await fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		await fixture.load<typeof import('../searchUi')>('searchUi').runSearch(project);
		assert.strictEqual((fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude, './fixture/**/src/**/*');
	});

	test('shows the patterns being added in the picker title', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('target', '')] } });
		fixture.picks.push(undefined);
		await fixture.runCommand('addFolderToExclude', vscode.Uri.joinPath(fixture.folder.uri, 'dist'));
		assert.strictEqual(fixture.picker.title, 'Exclude 1 folder: dist/**/*');
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('moves a pattern from include to exclude and reports it', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.picks.push('target');
		await fixture.runCommand('addFolderToExclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.match(String(fixture.choices[0].find(item => item.filter)?.detail), /Moves src\/\*\*\/\* out of include/);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('target', '', 'src/**/*')]);
		assert.match(fixture.messages.at(-1)!, /Moved src\/\*\*\/\* out of 'include'/);
	});

	test('undoes an update from the notification', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('target')], globalFiltersEnabled: { target: false } } });
		fixture.selection.info = 'Undo';
		fixture.picks.push('target');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'test'));
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('target')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { target: false });
		assert.match(fixture.messages.at(-1)!, /Restored filter 'target'/);
	});

	test('searches with the updated filter from the notification', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.selection.info = 'Search Now';
		fixture.picks.push('target');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'test'));
		assert.strictEqual(fixture.executed[0].command, 'workbench.action.findInFiles');
		assert.strictEqual((fixture.executed[0].args[0] as { filesToInclude: string }).filesToInclude, 'src/**/*,test/**/*');
	});

	test('opens the filter editor from the notification', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.selection.info = 'Edit Filter';
		fixture.picks.push('target', 'discard');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'test'));
		const menu = fixture.choices.at(-1)!;
		assert.ok(menu.some(item => item.action === 'saveAndSearch'));
		assert.match(String(menu.find(item => item.action === 'include')?.description), /src\/\*\*\/\*,test\/\*\*\/\*/);
	});

	test('creates a project filter from a folder with a suggested name in two steps', async () => {
		const fixture = explorerFixture({});
		fixture.picks.push('new', 'workspace');
		fixture.inputs.push('src');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.strictEqual(fixture.choices[1][0].value, 'workspace', 'Folder filters default to the project scope');
		assert.strictEqual(fixture.inputBoxes.length, 1);
		assert.strictEqual(fixture.inputBoxes[0].value, 'src');
		assert.deepStrictEqual(fixture.workspaceWrites, [[{ name: 'src', include: './src/**/*', exclude: '', scope: 'workspace' }]]);
		assert.match(fixture.messages.at(-1)!, /Created filter 'src'/);
	});

	test('defaults file type filters to global and validates the name', async () => {
		const fixture = explorerFixture({ settings: { globalFilters: [filter('existing')] }, fileType: vscode.FileType.File });
		fixture.picks.push('new', 'global');
		fixture.inputs.push(undefined);
		await fixture.runCommand('addFileTypeToExclude', vscode.Uri.joinPath(fixture.folder.uri, 'app.test.ts'));
		assert.strictEqual(fixture.choices[1][0].value, 'global');
		assert.strictEqual(fixture.inputBoxes[0].value, 'Exclude *.ts files');
		const validate = fixture.inputBoxes[0].validateInput!;
		assert.match(String(validate('existing')), /already exists in this global scope/);
		assert.strictEqual(validate('fresh'), null);
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('lists only global filters and project filters of the selected root', async () => {
		const fixture = explorerFixture({
			settings: { globalFilters: [filter('global')] },
			workspaceFilters: [filter('here')],
			extraWorkspaceFilters: [filter('there')],
			extraWorkspaceFolderNames: ['other']
		});
		fixture.picks.push(undefined);
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.deepStrictEqual(fixture.choices[0].filter(item => item.filter).map(item => item.filter!.name), ['global', 'here']);
	});
});

suite('Explorer menu manifest', () => {
	const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
	const explorerCommands = ['addFolderToInclude', 'addFolderToExclude', 'addFileTypeToInclude', 'addFileTypeToExclude']
		.map(name => `custom-search-filters.${name}`);

	test('uses a category instead of repeating it in every title', () => {
		for (const command of manifest.contributes.commands) {
			assert.strictEqual(command.category, 'Custom Search', command.command);
			assert.ok(!command.title.startsWith('Custom Search'), command.title);
		}
	});

	test('groups Explorer commands in a submenu and hides them from the Command Palette', () => {
		const submenu = manifest.contributes.submenus[0].id;
		assert.deepStrictEqual(manifest.contributes.menus['explorer/context'].map((entry: { submenu: string }) => entry.submenu), [submenu]);
		assert.deepStrictEqual(manifest.contributes.menus[submenu].map((entry: { command: string }) => entry.command), explorerCommands);
		const hidden = manifest.contributes.menus.commandPalette
			.filter((entry: { when: string; command: string }) => entry.when === 'false' && explorerCommands.includes(entry.command))
			.map((entry: { command: string }) => entry.command);
		assert.deepStrictEqual(hidden, explorerCommands);
	});
});
