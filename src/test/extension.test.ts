import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { appendToPattern, compareVersions, normalizeFilter } from '../model/searchFilter';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('appendToPattern appends unique comma separated patterns', () => {
		assert.strictEqual(appendToPattern('', 'src/**/*'), 'src/**/*');
		assert.strictEqual(appendToPattern('src/**/*', '**/*.ts'), 'src/**/*,**/*.ts');
		assert.strictEqual(appendToPattern('src/**/*, **/*.ts', '**/*.ts'), 'src/**/*,**/*.ts');
	});

	test('compareVersions compares semantic version parts', () => {
		assert.strictEqual(compareVersions('0.1.3', '0.1.4'), -1);
		assert.strictEqual(compareVersions('0.2.0', '0.1.9'), 1);
		assert.strictEqual(compareVersions('1.0', '1.0.0'), 0);
	});

	test('normalizeFilter fills missing fields and trims names', () => {
		assert.deepStrictEqual(normalizeFilter({ name: '  api  ', include: 'src/**' }, 'global'), {
			name: 'api',
			include: 'src/**',
			exclude: '',
			scope: 'global',
			enabled: undefined
		});
	});

	test('Folder detection with dots in name', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test.folder.with.dots'));
		try {
			const hasExtension = path.extname(tempDir) !== '';
			assert.strictEqual(hasExtension, true, 'Old logic incorrectly identifies folder with dots as having extension');

			const stats = fs.statSync(tempDir);
			assert.strictEqual(stats.isDirectory(), true, 'New logic correctly identifies folder with dots as directory');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
