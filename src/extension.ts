// Author: juzidaxia
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path'; // Need path module for normalization
import * as fs from 'fs'; // Need fs module for file operations

// Define the structure for a search filter
interface SearchFilter {
	name: string;
	include: string; // Glob pattern for files to include
	exclude: string; // Glob pattern for files to exclude
	scope?: 'global' | 'workspace'; // Scope of the filter: global or workspace-specific
	enabled?: boolean; // Whether the filter is enabled (only for global filters, shown in settings with checkbox)
}

// Key for storing filters in global state (for migration purposes)
const FILTERS_STORAGE_KEY = 'customSearchFilters';
const PROJECT_FILTERS_FILE = '.vscode/custom-search-filters.json';
const GLOBAL_FILTERS_CONFIG_KEY = 'custom-search-filters.globalFilters';

// Helper function to get workspace root folder
function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
}

// Helper function to get project filters file path
function getProjectFiltersPath(): string | undefined {
	const workspaceFolder = getWorkspaceFolder();
	if (!workspaceFolder) {
		return undefined;
	}
	return path.join(workspaceFolder.uri.fsPath, PROJECT_FILTERS_FILE);
}

// Helper function to load global-scoped filters from VS Code settings
function loadGlobalFilters(): SearchFilter[] {
	try {
		const config = vscode.workspace.getConfiguration('custom-search-filters');
		const filters: SearchFilter[] = config.get<SearchFilter[]>('globalFilters', []);
		const enabledMap: Record<string, boolean> = config.get<Record<string, boolean>>('globalFiltersEnabled', {});
		
		// Merge filters with enabled state from separate config
		return filters.map(f => {
			const filterName = f.name;
			// Check enabled state: if explicitly set in enabledMap, use it; otherwise default to true
			const enabled = enabledMap.hasOwnProperty(filterName) ? enabledMap[filterName] : true;
			
			return { 
				...f, 
				scope: f.scope || 'global',
				enabled: enabled
			};
		});
	} catch (error) {
		console.error('Error loading global filters from settings:', error);
		return [];
	}
}

// Helper function to save global-scoped filters to VS Code settings
async function saveGlobalFilters(filters: SearchFilter[]): Promise<boolean> {
	try {
		const config = vscode.workspace.getConfiguration('custom-search-filters');
		// Only save global-scoped filters
		const globalFilters = filters.filter(f => (f.scope || 'global') === 'global');
		
		// Separate filters and enabled state
		const filtersToSave = globalFilters.map(f => {
			// Remove enabled from filter object (it's stored separately)
			const { enabled, ...filterWithoutEnabled } = f;
			return filterWithoutEnabled;
		});
		
		// Build enabled state map - store ALL filters (both enabled and disabled)
		const enabledMap: Record<string, boolean> = {};
		globalFilters.forEach(f => {
			// Store all filters in enabledMap, default to true if not specified
			enabledMap[f.name] = f.enabled !== undefined ? f.enabled : true;
		});
		
		// Update both configs in global scope (user settings)
		await config.update('globalFilters', filtersToSave, vscode.ConfigurationTarget.Global);
		await config.update('globalFiltersEnabled', enabledMap, vscode.ConfigurationTarget.Global);
		return true;
	} catch (error) {
		console.error('Error saving global filters to settings:', error);
		return false;
	}
}

// Helper function to migrate filters from globalState to VS Code settings (one-time migration)
async function migrateGlobalFiltersFromState(context: vscode.ExtensionContext): Promise<void> {
	try {
		// Check if there are filters in globalState
		const filtersInState: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];
		if (filtersInState.length === 0) {
			// No filters to migrate
			return;
		}

		// Check if settings already have filters
		const existingFilters = loadGlobalFilters();
		if (existingFilters.length > 0) {
			// Settings already have filters, skip migration
			console.log('Global filters already exist in settings, skipping migration.');
			return;
		}

		// Migrate filters to settings, ensuring enabled is set to true by default
		const filtersToMigrate = filtersInState.map(f => ({ 
			...f, 
			enabled: f.enabled !== undefined ? f.enabled : true 
		}));
		if (await saveGlobalFilters(filtersToMigrate)) {
			console.log(`Migrated ${filtersToMigrate.length} global filter(s) from globalState to VS Code settings.`);
			// Optionally clear globalState after successful migration
			// await context.globalState.update(FILTERS_STORAGE_KEY, undefined);
		}
	} catch (error) {
		console.error('Error migrating global filters:', error);
	}
}

// Helper function to load project-scoped filters
function loadProjectFilters(): SearchFilter[] {
	const filtersPath = getProjectFiltersPath();
	if (!filtersPath) {
		return [];
	}

	try {
		if (fs.existsSync(filtersPath)) {
			const fileContent = fs.readFileSync(filtersPath, 'utf8');
			const filters: SearchFilter[] = JSON.parse(fileContent);
			// Ensure all project filters have scope set
			return filters.map(f => ({ ...f, scope: 'workspace' }));
		}
	} catch (error) {
		console.error('Error loading project filters:', error);
	}
	return [];
}

// Helper function to save project-scoped filters
function saveProjectFilters(filters: SearchFilter[]): boolean {
	const filtersPath = getProjectFiltersPath();
	if (!filtersPath) {
		return false;
	}

	try {
		const filtersDir = path.dirname(filtersPath);
		// Create .vscode directory if it doesn't exist
		if (!fs.existsSync(filtersDir)) {
			fs.mkdirSync(filtersDir, { recursive: true });
		}
		// Only save workspace-scoped filters
		const workspaceFilters = filters.filter(f => f.scope === 'workspace');
		fs.writeFileSync(filtersPath, JSON.stringify(workspaceFilters, null, 2), 'utf8');
		return true;
	} catch (error) {
		console.error('Error saving project filters:', error);
		return false;
	}
}

// Helper function to load all filters (global + project)
function loadAllFilters(context: vscode.ExtensionContext): SearchFilter[] {
	// Load from VS Code settings (with fallback to globalState for migration)
	const globalFiltersFromSettings = loadGlobalFilters();
	const globalFiltersFromState: SearchFilter[] = context.globalState.get<SearchFilter[]>(FILTERS_STORAGE_KEY) || [];
	
	// Use settings if it has filters, otherwise fall back to globalState
	const globalFilters = globalFiltersFromSettings.length > 0 
		? globalFiltersFromSettings 
		: globalFiltersFromState.map(f => ({ ...f, scope: f.scope || 'global' }));
	
	const projectFilters = loadProjectFilters();
	return [...globalFilters, ...projectFilters];
}

// Helper function to format filter label with scope indicator
function formatFilterLabel(filter: SearchFilter): string {
	const scopeIcon = filter.scope === 'workspace' ? '$(folder)' : '$(globe)';
	const scopeText = filter.scope === 'workspace' ? 'Project' : 'Global';
	return `${scopeIcon} ${filter.name} (${scopeText})`;
}

// Helper function to delete a filter
async function deleteFilter(context: vscode.ExtensionContext, filterToDelete: SearchFilter): Promise<boolean> {
	try {
		const filterScope = filterToDelete.scope || 'global';
		
		if (filterScope === 'workspace') {
			// Delete from project file
			const projectFilters = loadProjectFilters();
			const updatedFilters = projectFilters.filter(f => !(f.name === filterToDelete.name && f.scope === 'workspace'));
			if (saveProjectFilters(updatedFilters)) {
				vscode.window.showInformationMessage(`Search filter '${filterToDelete.name}' deleted from project successfully!`);
				return true;
			} else {
				vscode.window.showErrorMessage('Failed to delete filter from project. See console for details.');
				return false;
			}
		} else {
			// Delete from global settings
			let globalFilters: SearchFilter[] = loadGlobalFilters();
			const updatedFilters = globalFilters.filter(f => f.name !== filterToDelete.name);
			// saveGlobalFilters will automatically clean up the enabled map for deleted filters
			if (await saveGlobalFilters(updatedFilters)) {
				vscode.window.showInformationMessage(`Search filter '${filterToDelete.name}' deleted from global successfully!`);
				return true;
			} else {
				vscode.window.showErrorMessage('Failed to delete filter from global settings. See console for details.');
				return false;
			}
		}
	} catch (error) {
		console.error('Error deleting search filter:', error);
		vscode.window.showErrorMessage('Failed to delete search filter. See console for details.');
		return false;
	}
}

// Helper function to ask user about filter scope
async function askFilterScope(): Promise<'global' | 'workspace' | undefined> {
	const scope = await vscode.window.showQuickPick<{ label: string; description: string; value: 'global' | 'workspace' }>(
		[
			{ label: '$(globe) Global', description: 'Available across all projects', value: 'global' },
			{ label: '$(folder) Current Project', description: 'Only for this workspace', value: 'workspace' }
		],
		{
			placeHolder: 'Where should this filter be saved?'
		}
	);
	return scope?.value;
}

// Helper function to save filters and handle overwrites
async function saveFilter(context: vscode.ExtensionContext, newFilter: SearchFilter, scope?: 'global' | 'workspace'): Promise<boolean> {
	// Determine scope: use provided scope, or filter's scope, or ask user
	let filterScope: 'global' | 'workspace' = scope || newFilter.scope || 'global';
	
	// If scope is not set and we're creating a new filter, ask the user
	if (!newFilter.scope && !scope) {
		const selectedScope = await askFilterScope();
		if (!selectedScope) {
			vscode.window.showInformationMessage('Filter not saved.');
			return false;
		}
		filterScope = selectedScope;
	}
	
	newFilter.scope = filterScope;

	// Check for conflicts in the appropriate storage
	const allFilters = loadAllFilters(context);
	const existingFilter = allFilters.find(f => f.name === newFilter.name && f.scope === filterScope);

	if (existingFilter) {
		const overwrite = await vscode.window.showQuickPick(['Yes', 'No'], {
			placeHolder: `Filter '${newFilter.name}' already exists in ${filterScope === 'global' ? 'global' : 'project'} scope. Overwrite?`
		});
		if (overwrite !== 'Yes') {
			vscode.window.showInformationMessage('Filter not saved.');
			return false;
		}
	}

	try {
		if (filterScope === 'workspace') {
			// Save to project file
			const projectFilters = loadProjectFilters();
			const existingIndex = projectFilters.findIndex(f => f.name === newFilter.name);
			if (existingIndex > -1) {
				projectFilters[existingIndex] = newFilter;
			} else {
				projectFilters.push(newFilter);
			}
			if (saveProjectFilters(projectFilters)) {
				vscode.window.showInformationMessage(`Filter '${newFilter.name}' saved to project successfully!`);
				return true;
			} else {
				vscode.window.showErrorMessage('Failed to save filter to project. See console for details.');
				return false;
			}
		} else {
			// Save to global settings
			let globalFilters: SearchFilter[] = loadGlobalFilters();
			const existingIndex = globalFilters.findIndex(f => f.name === newFilter.name);
			if (existingIndex > -1) {
				// Preserve enabled state if updating existing filter and not explicitly set
				if (newFilter.enabled === undefined) {
					newFilter.enabled = globalFilters[existingIndex].enabled !== undefined 
						? globalFilters[existingIndex].enabled 
						: true;
				}
				globalFilters[existingIndex] = newFilter;
			} else {
				// For new filters, default enabled to true if not specified
				if (newFilter.enabled === undefined) {
					newFilter.enabled = true;
				}
				globalFilters.push(newFilter);
			}
			if (await saveGlobalFilters(globalFilters)) {
				vscode.window.showInformationMessage(`Filter '${newFilter.name}' saved globally successfully!`);
				return true;
			} else {
				vscode.window.showErrorMessage('Failed to save filter to global settings. See console for details.');
				return false;
			}
		}
	} catch (error) {
		console.error('Error saving search filter:', error);
		vscode.window.showErrorMessage('Failed to save search filter. See console for details.');
		return false;
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
// Modify the function signature to accept Uri or Uri[]
async function addFolderToFilter(targetUriOrUris: vscode.Uri | vscode.Uri[] | undefined, targetPattern: 'include' | 'exclude', context: vscode.ExtensionContext) {
	// --- Input Validation and URI processing ---
    let folderUris: vscode.Uri[] = [];
	if (Array.isArray(targetUriOrUris)) {
		folderUris = targetUriOrUris;
	} else if (targetUriOrUris instanceof vscode.Uri) {
		folderUris = [targetUriOrUris];
	}

	if (!folderUris || folderUris.length === 0) {
		vscode.window.showErrorMessage('Please run this command by right-clicking one or more folders in the Explorer.');
		return;
	}

    // Filter out any non-folder URIs just in case (though 'when' clause should prevent this)
    // and convert valid ones to relative glob patterns
    const folderPatterns: string[] = [];
    for (const uri of folderUris) {
        try {
            // Use fs.stat to properly check if it's a folder, since path.extname() fails for folders with dots
            const fs = require('fs');
            const stats = fs.statSync(uri.fsPath);
            if (stats.isDirectory()) {
                let relativePath = vscode.workspace.asRelativePath(uri, false);
                if (relativePath) { // Ensure it's within the workspace
                    const pattern = path.posix.join(relativePath, '**', '*');
                    if (!folderPatterns.includes(pattern)) { // Avoid duplicates within the selection
                        folderPatterns.push(pattern);
                    }
                }
            }
        } catch (e) {
            console.warn(`Skipping non-folder or invalid URI: ${uri.toString()}`, e);
        }
    }

    if (folderPatterns.length === 0) {
        vscode.window.showInformationMessage('No valid folders selected or found within the workspace.');
        return;
    }

    const patternsToAddString = folderPatterns.join(', '); // For display purposes

	// --- Filter Selection (remains similar) ---
	const savedFilters: SearchFilter[] = loadAllFilters(context);
	const createNewOption = { label: "$(add) Create New Filter...", description: `Create a new filter with ${folderPatterns.length} folder(s)`, name: null };
	const quickPickItems = [
        createNewOption,
		...savedFilters.map(filter => ({ 
			label: formatFilterLabel(filter), 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, // Fixed typo
			filter: filter // Store the actual filter object
		}))
    ]; // Same structure as before
	const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
		placeHolder: `Select filter to add ${folderPatterns.length} folder(s) to '${targetPattern}' pattern, or create a new one`
	});
	if (!selectedItem) { return; }

	// --- Handle Filter Creation or Update ---
	if (selectedItem === createNewOption) {
		// Create a new filter
		const filterName = await vscode.window.showInputBox({ 
            prompt: 'Enter a name for the new search filter',
			validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.'
         });
		if (!filterName) { return; }
		const newFilter: SearchFilter = { name: filterName.trim(), include: '', exclude: '' };

		const combinedPattern = folderPatterns.join(','); // Join all selected folder patterns

		if (targetPattern === 'include') {
			newFilter.include = combinedPattern;
			const excludePattern = await vscode.window.showInputBox({ 
                prompt: '(Optional) Enter files to exclude for this new filter',
				placeHolder: 'e.g., **/*.log,**/node_modules/**'
             });
			newFilter.exclude = excludePattern || '';
		} else {
			newFilter.exclude = combinedPattern;
			const includePattern = await vscode.window.showInputBox({ 
                prompt: '(Optional) Enter files to include for this new filter',
				placeHolder: 'e.g., src/**/*.ts'
             });
			newFilter.include = includePattern || '';
		}
		await saveFilter(context, newFilter, undefined);

	} else if ('filter' in selectedItem && selectedItem.filter) {
		// Add to existing filter
		const filterToUpdate = selectedItem.filter;
		let currentPattern = targetPattern === 'include' ? filterToUpdate.include : filterToUpdate.exclude;

        // ** Modified Append Logic **
        let combinedPatternAppend = currentPattern;
        let addedCount = 0;
        for (const pattern of folderPatterns) {
            const originalLength = combinedPatternAppend?.length ?? 0;
            combinedPatternAppend = appendToPattern(combinedPatternAppend, pattern); // appendToPattern handles internal duplicates
            if (combinedPatternAppend.length > originalLength || (!currentPattern && pattern)) { // Check if something was actually added
                 addedCount++;
            }
        }
        const combinedPatternOverwrite = folderPatterns.join(','); // For overwrite option

        


        // Ask how to add the path (Append/Overwrite)
        const addMethod = await vscode.window.showQuickPick(
            [
                // Show Append option only if it results in a change
                ...(addedCount > 0 ? [{ label: 'Append (Combine)', description: `Result: ${combinedPatternAppend}`, action: 'append' }] : []),
                { label: 'Overwrite', description: `Result: ${combinedPatternOverwrite}`, action: 'overwrite' }
            ],
            { placeHolder: `How to add ${folderPatterns.length} folder pattern(s) to the '${targetPattern}' pattern for filter '${filterToUpdate.name}'?` }
        );

        if (!addMethod) { return; } // User cancelled

        // Check if nothing changed for Append option after selection (if Append was the only option and user picked it)
        if (addedCount === 0 && addMethod?.action === 'append') {
             vscode.window.showInformationMessage(`All selected folder patterns already exist in the '${targetPattern}' list for filter '${filterToUpdate.name}'. No changes made.`);
             return;
        }

		// Update the pattern based on choice
		if (targetPattern === 'include') {
            filterToUpdate.include = (addMethod.action === 'append') ? combinedPatternAppend : combinedPatternOverwrite;
		} else {
            filterToUpdate.exclude = (addMethod.action === 'append') ? combinedPatternAppend : combinedPatternOverwrite;
		}
		// Preserve the existing scope when updating
		await saveFilter(context, filterToUpdate, filterToUpdate.scope);
	}
}

// NEW Helper function to handle adding file type to include/exclude
// Modify the function signature
async function addFileTypeToFilter(targetUriOrUris: vscode.Uri | vscode.Uri[] | undefined, targetPattern: 'include' | 'exclude', context: vscode.ExtensionContext) {
	// --- Input Validation and URI processing ---
    let fileUris: vscode.Uri[] = [];
    if (Array.isArray(targetUriOrUris)) {
		fileUris = targetUriOrUris;
	} else if (targetUriOrUris instanceof vscode.Uri) {
		fileUris = [targetUriOrUris];
	}

	if (!fileUris || fileUris.length === 0) {
		vscode.window.showErrorMessage('Please run this command by right-clicking one or more files (with extensions) in the Explorer.');
		return;
	}

    // Extract unique file type patterns (e.g., **/*.ts, **/*.js)
    const uniqueFileTypePatterns = new Set<string>();
    for (const uri of fileUris) {
        const fileExtension = path.extname(uri.fsPath);
        if (fileExtension) { // Check if it's a file with an extension
             const pattern = `**/*${fileExtension}`;
             uniqueFileTypePatterns.add(pattern);
        }
    }

    const fileTypePatterns = Array.from(uniqueFileTypePatterns); // Convert Set to Array

    if (fileTypePatterns.length === 0) {
        vscode.window.showInformationMessage('No valid files with extensions selected.');
        return;
    }

    const patternsToAddString = fileTypePatterns.join(', '); // For display

	// --- Filter Selection (remains similar) ---
	const savedFilters: SearchFilter[] = loadAllFilters(context);
    const createNewOption = { label: "$(add) Create New Filter...", description: `Create a new filter with ${fileTypePatterns.length} file type(s)`, name: null };
	const quickPickItems = [
        createNewOption,
		...savedFilters.map(filter => ({ 
			label: formatFilterLabel(filter), 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, // Fixed typo
			filter: filter // Store the actual filter object
		}))
    ]; // Same structure
	const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
		placeHolder: `Select filter to add ${fileTypePatterns.length} file type(s) to '${targetPattern}' pattern, or create new`
	});
	if (!selectedItem) { return; }

	// --- Handle Filter Creation or Update ---
	if (selectedItem === createNewOption) {
        // Create a new filter
		const filterName = await vscode.window.showInputBox({ 
            prompt: 'Enter a name for the new search filter',
			validateInput: text => text && text.trim().length > 0 ? null : 'Filter name cannot be empty.'
         });
		if (!filterName) { return; }
		const newFilter: SearchFilter = { name: filterName.trim(), include: '', exclude: '' };

		const combinedPattern = fileTypePatterns.join(','); // Join all unique selected file type patterns

		if (targetPattern === 'include') {
			newFilter.include = combinedPattern;
			const excludePattern = await vscode.window.showInputBox({ 
                prompt: `(Optional) Enter files to exclude for new filter '${filterName}'`,
				placeHolder: 'e.g., **/*.log,**/node_modules/**'
             });
			newFilter.exclude = excludePattern || '';
		} else {
			newFilter.exclude = combinedPattern;
			const includePattern = await vscode.window.showInputBox({ 
                prompt: `(Optional) Enter files to include for new filter '${filterName}'`,
				placeHolder: 'e.g., src/**/*.ts'
             });
			newFilter.include = includePattern || '';
		}
		await saveFilter(context, newFilter, undefined);

	} else if ('filter' in selectedItem && selectedItem.filter) {
        // Add to existing filter
		const filterToUpdate = selectedItem.filter;
		let currentPattern = targetPattern === 'include' ? filterToUpdate.include : filterToUpdate.exclude;

        // ** Modified Append Logic **
        let combinedPatternAppend = currentPattern;
        let addedCount = 0;
        for (const pattern of fileTypePatterns) {
            const originalLength = combinedPatternAppend?.length ?? 0;
            combinedPatternAppend = appendToPattern(combinedPatternAppend, pattern);
            if (combinedPatternAppend.length > originalLength || (!currentPattern && pattern)) {
                 addedCount++;
            }
        }
        const combinedPatternOverwrite = fileTypePatterns.join(',');

        // Check if nothing would actually change for the append option
        if (addedCount === 0) {
             vscode.window.showInformationMessage(`All selected file type patterns already exist in the '${targetPattern}' list for filter '${filterToUpdate.name}'. No changes made.`);
             return;
        }


        // Ask how to add the path (Append/Overwrite)
        const addMethod = await vscode.window.showQuickPick(
            [
                 // Show Append option only if it results in a change
                ...(addedCount > 0 ? [{ label: 'Append (Combine)', description: `Result: ${combinedPatternAppend}`, action: 'append' }] : []),
                { label: 'Overwrite', description: `Result: ${combinedPatternOverwrite}`, action: 'overwrite' }
            ],
            { placeHolder: `How to add ${fileTypePatterns.length} file type pattern(s) to the '${targetPattern}' pattern for filter '${filterToUpdate.name}'?` }
        );

        if (!addMethod) { return; } // User cancelled

		// Update the pattern based on choice
		if (targetPattern === 'include') {
            filterToUpdate.include = (addMethod.action === 'append') ? combinedPatternAppend : combinedPatternOverwrite;
		} else {
            filterToUpdate.exclude = (addMethod.action === 'append') ? combinedPatternAppend : combinedPatternOverwrite;
		}
		// Preserve the existing scope when updating
		await saveFilter(context, filterToUpdate, filterToUpdate.scope);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "custom-search-filters" is now active!');

	// Migrate global filters from globalState to VS Code settings (one-time migration)
	migrateGlobalFiltersFromState(context).catch(error => {
		console.error('Error during migration:', error);
	});

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
		let savedFilters: SearchFilter[] = loadAllFilters(context);

		// Filter out disabled global filters (workspace filters are always shown)
		savedFilters = savedFilters.filter(filter => {
			if (filter.scope === 'workspace') {
				return true; // Always show workspace filters
			}
			// For global filters, only show if enabled (default to true if not specified)
			return filter.enabled !== false;
		});

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No enabled custom search filters available. Use the "Add Custom Search Filter" command to create one, or enable filters in settings.');
			return;
		}

		// Create QuickPick instance to handle button clicks
		const quickPick = vscode.window.createQuickPick();
		quickPick.placeholder = 'Select a custom search filter to apply';

		// Function to update QuickPick items
		const updateQuickPickItems = () => {
			let allFilters = loadAllFilters(context);
			// Filter out disabled global filters
			allFilters = allFilters.filter(filter => {
				if (filter.scope === 'workspace') {
					return true; // Always show workspace filters
				}
				return filter.enabled !== false;
			});
			savedFilters = allFilters;
			quickPick.items = savedFilters.map(filter => ({
				label: formatFilterLabel(filter),
				description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`,
				filter: filter,
				buttons: [{
					iconPath: new vscode.ThemeIcon('x'),
					tooltip: 'Delete filter'
				}]
			}));
		};

		updateQuickPickItems();

		// Handle button clicks (delete)
		quickPick.onDidTriggerItemButton(async (e) => {
			const filterToDelete = (e.item as any).filter;
			if (filterToDelete) {
				const confirmed = await vscode.window.showWarningMessage(
					`Are you sure you want to delete filter '${filterToDelete.name}'?`,
					{ modal: true },
					'Delete',
					'Cancel'
				);
				if (confirmed === 'Delete') {
					await deleteFilter(context, filterToDelete);
					updateQuickPickItems(); // Refresh the list
				}
			}
		});

		// Handle item selection (search)
		quickPick.onDidAccept(async () => {
			const selectedItem = quickPick.selectedItems[0];
			if (selectedItem && (selectedItem as any).filter) {
				const selectedFilter = (selectedItem as any).filter;
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
			}
		});

		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	});

	context.subscriptions.push(selectAndSearchDisposable);

	// Command to delete a custom search filter
	const deleteFilterDisposable = vscode.commands.registerCommand('custom-search-filters.deleteFilter', async () => {
		// 1. Retrieve saved filters
		let savedFilters: SearchFilter[] = loadAllFilters(context);

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No custom search filters to delete.');
			return;
		}

		// 2. Prepare Quick Pick items
		const quickPickItems = savedFilters.map(filter => ({ 
			label: formatFilterLabel(filter), 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, 
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select a filter to delete
		const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select a custom search filter to delete' 
		});

		if (!selectedItem) { return; } // User cancelled

		// 4. Find and remove the selected filter
		await deleteFilter(context, selectedItem.filter);
	});

	context.subscriptions.push(deleteFilterDisposable); // Register the new command

	// --- NEW Context Menu Commands ---
	const addFolderToIncludeDisposable = vscode.commands.registerCommand(
        'custom-search-filters.addFolderToInclude',
        // The first argument is the primary uri, the second is the array of all selected uris
        (uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined) => {
		    addFolderToFilter(uris || uri, 'include', context); // Pass the array if available, otherwise the single uri
	    }
    );
	const addFolderToExcludeDisposable = vscode.commands.registerCommand(
        'custom-search-filters.addFolderToExclude',
        (uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined) => {
		    addFolderToFilter(uris || uri, 'exclude', context);
	    }
    );

    // NEW: File Type context menu commands
	const addFileTypeToIncludeDisposable = vscode.commands.registerCommand(
        'custom-search-filters.addFileTypeToInclude',
        (uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined) => {
		    addFileTypeToFilter(uris || uri, 'include', context);
	    }
    );
	const addFileTypeToExcludeDisposable = vscode.commands.registerCommand(
        'custom-search-filters.addFileTypeToExclude',
        (uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined) => {
		    addFileTypeToFilter(uris || uri, 'exclude', context);
	    }
    );

	// --- NEW: Command to Edit an Existing Filter ---
	const editFilterDisposable = vscode.commands.registerCommand('custom-search-filters.editFilter', async () => {
		// 1. Retrieve saved filters
		let savedFilters: SearchFilter[] = loadAllFilters(context);

		if (savedFilters.length === 0) {
			vscode.window.showInformationMessage('No custom search filters saved yet to edit.');
			return;
		}

		// 2. Prepare Quick Pick items for selection
		const quickPickItems = savedFilters.map(filter => ({ 
			label: formatFilterLabel(filter), 
			description: `Include: ${filter.include || '(none)'}, Exclude: ${filter.exclude || '(none)'}`, 
			filter: filter // Store the actual filter object
		}));

		// 3. Show Quick Pick to select a filter to edit
		const selectedItem = await vscode.window.showQuickPick(quickPickItems, { 
			placeHolder: 'Select a custom search filter to edit' 
		});

		if (!selectedItem) { return; } 

		const originalFilter = selectedItem.filter;
		const originalName = originalFilter.name; 

		// 4. Prompt for potentially new Filter Name (pre-filled)
		const newFilterName = await vscode.window.showInputBox({
			prompt: 'Enter the new name for the search filter',
			value: originalFilter.name, // Pre-fill with current name
			validateInput: text => {
				return text && text.trim().length > 0 ? null : 'Filter name cannot be empty.';
			},
            ignoreFocusOut: true // Keep open on focus loss
		});
		// *** Only cancel the entire edit if the NAME prompt is cancelled or explicitly empty ***
		if (newFilterName === undefined) { 
            vscode.window.showInformationMessage('Edit cancelled.');
            return; 
        }
        // Re-validate trimmed name just in case validateInput allowed spaces
        if (!newFilterName.trim()){
             vscode.window.showErrorMessage('Filter name cannot be empty.');
             return; 
        }

		// 5. Prompt for potentially new Include Pattern (pre-filled)
		const newIncludePattern = await vscode.window.showInputBox({
			prompt: 'Enter the new files to include (glob pattern)',
			value: originalFilter.include, // Pre-fill
			placeHolder: '(Optional) Leave blank for default; Esc to keep original',
            ignoreFocusOut: true // Keep open on focus loss
		});
        // *** If Esc is pressed (undefined), keep original value. Otherwise, use input (or empty string). ***
        const finalIncludePattern = newIncludePattern === undefined ? originalFilter.include : (newIncludePattern || '');


		// 6. Prompt for potentially new Exclude Pattern (pre-filled)
		const newExcludePattern = await vscode.window.showInputBox({
			prompt: 'Enter the new files to exclude (glob pattern)',
			value: originalFilter.exclude, // Pre-fill
			placeHolder: '(Optional) e.g., **/node_modules/**; Esc to keep original',
            ignoreFocusOut: true // Keep open on focus loss
		});
        // *** If Esc is pressed (undefined), keep original value. Otherwise, use input (or empty string). ***
        const finalExcludePattern = newExcludePattern === undefined ? originalFilter.exclude : (newExcludePattern || '');
		console.log('[EditFilter Debug] Final exclude pattern:', finalExcludePattern); // <-- ADDED LOG

        // --- Create updated filter, check name conflicts, save (logic remains the same) ---
        const filterScope = originalFilter.scope || 'global';
        const updatedFilter: SearchFilter = {
			name: newFilterName.trim(), // Trim the validated name
			include: finalIncludePattern,
			exclude: finalExcludePattern,
			scope: filterScope, // Preserve the original scope
			enabled: originalFilter.enabled // Preserve enabled state (for global filters)
		};

		// 8. Handle potential name conflicts if the name was changed
        if (originalName !== updatedFilter.name) {
            const conflictingFilterExists = savedFilters.some(f => f.name === updatedFilter.name && f.scope === filterScope);
            if (conflictingFilterExists) {
                vscode.window.showErrorMessage(`A filter with the name '${updatedFilter.name}' already exists in ${filterScope === 'global' ? 'global' : 'project'} scope. Please choose a different name.`);
                return; // Stop the edit process
            }
        }

		// 9. Save the updated filter to the appropriate location
		try {
            if (filterScope === 'workspace') {
                // Update in project file
                const projectFilters = loadProjectFilters();
                const existingIndex = projectFilters.findIndex(f => f.name === originalName);
                if (existingIndex > -1) {
                    projectFilters[existingIndex] = updatedFilter;
                } else {
                    // If not found, add it (shouldn't happen, but handle gracefully)
                    projectFilters.push(updatedFilter);
                }
                if (saveProjectFilters(projectFilters)) {
                    vscode.window.showInformationMessage(`Search filter '${updatedFilter.name}' updated in project successfully!`);
                } else {
                    vscode.window.showErrorMessage('Failed to update filter in project. See console for details.');
                }
            } else {
                // Update in global settings
                let globalFilters: SearchFilter[] = loadGlobalFilters();
                const existingIndex = globalFilters.findIndex(f => f.name === originalName);
                if (existingIndex > -1) {
                    globalFilters[existingIndex] = updatedFilter;
                } else {
                    // If not found, add it (shouldn't happen, but handle gracefully)
                    globalFilters.push(updatedFilter);
                }
                if (await saveGlobalFilters(globalFilters)) {
                    vscode.window.showInformationMessage(`Search filter '${updatedFilter.name}' updated globally successfully!`);
                } else {
                    vscode.window.showErrorMessage('Failed to update filter in global settings. See console for details.');
                }
            }
		} catch (error) {
			console.error('Error updating search filter:', error);
			vscode.window.showErrorMessage('Failed to update search filter. See console for details.');
		}
	});
	context.subscriptions.push(editFilterDisposable);
    // --- END NEW Command ---

	// Add all disposables to subscriptions
	context.subscriptions.push(
        addFilterDisposable,
        selectAndSearchDisposable,
        deleteFilterDisposable,
        editFilterDisposable,
        addFolderToIncludeDisposable,
        addFolderToExcludeDisposable,
        addFileTypeToIncludeDisposable, 
        addFileTypeToExcludeDisposable
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
