import * as vscode from 'vscode';
import { StoredSearchFilter, filterKey } from '../model/searchFilter';
import { onDidChangeFilters } from './filterEvents';

const PINNED_KEY = 'pinnedFilterKeys';

let memento: vscode.Memento | undefined;
const changes = new vscode.EventEmitter<readonly string[]>();
export const onDidChangePinnedFilters = changes.event;

function readKeys(): string[] {
	const stored = memento?.get<unknown>(PINNED_KEY);
	return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : [];
}

async function writeKeys(keys: Set<string>): Promise<void> {
	await memento?.update(PINNED_KEY, [...keys].sort());
	changes.fire([...keys]);
}

// Pins are stored per workspace by filter key, like the panel's checkboxes, so pinning
// never changes settings or project files.
export function initPinnedFilters(context: vscode.ExtensionContext): void {
	memento = context.workspaceState;
	context.subscriptions.push(onDidChangeFilters(change => {
		const keys = new Set(readKeys());
		if (!change.previousKey || (change.filter && filterKey(change.filter) === change.previousKey)
			|| !keys.delete(change.previousKey)) {
			return;
		}
		// A rename moves the pin, a delete drops it. Disabled filters stay pinned but are not applied.
		if (change.filter) {
			keys.add(filterKey(change.filter));
		}
		void writeKeys(keys).catch(error => console.error('Error updating pinned filters:', error));
	}));
}

export function isPinned(filter: StoredSearchFilter): boolean {
	return readKeys().includes(filterKey(filter));
}

export function hasPinnedFilters(): boolean {
	return readKeys().length > 0;
}

export async function setPinned(filter: StoredSearchFilter, pinned: boolean): Promise<void> {
	const keys = new Set(readKeys());
	const key = filterKey(filter);
	if (keys.has(key) === pinned) {
		return;
	}
	if (pinned) {
		keys.add(key);
	} else {
		keys.delete(key);
	}
	await writeKeys(keys);
}

// The enabled pinned filters among `filters`, in their listed order.
export function pinnedFilters(filters: StoredSearchFilter[]): StoredSearchFilter[] {
	const keys = new Set(readKeys());
	return filters.filter(filter => filter.enabled !== false && keys.has(filterKey(filter)));
}
