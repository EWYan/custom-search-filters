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
    *   Each entry has a pin button (see [Pinned Filters](#pinned-filters)). User-defined filters also have edit (pencil) and delete (✕) buttons.
    *   Any pinned filters are added to the selected filter's patterns.
*   **Custom Search: Delete Filter**:
    *   Shows a list of your saved filters.
    *   Select a filter to permanently remove it.
*   **Custom Search: Edit Filter**:
    *   Shows a list of all saved filters, including disabled ones.
    *   Selecting a filter opens the filter editor (see [Editing Filters](#editing-filters)).

## Built-in All Workspace Files

**All Workspace Files** is available in the panel's **Global** group and in **Select Filter and Search**, even when no filters are saved. It stays first, with the standard globe icon and a muted **Built-in** description that remains when pinned. The search picker uses one line, with no extra explanation row, and initially focuses a user-defined filter when one is available. The panel tooltip contains the full explanation.

It includes `**/*` with no exclusions and starts unchecked and unpinned. Select it to search all roots in the current workspace. Other filters' exclusions still apply. Because includes combine with OR, selecting or pinning it broadens narrower include filters to all workspace files.

This filter is read-only: it has no edit/delete actions and cannot receive patterns from the Explorer. Its definition is not written to user settings or project files. You can check, clear, pin, or unpin it normally; selection and pin state are remembered per workspace, independently of any user filter with the same name.

## Persistent Filters Panel

Run **Custom Search: Show Filters Panel**, click the list-tree icon in the Search view title, or open **Search Filters** in the bottom panel. Filters are grouped by global scope and workspace root. Hover a filter to show its actions: the pin button pins it (see [Pinned Filters](#pinned-filters)) and user-defined filters have a pencil button for editing. Disabled filters remain visible without a checkbox.

1. Check the filters to combine. The panel previews the resulting **Include** and **Exclude** patterns, including exact overlaps where exclusion takes precedence.
2. Click **Apply Selected Filters** (play icon) to fill the native search path fields and run the search. Checking boxes alone never starts a search.
3. **Clear Filter Selection** only clears checkboxes. Click **Apply** with nothing checked to use pinned filters only; if no enabled filters are pinned, both search path fields are cleared.

When several filters provide includes, their patterns are combined with **OR**; all exclude patterns apply to the combined scope. If only one filter provides includes, its expression keeps VS Code's existing semantics, including path/glob combinations such as `./src,**/*.ts`. An exclusion-only filter does not broaden another filter's include scope. For example, combining separate `src/**` and `**/*.ts` filters searches either match. This combines rules, not the independent search results of each filter. Duplicate patterns are removed; brace expressions such as `**/*.{ts,js}` remain intact. Includes and excludes are never moved between the original filters by the panel.

Checkboxes are saved per workspace, separately from each filter's enabled state. Reopening restores the selection without running a search. Renaming through the extension keeps the selection; deleting, disabling, or removing a filter's workspace root clears its selection. Settings and project file changes refresh the panel automatically.

If a project filter file contains invalid JSON or cannot be read, the panel keeps its previous filters and selections and reports the file path. Fix the file to refresh automatically, or use **Refresh Filters**. Searches and edits that load filters stop until it can be read; a valid empty array or a deleted file clears the corresponding selections.

Applying uses VS Code's **Find in Files** command and preserves the current regex, case-sensitive, and whole-word options. VS Code controls focus and may seed the search term from the editor selection. It also honors `search.mode`: use `view` for the sidebar, or your configured Search Editor mode. Editing search fields manually does not change the panel's checkboxes; the next Apply replaces those path fields with the preview.

## Pinned Filters

Pin a filter that should apply to every search, such as one that excludes build output or tests. Every search the extension starts then combines the pinned filters with the filter you choose, so you do not have to select them again each time.

### Pinning and Unpinning

| Where | How |
|---|---|
| **Search Filters** panel | Hover a filter and click the pin button. Click it again to unpin. |
| **Select Filter and Search** | Click the pin button on an entry. The list stays open, so you can pin several filters and then pick one to search. |
| Filter editor | Select **Pinned** to toggle it, then choose **Save**. Like other fields, it is marked `● modified` and is discarded if you leave without saving. |

### How Pinned Filters Look

*   **Panel**: a pinned filter shows a colored pin instead of a checkbox, and its name uses the same color. A pinned filter that is disabled shows a gray pin. The panel title shows the count, for example `1 selected · 2 pinned`.
*   **Select Filter and Search**: pinned entries end with a pin icon, their description starts with `Pinned ·`, and the placeholder says how many pinned filters will be added.

The default color follows your theme: yellow in dark themes and orange in light themes. To change it, add the `customSearchFilters.pinnedForeground` color to your user settings:

```json
"workbench.colorCustomizations": {
  "customSearchFilters.pinnedForeground": "#ff8800"
}
```

The pin icon is always colored. The name is colored only while `explorer.decorations.colors` is enabled, which is the default.

### How Searches Combine Pinned Filters

| Action | Search path fields get |
|---|---|
| **Apply Selected Filters** in the panel | Pinned filters + checked filters |
| **Apply Selected Filters** with nothing checked | Pinned filters only |
| **Select Filter and Search** | Pinned filters + the selected filter |
| **Search Now**, **Save and Search** | Pinned filters + that filter |

Pinned filters are combined with the same rules as the panel: includes match **any** pattern, and excludes take precedence. For example, with `Exclude build output` (`**/node_modules/**,**/dist/**`) pinned, selecting a `TypeScript` filter (`**/*.ts`) searches TypeScript files outside `node_modules` and `dist`. A pinned exclusion-only filter never broadens the include scope. The panel's **Include** and **Exclude** preview always includes the pinned filters.

### Pin Behavior

*   Pins are saved per workspace, like the panel's checkboxes. Pinning never changes settings or the project's `.vscode/custom-search-filters.json`, so it is not shared through Settings Sync or the repository.
*   Pinning a checked filter clears its checkbox selection through every entry point. Unpinning leaves it unchecked; check it again to include it in the next panel Apply.
*   Renaming a filter through the extension keeps its pin. Deleting a filter removes its pin.
*   A disabled filter stays pinned but is not added automatically until it is enabled again. Explicitly choosing **Save and Search** still searches with the edited filter.
*   A filter deleted by editing settings or the project file directly keeps its pin entry. A new filter with the same name and scope is then pinned automatically; unpin it if that is not wanted.

## Adding Folders and File Types from the Explorer

Right-click one or more folders or files in the Explorer and open the **Search Filters** submenu, next to **Find in Folder...**:

| Selection | Commands | Pattern added |
|---|---|---|
| Folders | **Include Folder...**, **Exclude Folder...** | `./src/utils/**/*` in project filters |
| Files with an extension | **Include File Type...**, **Exclude File Type...** | `**/*.ts` |

Project folder selections are stored as explicit relative paths (e.g., `./src/**/*`) and qualified with the current workspace folder name when searching a workspace file (e.g., `./frontend/src/**/*`). They keep working when the project is opened alone. Plain project globs such as `*.ts`, `.ts`, or `src/**/*` retain VS Code's recursive matching within that project; use `./src/**/*` to target only its root-level `src` directory. Home-relative paths such as `~/projects/lib` remain usable when combining filters. Global filters created from Explorer folders keep explicit workspace prefixes where needed. Use a global filter when selecting folders across multiple roots. These commands work on the Explorer selection, so they are not listed in the Command Palette.

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
*   **Pinned**: select it to toggle whether the filter is added to every search in this workspace (see [Pinned Filters](#pinned-filters)).
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

### Panel Selection and Pins
*   **Scope**: Per workspace, for both global and workspace filters
*   **Storage Location**: VS Code workspace state, not settings or project files
*   **Sync**: Not synced and not shared with team members

## Development and Debugging

Open this repository folder in VS Code and run `npm ci` once to install development dependencies. In **Run and Debug**, select **Run Custom Search Filters** and press **F5**. The launch configuration compiles TypeScript and opens an **Extension Development Host**. Open a project in that window and run **Custom Search: Show Filters Panel** to exercise the extension. Breakpoints can be set in `src/`.

The `vscode` module is provided by the extension host. Running `node out/extension.js` or using **Run Code** on the entry file cannot load that API. See the [VS Code extension debugging guide](https://code.visualstudio.com/api/get-started/your-first-extension).

Run `npm test` for compilation, linting, and extension host tests, including native search results in temporary single-folder and multi-root workspaces.

**Enjoy!**
