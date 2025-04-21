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
*   **Custom Search: Combine Filters**:
    *   Allows selecting multiple existing filters.
    *   Prompts for a new name and combines the include/exclude patterns (comma-separated) of the selected filters into a new filter.
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

**Enjoy!**
