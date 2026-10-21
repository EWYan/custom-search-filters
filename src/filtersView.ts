import * as vscode from 'vscode';
import { editFilterInteractively } from './filterEditor';
import { CombinedFilters, StoredSearchFilter, WorkspaceSearchFilter, filterKey, isBuiltinFilter } from './model/searchFilter';
import { combineForSearch } from './model/searchPatterns';
import { describeFilter, runSearch, searchWithPatterns } from './searchUi';
import { onDidChangeFilters } from './storage/filterEvents';
import { loadAllFilters, loadSearchFilters } from './storage/filterRepository';
import { isPinned, onDidChangePinnedFilters, pinnedFilters, setPinned } from './storage/pinnedFilters';

const VIEW_ID = 'custom-search-filters.filters';
const SELECTION_KEY = 'selectedFilterKeys';
// Pinned rows carry a URI in this scheme so a file decoration can color their labels.
const PINNED_SCHEME = 'custom-search-filters-pinned';
const PINNED_COLOR = 'customSearchFilters.pinnedForeground';

export type FilterNode =
	| { kind: 'group'; id: string; label: string; filters: StoredSearchFilter[] }
	| { kind: 'filter'; filter: StoredSearchFilter }
	| { kind: 'preview'; label: string; value: string; warning?: boolean };

export class FiltersView implements vscode.TreeDataProvider<FilterNode>, vscode.Disposable {
	private readonly changed = new vscode.EventEmitter<FilterNode | undefined>();
	readonly onDidChangeTreeData = this.changed.event;
	private readonly view: vscode.TreeView<FilterNode>;
	private readonly disposables: vscode.Disposable[] = [];
	private watchers: vscode.FileSystemWatcher[] = [];
	private readonly selected: Set<string>;
	private filters: StoredSearchFilter[] = [];
	private pending: Promise<void> = Promise.resolve();
	private refreshTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		const stored = context.workspaceState.get<unknown>(SELECTION_KEY);
		this.selected = new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
		this.view = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, manageCheckboxStateManually: true });
		this.disposables.push(this.view, this.changed,
			this.view.onDidChangeCheckboxState(event => {
				void this.setChecked(event.items).catch(error => this.reportError(error));
			}),
			onDidChangeFilters(change => {
				if (change.previousKey && this.selected.delete(change.previousKey) && change.filter?.enabled !== false && change.filter) {
					this.selected.add(filterKey(change.filter));
				}
				this.scheduleRefresh();
			}),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('custom-search-filters')) { this.scheduleRefresh(); }
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.watchWorkspaceFiles();
				this.scheduleRefresh();
			}),
			vscode.commands.registerCommand('custom-search-filters.showFilters', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
			vscode.commands.registerCommand('custom-search-filters.applySelectedFilters', () => this.apply()),
			vscode.commands.registerCommand('custom-search-filters.clearFilterSelection', () => this.clear()),
			vscode.commands.registerCommand('custom-search-filters.refreshFilters', () => this.refresh()),
			vscode.commands.registerCommand('custom-search-filters.editPanelFilter', async (node: FilterNode) => {
				if (node?.kind !== 'filter' || isBuiltinFilter(node.filter)) { return; }
				const current = (await loadAllFilters()).find(filter => filterKey(filter) === filterKey(node.filter));
				if (!current) { await this.refresh(); return; }
				const result = await editFilterInteractively(current);
				await this.refresh();
				if (result.outcome === 'saveAndSearch') { await runSearch(result.filter); }
			}),
			vscode.commands.registerCommand('custom-search-filters.pinFilter', (node: FilterNode) => this.pin(node, true)),
			vscode.commands.registerCommand('custom-search-filters.unpinFilter', (node: FilterNode) => this.pin(node, false)),
			onDidChangePinnedFilters(keys => {
				if (this.disposed) { return; }
				// Clear hidden selections for every entry point, even if a rapid unpin follows.
				keys.forEach(key => this.selected.delete(key));
				this.updateView();
				void this.enqueue(() => this.persist()).catch(error => this.reportError(error));
			}),
			vscode.window.registerFileDecorationProvider({
				provideFileDecoration: uri => uri.scheme === PINNED_SCHEME
					? new vscode.FileDecoration(undefined, 'Pinned', new vscode.ThemeColor(PINNED_COLOR))
					: undefined
			})
		);
		this.watchWorkspaceFiles();
	}

	private reportError(error: unknown): void {
		console.error('Search Filters panel:', error);
		void vscode.window.showErrorMessage(`Search Filters: ${error instanceof Error ? error.message : String(error)}`);
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const next = this.pending.then(async () => { if (!this.disposed) { await operation(); } });
		this.pending = next.catch(() => {});
		return next;
	}

	private scheduleRefresh(): void {
		if (this.disposed) { return; }
		if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
		// Coalesce the definition/enabled writes and let repository rename events transfer the selection first.
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined;
			void this.refresh();
		}, 100);
	}

	private watchWorkspaceFiles(): void {
		this.watchers.forEach(watcher => watcher.dispose());
		this.watchers = (vscode.workspace.workspaceFolders || []).map(folder => {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '.vscode/custom-search-filters.json'));
			watcher.onDidCreate(() => this.scheduleRefresh());
			watcher.onDidChange(() => this.scheduleRefresh());
			watcher.onDidDelete(() => this.scheduleRefresh());
			return watcher;
		});
	}

	private async persist(): Promise<void> {
		const keys = [...this.selected].sort();
		if (JSON.stringify(this.context.workspaceState.get(SELECTION_KEY)) !== JSON.stringify(keys)) {
			await this.context.workspaceState.update(SELECTION_KEY, keys);
		}
	}

	private async reload(): Promise<void> {
		try {
			// Replace the snapshot only after every project file has loaded successfully.
			this.filters = await loadSearchFilters();
		} catch (error) {
			this.view.message = 'Could not load project filters. Previous filters and selections are retained. Fix the project file and refresh.';
			throw error;
		}
		const available = new Set(this.filters.filter(filter => filter.enabled !== false && !isPinned(filter)).map(filterKey));
		for (const key of this.selected) {
			if (!available.has(key)) { this.selected.delete(key); }
		}
		await this.persist();
		this.updateView();
	}

	refresh(): Promise<void> {
		// Keep activation and file watching alive so fixing an invalid file can recover.
		return this.enqueue(() => this.reload()).catch(error => this.reportError(error));
	}

	setChecked(items: readonly [FilterNode, vscode.TreeItemCheckboxState][]): Promise<void> {
		return this.enqueue(async () => {
			await this.reload();
			for (const [node, state] of items) {
				if (node.kind !== 'filter') { continue; }
				const key = filterKey(node.filter);
				if (state === vscode.TreeItemCheckboxState.Checked && this.filters.some(filter => filterKey(filter) === key && filter.enabled !== false && !isPinned(filter))) {
					this.selected.add(key);
				} else { this.selected.delete(key); }
			}
			await this.persist();
			this.updateView();
		});
	}

	clear(): Promise<void> {
		return this.enqueue(async () => {
			this.selected.clear();
			await this.persist();
			this.updateView();
		});
	}

	// Pinned filters are added to every search, so their checkboxes are replaced by the pin.
	pin(node: FilterNode | undefined, pinned: boolean): Promise<void> {
		return this.enqueue(async () => {
			if (node?.kind !== 'filter') { return; }
			await this.reload();
			const key = filterKey(node.filter);
			const current = this.filters.find(filter => filterKey(filter) === key);
			if (!current) { return; }
			await setPinned(current, pinned);
			await this.persist();
		});
	}

	apply(): Promise<void> {
		return this.enqueue(async () => {
			await this.reload();
			await searchWithPatterns(this.combined());
		});
	}

	private combined(): CombinedFilters {
		const pinned = new Set(pinnedFilters(this.filters).map(filterKey));
		return combineForSearch(this.filters.filter(filter => pinned.has(filterKey(filter)) || this.selected.has(filterKey(filter))));
	}

	private updateView(): void {
		const pinned = pinnedFilters(this.filters).length;
		this.view.description = pinned ? `${this.selected.size} selected · ${pinned} pinned` : `${this.selected.size} selected`;
		if (this.selected.size) {
			this.view.message = 'Includes match ANY pattern; excludes take precedence. Click Apply to search.';
		} else if (pinned) {
			this.view.message = 'Pinned filters are added to every search. Check filters, then Apply.';
		} else {
			this.view.message = 'Check filters, then Apply. Applying an empty selection clears both path fields.';
		}
		this.changed.fire(undefined);
	}

	getChildren(node?: FilterNode): FilterNode[] {
		if (node?.kind === 'group') { return node.filters.map(filter => ({ kind: 'filter', filter })); }
		if (node) { return []; }
		const groups = new Map<string, Extract<FilterNode, { kind: 'group' }>>();
		for (const filter of this.filters) {
			const folder = filter.scope === 'workspace' ? (filter as WorkspaceSearchFilter).workspaceFolder : undefined;
			const id = folder?.uri.toString() || 'global';
			if (!groups.has(id)) { groups.set(id, { kind: 'group', id, label: folder ? `Project: ${folder.name}` : 'Global', filters: [] }); }
			groups.get(id)!.filters.push(filter);
		}
		const combined = this.combined();
		const previews: FilterNode[] = [
			{ kind: 'preview', label: 'Include', value: combined.include || '(all files)' },
			{ kind: 'preview', label: 'Exclude', value: combined.exclude || '(none)' }
		];
		if (combined.conflicts.length) {
			previews.push({ kind: 'preview', label: 'Overlap (excluded)', value: combined.conflicts.join(', '), warning: true });
		}
		return [...groups.values(), ...previews];
	}

	getTreeItem(node: FilterNode): vscode.TreeItem {
		if (node.kind === 'group') {
			const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
			item.id = `group:${node.id}`;
			item.iconPath = new vscode.ThemeIcon(node.id === 'global' ? 'globe' : 'folder');
			return item;
		}
		if (node.kind === 'preview') {
			const item = new vscode.TreeItem(node.label);
			item.description = node.value;
			item.tooltip = `${node.label}: ${node.value}`;
			item.iconPath = new vscode.ThemeIcon(node.warning ? 'warning' : 'preview');
			return item;
		}
		const builtin = isBuiltinFilter(node.filter);
		const item = new vscode.TreeItem(node.filter.name);
		item.id = filterKey(node.filter);
		item.description = builtin ? 'Built-in' : describeFilter(node.filter);
		item.tooltip = describeFilter(node.filter);
		item.contextValue = builtin ? 'searchFilter.builtin' : 'searchFilter';
		if (builtin) {
			item.iconPath = new vscode.ThemeIcon('globe');
			item.tooltip += '\nBuilt-in, read-only. Includes all workspace files; other filters\' excludes still apply.';
		}
		if (isPinned(node.filter)) {
			item.contextValue += '.pinned';
			if (node.filter.enabled === false) {
				item.iconPath = new vscode.ThemeIcon('pinned', new vscode.ThemeColor('disabledForeground'));
				item.tooltip = `${item.tooltip}\nPinned, but not applied while disabled`;
			} else {
				item.iconPath = new vscode.ThemeIcon('pinned', new vscode.ThemeColor(PINNED_COLOR));
				item.resourceUri = vscode.Uri.from({ scheme: PINNED_SCHEME, path: `/${encodeURIComponent(item.id)}` });
				item.tooltip = `${item.tooltip}\nPinned: added to every search`;
			}
		} else if (node.filter.enabled !== false) {
			item.checkboxState = this.selected.has(item.id) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
		}
		return item;
	}

	dispose(): void {
		this.disposed = true;
		if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
		this.watchers.forEach(watcher => watcher.dispose());
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

export async function registerFiltersView(context: vscode.ExtensionContext): Promise<void> {
	const panel = new FiltersView(context);
	context.subscriptions.push(panel);
	await panel.refresh();
}
