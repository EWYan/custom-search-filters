import * as assert from 'assert';
import { SearchFilter, WorkspaceSearchFilter } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

suite('Project search pattern resolution', () => {
	for (const options of [{ workspaceFile: true }, { extraWorkspaceFolderNames: ['other'] }]) {
		test(`retains recursive globs and explicit paths with ${options.workspaceFile ? 'a workspace file' : 'multiple roots'}`, () => {
			const fixture = createExtensionFixture(options);
			try {
				const patterns = fixture.load<typeof import('../model/searchPatterns')>('model/searchPatterns');
				for (const [input, expected] of [
					['*.ts', './fixture/**/*.ts'], ['.ts', './fixture/**/*.ts'],
					['src/', './fixture/**/src'], ['**/*.{ts,js}', './fixture/**/*.{ts,js}'],
					['{src,lib}/**', './fixture/**/{src,lib}/**'], ['./src/**/*', './fixture/src/**/*'],
					['../shared', '../shared'], ['~/projects/lib', '~/projects/lib'], ['~', '~'],
					['~scratch', './fixture/**/~scratch'], [fixture.folder.uri.fsPath, fixture.folder.uri.fsPath]
				]) {
					const project: WorkspaceSearchFilter = { name: 'project', scope: 'workspace', workspaceFolder: fixture.folder, include: input, exclude: input };
					const result = patterns.patternsForSearch(project);
					assert.strictEqual(result.include, expected, input);
					assert.strictEqual(result.exclude, expected, input);
					assert.strictEqual(project.include, input, 'Resolution must not change stored definitions');
				}
			} finally { fixture.dispose(); }
		});
	}

	test('preserves recursive project includes and excludes when mixed with a rooted single-folder filter', () => {
		const fixture = createExtensionFixture();
		try {
			const project: WorkspaceSearchFilter = { name: 'project', scope: 'workspace', workspaceFolder: fixture.folder, include: '*.ts', exclude: '*.log' };
			const rooted: SearchFilter = { name: 'rooted', scope: 'global', include: './src', exclude: '' };
			const result = fixture.load<typeof import('../model/searchPatterns')>('model/searchPatterns').combineForSearch([project, rooted]);
			assert.strictEqual(result.include, './**/*.ts,./src');
			assert.strictEqual(result.exclude, './**/*.log');
		} finally { fixture.dispose(); }
	});

	test('treats home-relative includes as paths when combining single-folder filters', () => {
		const fixture = createExtensionFixture();
		try {
			const result = fixture.load<typeof import('../model/searchPatterns')>('model/searchPatterns').combineForSearch([
				{ name: 'home', include: '~/projects/lib', exclude: '~/projects/lib/dist', scope: 'global' },
				{ name: 'typescript', include: '*.ts', exclude: '', scope: 'global' }
			]);
			assert.strictEqual(result.include, '~/projects/lib,./**/*.ts');
			assert.strictEqual(result.exclude, '~/projects/lib/dist');
		} finally { fixture.dispose(); }
	});
});
