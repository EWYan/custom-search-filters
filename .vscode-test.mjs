import { defineConfig } from '@vscode/test-cli';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Real files let the search regressions check VS Code's parser and search results.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-search-filters-tests-'));
process.once('exit', () => {
	if (path.dirname(fixtureRoot) === path.resolve(os.tmpdir()) && path.basename(fixtureRoot).startsWith('custom-search-filters-tests-')) {
		fs.rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

const folders = ['fixture', 'other'].map(name => ({ name, path: path.join(fixtureRoot, name) }));
for (const folder of folders) {
	for (const file of ['root.ts', 'src/nested.ts', 'src/note.txt', 'dist/build.ts', 'child/src/deep.ts', 'child/dist/hidden.ts']) {
		const target = path.join(folder.path, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, 'CUSTOM_SEARCH_FILTERS_NATIVE_REGRESSION\n');
	}
}
const workspaceFile = path.join(fixtureRoot, 'search.code-workspace');
fs.writeFileSync(workspaceFile, JSON.stringify({ folders, settings: { 'search.searchOnType': false } }));

export default defineConfig([
	{ label: 'workspace', files: 'out/test/**/*.test.js', workspaceFolder: workspaceFile },
	{ label: 'single-folder', files: 'out/test/nativeSearch.test.js', workspaceFolder: folders[0].path }
]);
