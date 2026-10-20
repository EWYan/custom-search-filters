import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { migrateGlobalFiltersFromState } from './migration';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Extension "custom-search-filters" is active.');

	try {
		await migrateGlobalFiltersFromState(context);
	} catch (error) {
		console.error('Error during migration:', error);
	}

	registerCommands(context);
}

export function deactivate(): void {}
