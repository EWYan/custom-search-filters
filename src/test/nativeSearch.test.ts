import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ALL_WORKSPACE_FILES } from '../model/builtinFilters';
import { SearchFilter, WorkspaceSearchFilter } from '../model/searchFilter';
import { combineForSearch, patternsForSearch, usesWorkspaceNames } from '../model/searchPatterns';

async function search(patterns: SearchFilter): Promise<string[]> {
	const previous = new Set(vscode.workspace.textDocuments.map(document => document.uri.toString()));
	try {
		await vscode.commands.executeCommand('search.action.openNewEditor', {
			query: 'CUSTOM_SEARCH_FILTERS_NATIVE_REGRESSION', filesToInclude: patterns.include, filesToExclude: patterns.exclude,
			triggerSearch: true, focusResults: false, useExcludeSettingsAndIgnoreFiles: false,
			isRegexp: false, matchWholeWord: false, isCaseSensitive: false, contextLines: 0
		});
		for (let attempt = 0; attempt < 200; attempt++) {
			const document = vscode.workspace.textDocuments.find(item => item.uri.scheme === 'search-editor' && !previous.has(item.uri.toString()));
			const contents = document?.getText();
			if (contents?.trim()) {
				return contents.split('\n').filter(line => /^\S.*:\s*$/.test(line)).map(line => line.trim());
			}
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		throw new Error(`Search did not produce results for ${JSON.stringify(patterns)}`);
	} finally {
		if (vscode.window.activeTextEditor?.document.uri.scheme === 'search-editor') {
			await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
		}
	}
}

suite('Native search results', function () {
	this.timeout(20000);
	const folder = vscode.workspace.workspaceFolders![0];
	const project = (include: string, exclude = ''): WorkspaceSearchFilter => ({ name: 'project', include, exclude, scope: 'workspace', workspaceFolder: folder });
	const homePath = '~/' + path.relative(os.homedir(), path.join(folder.uri.fsPath, 'src')).replace(/\\/g, '/');
	const assertProjectOnly = (files: string[]) => assert.ok(files.every(file => !file.startsWith('other ')), files.join('\n'));

	test('searches all workspace roots with the built-in filter', async () => {
		const files = await search(patternsForSearch(ALL_WORKSPACE_FILES));
		assert.strictEqual(files.length, vscode.workspace.workspaceFolders!.length * 6, files.join('\n'));
	});

	test('combines the built-in filter with a narrow project include while retaining exclusions', async () => {
		const combined = combineForSearch([
			ALL_WORKSPACE_FILES, project('*.ts'),
			{ name: 'Exclude build', scope: 'global', include: '', exclude: '**/dist/**' }
		]);
		const files = await search(combined);
		assert.strictEqual(files.length, vscode.workspace.workspaceFolders!.length * 4, files.join('\n'));
		assert.ok(files.some(file => file.endsWith('note.txt:')), 'The built-in include must override the narrower project include');
		assert.ok(files.every(file => !file.endsWith('build.ts:') && !file.endsWith('hidden.ts:')));
	});

	for (const glob of ['*.ts', '.ts', '**/*.ts', '**/*.{ts,txt}']) {
		test(`matches nested project files for ${glob} without searching other roots`, async () => {
			const files = await search(patternsForSearch(project(glob)));
			assert.strictEqual(files.length, glob.includes('{') ? 6 : 5, files.join('\n'));
			assert.ok(files.some(file => file.endsWith('nested.ts:')));
			assert.ok(files.some(file => file.endsWith('deep.ts:')));
			assertProjectOnly(files);
		});
	}

	test('excludes project globs recursively', async () => {
		const files = await search(patternsForSearch(project('**/*', '*.ts')));
		assert.strictEqual(files.length, 1, files.join('\n'));
		assert.ok(files[0].endsWith('note.txt:'));
		assertProjectOnly(files);
	});

	test('keeps explicit project directories rooted while plain directory globs match at any depth', async () => {
		const rooted = await search(patternsForSearch(project('./src/**/*')));
		assert.strictEqual(rooted.length, 2, rooted.join('\n'));
		assert.ok(!rooted.some(file => file.endsWith('deep.ts:')));
		const recursive = await search(patternsForSearch(project('src/**/*')));
		assert.strictEqual(recursive.length, 3, recursive.join('\n'));
		assert.ok(recursive.some(file => file.endsWith('deep.ts:')));
		assertProjectOnly(recursive);
	});

	test('unions home-relative and rooted include filters without losing home results', async () => {
		const rootedPath = usesWorkspaceNames() ? './other/dist/**/*' : './dist/**/*';
		const expected = await search({ name: 'native', include: `${homePath},${rootedPath}`, exclude: '' });
		assert.strictEqual(expected.length, 3, expected.join('\n'));
		const combined = combineForSearch([
			{ name: 'home', scope: 'global', include: homePath, exclude: '' },
			{ name: 'rooted', scope: 'global', include: rootedPath, exclude: '' }
		]);
		assert.deepStrictEqual((await search(combined)).sort(), expected.sort());
	});

	test('unions home-relative includes with recursive globs instead of intersecting them', async () => {
		const combined = combineForSearch([
			{ name: 'home', scope: 'global', include: homePath, exclude: '' },
			{ name: 'typescript', scope: 'global', include: '*.ts', exclude: '' }
		]);
		const files = await search(combined);
		assert.strictEqual(files.length, vscode.workspace.workspaceFolders!.length * 5 + 1, files.join('\n'));
		assert.ok(files.some(file => file.endsWith('note.txt:')));
	});

	test('preserves home-relative project includes and excludes', async () => {
		assert.strictEqual((await search(patternsForSearch(project(homePath)))).length, 2);
		// Absolute/home-relative excludes follow the native parser's rules, which differ
		// from project-relative excludes. Compare with native input instead of assuming.
		const expected = await search({ name: 'native', include: folder.uri.fsPath.replace(/\\/g, '/') + '/**/*', exclude: homePath });
		const files = await search(patternsForSearch(project('**/*', homePath)));
		assert.deepStrictEqual(files.sort(), expected.sort());
		assertProjectOnly(files);
	});
});
