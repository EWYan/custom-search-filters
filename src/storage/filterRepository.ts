import * as vscode from 'vscode';
import { FilterScope, SearchFilter, StoredSearchFilter, WorkspaceSearchFilter, filterKey } from '../model/searchFilter';
import { notifyFilterChange } from './filterEvents';
import { loadGlobalFilters, saveGlobalFilters } from './globalFilters';
import { getWorkspaceFolderForUri, loadAllWorkspaceFilters, loadWorkspaceFilters, saveWorkspaceFilters } from './workspaceFilters';

export async function loadAllFilters(): Promise<StoredSearchFilter[]> {
	return [
		...loadGlobalFilters(),
		...await loadAllWorkspaceFilters()
	];
}

export function hasNameConflict(
	filters: StoredSearchFilter[],
	name: string,
	scope: FilterScope,
	workspaceFolder?: vscode.WorkspaceFolder,
	originalName?: string
): boolean {
	return filters.some(existing => {
		if (existing.name !== name || existing.name === originalName || existing.scope !== scope) {
			return false;
		}
		if (scope !== 'workspace') {
			return true;
		}
		return (existing as WorkspaceSearchFilter).workspaceFolder.uri.toString() === workspaceFolder?.uri.toString();
	});
}

// Pass originalName when renaming so the filter keeps its position and is written once.
export async function saveFilter(filter: SearchFilter, targetWorkspaceFolder?: vscode.WorkspaceFolder, originalName?: string): Promise<void> {
	const scope = filter.scope || 'global';
	const nameToReplace = originalName ?? filter.name;

	if (scope === 'workspace') {
		const workspaceFolder = targetWorkspaceFolder || getWorkspaceFolderForUri();
		if (!workspaceFolder) {
			throw new Error('No workspace folder is available for workspace filter storage.');
		}

		const filters = await loadWorkspaceFilters(workspaceFolder);
		const existingIndex = filters.findIndex(existing => existing.name === nameToReplace);
		if (existingIndex > -1) {
			filters[existingIndex] = { ...filter, scope: 'workspace', workspaceFolder };
		} else {
			filters.push({ ...filter, scope: 'workspace', workspaceFolder });
		}
		await saveWorkspaceFilters(workspaceFolder, filters);
		notifyFilterChange({
			previousKey: filterKey({ ...filter, name: nameToReplace, scope: 'workspace', workspaceFolder }),
			filter: { ...filter, scope: 'workspace', workspaceFolder }
		});
		return;
	}

	const filters = loadGlobalFilters();
	const existingIndex = filters.findIndex(existing => existing.name === nameToReplace);
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
	notifyFilterChange({ previousKey: filterKey({ ...filter, name: nameToReplace, scope: 'global' }), filter });
}

export async function deleteFilter(filter: StoredSearchFilter): Promise<void> {
	if (filter.scope === 'workspace') {
		const workspaceFilter = filter as WorkspaceSearchFilter;
		const filters = await loadWorkspaceFilters(workspaceFilter.workspaceFolder);
		await saveWorkspaceFilters(
			workspaceFilter.workspaceFolder,
			filters.filter(existing => existing.name !== filter.name)
		);
		notifyFilterChange({ previousKey: filterKey(filter) });
		return;
	}

	await saveGlobalFilters(loadGlobalFilters().filter(existing => existing.name !== filter.name));
	notifyFilterChange({ previousKey: filterKey(filter) });
}
