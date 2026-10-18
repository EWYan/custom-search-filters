import * as assert from 'assert';
import * as vscode from 'vscode';
import { SearchFilter } from '../model/searchFilter';
import { createExtensionFixture } from './helpers/extensionFixture';

function filter(name: string, include = 'src/**/*', exclude = ''): SearchFilter {
	return { name, include, exclude, scope: 'global' };
}

suite('Filter migration regressions', () => {
	test('preserves existing settings instead of restoring deleted or renamed legacy filters', async () => {
		const current = [filter('renamed', 'new/**/*')];
		const fixture = createExtensionFixture({
			settings: { globalFilters: current },
			legacy: [filter('deleted'), filter('old-name')]
		});
		await fixture.load<typeof import('../migration')>('migration').migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), current);
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('preserves an explicitly empty user filter list', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [] }, legacy: [filter('deleted')] });
		await fixture.load<typeof import('../migration')>('migration').migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('does not overwrite malformed but explicitly configured user settings', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: null }, legacy: [filter('old')] });
		await fixture.load<typeof import('../migration')>('migration').migrateGlobalFiltersFromState(fixture.context);
		assert.strictEqual(fixture.settings.get('globalFilters'), null);
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('migrates valid legacy data and enabled states when user settings are absent', async () => {
		const fixture = createExtensionFixture({ legacy: [null, [], { name: 42 }, filter('active'), { ...filter('disabled'), enabled: false }] });
		const migration = fixture.load<typeof import('../migration')>('migration');
		await migration.migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('active'), filter('disabled')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { active: true, disabled: false });
		assert.strictEqual(fixture.state.get('customSearchFilters'), undefined);

		fixture.settings.set('globalFilters', []);
		await migration.migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
	});

	test('retains legacy data and retries when saving settings fails', async () => {
		let fail = true;
		const legacy = [filter('legacy')];
		const fixture = createExtensionFixture({ legacy, beforeUpdate: async () => {
			if (fail) {
				throw new Error('Settings are unavailable');
			}
		} });
		const migration = fixture.load<typeof import('../migration')>('migration');
		await assert.rejects(migration.migrateGlobalFiltersFromState(fixture.context), /Settings are unavailable/);
		assert.deepStrictEqual(fixture.state.get('customSearchFilters'), legacy);
		assert.strictEqual(fixture.state.get('migrationVersion'), undefined);
		fail = false;
		await migration.migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), legacy);
	});
});

suite('Activation regressions', () => {
	test('waits for migration so the first search includes legacy filters', async () => {
		let release!: () => void;
		const pending = new Promise<void>(resolve => { release = resolve; });
		const fixture = createExtensionFixture({ legacy: [filter('legacy')], beforeUpdate: () => pending });
		const activation = fixture.load<typeof import('../extension')>('extension').activate(fixture.context);
		try {
			assert.strictEqual(fixture.handlers.size, 0, 'Commands must wait for migration');
		} finally {
			release();
		}
		await activation;
		await fixture.runCommand('selectAndSearch');
		assert.deepStrictEqual(fixture.picker.items.map(item => item.filter?.name), ['legacy']);
	});

	test('keeps workspace filters usable when migration or global configuration fails', async () => {
		const fixture = createExtensionFixture({
			legacy: [filter('legacy')], workspaceFilters: [filter('project')],
			configurationError: new Error('Configuration unavailable')
		});
		await fixture.load<typeof import('../extension')>('extension').activate(fixture.context);
		await fixture.runCommand('selectAndSearch');
		assert.deepStrictEqual(fixture.picker.items.map(item => item.filter?.name), ['project']);
		assert.deepStrictEqual(fixture.state.get('customSearchFilters'), [filter('legacy')]);
	});
});

suite('Pattern command regressions', () => {
	for (const target of ['include', 'exclude'] as const) {
		const suffix = target === 'include' ? 'Include' : 'Exclude';
		for (const kind of ['Folder', 'FileType'] as const) {
			test(`adds a symbolic link ${kind} to ${target}`, async () => {
				const fixture = createExtensionFixture({
					settings: { globalFilters: [filter('target', '')] },
					fileType: (kind === 'Folder' ? vscode.FileType.Directory : vscode.FileType.File) | vscode.FileType.SymbolicLink
				});
				fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
				const uri = vscode.Uri.joinPath(fixture.folder.uri, kind === 'Folder' ? 'linked-src' : 'linked.ts');
				await fixture.runCommand(`add${kind}To${suffix}`, uri);
				const saved = fixture.settings.get('globalFilters') as SearchFilter[];
				assert.strictEqual(saved[0][target], kind === 'Folder' ? 'linked-src/**/*' : '**/*.ts');
			});
		}

		test(`allows overwriting ${target} with a subset of existing folders`, async () => {
			const existing = { ...filter('target', ''), [target]: 'src/**/*,test/**/*' };
			const fixture = createExtensionFixture({ settings: { globalFilters: [existing] } });
			fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
			await fixture.runCommand(`addFolderTo${suffix}`, vscode.Uri.joinPath(fixture.folder.uri, 'src'));
			assert.deepStrictEqual(fixture.choices[1].map(item => item.action), ['overwrite']);
			const saved = fixture.settings.get('globalFilters') as SearchFilter[];
			assert.strictEqual(saved[0][target], 'src/**/*');
		});
	}

	test('skips writes when append and overwrite would both leave the pattern unchanged', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.strictEqual(fixture.choices.length, 1);
		assert.deepStrictEqual(fixture.updates, []);
		assert.match(fixture.messages[0], /No changes made/);
	});

	test('still supports appending a new folder without losing existing patterns', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.selection.action = 'append';
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'test'));
		const saved = fixture.settings.get('globalFilters') as SearchFilter[];
		assert.strictEqual(saved[0].include, 'src/**/*,test/**/*');
	});
});

suite('Malformed configuration regressions', () => {
	test('skips invalid global entries while preserving valid global and workspace filters', async () => {
		const fixture = createExtensionFixture({
			settings: { globalFilters: [null, false, 42, 'invalid', [], {}, { name: 42 }, filter('valid')] },
			workspaceFilters: [filter('project')]
		});
		const filters = await fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		assert.deepStrictEqual(filters.map(item => item.name), ['valid', 'project']);
	});

	test('keeps workspace filters available when the global list has the wrong type', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: null }, workspaceFilters: [filter('project')] });
		const filters = await fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		assert.deepStrictEqual(filters.map(item => item.name), ['project']);
	});

	test('defaults to enabled when the enabled map is malformed', () => {
		for (const enabled of [null, [], 'invalid', 42]) {
			const fixture = createExtensionFixture({ settings: { globalFilters: [filter('valid')], globalFiltersEnabled: enabled } });
			const filters = fixture.load<typeof import('../storage/globalFilters')>('storage/globalFilters').loadGlobalFilters();
			assert.strictEqual(filters[0].enabled, true);
		}
	});

	test('honors boolean disabled states and ignores invalid enabled values', () => {
		const fixture = createExtensionFixture({ settings: {
			globalFilters: [filter('disabled'), filter('invalid')], globalFiltersEnabled: { disabled: false, invalid: 'false' }
		} });
		const filters = fixture.load<typeof import('../storage/globalFilters')>('storage/globalFilters').loadGlobalFilters();
		assert.deepStrictEqual(filters.map(item => item.enabled), [false, true]);
	});
});
