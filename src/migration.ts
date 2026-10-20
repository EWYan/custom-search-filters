import * as vscode from 'vscode';
import { compareVersions, normalizeFilter } from './model/searchFilter';
import { saveGlobalFilters } from './storage/globalFilters';

const FILTERS_STORAGE_KEY = 'customSearchFilters';
const MIGRATION_VERSION_KEY = 'migrationVersion';
const MIN_MIGRATION_VERSION = '0.1.4';

function needsMigration(lastMigrationVersion: string | undefined): boolean {
	if (!lastMigrationVersion) {
		return true;
	}
	return compareVersions(lastMigrationVersion, MIN_MIGRATION_VERSION) < 0;
}

export async function migrateGlobalFiltersFromState(context: vscode.ExtensionContext): Promise<void> {
	const lastMigrationVersion = context.globalState.get<string>(MIGRATION_VERSION_KEY);
	if (!needsMigration(lastMigrationVersion)) {
		return;
	}

	const config = vscode.workspace.getConfiguration('custom-search-filters');
	// Older releases retained a legacy snapshot after migration. Even an explicit
	// empty user setting is authoritative: merging that snapshot revives deletions.
	if (config.inspect<unknown>('globalFilters')?.globalValue !== undefined) {
		await context.globalState.update(MIGRATION_VERSION_KEY, MIN_MIGRATION_VERSION);
		return;
	}

	const filtersInState = context.globalState.get<unknown>(FILTERS_STORAGE_KEY);
	if (!Array.isArray(filtersInState) || filtersInState.length === 0) {
		await context.globalState.update(MIGRATION_VERSION_KEY, MIN_MIGRATION_VERSION);
		return;
	}

	const filtersToMigrate = filtersInState
		.map(filter => normalizeFilter(filter, 'global'))
		.filter(filter => filter.name.length > 0)
		.map(filter => ({ ...filter, enabled: filter.enabled !== undefined ? filter.enabled : true }));

	if (filtersToMigrate.length > 0) {
		await saveGlobalFilters(filtersToMigrate);
		await context.globalState.update(FILTERS_STORAGE_KEY, undefined);
	}

	await context.globalState.update(MIGRATION_VERSION_KEY, MIN_MIGRATION_VERSION);
}

export async function recoverLegacyFilters(context: vscode.ExtensionContext): Promise<void> {
	const snapshot = context.globalState.get<unknown>(FILTERS_STORAGE_KEY);
	const legacyFilters = Array.isArray(snapshot)
		? snapshot.map(filter => normalizeFilter(filter, 'global')).filter(filter => filter.name.length > 0)
		: [];
	if (legacyFilters.length === 0) {
		await vscode.window.showInformationMessage('No legacy filters are available to recover.');
		return;
	}

	const action = await vscode.window.showWarningMessage(
		'Recover missing legacy filters? This may restore filters you previously deleted. Existing filters and enabled states will be kept.',
		{ modal: true }, 'Recover'
	);
	if (action !== 'Recover') {
		return;
	}

	// Read user values after confirmation; workspace overrides must never be copied into user settings.
	const config = vscode.workspace.getConfiguration('custom-search-filters');
	const currentFilters = config.inspect<unknown>('globalFilters')?.globalValue;
	const currentEnabled = config.inspect<unknown>('globalFiltersEnabled')?.globalValue;
	if ((currentFilters !== undefined && !Array.isArray(currentFilters))
		|| (currentEnabled !== undefined && (currentEnabled === null || typeof currentEnabled !== 'object' || Array.isArray(currentEnabled)))) {
		throw new Error('Fix custom-search-filters user settings before recovering legacy filters.');
	}

	const filters = [...(currentFilters as unknown[] | undefined ?? [])];
	const names = new Set(filters.map(filter => normalizeFilter(filter, 'global').name));
	const recovered = legacyFilters.filter(filter => {
		if (names.has(filter.name)) {
			return false;
		}
		names.add(filter.name);
		return true;
	});
	if (recovered.length === 0) {
		await vscode.window.showInformationMessage('All legacy filter names already exist in your user settings. No changes made.');
		return;
	}

	const enabled = {
		...Object.fromEntries(recovered.map(filter => [filter.name, filter.enabled ?? true])),
		...(currentEnabled as Record<string, unknown> | undefined)
	};
	filters.push(...recovered.map(({ enabled, ...filter }) => filter));
	await config.update('globalFiltersEnabled', enabled, vscode.ConfigurationTarget.Global);
	await config.update('globalFilters', filters, vscode.ConfigurationTarget.Global);
	// Retain the legacy snapshot so a failed or partial historical migration remains recoverable.
	await vscode.window.showInformationMessage(`Recovered ${recovered.length} legacy filter(s).`);
}
