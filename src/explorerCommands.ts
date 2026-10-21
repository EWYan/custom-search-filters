import * as path from 'path';
import * as vscode from 'vscode';
import { editFilterInteractively } from './filterEditor';
import {
	FilterPatternTarget, FilterScope, SearchFilter, StoredSearchFilter, WorkspaceSearchFilter, applyPatterns, filterKey
} from './model/searchFilter';
import { usesWorkspaceNames } from './model/searchPatterns';
import { describeFilter, formatFilterLabel, askFilterScope, runSearch } from './searchUi';
import { hasNameConflict, loadAllFilters, saveFilter } from './storage/filterRepository';
import { getWorkspaceFolderForUri } from './storage/workspaceFilters';

type PatternKind = 'folder' | 'fileType';

interface TargetItem extends vscode.QuickPickItem {
	action?: 'new';
	filter?: StoredSearchFilter;
}

interface TargetChoice {
	item: TargetItem;
	mode: 'append' | 'replace';
}

const REPLACE_BUTTON: vscode.QuickInputButton = {
	iconPath: new vscode.ThemeIcon('replace'),
	tooltip: 'Replace the existing patterns instead of appending'
};

function commandUris(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): vscode.Uri[] {
	if (uris && uris.length > 0) {
		return uris;
	}
	return uri ? [uri] : [];
}

function workspaceFolderOf(filter: StoredSearchFilter): vscode.WorkspaceFolder | undefined {
	return filter.scope === 'workspace' ? (filter as WorkspaceSearchFilter).workspaceFolder : undefined;
}

function plural(count: number, singular: string, pluralForm: string): string {
	return count === 1 ? singular : pluralForm;
}

function describePatterns(kind: PatternKind, target: FilterPatternTarget, patterns: string[]): string {
	const noun = kind === 'folder'
		? plural(patterns.length, 'folder', 'folders')
		: plural(patterns.length, 'file type', 'file types');
	const verb = target === 'include' ? 'Include' : 'Exclude';
	return `${verb} ${patterns.length} ${noun}: ${patterns.join(', ')}`;
}

export function suggestFilterName(kind: PatternKind, target: FilterPatternTarget, patterns: string[], workspaceFolder?: vscode.WorkspaceFolder): string {
	const labels = patterns.map(pattern => kind === 'fileType'
		? pattern.replace(/^\*\*\//, '')
		: path.posix.basename(pattern.replace(/\/?\*\*\/\*$/, '')) || workspaceFolder?.name || 'workspace');
	const shown = labels.slice(0, 3).join(' + ') + (labels.length > 3 ? ` +${labels.length - 3}` : '');
	const name = kind === 'fileType' ? `${shown} files` : shown;
	return target === 'exclude' ? `Exclude ${name}` : name;
}

async function folderPatternsFromUris(uris: vscode.Uri[]): Promise<string[]> {
	const patterns = new Set<string>();
	for (const uri of uris) {
		try {
			const stats = await vscode.workspace.fs.stat(uri);
			if ((stats.type & vscode.FileType.Directory) === 0) {
				continue;
			}

			const workspaceFolder = getWorkspaceFolderForUri(uri);
			if (!workspaceFolder) {
				continue;
			}

			const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
			// Multi-root search scopes './<folder name>/...' to that root; plain paths match in every root.
			patterns.add(usesWorkspaceNames()
				? `./${path.posix.join(workspaceFolder.name, relativePath, '**', '*')}`
				: path.posix.join(relativePath || '.', '**', '*'));
		} catch (error) {
			console.warn(`Skipping non-folder or invalid URI: ${uri.toString()}`, error);
		}
	}
	return [...patterns];
}

async function fileTypePatternsFromUris(uris: vscode.Uri[]): Promise<string[]> {
	const patterns = new Set<string>();
	for (const uri of uris) {
		try {
			const stats = await vscode.workspace.fs.stat(uri);
			if ((stats.type & vscode.FileType.File) === 0) {
				continue;
			}

			const fileExtension = path.extname(uri.fsPath);
			if (fileExtension) {
				patterns.add(`**/*${fileExtension}`);
			}
		} catch (error) {
			console.warn(`Skipping non-file or invalid URI: ${uri.toString()}`, error);
		}
	}
	return [...patterns];
}

function patternsForScope(kind: PatternKind, patterns: string[], folder?: vscode.WorkspaceFolder): string[] | undefined {
	if (kind !== 'folder' || !folder) {
		return patterns;
	}
	// Explorer selections identify a particular folder, not every folder with that name.
	if (!usesWorkspaceNames()) { return patterns.map(pattern => `./${pattern}`); }
	const prefix = `./${folder.name}/`;
	return patterns.every(pattern => pattern.startsWith(prefix))
		? patterns.map(pattern => `./${pattern.slice(prefix.length)}`) : undefined;
}

function targetItems(filters: StoredSearchFilter[], kind: PatternKind, target: FilterPatternTarget, patterns: string[]): TargetItem[] {
	const opposite = target === 'include' ? 'exclude' : 'include';
	const items: TargetItem[] = [{ label: '$(add) New Filter...', description: 'Create a filter with these patterns', action: 'new' }];
	if (filters.length > 0) {
		items.push({ label: 'Add to existing filter', kind: vscode.QuickPickItemKind.Separator });
	}
	for (const filter of filters) {
		const scoped = patternsForScope(kind, patterns, workspaceFolderOf(filter));
		if (!scoped) { continue; }
		const change = applyPatterns(filter, target, scoped, 'append');
		let detail: string | undefined;
		if (!change.changed) {
			detail = '$(check) Already contains these patterns';
		} else if (change.moved.length > 0) {
			detail = `$(arrow-swap) Moves ${change.moved.join(', ')} out of ${opposite}`;
		}
		items.push({ label: formatFilterLabel(filter), description: describeFilter(filter), detail, filter, buttons: [REPLACE_BUTTON] });
	}
	return items;
}

function pickTarget(title: string, items: TargetItem[]): Promise<TargetChoice | undefined> {
	return new Promise(resolve => {
		const quickPick = vscode.window.createQuickPick<TargetItem>();
		let choice: TargetChoice | undefined;
		quickPick.title = title;
		quickPick.placeholder = 'Select a filter to append to, or create a new one';
		quickPick.matchOnDescription = true;
		quickPick.items = items;
		quickPick.onDidAccept(() => {
			const item = quickPick.selectedItems[0];
			if (item) {
				choice = { item, mode: 'append' };
				quickPick.hide();
			}
		});
		quickPick.onDidTriggerItemButton(event => {
			choice = { item: event.item, mode: 'replace' };
			quickPick.hide();
		});
		quickPick.onDidHide(() => {
			quickPick.dispose();
			resolve(choice);
		});
		quickPick.show();
	});
}

async function offerFollowUp(message: string, saved: StoredSearchFilter, undo?: () => Promise<void>): Promise<void> {
	const actions = undo ? ['Search Now', 'Edit Filter', 'Undo'] : ['Search Now', 'Edit Filter'];
	const action = await vscode.window.showInformationMessage(message, ...actions);
	if (action === 'Undo' && undo) {
		await undo();
		return;
	}
	if (action !== 'Search Now' && action !== 'Edit Filter') { return; }
	const current = (await loadAllFilters()).find(filter => filterKey(filter) === filterKey(saved));
	if (!current) {
		vscode.window.showInformationMessage('This filter no longer exists.');
		return;
	}
	if (action === 'Search Now') {
		await runSearch(current);
	} else if (action === 'Edit Filter') {
		const result = await editFilterInteractively(current);
		if (result.outcome === 'saveAndSearch') {
			await runSearch(result.filter);
		}
	}
}

async function createFilter(kind: PatternKind, target: FilterPatternTarget, patterns: string[], contextUri: vscode.Uri | undefined): Promise<void> {
	const workspaceFolder = getWorkspaceFolderForUri(contextUri);
	// Folder paths belong to a project; file types are useful everywhere.
	const preferred: FilterScope = kind === 'folder' ? 'workspace' : 'global';
	const scope = workspaceFolder ? await askFilterScope(workspaceFolder, preferred) : 'global';
	if (!scope) {
		return;
	}

	const folder = scope === 'workspace' ? workspaceFolder : undefined;
	const scopedPatterns = patternsForScope(kind, patterns, folder);
	if (!scopedPatterns) {
		vscode.window.showErrorMessage('Use a global filter for folders selected from multiple workspace roots.');
		return;
	}
	const scopeText = scope === 'workspace' ? 'project' : 'global';
	const existing = await loadAllFilters();
	const name = await vscode.window.showInputBox({
		title: describePatterns(kind, target, patterns),
		prompt: 'Name for the new filter',
		value: suggestFilterName(kind, target, patterns, workspaceFolder),
		ignoreFocusOut: true,
		validateInput: text => {
			if (!text.trim()) {
				return 'Filter name cannot be empty.';
			}
			return hasNameConflict(existing, text.trim(), scope, folder)
				? `A filter named '${text.trim()}' already exists in this ${scopeText} scope.`
				: null;
		}
	});
	if (!name?.trim()) {
		return;
	}

	const filter: SearchFilter = {
		name: name.trim(),
		include: target === 'include' ? scopedPatterns.join(',') : '',
		exclude: target === 'exclude' ? scopedPatterns.join(',') : '',
		scope,
		enabled: scope === 'global' ? true : undefined
	};
	if (hasNameConflict(await loadAllFilters(), filter.name, scope, folder)) {
		vscode.window.showErrorMessage(`A filter named '${filter.name}' already exists in this ${scopeText} scope.`);
		return;
	}
	await saveFilter(filter, folder);
	const saved: StoredSearchFilter = folder ? { ...filter, scope: 'workspace', workspaceFolder: folder } : filter;
	await offerFollowUp(`Created filter '${filter.name}'.`, saved);
}

async function addPatternsToFilter(kind: PatternKind, target: FilterPatternTarget, patterns: string[], contextUri: vscode.Uri | undefined): Promise<void> {
	const contextFolder = getWorkspaceFolderForUri(contextUri);
	// Project filters of other roots would receive paths that belong to this root.
	const filters = (await loadAllFilters()).filter(filter => filter.scope !== 'workspace'
		|| workspaceFolderOf(filter)?.uri.toString() === contextFolder?.uri.toString());
	const choice = await pickTarget(describePatterns(kind, target, patterns), targetItems(filters, kind, target, patterns));
	if (!choice) {
		return;
	}
	if (choice.item.action === 'new' || !choice.item.filter) {
		await createFilter(kind, target, patterns, contextUri);
		return;
	}

	const before = (await loadAllFilters()).find(filter => filterKey(filter) === filterKey(choice.item.filter!));
	if (!before) {
		vscode.window.showInformationMessage('This filter no longer exists.');
		return;
	}
	const scopedPatterns = patternsForScope(kind, patterns, workspaceFolderOf(before));
	if (!scopedPatterns) { return; }
	const change = applyPatterns(before, target, scopedPatterns, choice.mode);
	if (!change.changed) {
		vscode.window.showInformationMessage(`Filter '${before.name}' already contains ${patterns.join(', ')} in '${target}'. No changes made.`);
		return;
	}

	const folder = workspaceFolderOf(before);
	await saveFilter(change.filter, folder);
	const opposite = target === 'include' ? 'exclude' : 'include';
	const verb = choice.mode === 'replace' ? `Replaced '${target}' of '${before.name}' with` : `Added to '${target}' of '${before.name}':`;
	const movedNote = change.moved.length > 0 ? ` Moved ${change.moved.join(', ')} out of '${opposite}'.` : '';
	await offerFollowUp(`${verb} ${patterns.join(', ')}.${movedNote}`, change.filter, async () => {
		const current = (await loadAllFilters()).find(filter => filterKey(filter) === filterKey(before));
		if (!current || current.include !== change.filter.include || current.exclude !== change.filter.exclude
			|| (current.enabled !== false) !== (change.filter.enabled !== false)) {
			vscode.window.showWarningMessage('Cannot undo: this filter was changed or deleted after this operation.');
			return;
		}
		await saveFilter(before, folder);
		vscode.window.showInformationMessage(`Restored filter '${before.name}'.`);
	});
}

export async function addFolders(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined, target: FilterPatternTarget): Promise<void> {
	const selectedUris = commandUris(uri, uris);
	const patterns = await folderPatternsFromUris(selectedUris);
	if (patterns.length === 0) {
		vscode.window.showInformationMessage('No valid folders selected or found within the workspace.');
		return;
	}
	await addPatternsToFilter('folder', target, patterns, selectedUris[0]);
}

export async function addFileTypes(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined, target: FilterPatternTarget): Promise<void> {
	const selectedUris = commandUris(uri, uris);
	const patterns = await fileTypePatternsFromUris(selectedUris);
	if (patterns.length === 0) {
		vscode.window.showInformationMessage('No valid files with extensions selected.');
		return;
	}
	await addPatternsToFilter('fileType', target, patterns, selectedUris[0]);
}
