import type { SearchFilter } from './searchFilter';

// Available in every workspace, without adding definitions to user settings.
export const ALL_WORKSPACE_FILES: Readonly<SearchFilter> = Object.freeze({
	builtinId: 'all-workspace-files',
	name: 'All Workspace Files',
	scope: 'global',
	include: '**/*',
	exclude: '',
	enabled: true
});
