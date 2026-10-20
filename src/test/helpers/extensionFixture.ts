import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import { SearchFilter } from '../../model/searchFilter';
import type { FilterNode } from '../../filtersView';

interface FixtureOptions {
	settings?: Record<string, unknown>;
	workspaceSettings?: Record<string, unknown>;
	legacy?: unknown;
	workspaceFilters?: unknown[];
	extraWorkspaceFilters?: unknown[];
	extraWorkspaceFolderNames?: string[];
	fileType?: vscode.FileType;
	beforeUpdate?: (key: string, value: unknown) => Promise<void>;
	configurationError?: Error;
	workspaceState?: Record<string, unknown>;
	workspaceFile?: boolean;
}

interface PickerItem {
	label?: string;
	filter?: SearchFilter;
	action?: string;
	value?: string;
	description?: string;
	detail?: string;
	buttons?: vscode.QuickInputButton[];
}

// A scripted answer: an action, value, filter name or label to pick; labels to check in a
// multi-select pick; an item button to press; or undefined to dismiss with Escape.
type PickAnswer = string | string[] | { item: string; button: number } | undefined;

function matches(item: PickerItem, answer: string): boolean {
	return item.action === answer || item.value === answer || item.filter?.name === answer || item.label === answer;
}

export function createExtensionFixture(options: FixtureOptions = {}) {
	const settings = new Map<string, unknown>(Object.entries(options.settings || {}));
	const state = new Map<string, unknown>([['customSearchFilters', options.legacy || []]]);
	const workspaceState = new Map<string, unknown>(Object.entries(options.workspaceState || {}));
	const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
	const messages: string[] = [];
	const choices: PickerItem[][] = [];
	const updates: string[] = [];
	const diagnostics: unknown[][] = [];
	const workspaceWrites: unknown[] = [];
	const picks: PickAnswer[] = [];
	const inputs: Array<string | undefined> = [];
	const inputBoxes: vscode.InputBoxOptions[] = [];
	const executed: Array<{ command: string; args: unknown[] }> = [];
	const folder: vscode.WorkspaceFolder = {
		name: 'fixture', index: 0,
		uri: vscode.Uri.file(path.join(os.tmpdir(), 'custom-search-filters-fixture'))
	};
	const workspaceFolders: vscode.WorkspaceFolder[] = [folder, ...(options.extraWorkspaceFolderNames || []).map((name, index) => ({
		name, index: index + 1,
		uri: vscode.Uri.file(path.join(os.tmpdir(), `custom-search-filters-fixture-${name}`))
	}))];
	const workspaceData = new Map(workspaceFolders.map((entry, index) => [entry.uri.toString(), index === 0 ? options.workspaceFilters || [] : options.extraWorkspaceFilters || []]));
	const configurationChange = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
	const workspaceChange = new vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>();
	const checkboxChange = new vscode.EventEmitter<vscode.TreeCheckboxChangeEvent<FilterNode>>();
	const watchers: Array<{ change: vscode.EventEmitter<vscode.Uri>; disposed: boolean }> = [];
	const tree = {
		provider: undefined as vscode.TreeDataProvider<FilterNode> | undefined,
		description: '', message: '',
		onDidChangeCheckboxState: checkboxChange.event,
		dispose() { checkboxChange.dispose(); }
	};
	type ButtonHandler = (event: { item: PickerItem; button: vscode.QuickInputButton }) => Promise<void> | void;
	const picker = {
		title: undefined as string | undefined,
		items: [] as PickerItem[],
		selectedItems: [] as PickerItem[],
		created: 0,
		triggerItemButton: undefined as ButtonHandler | undefined,
		acceptHandler: undefined as (() => void) | undefined,
		hideHandler: undefined as (() => void) | undefined,
		dispose() {},
		// Answers queued in `picks` drive the picker once it is shown; otherwise it stays open.
		show() {
			if (picks.length === 0) {
				return;
			}
			choices.push(picker.items);
			const answer = picks.shift();
			setImmediate(() => {
				if (answer === undefined) {
					picker.hide();
				} else if (typeof answer === 'object' && !Array.isArray(answer)) {
					const item = picker.items.find(entry => matches(entry, answer.item))!;
					picker.triggerItemButton?.({ item, button: item.buttons![answer.button] });
				} else {
					picker.selectedItems = picker.items.filter(entry => matches(entry, String(answer)));
					picker.acceptHandler?.();
				}
			});
		},
		hide() {
			picker.hideHandler?.();
		},
		onDidAccept(handler: () => void) {
			picker.acceptHandler = handler;
		},
		onDidHide(handler: () => void) {
			picker.hideHandler = handler;
		},
		onDidTriggerItemButton(handler: ButtonHandler) {
			picker.triggerItemButton = handler;
		}
	};
	const selection = { action: 'overwrite', warning: undefined as string | undefined, info: undefined as string | undefined | Promise<string | undefined> };
	const config = {
		get: (key: string, fallback: unknown) => options.workspaceSettings?.[key] ?? (settings.has(key) ? settings.get(key) : fallback),
		inspect: (key: string) => ({ key, globalValue: settings.get(key) }),
		update: async (key: string, value: unknown) => {
			await options.beforeUpdate?.(key, value);
			settings.set(key, value);
			updates.push(key);
			configurationChange.fire({ affectsConfiguration: section => section === 'custom-search-filters' });
		}
	};
	const api = {
		Uri: vscode.Uri, FileType: vscode.FileType, FileSystemError: vscode.FileSystemError,
		ConfigurationTarget: vscode.ConfigurationTarget, ThemeIcon: vscode.ThemeIcon, QuickPickItemKind: vscode.QuickPickItemKind,
		EventEmitter: vscode.EventEmitter, TreeItem: vscode.TreeItem, TreeItemCheckboxState: vscode.TreeItemCheckboxState,
		TreeItemCollapsibleState: vscode.TreeItemCollapsibleState, RelativePattern: vscode.RelativePattern,
		workspace: {
			workspaceFolders,
			workspaceFile: options.workspaceFile || workspaceFolders.length > 1 ? vscode.Uri.file(path.join(os.tmpdir(), 'fixture.code-workspace')) : undefined,
			getWorkspaceFolder: (uri: vscode.Uri) => workspaceFolders.find(entry => uri.toString() === entry.uri.toString() || uri.toString().startsWith(entry.uri.toString() + '/')),
			onDidChangeConfiguration: configurationChange.event,
			onDidChangeWorkspaceFolders: workspaceChange.event,
			createFileSystemWatcher: () => {
				const change = new vscode.EventEmitter<vscode.Uri>();
				const watcher = { change, disposed: false };
				watchers.push(watcher);
				return { onDidCreate: change.event, onDidChange: change.event, onDidDelete: change.event, dispose() { watcher.disposed = true; change.dispose(); } };
			},
			getConfiguration: () => {
				if (options.configurationError) {
					throw options.configurationError;
				}
				return config;
			},
			fs: {
				stat: async () => ({ type: options.fileType ?? vscode.FileType.Directory }),
				readFile: async (uri: vscode.Uri) => {
					const root = workspaceFolders.find(entry => uri.toString().startsWith(entry.uri.toString() + '/'));
					return Buffer.from(JSON.stringify(workspaceData.get(root?.uri.toString() || '') || []));
				},
				createDirectory: async () => {},
				writeFile: async (uri: vscode.Uri, content: Uint8Array) => {
					const values = JSON.parse(Buffer.from(content).toString('utf8'));
					workspaceWrites.push(values);
					const root = workspaceFolders.find(entry => uri.toString().startsWith(entry.uri.toString() + '/'));
					if (root) { workspaceData.set(root.uri.toString(), values); }
					watchers.forEach(watcher => watcher.change.fire(uri));
				}
			}
		},
		window: {
			createTreeView: (_id: string, treeOptions: vscode.TreeViewOptions<FilterNode>) => { tree.provider = treeOptions.treeDataProvider; return tree; },
			showInformationMessage: async (message: string) => {
				messages.push(message);
				return selection.info;
			},
			showErrorMessage: async (message: string) => { messages.push(message); },
			showWarningMessage: async (message: string) => { messages.push(message); return selection.warning; },
			showQuickPick: async (items: PickerItem[]) => {
				choices.push(items);
				if (picks.length > 0) {
					const answer = picks.shift();
					if (Array.isArray(answer)) {
						return items.filter(item => item.label !== undefined && answer.includes(item.label));
					}
					return typeof answer === 'string' ? items.find(item => matches(item, answer)) : undefined;
				}
				return items.find(item => item.action === selection.action) || items.find(item => item.filter);
			},
			showInputBox: async (inputOptions: vscode.InputBoxOptions) => {
				inputBoxes.push(inputOptions);
				return inputs.shift();
			},
			createQuickPick: () => {
				picker.created++;
				return picker;
			}
		},
		commands: {
			executeCommand: async (command: string, ...args: unknown[]) => {
				executed.push({ command, args });
			},
			registerCommand: (id: string, handler: (...args: unknown[]) => Promise<void>) => {
				handlers.set(id, handler);
				return { dispose: () => handlers.delete(id) };
			}
		}
	};
	const context = {
		subscriptions: [],
		globalState: {
			get: (key: string) => state.get(key),
			update: async (key: string, value: unknown) => { state.set(key, value); }
		},
		workspaceState: {
			get: (key: string) => workspaceState.get(key),
			update: async (key: string, value: unknown) => { workspaceState.set(key, value); }
		}
	} as unknown as vscode.ExtensionContext;

	// Each fixture loads the compiled production code with its own API and module cache.
	const modules = new Map<string, { exports: Record<string, unknown> }>();
	function load<T>(entry: string): T {
		const filename = path.resolve(__dirname, '../..', entry.endsWith('.js') ? entry : `${entry}.js`);
		const cached = modules.get(filename);
		if (cached) {
			return cached.exports as T;
		}
		const module = { exports: {} };
		modules.set(filename, module);
		const localRequire = (id: string): unknown => {
			if (id === 'vscode') {
				return api;
			}
			return id.startsWith('.') ? load(path.resolve(path.dirname(filename), id)) : require(id);
		};
		const source = fs.readFileSync(filename, 'utf8');
		const evaluate = vm.runInThisContext(`(function(exports, require, module, __filename, __dirname, console) {\n${source}\n})`, { filename });
		evaluate(module.exports, localRequire, module, filename, path.dirname(filename), {
			log() {},
			warn: (...args: unknown[]) => diagnostics.push(args),
			error: (...args: unknown[]) => diagnostics.push(args)
		});
		return module.exports as T;
	}

	async function runCommand(command: string, ...args: unknown[]): Promise<void> {
		const handler = handlers.get(`custom-search-filters.${command}`);
		if (!handler) {
			throw new Error(`Command not registered: ${command}`);
		}
		await handler(...args);
	}

	const dispose = () => {
		context.subscriptions.forEach(disposable => disposable.dispose());
		configurationChange.dispose(); workspaceChange.dispose(); checkboxChange.dispose();
	};
	return { settings, state, workspaceState, handlers, messages, choices, updates, diagnostics, workspaceWrites, picks, inputs, inputBoxes, executed, folder, picker, selection, context, load, runCommand,
		tree, checkboxChange, configurationChange, workspaceChange, workspaceData, workspaceFolders, watchers, dispose };
}
