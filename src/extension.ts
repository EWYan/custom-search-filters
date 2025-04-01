// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Define the structure for a search filter
interface SearchFilter {
	name: string;
	include: string; // Glob pattern for files to include
	exclude: string; // Glob pattern for files to exclude
}

// Key for storing filters in global state
const FILTERS_STORAGE_KEY = 'customSearchFilters';

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
		try {
			const existingFilters: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];
			
			// Check if filter name already exists
			const existingIndex = existingFilters.findIndex(f => f.name === newFilter.name);
			if (existingIndex > -1) {
				// Optional: Ask user if they want to overwrite
				const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], {
					placeHolder: `Filter '${newFilter.name}' already exists. Overwrite?`
				});
				if (overwrite === 'Yes') {
					existingFilters[existingIndex] = newFilter;
				} else {
					vscode.window.showInformationMessage('Filter not saved.');
					return; // Don't save if not overwriting
				}
			} else {
				existingFilters.push(newFilter);
			}

			await context.globalState.update(FILTERS_STORAGE_KEY, existingFilters);
			vscode.window.showInformationMessage(`Search filter '${newFilter.name}' saved successfully!`);
		} catch (error) {
			console.error('Error saving search filter:', error);
			vscode.window.showErrorMessage('Failed to save search filter. See console for details.');
		}
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
