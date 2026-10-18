import * as vscode from 'vscode';
import { SearchFilter, normalizeFilter } from '../model/searchFilter';

const SECTION = 'custom-search-filters';
const FILTERS_KEY = 'globalFilters';
const ENABLED_KEY = 'globalFiltersEnabled';

export function loadGlobalFilters(): SearchFilter[] {
	try {
		const config = vscode.workspace.getConfiguration(SECTION);
		const filters = config.get<unknown>(FILTERS_KEY, []);
		const enabledValue = config.get<unknown>(ENABLED_KEY, {});
		const enabledMap = enabledValue !== null && typeof enabledValue === 'object' && !Array.isArray(enabledValue)
			? enabledValue as Record<string, unknown>
			: {};

		if (!Array.isArray(filters)) {
			return [];
		}

		return filters
			.map(filter => {
				const normalized = normalizeFilter(filter, 'global');
				normalized.enabled = Object.prototype.hasOwnProperty.call(enabledMap, normalized.name)
					&& typeof enabledMap[normalized.name] === 'boolean'
					? enabledMap[normalized.name] as boolean
					: true;
				return normalized;
			})
			.filter(filter => filter.name.length > 0);
	} catch (error) {
		console.error('Error loading global filters:', error);
		return [];
	}
}

export async function saveGlobalFilters(filters: SearchFilter[]): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	const globalFilters = filters
		.map(filter => normalizeFilter(filter, 'global'))
		.filter(filter => filter.name.length > 0);

	const filtersToSave = globalFilters.map(filter => {
		const { enabled, ...filterWithoutEnabled } = filter;
		return filterWithoutEnabled;
	});

	const enabledMap = Object.fromEntries(globalFilters.map(filter => [filter.name, filter.enabled ?? true]));

	// Keep migration retryable if either write fails: definitions mark the import as present.
	await config.update(ENABLED_KEY, enabledMap, vscode.ConfigurationTarget.Global);
	await config.update(FILTERS_KEY, filtersToSave, vscode.ConfigurationTarget.Global);
}
