import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Folder detection with dots in name', () => {
		// Create a temporary directory with dots in the name
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test.folder.with.dots'));
		
		try {
			// Test the old logic (should fail)
			const hasExtension = path.extname(tempDir) !== '';
			assert.strictEqual(hasExtension, true, 'Old logic incorrectly identifies folder with dots as having extension');
			
			// Test the new logic (should work)
			const stats = fs.statSync(tempDir);
			const isDirectory = stats.isDirectory();
			assert.strictEqual(isDirectory, true, 'New logic correctly identifies folder with dots as directory');
			
		} finally {
			// Clean up
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
