# Change Log

All notable changes to the "custom-search-filters" extension will be documented in this file.

- Initial release 0.0.1
    - Add custom search filters
    - Select and search with a custom filter
    - Delete a custom filter
    - Add combineFilters command

## [0.1.1] - 2025-04-20
### Added
- Add file type to include/exclude filters
- Add folder to include/exclude filters
- Add edit filter command
- Add delete filter command
- Add combine filters command

### Changed
- Update minimum VS Code engine version to 1.96.2. 

### Fixed
- Context menu options for files now correctly appear by using `resourceExtname != ''` in `when` clause instead of the non-standard `resourceIsFile`.

## [0.1.2] - 2025-04-21
### Enhanced
- support add multiple folders and file types at once

### Fixed
- Fixed bug where edit filter command was not working.

## [0.1.3] - 2025-09-20
### Fixed
- Fixed folder detection issue where folders with dots in their names (e.g., "my.folder") were incorrectly identified as files. Now uses `fs.statSync()` to properly check if a path is a directory instead of relying on `path.extname()`.

## [1.0.1] - 2026-10-18

### Added

- Add a filter shortcut to the Search view title bar.
- Add **Custom Search: Recover Legacy Filters** to explicitly recover missing legacy data after a failed migration in an older release, without replacing existing user filters or enabled states.

### Changed

- Separate commands, storage, filter models, and migration into dedicated modules.

### Fixed

- Preserve existing global settings, including explicitly empty lists, when migrating legacy filters so deleted or renamed filters do not reappear.
- Wait for migration before enabling commands so the first search can use migrated filters.
- Recognize symbolic links to files and directories in Explorer filter commands.
- Allow overwriting patterns with a subset of existing patterns even when appending would make no change.
- Skip malformed filter entries and enabled states, and keep workspace filters available if global configuration cannot be read.
- Preserve stored filter names exactly, including whitespace, so upgrades do not reset disabled states or collapse distinct names.
- Save enabled states before filter definitions so a failed migration can be retried without losing disabled states.
- Preserve enabled states for filter names such as `__proto__`.

## [1.1.0] - 2026-10-22

### Added

- Add a read-only **All Workspace Files** global filter with a globe icon, muted **Built-in** description, independent selection/pin identity, and no writes to filter configuration. It starts unchecked and unpinned and keeps other filters' exclusions when combined. Its compact single-line entry stays first; the search picker initially focuses a user-defined filter when available.
- Add a persistent **Search Filters** panel with checkboxes, grouped scopes, a combined rule preview, explicit Apply, and Clear Selection.
- Remember checked filters per workspace independently of enabled states; refresh on settings, project file, and workspace-root changes.
- Pin filters from the **Search Filters** panel, **Select Filter and Search**, or the filter editor to add them to every search: Apply, **Select Filter and Search**, **Search Now**, and **Save and Search**. Pins are saved per workspace.
- Highlight pinned filters with a colored pin and name in the panel and a pin icon in **Select Filter and Search**. The color is customizable through `customSearchFilters.pinnedForeground`.
- Add an edit button to each entry in **Select Filter and Search**.
- Replace the sequential prompts of **Edit Filter** with a filter editor: pick only the fields to change, see modified fields marked, validate names as they are typed, remove individual patterns from a checklist, toggle the enabled state, and save, save and search, or discard.
- Add **Search Now**, **Edit Filter**, and **Undo** to the confirmation after adding folders or file types from the Explorer.

### Changed

- Group the Explorer commands in a **Search Filters** submenu next to **Find in Folder...**, with shorter titles (**Include Folder...**, **Exclude Folder...**, **Include File Type...**, **Exclude File Type...**), and hide them from the Command Palette, where they need an Explorer selection.
- Show all commands under a **Custom Search** category instead of repeating the prefix in every title.
- Add Explorer patterns to a filter in one step: selecting a filter appends, and replacing moves to a button on the filter's entry. Filters that already contain the patterns are marked, and the picker title shows the patterns being added.
- Create a filter from the Explorer in two steps, scope then name, with a suggested name and a scope default based on the pattern type. The optional prompt for the other pattern list is gone; use **Edit Filter** afterwards.
- List only global filters and project filters of the selected resource's workspace root when adding from the Explorer.
- Read global filters and enabled states from user settings only. Workspace or folder values for `custom-search-filters.globalFilters` and `custom-search-filters.globalFiltersEnabled` are now ignored.
- Rely on VS Code's implicit command activation instead of listing every command in `activationEvents`.
- Preserve regex, case-sensitive, and whole-word search options when applying filters.

### Fixed

- Stop copying workspace-level setting overrides into user settings when global filters are added, edited, or deleted, and make deleted filters disappear even when a workspace override exists.
- Honor `"enabled": false` on workspace filters in `.vscode/custom-search-filters.json`.
- Store project folder patterns relatively and qualify them at search time, so they work in both multi-root and standalone projects.
- Move a pattern out of a filter's other list when adding it from the Explorer, so a filter never includes and excludes the same pattern.
- Leave a filter unchanged when appended patterns are already present with different spacing, instead of rewriting it.
- Keep a renamed filter in its original position and save the rename in a single write instead of saving the new name and then deleting the old one.
- Keep brace groups and character classes intact when splitting or removing glob patterns.
- Prevent an old Undo notification from overwriting later changes or resurrecting a deleted filter.
- Qualify global include rules per root when combining them with project rules, preserving OR semantics in VS Code's search parser.
- Preserve a single filter's include expression when adding exclusion-only filters, and retain extension shorthand such as `.ts` when combining include rules.
- Clear checked state consistently when pinning through the panel, search list, or editor; unpinning leaves the filter unchecked.
- Preserve recursive project include/exclude globs and extension shorthand in workspace files; keep new Explorer project folder selections explicitly rooted.
- Preserve home-relative paths such as `~/projects/lib` when qualifying project filters or combining include rules.
- Retain panel filters and selections on invalid or unreadable project JSON, recover after correction, and prevent edits from overwriting a file that failed to load.

## [1.1.1] - 2026-10-24

### Added

- Add a transparent blue search-and-filter extension icon for the Extensions view and Marketplace listing.

### Changed

- Reorganize the user guide with quick-start steps, configuration examples, native search-clearing instructions, and troubleshooting, and add a Simplified Chinese translation.

### Fixed

- Resize the extension icon to 256 x 256 pixels to stay below the Marketplace's 1024 KB image limit.
