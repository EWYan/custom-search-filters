import * as path from 'path';
import * as vscode from 'vscode';
import { CombinedFilters, SearchFilter, StoredSearchFilter, WorkspaceSearchFilter, combineFilters, splitPatterns } from './searchFilter';

export function usesWorkspaceNames(): boolean {
	return Boolean(vscode.workspace.workspaceFile) || (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

function isSearchPath(pattern: string): boolean {
	// VS Code expands the home directory before classifying paths and globs.
	return path.isAbsolute(pattern) || /^(?:\.\.?|~)([\\/]|$)/.test(pattern);
}

function recursiveGlob(pattern: string): string {
	// Plain search-box globs match at any depth; .ts is shorthand for *.ts.
	const glob = pattern.startsWith('.') ? `*${pattern}` : pattern;
	return `**/${glob.replace(/\\/g, '/').replace(/\/+$/, '')}`.replace(/\*\*\/\*\*/g, '**');
}

function qualifyProjectPattern(pattern: string, prefix: string): string {
	if (/^\.([\\/]|$)/.test(pattern)) {
		return `${prefix}${pattern.replace(/^\.([\\/]|$)/, '')}`;
	}
	return isSearchPath(pattern) ? pattern : `${prefix}${recursiveGlob(pattern)}`;
}

// Project definitions stay relative on disk. Resolve the current workspace alias only when searching.
export function patternsForSearch(filter: StoredSearchFilter): SearchFilter {
	if (filter.scope !== 'workspace' || !usesWorkspaceNames()) {
		return { ...filter };
	}
	const folder = (filter as WorkspaceSearchFilter).workspaceFolder;
	const qualify = (value: string) => splitPatterns(value)
		.map(pattern => qualifyProjectPattern(pattern, `./${folder.name}/`)).join(',');
	return { ...filter, include: qualify(filter.include), exclude: qualify(filter.exclude) };
}

export function combineForSearch(filters: StoredSearchFilter[]): CombinedFilters {
	const folders = vscode.workspace.workspaceFolders || [];
	const resolved = filters.filter(filter => filter.enabled !== false).map(patternsForSearch);
	const includes = resolved.filter(filter => splitPatterns(filter.include).length > 0);
	const namedRoots = usesWorkspaceNames();
	if (!folders.length || (!namedRoots && !resolved.some(filter => splitPatterns(filter.include).some(isSearchPath)))) {
		return combineFilters(resolved);
	}
	// VS Code intersects unqualified includes with ./root search paths. Expand global
	// includes per root so combining global and project rules remains an OR operation.
	const expandGlobals = (value: string) => splitPatterns(value).flatMap(pattern => {
		if (isSearchPath(pattern)) { return [pattern]; }
		return folders.map(folder => `./${namedRoots ? folder.name + '/' : ''}${recursiveGlob(pattern)}`);
	}).join(',');
	const expanded = resolved.map(filter => {
		if (filter.scope !== 'workspace') { return { ...filter, include: expandGlobals(filter.include) }; }
		if (namedRoots) { return filter; }
		const anchor = (value: string) => splitPatterns(value).map(pattern => qualifyProjectPattern(pattern, './')).join(',');
		return { ...filter, include: anchor(filter.include), exclude: anchor(filter.exclude) };
	});
	const combined = combineFilters(expanded);
	// With only one include-bearing filter there is no include union to resolve.
	// Preserve VS Code's path/glob intersection (e.g. ./src,**/*.ts), including
	// when the other filters only add exclusions or are disabled.
	if (includes.length === 1) { combined.include = includes[0].include; }
	// Compare global excludes in the same coordinate system without changing how they
	// apply to absolute search paths outside the workspace.
	combined.conflicts = combineFilters(expanded.map(filter => filter.scope === 'workspace'
		? filter : { ...filter, exclude: expandGlobals(filter.exclude) })).conflicts;
	return combined;
}
