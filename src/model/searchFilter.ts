import * as vscode from 'vscode';

export type FilterScope = 'global' | 'workspace';
export type FilterPatternTarget = 'include' | 'exclude';

export interface SearchFilter {
	name: string;
	include: string;
	exclude: string;
	scope?: FilterScope;
	enabled?: boolean;
}

export interface WorkspaceSearchFilter extends SearchFilter {
	scope: 'workspace';
	workspaceFolder: vscode.WorkspaceFolder;
}

export type StoredSearchFilter = SearchFilter | WorkspaceSearchFilter;

export function normalizeFilter(value: unknown, scope: FilterScope): SearchFilter {
	const filter = value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
	return {
		// Stored names are identifiers, including whitespace used by older versions.
		name: typeof filter.name === 'string' ? filter.name : '',
		include: typeof filter.include === 'string' ? filter.include : '',
		exclude: typeof filter.exclude === 'string' ? filter.exclude : '',
		scope,
		enabled: typeof filter.enabled === 'boolean' ? filter.enabled : undefined
	};
}

export function appendToPattern(existingPattern: string | undefined | null, pathToAdd: string): string {
	if (!existingPattern || existingPattern.trim() === '') {
		return pathToAdd;
	}

	const patterns = existingPattern.split(',').map(pattern => pattern.trim()).filter(pattern => pattern !== '');
	if (!patterns.includes(pathToAdd)) {
		patterns.push(pathToAdd);
	}
	return patterns.join(',');
}

export function compareVersions(v1: string, v2: string): number {
	const parts1 = v1.split('.').map(Number);
	const parts2 = v2.split('.').map(Number);
	const maxLength = Math.max(parts1.length, parts2.length);

	for (let i = 0; i < maxLength; i++) {
		const part1 = Number.isFinite(parts1[i]) ? parts1[i] : 0;
		const part2 = Number.isFinite(parts2[i]) ? parts2[i] : 0;
		if (part1 < part2) {
			return -1;
		}
		if (part1 > part2) {
			return 1;
		}
	}

	return 0;
}
