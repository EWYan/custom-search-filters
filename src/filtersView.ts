import * as vscode from 'vscode';
import { editFilterInteractively } from './filterEditor';
import { CombinedFilters, StoredSearchFilter, WorkspaceSearchFilter, filterKey } from './model/searchFilter';
import { combineForSearch } from './model/searchPatterns';
import { describeFilter, runSearch } from './searchUi';
import { onDidChangeFilters } from './storage/filterEvents';
import { loadAllFilters } from './storage/filterRepository';

const VIEW_ID = 'custom-search-filters.filters';
const SELECTION_KEY = 'selectedFilterKeys';

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
				if (node?.kind !== 'filter') { return; }
				const current = (await loadAllFilters()).find(filter => filterKey(filter) === filterKey(node.filter));
				if (!current) { await this.refresh(); return; }
				const result = await editFilterInteractively(current);
				await this.refresh();
				if (result.outcome === 'saveAndSearch') { await runSearch(result.filter); }
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
			void this.refresh().catch(error => this.reportError(error));
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
		this.filters = await loadAllFilters();
		const available = new Set(this.filters.filter(filter => filter.enabled !== false).map(filterKey));
		for (const key of this.selected) {
			if (!available.has(key)) { this.selected.delete(key); }
		}
		await this.persist();
		this.updateView();
	}

	refresh(): Promise<void> {
		return this.enqueue(() => this.reload());
	}

	setChecked(items: readonly [FilterNode, vscode.TreeItemCheckboxState][]): Promise<void> {
		return this.enqueue(async () => {
			await this.reload();
			for (const [node, state] of items) {
				if (node.kind !== 'filter') { continue; }
				const key = filterKey(node.filter);
				if (state === vscode.TreeItemCheckboxState.Checked && this.filters.some(filter => filterKey(filter) === key && filter.enabled !== false)) {
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

	apply(): Promise<void> {
		return this.enqueue(async () => {
			await this.reload();
			await runSearch(this.combined());
		});
	}

	private combined(): CombinedFilters {
		return combineForSearch(this.filters.filter(filter => this.selected.has(filterKey(filter))));
	}

	private updateView(): void {
		this.view.description = `${this.selected.size} selected`;
		this.view.message = this.selected.size
			? 'Includes match ANY pattern; excludes take precedence. Click Apply to search.'
			: 'Check filters, then Apply. Applying an empty selection clears both path fields.';
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
		const item = new vscode.TreeItem(node.filter.name);
		item.id = filterKey(node.filter);
		item.description = describeFilter(node.filter);
		item.tooltip = describeFilter(node.filter);
		item.contextValue = 'searchFilter';
		if (node.filter.enabled !== false) {
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
