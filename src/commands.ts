import * as path from 'path';
import * as vscode from 'vscode';
import { FilterPatternTarget, SearchFilter, StoredSearchFilter, WorkspaceSearchFilter, appendToPattern } from './model/searchFilter';
import { deleteFilter, loadAllFilters, saveFilter } from './storage/filterRepository';
import { getWorkspaceFolderForUri } from './storage/workspaceFilters';

interface FilterQuickPickItem extends vscode.QuickPickItem {
	filter: StoredSearchFilter;
}

interface PatternAddMethod extends vscode.QuickPickItem {
	action: 'append' | 'overwrite';
	value: string;
}

function formatFilterLabel(filter: StoredSearchFilter): string {
	const scopeIcon = filter.scope === 'workspace' ? '$(folder)' : '$(globe)';
	const scopeText = filter.scope === 'workspace'
		? `Project: ${(filter as WorkspaceSearchFilter).workspaceFolder.name}`
		: 'Global';
	return `${scopeIcon} ${filter.name} (${scopeText})`;
}

function describeFilter(filter: SearchFilter): string {
	return `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`;
}

function toFilterQuickPickItems(filters: StoredSearchFilter[]): FilterQuickPickItem[] {
	return filters.map(filter => ({
		label: formatFilterLabel(filter),
		description: describeFilter(filter),
		filter
	}));
}

function commandUris(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): vscode.Uri[] {
	if (uris && uris.length > 0) {
		return uris;
	}
	return uri ? [uri] : [];
}

function workspaceFolderForFilter(filter: StoredSearchFilter, fallbackUri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
	if (filter.scope === 'workspace') {
		return (filter as WorkspaceSearchFilter).workspaceFolder;
	}
	return getWorkspaceFolderForUri(fallbackUri);
}

async function askFilterScope(workspaceFolder?: vscode.WorkspaceFolder): Promise<'global' | 'workspace' | undefined> {
	const items: Array<vscode.QuickPickItem & { value: 'global' | 'workspace' }> = [
		{ label: '$(globe) Global', description: 'Available across all projects', value: 'global' }
	];

	if (workspaceFolder) {
		items.push({
			label: '$(folder) Current Project',
			description: `Stored in ${workspaceFolder.name}`,
			value: 'workspace'
		});
	}

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Where should this filter be saved?'
	});
	return selected?.value;
}

async function saveFilterWithPrompts(filter: SearchFilter, workspaceFolder?: vscode.WorkspaceFolder, originalName?: string, allowOverwrite = true): Promise<boolean> {
	const allFilters = await loadAllFilters();
	const targetScope = filter.scope || 'global';
	const conflict = allFilters.some(existing => {
		if (existing.name !== filter.name || existing.name === originalName || existing.scope !== targetScope) {
			return false;
		}
		if (targetScope !== 'workspace') {
			return true;
		}
		return (existing as WorkspaceSearchFilter).workspaceFolder.uri.toString() === workspaceFolder?.uri.toString();
	});

	if (conflict) {
		if (!allowOverwrite) {
			vscode.window.showErrorMessage(`A filter named '${filter.name}' already exists in this ${targetScope === 'workspace' ? 'project' : 'global'} scope.`);
			return false;
		}

		const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: `Filter '${filter.name}' already exists in this ${targetScope === 'workspace' ? 'project' : 'global'} scope. Overwrite?`
		});
		if (overwrite !== 'Yes') {
			vscode.window.showInformationMessage('Filter not saved.');
			return false;
		}
	}

	await saveFilter(filter, workspaceFolder);
	vscode.window.showInformationMessage(`Search filter '${filter.name}' saved ${targetScope === 'workspace' ? 'to project' : 'globally'} successfully.`);
	return true;
}

async function askNewFilter(baseFilter: SearchFilter, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
	const name = await vscode.window.showInputBox({
		prompt: 'Enter a name for the new search filter',
		validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.'
	});
	if (!name) {
		return;
	}

	const scope = await askFilterScope(workspaceFolder);
	if (!scope) {
		vscode.window.showInformationMessage('Filter not saved.');
		return;
	}

	await saveFilterWithPrompts({
		...baseFilter,
		name: name.trim(),
		scope,
		enabled: scope === 'global' ? true : undefined
	}, scope === 'workspace' ? workspaceFolder : undefined);
}

async function addPatternsToFilter(targetPattern: FilterPatternTarget, patterns: string[], contextUri: vscode.Uri | undefined): Promise<void> {
	const savedFilters = await loadAllFilters();
	const createNewOption = {
		label: '$(add) Create New Filter...',
		description: `Create a new filter with ${patterns.length} pattern(s)`
	};
	const quickPickItems = [createNewOption, ...toFilterQuickPickItems(savedFilters)];

	const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
		placeHolder: `Select filter to add ${patterns.length} pattern(s) to '${targetPattern}', or create a new one`
	});
	if (!selectedItem) {
		return;
	}

	const combinedPatternOverwrite = patterns.join(',');
	if (selectedItem === createNewOption) {
		const newFilter: SearchFilter = {
			name: '',
			include: targetPattern === 'include' ? combinedPatternOverwrite : '',
			exclude: targetPattern === 'exclude' ? combinedPatternOverwrite : ''
		};

		const otherPattern = await vscode.window.showInputBox({
			prompt: `(Optional) Enter files to ${targetPattern === 'include' ? 'exclude' : 'include'} for this new filter`,
			placeHolder: targetPattern === 'include' ? 'e.g., **/*.log,**/node_modules/**' : 'e.g., src/**/*.ts'
		});
		if (targetPattern === 'include') {
			newFilter.exclude = otherPattern || '';
		} else {
			newFilter.include = otherPattern || '';
		}

		await askNewFilter(newFilter, getWorkspaceFolderForUri(contextUri));
		return;
	}

	const filterToUpdate = (selectedItem as FilterQuickPickItem).filter;
	const currentPattern = targetPattern === 'include' ? filterToUpdate.include : filterToUpdate.exclude;
	let combinedPatternAppend = currentPattern;
	for (const pattern of patterns) {
		combinedPatternAppend = appendToPattern(combinedPatternAppend, pattern);
	}

	const methods: PatternAddMethod[] = [];
	if (combinedPatternAppend !== currentPattern) {
		methods.push({ label: 'Append (Combine)', description: `Result: ${combinedPatternAppend}`, action: 'append', value: combinedPatternAppend });
	}
	if (combinedPatternOverwrite !== currentPattern) {
		methods.push({ label: 'Overwrite', description: `Result: ${combinedPatternOverwrite}`, action: 'overwrite', value: combinedPatternOverwrite });
	}
	if (methods.length === 0) {
		vscode.window.showInformationMessage(`All selected patterns already exist in the '${targetPattern}' list for filter '${filterToUpdate.name}'. No changes made.`);
		return;
	}

	const addMethod = await vscode.window.showQuickPick<PatternAddMethod>(
		methods,
		{ placeHolder: `How to add ${patterns.length} pattern(s) to '${targetPattern}' for filter '${filterToUpdate.name}'?` }
	);
	if (!addMethod) {
		return;
	}

	const updatedFilter = { ...filterToUpdate };
	if (targetPattern === 'include') {
		updatedFilter.include = addMethod.value;
	} else {
		updatedFilter.exclude = addMethod.value;
	}
	await saveFilter(updatedFilter, workspaceFolderForFilter(filterToUpdate, contextUri));
	vscode.window.showInformationMessage(`Search filter '${filterToUpdate.name}' updated successfully.`);
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
			patterns.add(path.posix.join(relativePath || '.', '**', '*'));
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

async function addFilter(): Promise<void> {
	const filterName = await vscode.window.showInputBox({
		prompt: 'Enter a name for the search filter',
		placeHolder: 'e.g., My TypeScript Project',
		validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.'
	});
	if (!filterName) {
		return;
	}

	const includePattern = await vscode.window.showInputBox({
		prompt: 'Enter the files to include (glob pattern)',
		placeHolder: 'e.g., src/**/*.ts'
	});
	const excludePattern = await vscode.window.showInputBox({
		prompt: 'Enter the files to exclude (glob pattern)',
		placeHolder: 'e.g., **/*.{spec,test}.ts,**/node_modules/**'
	});

	const workspaceFolder = getWorkspaceFolderForUri();
	const scope = await askFilterScope(workspaceFolder);
	if (!scope) {
		vscode.window.showInformationMessage('Filter not saved.');
		return;
	}

	await saveFilterWithPrompts({
		name: filterName.trim(),
		include: includePattern || '',
		exclude: excludePattern || '',
		scope,
		enabled: scope === 'global' ? true : undefined
	}, scope === 'workspace' ? workspaceFolder : undefined);
}

async function selectAndSearch(): Promise<void> {
	const quickPick = vscode.window.createQuickPick<FilterQuickPickItem>();
	quickPick.placeholder = 'Select a custom search filter to apply';

	const updateQuickPickItems = async () => {
		const filters = (await loadAllFilters()).filter(filter => filter.scope === 'workspace' || filter.enabled !== false);
		quickPick.items = filters.map(filter => ({
			...toFilterQuickPickItems([filter])[0],
			buttons: [{ iconPath: new vscode.ThemeIcon('x'), tooltip: 'Delete filter' }]
		}));
	};

	await updateQuickPickItems();
	if (quickPick.items.length === 0) {
		vscode.window.showInformationMessage('No enabled custom search filters available. Use the "Add Custom Search Filter" command to create one, or enable filters in settings.');
		quickPick.dispose();
		return;
	}

	quickPick.onDidTriggerItemButton(async event => {
		const confirmed = await vscode.window.showWarningMessage(
			`Are you sure you want to delete filter '${event.item.filter.name}'?`,
			{ modal: true },
			'Delete',
			'Cancel'
		);
		if (confirmed === 'Delete') {
			await deleteFilter(event.item.filter);
			await updateQuickPickItems();
		}
	});

	quickPick.onDidAccept(() => {
		const selectedFilter = quickPick.selectedItems[0]?.filter;
		if (!selectedFilter) {
			return;
		}

		quickPick.dispose();
		vscode.commands.executeCommand('workbench.action.findInFiles', {
			filesToInclude: selectedFilter.include,
			filesToExclude: selectedFilter.exclude,
			triggerSearch: true,
			isCaseSensitive: false,
			matchWholeWord: false,
			isRegex: false,
			showIncludesExcludes: true
		});
	});

	quickPick.onDidHide(() => quickPick.dispose());
	quickPick.show();
}

async function deleteSelectedFilter(): Promise<void> {
	const filters = await loadAllFilters();
	if (filters.length === 0) {
		vscode.window.showInformationMessage('No custom search filters to delete.');
		return;
	}

	const selectedItem = await vscode.window.showQuickPick(toFilterQuickPickItems(filters), {
		placeHolder: 'Select a custom search filter to delete'
	});
	if (!selectedItem) {
		return;
	}

	await deleteFilter(selectedItem.filter);
	vscode.window.showInformationMessage(`Search filter '${selectedItem.filter.name}' deleted successfully.`);
}

async function editFilter(): Promise<void> {
	const filters = await loadAllFilters();
	if (filters.length === 0) {
		vscode.window.showInformationMessage('No custom search filters saved yet to edit.');
		return;
	}

	const selectedItem = await vscode.window.showQuickPick(toFilterQuickPickItems(filters), {
		placeHolder: 'Select a custom search filter to edit'
	});
	if (!selectedItem) {
		return;
	}

	const originalFilter = selectedItem.filter;
	const newFilterName = await vscode.window.showInputBox({
		prompt: 'Enter the new name for the search filter',
		value: originalFilter.name,
		validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.',
		ignoreFocusOut: true
	});
	if (newFilterName === undefined || !newFilterName.trim()) {
		return;
	}

	const newIncludePattern = await vscode.window.showInputBox({
		prompt: 'Enter the new files to include (glob pattern)',
		value: originalFilter.include,
		placeHolder: '(Optional) Leave blank for default; Esc to keep original',
		ignoreFocusOut: true
	});
	const newExcludePattern = await vscode.window.showInputBox({
		prompt: 'Enter the new files to exclude (glob pattern)',
		value: originalFilter.exclude,
		placeHolder: '(Optional) e.g., **/node_modules/**; Esc to keep original',
		ignoreFocusOut: true
	});

	const updatedFilter: SearchFilter = {
		name: newFilterName.trim(),
		include: newIncludePattern === undefined ? originalFilter.include : newIncludePattern,
		exclude: newExcludePattern === undefined ? originalFilter.exclude : newExcludePattern,
		scope: originalFilter.scope || 'global',
		enabled: originalFilter.enabled
	};

	const saved = await saveFilterWithPrompts(updatedFilter, workspaceFolderForFilter(originalFilter), originalFilter.name, false);
	if (saved && originalFilter.name !== updatedFilter.name) {
		await deleteFilter(originalFilter);
	}
}

async function addFolders(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined, targetPattern: FilterPatternTarget): Promise<void> {
	const selectedUris = commandUris(uri, uris);
	const patterns = await folderPatternsFromUris(selectedUris);
	if (patterns.length === 0) {
		vscode.window.showInformationMessage('No valid folders selected or found within the workspace.');
		return;
	}
	await addPatternsToFilter(targetPattern, patterns, selectedUris[0]);
}

async function addFileTypes(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined, targetPattern: FilterPatternTarget): Promise<void> {
	const selectedUris = commandUris(uri, uris);
	const patterns = await fileTypePatternsFromUris(selectedUris);
	if (patterns.length === 0) {
		vscode.window.showInformationMessage('No valid files with extensions selected.');
		return;
	}
	await addPatternsToFilter(targetPattern, patterns, selectedUris[0]);
}

export function registerCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('custom-search-filters.addFilter', addFilter),
		vscode.commands.registerCommand('custom-search-filters.selectAndSearch', selectAndSearch),
		vscode.commands.registerCommand('custom-search-filters.deleteFilter', deleteSelectedFilter),
		vscode.commands.registerCommand('custom-search-filters.editFilter', editFilter),
		vscode.commands.registerCommand('custom-search-filters.addFolderToInclude', (uri, uris) => addFolders(uri, uris, 'include')),
		vscode.commands.registerCommand('custom-search-filters.addFolderToExclude', (uri, uris) => addFolders(uri, uris, 'exclude')),
		vscode.commands.registerCommand('custom-search-filters.addFileTypeToInclude', (uri, uris) => addFileTypes(uri, uris, 'include')),
		vscode.commands.registerCommand('custom-search-filters.addFileTypeToExclude', (uri, uris) => addFileTypes(uri, uris, 'exclude'))
	);
}
