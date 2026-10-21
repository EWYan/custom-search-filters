import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerFiltersView } from './filtersView';
import { migrateGlobalFiltersFromState } from './migration';
import { initPinnedFilters } from './storage/pinnedFilters';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Extension "custom-search-filters" is active.');
	initPinnedFilters(context);

	try {
		await migrateGlobalFiltersFromState(context);
	} catch (error) {
		console.error('Error during migration:', error);
	}

	registerCommands(context);
	await registerFiltersView(context);
}

export function deactivate(): void {}
