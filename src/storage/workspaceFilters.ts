import * as vscode from 'vscode';
import { SearchFilter, WorkspaceSearchFilter, normalizeFilter } from '../model/searchFilter';

const PROJECT_FILTERS_FILE = '.vscode/custom-search-filters.json';

function filtersUri(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, PROJECT_FILTERS_FILE);
}

export function getWorkspaceFolderForUri(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
	if (uri) {
		return vscode.workspace.getWorkspaceFolder(uri);
	}

	const activeUri = vscode.window.activeTextEditor?.document.uri;
	if (activeUri) {
		const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
		if (activeFolder) {
			return activeFolder;
		}
	}

	return vscode.workspace.workspaceFolders?.[0];
}

export async function loadWorkspaceFilters(workspaceFolder: vscode.WorkspaceFolder): Promise<WorkspaceSearchFilter[]> {
	try {
		const content = await vscode.workspace.fs.readFile(filtersUri(workspaceFolder));
		const parsed = JSON.parse(Buffer.from(content).toString('utf8'));
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map(filter => ({
				...normalizeFilter(filter, 'workspace'),
				scope: 'workspace' as const,
				workspaceFolder
			}))
			.filter(filter => filter.name.length > 0);
	} catch (error) {
		if (error instanceof vscode.FileSystemError) {
			return [];
		}
		console.error('Error loading project filters:', error);
		return [];
	}
}

export async function loadAllWorkspaceFilters(): Promise<WorkspaceSearchFilter[]> {
	const folders = vscode.workspace.workspaceFolders || [];
	const filterGroups = await Promise.all(folders.map(folder => loadWorkspaceFilters(folder)));
	return filterGroups.flat();
}

export async function saveWorkspaceFilters(workspaceFolder: vscode.WorkspaceFolder, filters: SearchFilter[]): Promise<void> {
	const uri = filtersUri(workspaceFolder);
	const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
	const workspaceFilters = filters
		.map(filter => normalizeFilter(filter, 'workspace'))
		.filter(filter => filter.name.length > 0);
	const content = Buffer.from(JSON.stringify(workspaceFilters, null, 2), 'utf8');

	await vscode.workspace.fs.createDirectory(dirUri);
	await vscode.workspace.fs.writeFile(uri, content);
}
