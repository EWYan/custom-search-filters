# custom-search-filters

Manage and apply custom include/exclude file patterns for VS Code's search functionality.

## Features

All commands can be accessed via the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) unless otherwise noted.

*   **Custom Search: Add Filter**:
    *   Prompts for a filter name, include pattern (glob), and exclude pattern (glob).
    *   Saves the filter for later use.
*   **Custom Search: Select Filter and Search**:
    *   Shows a list of your saved filters.
    *   Selecting a filter opens the Search view with the corresponding include/exclude patterns pre-filled.
*   **Custom Search: Delete Filter**:
    *   Shows a list of your saved filters.
    *   Select a filter to permanently remove it.
*   **Custom Search: Edit Filter**:
    *   Shows a list of your saved filters.
    *   Selecting a filter allows you to modify its name, include pattern, and exclude pattern via input boxes.
*   **Custom Search: Add Folder to Include Filter** (Explorer Context Menu):
    *   Right-click one or more folders in the File Explorer.
    *   Choose this option to select an existing filter (or create a new one).
    *   You'll be prompted to either append the selected folder path(s) (e.g., `folder1/**/*,folder2/**/*`) to the filter's include pattern or overwrite the existing pattern. Duplicates are skipped when appending.
*   **Custom Search: Add Folder to Exclude Filter** (Explorer Context Menu):
    *   Right-click one or more folders in the File Explorer.
    *   Choose this option to select an existing filter (or create a new one).
    *   You'll be prompted to either append the selected folder path(s) to the filter's exclude pattern or overwrite the existing pattern. Duplicates are skipped when appending.
*   **Custom Search: Add File Type to Include Filter** (Explorer Context Menu):
    *   Right-click one or more files (with extensions) in the File Explorer.
    *   Choose this option to select an existing filter (or create a new one).
    *   You'll be prompted to either append the selected file type(s) (e.g., `**/*.ts,**/*.js`) to the filter's include pattern or overwrite the existing pattern. Duplicates are skipped when appending.
*   **Custom Search: Add File Type to Exclude Filter** (Explorer Context Menu):
    *   Right-click one or more files (with extensions) in the File Explorer.
    *   Choose this option to select an existing filter (or create a new one).
    *   You'll be prompted to either append the selected file type(s) to the filter's exclude pattern or overwrite the existing pattern. Duplicates are skipped when appending.

## Filter Scope and Storage

Filters can be saved with two different scopes:

### Global Filters
*   **Scope**: Available across all projects and workspaces
*   **Storage Location**: Stored in VS Code user settings
    *   Filter definitions: `custom-search-filters.globalFilters`
    *   Enable/disable states: `custom-search-filters.globalFiltersEnabled`
*   **Sync**: Can be synced across devices using VS Code Settings Sync
*   **Enable/Disable**: You can enable or disable global filters in VS Code settings. Disabled filters will not appear in the filter selection list
*   **Default State**: All global filters are enabled by default

### Workspace Filters
*   **Scope**: Only available in the current workspace/project
*   **Storage Location**: Stored in `.vscode/custom-search-filters.json` in the project root directory
*   **Sync**: Included in the project repository (if committed), making them available to all team members
*   **Visibility**: Always visible in the filter selection list (cannot be disabled)

When creating a new filter, you'll be prompted to choose between Global or Workspace scope. The filter list displays both types with icons indicating their scope (🌐 for Global, 📁 for Workspace).

**Enjoy!**
