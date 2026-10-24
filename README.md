<img src="media/icon.png" alt="Custom Search Filters icon" width="80" height="80">

# Custom Search Filters

**English** | [简体中文](README.zh-CN.md)

Save reusable include/exclude rules for VS Code's native file search. Switch between search scopes, combine several filters, and keep common exclusions pinned.

- **Reusable filters:** save rules globally or alongside a project.
- **Checkbox panel:** combine filters and preview the patterns before applying them.
- **Pinned filters:** automatically add shared rules to searches started by the extension.
- **Explorer actions:** build filters from selected folders or file types.

[Quick start](#quick-start) · [Usage](#usage) · [Patterns](#patterns-and-combination) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting)

## Installation

Requires **VS Code 1.96.2 or later**. This guide describes the **1.1.x** features.

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=juzidaxia.custom-search-filters), or search for `@id:juzidaxia.custom-search-filters` in the Extensions view. For a local build, run **Extensions: Install from VSIX...** and select its `.vsix` file. See [VS Code's installation guide](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#install-from-a-vsix).

If your installed version lacks the panel or pin actions, install a 1.1.x build.

## Quick start

1. Open a folder or workspace. Open the Command Palette with **Ctrl+Shift+P** (**Cmd+Shift+P** on macOS).
2. Run **Custom Search: Add Filter**. Enter `TypeScript` as the name, `**/*.ts` as **Include**, leave **Exclude** empty, and choose **Global**.
3. Open VS Code's Search view and enter a search term.
4. Run **Custom Search: Select Filter and Search**, then choose **TypeScript**. The extension fills **files to include** and **files to exclude** and runs the search.

You can also open the filter picker from the filter icon in the Search view or editor title bar.

## Usage

### Combine filters in the panel

Run **Custom Search: Show Filters Panel**, or click the list-tree icon in the Search view title bar. The **Search Filters** panel groups filters under **Global** and each project.

1. Check the filters you want to use.
2. Review the **Include** and **Exclude** preview, which also contains pinned rules.
3. Click **Apply Selected Filters** (play icon).

Checking boxes updates the preview; **Apply** starts the search. Exact include/exclude overlaps appear as **Overlap (excluded)**. Disabled filters remain visible without a checkbox.

**Clear Filter Selection** clears checkboxes. Apply again to use only pinned filters; if none are enabled and pinned, both search path fields are cleared. Each Apply replaces any patterns you entered manually.

Selections are remembered per workspace. Reopening restores them without starting a search.

<!-- Screenshot slot (media/screenshots/filters-panel.png): Search Filters panel with two checked filters, one pinned exclusion filter, and the native search fields after Apply. -->

### Keep common rules pinned

For a rule you reuse often, such as excluding generated files, click its pin button in the panel or search picker. You can also toggle **Pinned** in the filter editor and save.

A useful starting filter is `Skip dependencies and builds`: leave **Include** empty and set **Exclude** to `**/node_modules/**,**/dist/**`. Pin it, then choose a language or project filter.

| Search action | Rules applied |
|---|---|
| **Apply Selected Filters** | Pinned + checked filters |
| **Apply Selected Filters**, nothing checked | Pinned filters only |
| **Select Filter and Search** | Pinned + chosen filter |
| **Search Now** or **Save and Search** | Pinned + the current filter |

A colored pin replaces the checkbox in the panel. Pinning clears that filter's checkbox selection; unpinning leaves it unchecked. Disabled filters retain their pins but are skipped automatically. Explicit **Save and Search** still uses the edited filter.

Pins and checkbox selections are local to each workspace. Renaming through the extension keeps them; deleting through the extension removes them. Disabling clears a checkbox selection.

<!-- Screenshot slot (media/screenshots/filter-picker.png): Select Filter and Search showing the compact built-in entry, user filters, and a pinned filter. -->

### Search all workspace files

**All Workspace Files** is a built-in, read-only filter at the top of the list. It includes `**/*`, has no exclusions, and starts unchecked and unpinned.

Selecting or pinning it broadens the include scope to all workspace roots. Exclusions from other filters still apply, along with VS Code's search exclusions and ignore-file behavior. Its **Built-in** marker distinguishes it from saved filters; it cannot be edited, deleted, or used as an Explorer save target.

### Clear the current search

Run **Search: Clear Search Results**, or click the clear button in the Search view title bar. When the search or replace field contains text, it clears those fields and the results. Run it again with both fields empty to also clear **files to include** and **files to exclude**. See [VS Code's command behavior](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/searchView.ts#L1274-L1308).

This leaves the plugin's checkboxes and pins unchanged; the next **Apply** fills the path fields with their rules again. **Clear Filter Selection** clears only the checkboxes.

### Add folders and file types

Right-click one or more items in the Explorer and open **Search Filters**:

| Selection | Actions | Example pattern |
|---|---|---|
| Folders | **Include Folder...**, **Exclude Folder...** | `./src/utils/**/*` in a project filter |
| Files with extensions | **Include File Type...**, **Exclude File Type...** | `**/*.ts` |

Choose an existing filter to append patterns, use its replace button to replace that list, or select **New Filter...** to choose a scope and name. Folders default to **Current Project**; file types default to **Global**. Select Global when adding folders from several workspace roots.

Duplicates are skipped. An identical pattern in the opposite list is moved, so it is not both included and excluded. Afterwards, choose **Search Now**, **Edit Filter**, or **Undo**. Undo checks for later changes before restoring the filter.

These actions use the Explorer selection and appear only in its context menu.

### Edit saved filters

Run **Custom Search: Edit Filter**, or click a filter's pencil button. Edit **Name**, **Include**, **Exclude**, **Enabled**, or **Pinned**, then choose **Save** or **Save and Search**. Changes remain drafts until saved; **Discard Changes** abandons them.

For several patterns, **Choose Patterns to Keep** lets you remove entries with a checklist. Disabled filters are available for editing but hidden from the search picker.

## Patterns and combination

| Goal | Include | Exclude |
|---|---|---|
| TypeScript files | `**/*.ts` | Empty |
| C/C++ sources and headers | `**/*.{c,h,cpp,hpp}` | Empty |
| Project's top-level `src`, without tests | `./src/**/*` | `**/*.{test,spec}.ts` |
| Reusable exclusions | Empty | `**/node_modules/**,**/dist/**` |

Use forward slashes in paths and commas between patterns. Brace groups such as `**/*.{ts,js}` stay intact.

- **Includes from multiple filters combine with OR.** A project filter for `./src/**/*` plus a global filter for `**/*.ts` searches files in that `src` **or** TypeScript files elsewhere. For TypeScript only inside `src`, use `./src/**/*.ts` in one project filter.
- **Every exclusion applies to the combined scope.** Excludes take precedence over includes.
- **Exclusion-only filters preserve the include scope.** If no filter supplies includes, the include field stays empty.
- **One include-bearing filter keeps native VS Code semantics**, including a path/glob expression such as `./src,**/*.ts`. Combining several include-bearing filters merges their pattern lists; it does not evaluate each filter as a separate search. Duplicate patterns are removed.

Project patterns such as `src/**/*` match recursively; `./src/**/*` targets the project's root-level `src`. In a multi-root workspace, the extension qualifies project patterns with the current root name at search time, so the same saved project filter also works when opened alone. Absolute and home-relative paths such as `~/projects/lib` retain native search behavior.

See [VS Code's search syntax](https://code.visualstudio.com/docs/editing/codebasics#advanced-search-options) for the underlying pattern rules.

## Configuration

| Data | Stored in | Sharing |
|---|---|---|
| Global filters and enabled states | VS Code **User** settings | Eligible for Settings Sync |
| Project filters | `.vscode/custom-search-filters.json` in each workspace root | Share by committing the file |
| Checkboxes and pins | VS Code workspace state | Local; not synced or committed |

Names must be unique within a scope; different projects and Global can reuse a name. Global filter definitions and enabled states use **User settings only**; workspace or folder overrides are ignored.

### Global filters

Merge these entries into your **User settings JSON**:

```json
{
  "custom-search-filters.globalFilters": [
    {
      "name": "TypeScript",
      "include": "**/*.ts",
      "exclude": ""
    },
    {
      "name": "Skip dependencies and builds",
      "include": "",
      "exclude": "**/node_modules/**,**/dist/**"
    }
  ],
  "custom-search-filters.globalFiltersEnabled": {
    "TypeScript": true,
    "Skip dependencies and builds": true
  }
}
```

Global filters default to enabled. Set their name to `false` in `globalFiltersEnabled` to disable them.

### Project filters

Create `.vscode/custom-search-filters.json` in a project root:

```json
[
  {
    "name": "Source",
    "include": "./src/**/*",
    "exclude": "**/*.{test,spec}.ts",
    "enabled": true
  }
]
```

Use a JSON array with no comments or trailing commas. Set `"enabled": false` to disable a project filter. Settings and project-file changes refresh the panel automatically.

### Pin color

Merge this optional customization into User settings:

```json
{
  "workbench.colorCustomizations": {
    "customSearchFilters.pinnedForeground": "#ff8800"
  }
}
```

The default follows the theme. The pin icon is colored; name coloring also requires `explorer.decorations.colors` to be enabled.

## Command reference

Open the Command Palette and type **Custom Search**.

| Command | Purpose |
|---|---|
| **Add Filter** | Create a global or project filter |
| **Select Filter and Search** | Apply one filter together with enabled pins |
| **Show Filters Panel** | Open the checkbox panel |
| **Apply Selected Filters** | Search with checked filters and enabled pins |
| **Clear Filter Selection** | Clear checkboxes without applying |
| **Refresh Filters** | Reload settings and project files |
| **Edit Filter** | Edit or enable a saved filter |
| **Delete Filter** | Remove a saved filter |
| **Recover Legacy Filters** | Restore missing filters from retained legacy data |

## Upgrading from 0.2.2

Existing User settings and project JSON require no format conversion. Names and enabled states are preserved. Explicitly configured User settings, including an empty filter list, take precedence over legacy data. If you previously placed global-filter settings in workspace settings, move them to **User settings**.

If filters disappeared during an older migration, run **Custom Search: Recover Legacy Filters**. After confirmation, it adds missing names from a retained snapshot and preserves existing filters and enabled states. Recovery can restore intentionally deleted filters; use it only when needed. If no snapshot remains, the command reports that no legacy filters are available.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Checking a filter has no effect on search | Click **Apply Selected Filters** after reviewing the preview. |
| Search includes more files than expected | Inspect pinned filters and **All Workspace Files**. Multiple includes use OR. |
| Files are missing, even with **All Workspace Files** | Check **Exclude**, `.gitignore`, `files.exclude`, `search.exclude`, and the Search view's **Use Exclude Settings and Ignore Files** toggle. [VS Code search options](https://code.visualstudio.com/docs/editing/codebasics#advanced-search-options). |
| Project filters fail to load | Correct the reported JSON file or read permissions, then refresh. The panel retains its previous filters and selections; search and edits that reload filters stop until the file is readable. |
| A deleted filter becomes pinned when recreated | Direct edits to settings or JSON retain the pin identity. Unpin the recreated filter; deleting through the extension removes its pin. |

Applying filters preserves regex, case-sensitive, and whole-word options. VS Code controls search focus and may use selected editor text as the query. The `search.mode` setting determines whether results open in the Search view or a Search Editor; use `"search.mode": "view"` for the sidebar.

## Development

Run from the repository root:

| Command | Purpose |
|---|---|
| `npm ci` | Install locked development dependencies |
| `npm run compile` | Compile TypeScript into `out/` |
| `npm run watch` | Recompile as source files change |
| `npm run lint` | Check source with ESLint |
| `npm test` | Compile, lint, and run extension-host tests |

In VS Code, select **Run Custom Search Filters** in **Run and Debug**, then press **F5**. The launch configuration compiles the extension and opens an **Extension Development Host**. Set breakpoints in `src/`.

The `vscode` API is supplied by that host. Running `node out/extension.js` or using **Run Code** on the entry file produces `Cannot find module 'vscode'`. Tests may download VS Code and exercise native search in temporary single-folder and multi-root workspaces.

[Report an issue](https://github.com/EWYan/custom-search-filters/issues) with the extension/VS Code versions, workspace layout, relevant patterns, and steps to reproduce. See the [changelog](CHANGELOG.md) for release details. Licensed under [MIT](LICENSE).
