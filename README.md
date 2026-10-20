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

## Persistent Filters Panel

Run **Custom Search: Show Filters Panel**, click the list-tree icon in the Search view title, or open **Search Filters** in the bottom panel. Filters are grouped by global scope and workspace root. Use the pencil action to edit a filter; disabled filters remain visible without a checkbox.

1. Check the filters to combine. The panel previews the resulting **Include** and **Exclude** patterns, including exact overlaps where exclusion takes precedence.
2. Click **Apply Selected Filters** (play icon) to fill the native search path fields and run the search. Checking boxes alone never starts a search.
3. **Clear Filter Selection** only clears checkboxes. Click **Apply** with nothing checked to clear both search path fields.

Include patterns are combined with **OR**; all exclude patterns apply to the combined scope. An exclusion-only filter does not broaden another filter's include scope. For example, combining `src/**` and `**/*.ts` searches either match, rather than only TypeScript files inside `src`. This combines rules, not the independent search results of each filter. Duplicate patterns are removed; brace expressions such as `**/*.{ts,js}` remain intact. Includes and excludes are never moved between the original filters by the panel.

Checkboxes are saved per workspace, separately from each filter's enabled state. Reopening restores the selection without running a search. Renaming through the extension keeps the selection; deleting, disabling, or removing a filter's workspace root clears its selection. Settings and project file changes refresh the panel automatically.

Applying uses VS Code's **Find in Files** command and preserves the current regex, case-sensitive, and whole-word options. VS Code controls focus and may seed the search term from the editor selection. It also honors `search.mode`: use `view` for the sidebar, or your configured Search Editor mode. Editing search fields manually does not change the panel's checkboxes; the next Apply replaces those path fields with the preview.

## Adding Folders and File Types from the Explorer

Right-click one or more folders or files in the Explorer and open the **Search Filters** submenu, next to **Find in Folder...**:

| Selection | Commands | Pattern added |
|---|---|---|
| Folders | **Include Folder...**, **Exclude Folder...** | `src/utils/**/*` |
| Files with an extension | **Include File Type...**, **Exclude File Type...** | `**/*.ts` |

Project filter paths are stored relative to the project (e.g., `src/**/*`) and qualified with the current workspace folder name when searching a workspace file (e.g., `./frontend/src/**/*`). They keep working when the project is opened alone. Global filters created from Explorer folders keep explicit workspace prefixes where needed. Use a global filter when selecting folders across multiple roots. These commands work on the Explorer selection, so they are not listed in the Command Palette.

1.  A picker titled with the patterns being added (e.g., `Exclude 2 folders: dist/**/*, out/**/*`) lists **New Filter...** and your global filters plus the project filters of the selected folder's workspace root.
2.  Select a filter to **append** the patterns. Patterns already present are skipped, and a filter that already contains all of them is marked and left unchanged. To replace the existing patterns instead, use the replace button on the filter's entry.
3.  If a pattern being added is already in the filter's other list (for example, adding `src/**/*` to exclude while it is in include), it is moved out of that list so the exact pattern is not both included and excluded. The picker shows this before you choose.
4.  The confirmation offers **Search Now**, **Edit Filter**, and **Undo**. Undo refuses to overwrite a later edit or restore a deleted filter.

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
