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
