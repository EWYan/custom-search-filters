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