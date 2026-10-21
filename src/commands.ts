import * as vscode from 'vscode';
import { addFileTypes, addFolders } from './explorerCommands';
import { editFilterInteractively } from './filterEditor';
import { recoverLegacyFilters } from './migration';
import { SearchFilter, filterKey, isBuiltinFilter } from './model/searchFilter';
import { FilterQuickPickItem, askFilterScope, runSearch, toFilterQuickPickItems } from './searchUi';
import { deleteFilter, hasNameConflict, loadAllFilters, loadSearchFilters, saveFilter } from './storage/filterRepository';
import { hasPinnedFilters, isPinned, pinnedFilters, setPinned } from './storage/pinnedFilters';
import { getWorkspaceFolderForUri } from './storage/workspaceFilters';

const PIN_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('pin'), tooltip: 'Pin filter (add it to every search)' };
const UNPIN_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('pinned'), tooltip: 'Unpin filter' };
const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Edit filter' };
const DELETE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('x'), tooltip: 'Delete filter' };

async function saveFilterWithPrompts(filter: SearchFilter, workspaceFolder?: vscode.WorkspaceFolder): Promise<boolean> {
	const targetScope = filter.scope || 'global';
	if (hasNameConflict(await loadAllFilters(), filter.name, targetScope, workspaceFolder)) {
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

	const updateQuickPickItems = async () => {
		const allFilters = await loadSearchFilters();
		const active = quickPick.activeItems[0]?.filter;
		const pinned = hasPinnedFilters() ? pinnedFilters(allFilters).length : 0;
		quickPick.placeholder = pinned > 0
			? `Select a custom search filter to apply with ${pinned} pinned ${pinned === 1 ? 'filter' : 'filters'}`
			: 'Select a custom search filter to apply';
		const filters = allFilters.filter(filter => filter.enabled !== false);
		quickPick.items = filters.map(filter => {
			const item = toFilterQuickPickItems([filter])[0];
			const pinnedFilter = isPinned(filter);
			return {
				...item,
				label: pinnedFilter ? `${item.label}  $(pinned)` : item.label,
				description: pinnedFilter ? `Pinned · ${item.description}` : item.description,
				buttons: isBuiltinFilter(filter) ? [pinnedFilter ? UNPIN_BUTTON : PIN_BUTTON]
					: [pinnedFilter ? UNPIN_BUTTON : PIN_BUTTON, EDIT_BUTTON, DELETE_BUTTON]
			};
		});
		// Keep the built-in first, but initially focus a saved filter. Retain the user's
		// focus when pinning or refreshing so the highlight does not jump back to the top.
		const activeItem = (active && quickPick.items.find(item => filterKey(item.filter) === filterKey(active)))
			|| quickPick.items.find(item => !isBuiltinFilter(item.filter)) || quickPick.items[0];
		quickPick.activeItems = activeItem ? [activeItem] : [];
	};

	await updateQuickPickItems();
	if (quickPick.items.length === 0) {
		vscode.window.showInformationMessage('No enabled custom search filters available. Use the "Custom Search: Add Filter" command to create one, or "Custom Search: Edit Filter" to enable a disabled one.');
		quickPick.dispose();
		return;
	}

	quickPick.onDidTriggerItemButton(async event => {
		if (event.button === PIN_BUTTON || event.button === UNPIN_BUTTON) {
			await setPinned(event.item.filter, event.button === PIN_BUTTON);
			await updateQuickPickItems();
			return;
		}
		if (isBuiltinFilter(event.item.filter)) { return; }

		if (event.button === EDIT_BUTTON) {
			// Only one quick input can be visible, so close the list and reopen it after editing.
			quickPick.dispose();
			const result = await editFilterInteractively(event.item.filter);
			if (result.outcome === 'saveAndSearch') {
				await runSearch(result.filter);
			} else {
				await selectAndSearch();
			}
			return;
		}

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

	quickPick.onDidAccept(async () => {
		const selectedFilter = quickPick.selectedItems[0]?.filter;
		if (!selectedFilter) {
			return;
		}

		quickPick.dispose();
		await runSearch(selectedFilter);
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

	const result = await editFilterInteractively(selectedItem.filter);
	if (result.outcome === 'saveAndSearch') {
		await runSearch(result.filter);
	}
}

export function registerCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('custom-search-filters.addFilter', addFilter),
		vscode.commands.registerCommand('custom-search-filters.selectAndSearch', selectAndSearch),
		vscode.commands.registerCommand('custom-search-filters.deleteFilter', deleteSelectedFilter),
		vscode.commands.registerCommand('custom-search-filters.editFilter', editFilter),
		vscode.commands.registerCommand('custom-search-filters.recoverLegacyFilters', async () => {
			try {
				await recoverLegacyFilters(context);
			} catch (error) {
				console.error('Error recovering legacy filters:', error);
				await vscode.window.showErrorMessage(`Could not recover legacy filters: ${error instanceof Error ? error.message : String(error)}`);
			}
		}),
		vscode.commands.registerCommand('custom-search-filters.addFolderToInclude', (uri, uris) => addFolders(uri, uris, 'include')),
		vscode.commands.registerCommand('custom-search-filters.addFolderToExclude', (uri, uris) => addFolders(uri, uris, 'exclude')),
		vscode.commands.registerCommand('custom-search-filters.addFileTypeToInclude', (uri, uris) => addFileTypes(uri, uris, 'include')),
		vscode.commands.registerCommand('custom-search-filters.addFileTypeToExclude', (uri, uris) => addFileTypes(uri, uris, 'exclude'))
	);
}
