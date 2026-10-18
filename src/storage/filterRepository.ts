import * as vscode from 'vscode';
import { SearchFilter, StoredSearchFilter, WorkspaceSearchFilter } from '../model/searchFilter';
import { loadGlobalFilters, saveGlobalFilters } from './globalFilters';
import { getWorkspaceFolderForUri, loadAllWorkspaceFilters, loadWorkspaceFilters, saveWorkspaceFilters } from './workspaceFilters';

export async function loadAllFilters(): Promise<StoredSearchFilter[]> {
	return [
		...loadGlobalFilters(),
		...await loadAllWorkspaceFilters()
	];
}

export async function saveFilter(filter: SearchFilter, targetWorkspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
	const scope = filter.scope || 'global';

	if (scope === 'workspace') {
		const workspaceFolder = targetWorkspaceFolder || getWorkspaceFolderForUri();
		if (!workspaceFolder) {
			throw new Error('No workspace folder is available for workspace filter storage.');
		}

		const filters = await loadWorkspaceFilters(workspaceFolder);
		const existingIndex = filters.findIndex(existing => existing.name === filter.name);
		if (existingIndex > -1) {
			filters[existingIndex] = { ...filter, scope: 'workspace', workspaceFolder };
		} else {
			filters.push({ ...filter, scope: 'workspace', workspaceFolder });
		}
		await saveWorkspaceFilters(workspaceFolder, filters);
		return;
	}

	const filters = loadGlobalFilters();
	const existingIndex = filters.findIndex(existing => existing.name === filter.name);
	if (existingIndex > -1) {
		filters[existingIndex] = {
			...filter,
			scope: 'global',
			enabled: filter.enabled !== undefined ? filter.enabled : filters[existingIndex].enabled
		};
	} else {
		filters.push({ ...filter, scope: 'global', enabled: filter.enabled !== undefined ? filter.enabled : true });
	}
	await saveGlobalFilters(filters);
}

export async function deleteFilter(filter: StoredSearchFilter): Promise<void> {
	if (filter.scope === 'workspace') {
		const workspaceFilter = filter as WorkspaceSearchFilter;
		const filters = await loadWorkspaceFilters(workspaceFilter.workspaceFolder);
		await saveWorkspaceFilters(
			workspaceFilter.workspaceFolder,
			filters.filter(existing => existing.name !== filter.name)
		);
		return;
	}

	await saveGlobalFilters(loadGlobalFilters().filter(existing => existing.name !== filter.name));
}
