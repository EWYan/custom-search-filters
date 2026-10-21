import * as vscode from 'vscode';
import { FilterScope, SearchFilter, StoredSearchFilter, filterKey, isBuiltinFilter, scopeLabel } from './model/searchFilter';
import { combineForSearch, patternsForSearch } from './model/searchPatterns';
import { loadSearchFilters } from './storage/filterRepository';
import { hasPinnedFilters, pinnedFilters } from './storage/pinnedFilters';

export interface FilterQuickPickItem extends vscode.QuickPickItem {
	filter: StoredSearchFilter;
}

export function formatFilterLabel(filter: StoredSearchFilter): string {
	if (isBuiltinFilter(filter)) { return `$(globe) ${filter.name}`; }
	const scopeIcon = filter.scope === 'workspace' ? '$(folder)' : '$(globe)';
	return `${scopeIcon} ${filter.name} (${scopeLabel(filter)})`;
}

export function describeFilter(filter: SearchFilter): string {
	const description = `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`;
	return filter.enabled === false ? `${description} · Disabled` : description;
}

export function toFilterQuickPickItems(filters: StoredSearchFilter[]): FilterQuickPickItem[] {
	return filters.map(filter => ({
		label: formatFilterLabel(filter),
		description: isBuiltinFilter(filter) ? 'Built-in · Global' : describeFilter(filter),
		filter
	}));
}

// Fills the search path fields with patterns that are already resolved for the workspace.
export async function searchWithPatterns(patterns: SearchFilter): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.findInFiles', {
		filesToInclude: patterns.include,
		filesToExclude: patterns.exclude,
		triggerSearch: true,
		showIncludesExcludes: true
	});
}

// Searches with one filter plus every enabled pinned filter.
export async function runSearch(filter: StoredSearchFilter): Promise<void> {
	const pinned = hasPinnedFilters()
		? pinnedFilters(await loadSearchFilters()).filter(other => filterKey(other) !== filterKey(filter))
		: [];
	// The chosen filter is applied even when disabled, as before pins existed.
	await searchWithPatterns(pinned.length > 0
		? combineForSearch([{ ...filter, enabled: true }, ...pinned])
		: patternsForSearch(filter));
}

export async function askFilterScope(workspaceFolder?: vscode.WorkspaceFolder, preferred: FilterScope = 'global'): Promise<FilterScope | undefined> {
	const items: Array<vscode.QuickPickItem & { value: FilterScope }> = [
		{ label: '$(globe) Global', description: 'Available across all projects', value: 'global' }
	];

	if (workspaceFolder) {
		const projectItem = {
			label: '$(folder) Current Project',
			description: `Stored in ${workspaceFolder.name}`,
			value: 'workspace' as const
		};
		if (preferred === 'workspace') {
			items.unshift(projectItem);
		} else {
			items.push(projectItem);
		}
	}

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Where should this filter be saved?'
	});
	return selected?.value;
}
