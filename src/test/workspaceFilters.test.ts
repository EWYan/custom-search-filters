import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceSearchFilter } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

suite('Project filter read failures', () => {
	for (const [label, failure] of [
		['invalid JSON', '['], ['non-array JSON', '{}'], ['permission errors', vscode.FileSystemError.NoPermissions()]
	] as const) {
		test(`refuses saves and deletions on ${label} without overwriting the project file`, async () => {
			const fixture = createExtensionFixture();
			try {
				const project: WorkspaceSearchFilter = { name: 'project', scope: 'workspace', workspaceFolder: fixture.folder, include: '*.ts', exclude: '' };
				fixture.workspaceReads.set(fixture.folder.uri.toString(), failure);
				const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
				await assert.rejects(repository.saveFilter(project, fixture.folder), /Cannot load project filters/);
				await assert.rejects(repository.deleteFilter(project), /Cannot load project filters/);
				assert.deepStrictEqual(fixture.workspaceWrites, []);
				assert.strictEqual(fixture.workspaceReads.get(fixture.folder.uri.toString()), failure);
			} finally { fixture.dispose(); }
		});
	}
});
