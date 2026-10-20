# custom-search-filters

Manage and apply custom include/exclude file patterns for VS Code's search functionality.

## Features

All commands can be accessed via the Command Palette (Ctrl+Shift+P or Cmd+Shift+P), where they are listed under **Custom Search**, unless otherwise noted.

*   **Custom Search: Add Filter**:
    *   Prompts for a filter name, include pattern (glob), and exclude pattern (glob).
    *   Saves the filter for later use.
*   **Custom Search: Select Filter and Search**:
    *   Shows a list of your saved filters.
    *   Selecting a filter opens the Search view with the corresponding include/exclude patterns pre-filled.
    *   Also available from the filter icon in the Search view and editor title bars.
    *   Each entry has an edit (pencil) button that opens the filter editor and a delete (✕) button.
*   **Custom Search: Delete Filter**:
    *   Shows a list of your saved filters.
    *   Select a filter to permanently remove it.
*   **Custom Search: Edit Filter**:
    *   Shows a list of all saved filters, including disabled ones.
    *   Selecting a filter opens the filter editor (see [Editing Filters](#editing-filters)).
## Adding Folders and File Types from the Explorer

Right-click one or more folders or files in the Explorer and open the **Search Filters** submenu, next to **Find in Folder...**:

| Selection | Commands | Pattern added |
|---|---|---|
| Folders | **Include Folder...**, **Exclude Folder...** | `src/utils/**/*` |
| Files with an extension | **Include File Type...**, **Exclude File Type...** | `**/*.ts` |

In a multi-root workspace, folder paths are prefixed with their workspace folder name (e.g., `./frontend/src/**/*`) so the pattern only matches inside that root. These commands work on the Explorer selection, so they are not listed in the Command Palette.

1.  A picker titled with the patterns being added (e.g., `Exclude 2 folders: dist/**/*, out/**/*`) lists **New Filter...** and your global filters plus the project filters of the selected folder's workspace root.
2.  Select a filter to **append** the patterns. Patterns already present are skipped, and a filter that already contains all of them is marked and left unchanged. To replace the existing patterns instead, use the replace button on the filter's entry.
3.  If a pattern being added is already in the filter's other list (for example, adding `src/**/*` to exclude while it is in include), it is moved out of that list, since a pattern in both lists would match nothing. The picker shows this before you choose.
4.  The confirmation offers **Search Now**, **Edit Filter**, and **Undo**.

**New Filter...** asks for the scope (folders default to the current project, file types to global), then for a name with a suggestion such as `src` or `Exclude *.log files`, validated as you type.

## Editing Filters

The filter editor lists the filter's fields with their current values, so you only touch what you want to change:

*   **Name**, **Include**, **Exclude**: select a field to edit it in a prefilled input box. Names are validated as you type, including duplicates in the same scope. Press Enter to keep the change or Escape to leave the field as it was.
*   For an include or exclude list with several comma-separated patterns, you can edit it as text or choose the patterns to keep from a checklist; unchecking a pattern removes it.
*   **Enabled**: select it to toggle whether the filter appears in **Select Filter and Search**.
*   Changed fields are marked `● modified`. Nothing is written until you choose **Save** or **Save and Search**; the latter saves and immediately runs a search with the updated filter.
*   **Discard Changes** (or Escape, after confirmation) leaves the filter untouched.

When the editor is opened from the search list, the list reopens after you save or discard.

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
*   **User Settings Only**: Global filters and their enabled states are read from and written to user settings. Values for these settings in workspace or folder settings are ignored, so they are never copied into your user settings.

During upgrades, existing global filter settings are preserved, including an explicitly empty list. Legacy filters are imported only when the user setting has not been configured.

### Upgrading from 0.2.2

Version 1.0.1 keeps the existing user settings and workspace JSON format, including stored names and disabled states. No manual conversion is required.

If filters were lost during an earlier migration, run **Custom Search: Recover Legacy Filters** from the Command Palette. After confirmation, it restores missing names from the legacy snapshot into user settings, preserving existing filters and enabled states. Recovery may bring back previously deleted filters, so use it only when needed. The snapshot is retained for retrying recovery; if none remains, the command reports that nothing can be recovered.

### Workspace Filters
*   **Scope**: Only available in the current workspace/project
*   **Storage Location**: Stored in `.vscode/custom-search-filters.json` in the project root directory
*   **Sync**: Included in the project repository (if committed), making them available to all team members
*   **Enable/Disable**: Visible by default. Set `"enabled": false` on a filter in `.vscode/custom-search-filters.json` to hide it from the filter selection list; editing the filter keeps that setting

When creating a new filter, you'll be prompted to choose between Global or Workspace scope. The filter list displays both types with VS Code icons: globe for Global and folder for Workspace.

**Enjoy!**
