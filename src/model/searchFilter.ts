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

export function scopeLabel(filter: StoredSearchFilter): string {
	return filter.scope === 'workspace'
		? `Project: ${(filter as WorkspaceSearchFilter).workspaceFolder.name}`
		: 'Global';
}

export function splitPatterns(pattern: string | undefined | null): string[] {
	const result: string[] = [];
	let braces = 0;
	let inClass = false;
	let start = 0;
	const value = pattern || '';
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (inClass) {
			if (char === ']') { inClass = false; }
		} else if (char === '[') {
			inClass = true;
		} else if (char === '{') {
			braces++;
		} else if (char === '}') {
			braces = Math.max(0, braces - 1);
		} else if (char === ',' && braces === 0) {
			result.push(value.slice(start, i).trim());
			start = i + 1;
		}
	}
	result.push(value.slice(start).trim());
	return result.filter(Boolean);
}

export function filterKey(filter: StoredSearchFilter): string {
	return JSON.stringify([
		filter.scope || 'global',
		filter.scope === 'workspace' ? (filter as WorkspaceSearchFilter).workspaceFolder.uri.toString() : '',
		filter.name
	]);
}

export interface CombinedFilters extends SearchFilter {
	conflicts: string[];
}

export function combineFilters(filters: SearchFilter[]): CombinedFilters {
	const active = filters.filter(filter => filter.enabled !== false);
	const includes = [...new Set(active.flatMap(filter => splitPatterns(filter.include)))];
	const excludes = [...new Set(active.flatMap(filter => splitPatterns(filter.exclude)))];
	const excluded = new Set(excludes);
	return {
		name: 'Selected filters', scope: 'global',
		include: includes.join(','), exclude: excludes.join(','),
		conflicts: includes.filter(pattern => excluded.has(pattern))
	};
}

export function appendToPattern(existingPattern: string | undefined | null, pathToAdd: string): string {
	if (!existingPattern || existingPattern.trim() === '') {
		return pathToAdd;
	}

	const patterns = splitPatterns(existingPattern);
	if (!patterns.includes(pathToAdd)) {
		patterns.push(pathToAdd);
	}
	return patterns.join(',');
}

export interface PatternChange<T extends SearchFilter> {
	filter: T;
	moved: string[];
	changed: boolean;
}

// Adds patterns to one list and removes identical ones from the other so they
// do not contradict each other. Used by Explorer commands, not rule combination.
export function applyPatterns<T extends SearchFilter>(
	filter: T,
	target: FilterPatternTarget,
	patterns: string[],
	mode: 'append' | 'replace'
): PatternChange<T> {
	const opposite: FilterPatternTarget = target === 'include' ? 'exclude' : 'include';
	const updated = { ...filter };
	const replacement = mode === 'replace'
		? patterns.join(',')
		: patterns.reduce((combined, pattern) => appendToPattern(combined, pattern), filter[target]);
	// Keep the stored text when the pattern list is unchanged, e.g. 'a, b' stays as typed.
	if (replacement !== splitPatterns(filter[target]).join(',')) {
		updated[target] = replacement;
	}

	const oppositePatterns = splitPatterns(filter[opposite]);
	const moved = oppositePatterns.filter(pattern => patterns.includes(pattern));
	if (moved.length > 0) {
		updated[opposite] = oppositePatterns.filter(pattern => !patterns.includes(pattern)).join(',');
	}

	return {
		filter: updated,
		moved,
		changed: updated.include !== filter.include || updated.exclude !== filter.exclude
	};
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
