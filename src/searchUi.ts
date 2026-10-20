import * as vscode from 'vscode';
import { FilterScope, SearchFilter, StoredSearchFilter, scopeLabel } from './model/searchFilter';
import { patternsForSearch } from './model/searchPatterns';

export interface FilterQuickPickItem extends vscode.QuickPickItem {
	filter: StoredSearchFilter;
}

export function formatFilterLabel(filter: StoredSearchFilter): string {
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
		description: describeFilter(filter),
		filter
	}));
}

export async function runSearch(filter: StoredSearchFilter): Promise<void> {
	const resolved = patternsForSearch(filter);
	await vscode.commands.executeCommand('workbench.action.findInFiles', {
		filesToInclude: resolved.include,
		filesToExclude: resolved.exclude,
		triggerSearch: true,
		showIncludesExcludes: true
	});
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
