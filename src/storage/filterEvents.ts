import * as vscode from 'vscode';
import { StoredSearchFilter } from '../model/searchFilter';

export interface FilterChange {
	previousKey?: string;
	filter?: StoredSearchFilter;
}

const changes = new vscode.EventEmitter<FilterChange>();
export const onDidChangeFilters = changes.event;
export function notifyFilterChange(change: FilterChange): void {
	changes.fire(change);
}
