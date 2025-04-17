// Author: juzidaxia
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path'; // Need path module for normalization

// Define the structure for a search filter
interface SearchFilter {
	name: string;
	include: string; // Glob pattern for files to include
	exclude: string; // Glob pattern for files to exclude
}

// Key for storing filters in global state
const FILTERS_STORAGE_KEY = 'customSearchFilters';

// Helper function to save filters and handle overwrites
async function saveFilter(context: vscode.ExtensionContext, newFilter: SearchFilter): Promise<boolean> {
	let existingFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];
	const existingIndex = existingFilters.findIndex(f => f.name === newFilter.name);

	if (existingIndex > -1) {
		const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: `Filter '${newFilter.name}' already exists. Overwrite?`
		});
		if (overwrite === 'Yes') {
			existingFilters[existingIndex] = newFilter;
		} else {
			vscode.window.showInformationMessage('Filter not saved.');
			return false; // Indicate not saved
		}
	} else {
		existingFilters.push(newFilter);
	}

	try {
		await context.globalState.update(FILTERS_STORAGE_KEY, existingFilters);
		vscode.window.showInformationMessage(`Filter '${newFilter.name}' saved successfully!`);
		return true; // Indicate saved
	} catch (error) {
		console.error('Error saving search filter:', error);
		vscode.window.showErrorMessage('Failed to save search filter. See console for details.');
		return false; // Indicate error
	}
}

// Helper function to add a folder path to a filter pattern
function appendToPattern(existingPattern: string | undefined | null, pathToAdd: string): string {
	if (!existingPattern || existingPattern.trim() === '') {
		return pathToAdd;
	}
	// Avoid adding duplicate paths
	const patterns = existingPattern.split(',').map(p => p.trim()).filter(p => p !== '');
	if (!patterns.includes(pathToAdd)) {
		patterns.push(pathToAdd);
	}
	return patterns.join(',');
}

// Helper function to handle adding folder to include/exclude
async function addFolderToFilter(folderUri: vscode.Uri | undefined, targetPattern: 'include' | 'exclude', context: vscode.ExtensionContext) {
	if (!folderUri) {
		// Command might be called from command palette without context
		vscode.window.showErrorMessage('Please run this command by right-clicking a folder in the Explorer.');
		return;
	}

	// Convert URI to relative path, ensuring it's a directory pattern
    // Use path.posix to ensure forward slashes, needed for glob patterns
	let relativePath = vscode.workspace.asRelativePath(folderUri, false);
    relativePath = path.posix.join(relativePath, '**', '*'); // Append /**/* to target files within

	// 1. Retrieve saved filters
	const savedFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];

	// 2. Prepare Quick Pick items: existing filters + Create New
	const createNewOption = { label: "$(add) Create New Filter...", description: "Create a new filter and add this folder", name: null }; // Special item
	const quickPickItems = [
		createNewOption,
		...savedFilters.map(filter => ({ 
			label: filter.name, 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`,
			filter: filter // Store the actual filter object
		}))
	];
	
	// 3. Show Quick Pick to select a filter or create new
	const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
		placeHolder: `Select filter to add folder to '${targetPattern}' pattern, or create a new one`
	});

	if (!selectedItem) { return; } // User cancelled

	// 4. Handle selection
	if (selectedItem === createNewOption) {
		// Create a new filter
		const filterName = await vscode.window.showInputBox({ 
			prompt: 'Enter a name for the new search filter',
			validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.'
		});
		if (!filterName) { return; } // User cancelled

		const newFilter: SearchFilter = {
			name: filterName.trim(),
			include: '',
			exclude: ''
		};

		if (targetPattern === 'include') {
			newFilter.include = relativePath;
			// Optionally prompt for exclude pattern
			const excludePattern = await vscode.window.showInputBox({ 
				prompt: '(Optional) Enter files to exclude for this new filter',
				placeHolder: 'e.g., **/*.log,**/node_modules/**'
			});
			newFilter.exclude = excludePattern || ''; 
		} else { // targetPattern === 'exclude'
			newFilter.exclude = relativePath;
			// Optionally prompt for include pattern
			const includePattern = await vscode.window.showInputBox({ 
				prompt: '(Optional) Enter files to include for this new filter',
				placeHolder: 'e.g., src/**/*.ts'
			});
			newFilter.include = includePattern || '';
		}
		
		await saveFilter(context, newFilter);

	} else if ('filter' in selectedItem && selectedItem.filter) {
		// --- Add to Existing Filter Logic (Modified) ---
		const filterToUpdate = selectedItem.filter;
		const currentPattern = targetPattern === 'include' ? filterToUpdate.include : filterToUpdate.exclude;

        // *** NEW: Ask how to add the path ***
        const addMethod = await vscode.window.showQuickPick(
            [
                { label: 'Append (Combine)', description: `Result: ${appendToPattern(currentPattern, relativePath)}`, action: 'append' },
                { label: 'Overwrite', description: `Result: ${relativePath}`, action: 'overwrite' }
            ], 
            { 
                placeHolder: `How to add '${relativePath}' to the '${targetPattern}' pattern for filter '${filterToUpdate.name}'?`
            }
        );

        if (!addMethod) { return; } // User cancelled the append/overwrite choice

		if (targetPattern === 'include') {
            if (addMethod.action === 'append') {
			    filterToUpdate.include = appendToPattern(filterToUpdate.include, relativePath);
            } else { // Overwrite
                filterToUpdate.include = relativePath;
            }
		} else { // targetPattern === 'exclude'
            if (addMethod.action === 'append') {
			    filterToUpdate.exclude = appendToPattern(filterToUpdate.exclude, relativePath);
            } else { // Overwrite
                filterToUpdate.exclude = relativePath;
            }
		}

		// Update the filter in the global state 
		await saveFilter(context, filterToUpdate);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "custom-search-filters" is now active!');

	// Command to add a new custom search filter
	const addFilterDisposable = vscode.commands.registerCommand('custom-search-filters.addFilter', async () => {
		// 1. Prompt for Filter Name
		const filterName = await vscode.window.showInputBox({ 
			prompt: 'Enter a name for the search filter',
			placeHolder: 'e.g., My TypeScript Project',
			validateInput: text => {
				return text && text.trim().length > 0 ? null : 'Filter name cannot be empty.';
			}
		});
		if (!filterName) { return; } // User cancelled

		// 2. Prompt for Include Pattern
		const includePattern = await vscode.window.showInputBox({ 
			prompt: 'Enter the files to include (glob pattern)',
			placeHolder: 'e.g., src/**/*.ts'
		});
		// Allow empty include pattern, defaults to searching all files

		// 3. Prompt for Exclude Pattern
		const excludePattern = await vscode.window.showInputBox({ 
			prompt: 'Enter the files to exclude (glob pattern)',
			placeHolder: 'e.g., **/*.{spec,test}.ts,**/node_modules/**'
		});
		// Allow empty exclude pattern

		// 4. Create the filter object
		const newFilter: SearchFilter = {
			name: filterName.trim(),
			include: includePattern || '', // Store empty string if user left it blank
			exclude: excludePattern || ''  // Store empty string if user left it blank
		};

		// 5. Retrieve existing filters, add the new one, and save
		await saveFilter(context, newFilter); // Use helper
	});

	context.subscriptions.push(addFilterDisposable);

	// Command to select a filter and trigger search
	const selectAndSearchDisposable = vscode.commands.registerCommand('custom-search-filters.selectAndSearch', async () => {
		// 1. Retrieve saved filters
		const savedFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No custom search filters saved yet. Use the "Add Custom Search Filter" command to create one.');
			return;
		}

		// 2. Prepare Quick Pick items
		const quickPickItems = savedFilters.map(filter => ({ 
			label: filter.name, 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, // Show patterns in description
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select a filter
		const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select a custom search filter to apply' 
		});

		if (!selectedItem) { return; } // User cancelled

		// 4. Execute the built-in search command with the selected filter's parameters
		const selectedFilter = selectedItem.filter;
		vscode.commands.executeCommand('workbench.action.findInFiles', {
			// query: '', // Start with an empty query, user will type it
			filesToInclude: selectedFilter.include,
			filesToExclude: selectedFilter.exclude,
			triggerSearch: true, // Optional: Immediately trigger search? Might be better false.
            isCaseSensitive: false, // Default search settings
            matchWholeWord: false, // Default search settings
            isRegex: false, // Default search settings
			showIncludesExcludes: true // Ensure the include/exclude boxes are visible
		});
	});

	context.subscriptions.push(selectAndSearchDisposable);

	// Command to delete a custom search filter
	const deleteFilterDisposable = vscode.commands.registerCommand('custom-search-filters.deleteFilter', async () => {
		// 1. Retrieve saved filters
		let savedFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No custom search filters to delete.');
			return;
		}

		// 2. Prepare Quick Pick items
		const quickPickItems = savedFilters.map(filter => ({ 
			label: filter.name, 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, 
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select a filter to delete
		const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select a custom search filter to delete' 
		});

		if (!selectedItem) { return; } // User cancelled

		// 4. Find and remove the selected filter
		try {
			const filterToDelete = selectedItem.filter;
			const updatedFilters = savedFilters.filter(f => f.name !== filterToDelete.name);
			
			// 5. Update storage
			await context.globalState.update(FILTERS_STORAGE_KEY, updatedFilters);
			vscode.window.showInformationMessage(`Search filter '${filterToDelete.name}' deleted successfully!`);

		} catch (error) {
			console.error('Error deleting search filter:', error);
			vscode.window.showErrorMessage('Failed to delete search filter. See console for details.');
		}
	});

	context.subscriptions.push(deleteFilterDisposable); // Register the new command

	// Command to combine existing filters
	const combineFiltersDisposable = vscode.commands.registerCommand('custom-search-filters.combineFilters', async () => {
		// 1. Retrieve saved filters
		let savedFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];

		if (savedFilters.length < 2) {
			vscode.window.showInformationMessage('You need at least two existing filters to combine.');
			return;
		}

		// 2. Prepare Quick Pick items for multi-selection
		const quickPickItems = savedFilters.map(filter => ({ 
			label: filter.name, 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, 
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select multiple filters to combine
		const selectedItems = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select filters to combine (use Spacebar to select)',
			canPickMany: true // Enable multi-select
		});

		if (!selectedItems || selectedItems.length < 2) { 
			vscode.window.showInformationMessage('Combine operation cancelled. You must select at least two filters.');
			return; 
		}

		// 4. Prompt for the new combined filter name
		const combinedFilterName = await vscode.window.showInputBox({ 
			prompt: 'Enter a name for the combined filter',
			placeHolder: 'e.g., Combined Frontend Filters',
			validateInput: text => {
				return text && text.trim().length > 0 ? null : 'Filter name cannot be empty.';
			}
		});
		if (!combinedFilterName) { return; } // User cancelled

		// 5. Combine include and exclude patterns
		const combinedInclude = selectedItems
			.map(item => item.filter.include)
			.filter(pattern => pattern && pattern.trim() !== '') // Filter out empty includes
			.join(','); // Join with comma
			
		const combinedExclude = selectedItems
			.map(item => item.filter.exclude)
			.filter(pattern => pattern && pattern.trim() !== '') // Filter out empty excludes
			.join(','); // Join with comma

		// 6. Create the new filter object
		const newFilter: SearchFilter = {
			name: combinedFilterName.trim(),
			include: combinedInclude,
			exclude: combinedExclude
		};

		// 7. Save the new filter (handle potential name conflicts)
		await saveFilter(context, newFilter); // Use helper
	});

	context.subscriptions.push(combineFiltersDisposable); // Register the combine command

	// --- NEW Context Menu Commands ---
	const addFolderToIncludeDisposable = vscode.commands.registerCommand('custom-search-filters.addFolderToInclude', (folderUri: vscode.Uri | undefined) => {
		addFolderToFilter(folderUri, 'include', context);
	});
	context.subscriptions.push(addFolderToIncludeDisposable);

	const addFolderToExcludeDisposable = vscode.commands.registerCommand('custom-search-filters.addFolderToExclude', (folderUri: vscode.Uri | undefined) => {
		addFolderToFilter(folderUri, 'exclude', context);
	});
	context.subscriptions.push(addFolderToExcludeDisposable);
	// --- END NEW Commands ---

	// --- NEW: Command to Edit an Existing Filter ---
	const editFilterDisposable = vscode.commands.registerCommand('custom-search-filters.editFilter', async () => {
		// 1. Retrieve saved filters
		let savedFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No custom search filters saved yet to edit.');
			return;
		}

		// 2. Prepare Quick Pick items for selection
		const quickPickItems = savedFilters.map(filter => ({ 
			label: filter.name, 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, 
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select a filter to edit
		const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select a custom search filter to edit' 
		});

		if (!selectedItem) { return; } // User cancelled

		const originalFilter = selectedItem.filter;
		const originalName = originalFilter.name; // Keep track of the original name

		// 4. Prompt for potentially new Filter Name (pre-filled)
		const newFilterName = await vscode.window.showInputBox({ 
			prompt: 'Enter the new name for the search filter',
			value: originalFilter.name, // Pre-fill with current name
			validateInput: text => {
				return text && text.trim().length > 0 ? null : 'Filter name cannot be empty.';
			}
		});
		if (!newFilterName) { return; } // User cancelled

		// 5. Prompt for potentially new Include Pattern (pre-filled)
		const newIncludePattern = await vscode.window.showInputBox({ 
			prompt: 'Enter the new files to include (glob pattern)',
			value: originalFilter.include, // Pre-fill
			placeHolder: 'Leave blank for default (e.g., src/**/*.ts)'
		});
		// Allow cancellation (undefined) -> keep original? No, treat as empty string if undefined.
        const finalIncludePattern = newIncludePattern === undefined ? originalFilter.include : newIncludePattern || '';


		// 6. Prompt for potentially new Exclude Pattern (pre-filled)
		const newExcludePattern = await vscode.window.showInputBox({ 
			prompt: 'Enter the new files to exclude (glob pattern)',
			value: originalFilter.exclude, // Pre-fill
			placeHolder: 'Leave blank for default (e.g., **/node_modules/**)'
		});
        // Allow cancellation (undefined) -> keep original? No, treat as empty string if undefined.
        const finalExcludePattern = newExcludePattern === undefined ? originalFilter.exclude : newExcludePattern || '';


		// 7. Create the updated filter object
        const updatedFilter: SearchFilter = {
			name: newFilterName.trim(),
			include: finalIncludePattern, 
			exclude: finalExcludePattern
		};

		// 8. Handle potential name conflicts if the name was changed
        if (originalName !== updatedFilter.name) {
            const conflictingFilterExists = savedFilters.some(f => f.name === updatedFilter.name);
            if (conflictingFilterExists) {
                vscode.window.showErrorMessage(`A filter with the name '${updatedFilter.name}' already exists. Please choose a different name.`);
                return; // Stop the edit process
            }
        }

		// 9. Find the original filter in the array and update it
		try {
            const indexToUpdate = savedFilters.findIndex(f => f.name === originalName); 
            if (indexToUpdate > -1) {
                savedFilters[indexToUpdate] = updatedFilter; // Replace with the updated version
                await context.globalState.update(FILTERS_STORAGE_KEY, savedFilters);
			    vscode.window.showInformationMessage(`Search filter '${updatedFilter.name}' updated successfully!`);
            } else {
                // Should theoretically not happen if selection worked
                vscode.window.showErrorMessage(`Could not find the original filter '${originalName}' to update.`);
            }
		} catch (error) {
			console.error('Error updating search filter:', error);
			vscode.window.showErrorMessage('Failed to update search filter. See console for details.');
		}
	});
	context.subscriptions.push(editFilterDisposable); // Register the new command
    // --- END NEW Command ---
}

// This method is called when your extension is deactivated
export function deactivate() {}
