import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

	test('retries migration with disabled states intact when the second settings write fails', async () => {
		let fail = true;
		const legacy = [{ ...filter(' disabled '), enabled: false }];
		const fixture = createExtensionFixture({ legacy, beforeUpdate: async key => {
			if (fail && key === 'globalFilters') {
				throw new Error('Definitions write failed');
			}
		} });
		const migration = fixture.load<typeof import('../migration')>('migration');
		await assert.rejects(migration.migrateGlobalFiltersFromState(fixture.context), /Definitions write failed/);
		assert.strictEqual(fixture.settings.get('globalFilters'), undefined);
		assert.strictEqual(fixture.state.get('migrationVersion'), undefined);
		assert.deepStrictEqual(fixture.state.get('customSearchFilters'), legacy);
		fail = false;
		await migration.migrateGlobalFiltersFromState(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter(' disabled ')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { ' disabled ': false });
		assert.strictEqual(fixture.state.get('customSearchFilters'), undefined);
	});
});

suite('Legacy recovery regressions', () => {
	test('recovers a snapshot left behind by a completed 0.2.2 migration only on request', async () => {
		const legacy = [{ ...filter(' old '), enabled: false }];
		const fixture = createExtensionFixture({ legacy });
		fixture.state.set('migrationVersion', '0.1.4');
		await fixture.load<typeof import('../extension')>('extension').activate(fixture.context);
		assert.deepStrictEqual(fixture.updates, []);
		fixture.selection.warning = 'Recover';
		await fixture.runCommand('recoverLegacyFilters');
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter(' old ')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { ' old ': false });
		assert.deepStrictEqual(fixture.state.get('customSearchFilters'), legacy);
	});

	test('leaves an explicitly empty list untouched when recovery is cancelled', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [] }, legacy: [filter('deleted')] });
		await fixture.load<typeof import('../migration')>('migration').recoverLegacyFilters(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
		assert.deepStrictEqual(fixture.updates, []);
	});

	test('merges missing names without replacing user values or importing workspace overrides', async () => {
		const current = [filter('existing', 'current/**/*'), null];
		const fixture = createExtensionFixture({
			settings: { globalFilters: current, globalFiltersEnabled: { existing: false, recovered: false } },
			workspaceSettings: { globalFilters: [filter('workspace-override')], globalFiltersEnabled: { recovered: true } },
			legacy: [filter('existing', 'old/**/*'), filter('recovered'), filter('recovered', 'duplicate/**/*')]
		});
		fixture.selection.warning = 'Recover';
		const migration = fixture.load<typeof import('../migration')>('migration');
		await migration.recoverLegacyFilters(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [...current, filter('recovered')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { existing: false, recovered: false });
		fixture.updates.length = 0;
		await migration.recoverLegacyFilters(fixture.context);
		assert.deepStrictEqual(fixture.updates, [], 'A second recovery must not duplicate filters or reset enabled states');
	});

	test('recovers into an intentionally empty list only after confirmation', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [] }, legacy: [filter('deleted')] });
		fixture.selection.warning = 'Recover';
		await fixture.load<typeof import('../migration')>('migration').recoverLegacyFilters(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('deleted')]);
	});

	test('keeps invalid user settings intact and reports the recovery error', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: null }, legacy: [filter('legacy')] });
		fixture.selection.warning = 'Recover';
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		await fixture.runCommand('recoverLegacyFilters');
		assert.strictEqual(fixture.settings.get('globalFilters'), null);
		assert.deepStrictEqual(fixture.updates, []);
		assert.match(fixture.messages.at(-1)!, /Could not recover legacy filters/);
	});

	test('retries recovery after a partial write without losing disabled states', async () => {
		let fail = true;
		const fixture = createExtensionFixture({
			settings: { globalFilters: [] }, legacy: [{ ...filter('disabled'), enabled: false }],
			beforeUpdate: async key => {
				if (fail && key === 'globalFilters') {
					throw new Error('Definitions write failed');
				}
			}
		});
		fixture.selection.warning = 'Recover';
		const migration = fixture.load<typeof import('../migration')>('migration');
		await assert.rejects(migration.recoverLegacyFilters(fixture.context), /Definitions write failed/);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), []);
		fail = false;
		await migration.recoverLegacyFilters(fixture.context);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('disabled')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { disabled: false });
	});
});

suite('Stored name compatibility', () => {
	test('preserves whitespace in global and workspace names and keeps disabled states', async () => {
		const fixture = createExtensionFixture({
			settings: { globalFilters: [filter('api'), filter(' api ')], globalFiltersEnabled: { ' api ': false } },
			workspaceFilters: [filter(' project ')]
		});
		const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
		const filters = await repository.loadAllFilters();
		assert.deepStrictEqual(filters.map(item => item.name), ['api', ' api ', ' project ']);
		assert.strictEqual(filters[1].enabled, false);
		await repository.deleteFilter(filters[0]);
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter(' api ')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { ' api ': false });
	});

	test('preserves disabled states for names matching object properties', async () => {
		const fixture = createExtensionFixture({ settings: {
			globalFilters: [filter('__proto__')], globalFiltersEnabled: JSON.parse('{"__proto__": false}')
		} });
		const storage = fixture.load<typeof import('../storage/globalFilters')>('storage/globalFilters');
		await storage.saveGlobalFilters(storage.loadGlobalFilters());
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), JSON.parse('{"__proto__": false}'));
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
				fixture.picks.push('target');
				const uri = vscode.Uri.joinPath(fixture.folder.uri, kind === 'Folder' ? 'linked-src' : 'linked.ts');
				await fixture.runCommand(`add${kind}To${suffix}`, uri);
				const saved = fixture.settings.get('globalFilters') as SearchFilter[];
				assert.strictEqual(saved[0][target], kind === 'Folder' ? 'linked-src/**/*' : '**/*.ts');
			});
		}

		test(`allows replacing ${target} with a subset of existing folders`, async () => {
			const existing = { ...filter('target', ''), [target]: 'src/**/*,test/**/*' };
			const fixture = createExtensionFixture({ settings: { globalFilters: [existing] } });
			fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
			fixture.picks.push({ item: 'target', button: 0 });
			await fixture.runCommand(`addFolderTo${suffix}`, vscode.Uri.joinPath(fixture.folder.uri, 'src'));
			assert.match(String(fixture.choices[0].find(item => item.filter)?.detail), /Already contains/);
			const saved = fixture.settings.get('globalFilters') as SearchFilter[];
			assert.strictEqual(saved[0][target], 'src/**/*');
		});
	}

	test('skips writes when append and overwrite would both leave the pattern unchanged', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		fixture.picks.push('target');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.strictEqual(fixture.choices.length, 1);
		assert.deepStrictEqual(fixture.updates, []);
		assert.match(fixture.messages[0], /No changes made/);
	});

	test('still supports appending a new folder without losing existing patterns', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [filter('target')] } });
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		fixture.picks.push('target');
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

suite('Workspace setting override regressions', () => {
	const workspaceSettings = {
		globalFilters: [filter('workspace-override')],
		globalFiltersEnabled: { user: true, 'workspace-override': true }
	};

	test('lists only user-level global filters and enabled states', async () => {
		const fixture = createExtensionFixture({
			settings: { globalFilters: [filter('user')], globalFiltersEnabled: { user: false } },
			workspaceSettings
		});
		const filters = await fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository').loadAllFilters();
		assert.deepStrictEqual(filters.map(item => [item.name, item.enabled]), [['user', false]]);
	});

	test('saves and deletes global filters without copying workspace values into user settings', async () => {
		const fixture = createExtensionFixture({
			settings: { globalFilters: [filter('user')], globalFiltersEnabled: { user: false } },
			workspaceSettings
		});
		const repository = fixture.load<typeof import('../storage/filterRepository')>('storage/filterRepository');
		await repository.saveFilter(filter('added'));
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('user'), filter('added')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { user: false, added: true });

		await repository.deleteFilter(filter('user'));
		assert.deepStrictEqual(fixture.settings.get('globalFilters'), [filter('added')]);
		assert.deepStrictEqual(fixture.settings.get('globalFiltersEnabled'), { added: true });
	});
});

suite('Workspace filter enabled state', () => {
	test('hides workspace filters explicitly disabled in the project file', async () => {
		const fixture = createExtensionFixture({
			workspaceFilters: [{ ...filter('disabled'), enabled: false }, filter('default'), { ...filter('enabled'), enabled: true }]
		});
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		await fixture.runCommand('selectAndSearch');
		assert.deepStrictEqual(fixture.picker.items.map(item => item.filter?.name), ['default', 'enabled']);
	});

	test('keeps a disabled workspace filter disabled when its patterns are updated', async () => {
		const fixture = createExtensionFixture({ workspaceFilters: [{ ...filter('disabled', ''), enabled: false }] });
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		fixture.picks.push('disabled');
		await fixture.runCommand('addFolderToInclude', vscode.Uri.joinPath(fixture.folder.uri, 'src'));
		assert.deepStrictEqual(fixture.workspaceWrites, [[{ ...filter('disabled'), scope: 'workspace', enabled: false }]]);
	});
});

suite('Multi-root folder patterns', () => {
	for (const [relative, expected] of [['src', './fixture/src/**/*'], ['', './fixture/**/*']] as const) {
		test(`scopes ${relative || 'a root'} folder to its workspace folder name`, async () => {
			const fixture = createExtensionFixture({
				settings: { globalFilters: [filter('target', '')] },
				extraWorkspaceFolderNames: ['other']
			});
			fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
			fixture.picks.push('target');
			const uri = relative ? vscode.Uri.joinPath(fixture.folder.uri, relative) : fixture.folder.uri;
			await fixture.runCommand('addFolderToExclude', uri);
			const saved = fixture.settings.get('globalFilters') as SearchFilter[];
			assert.strictEqual(saved[0].exclude, expected);
		});
	}

	test('keeps plain relative folder patterns in a single-root workspace', async () => {
		const fixture = createExtensionFixture({ settings: { globalFilters: [filter('target', '')] } });
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		fixture.picks.push('target');
		await fixture.runCommand('addFolderToInclude', fixture.folder.uri);
		const saved = fixture.settings.get('globalFilters') as SearchFilter[];
		assert.strictEqual(saved[0].include, '**/*');
	});
});

suite('Manifest consistency', () => {
	test('registers every contributed command and relies on implicit activation', () => {
		const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
		const fixture = createExtensionFixture();
		fixture.load<typeof import('../commands')>('commands').registerCommands(fixture.context);
		const contributed = manifest.contributes.commands.map((command: { command: string }) => command.command).sort();
		assert.deepStrictEqual([...fixture.handlers.keys()].sort(), contributed);
		assert.deepStrictEqual(manifest.activationEvents, []);
	});
});
