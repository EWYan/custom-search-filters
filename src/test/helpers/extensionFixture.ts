import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import { SearchFilter } from '../../model/searchFilter';

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
	const selection = { action: 'overwrite', warning: undefined as string | undefined, info: undefined as string | undefined };
	const config = {
		get: (key: string, fallback: unknown) => options.workspaceSettings?.[key] ?? (settings.has(key) ? settings.get(key) : fallback),
		inspect: (key: string) => ({ key, globalValue: settings.get(key) }),
		update: async (key: string, value: unknown) => {
			await options.beforeUpdate?.(key, value);
			settings.set(key, value);
			updates.push(key);
		}
	};
	const api = {
		Uri: vscode.Uri, FileType: vscode.FileType, FileSystemError: vscode.FileSystemError,
		ConfigurationTarget: vscode.ConfigurationTarget, ThemeIcon: vscode.ThemeIcon, QuickPickItemKind: vscode.QuickPickItemKind,
		workspace: {
			workspaceFolders,
			getWorkspaceFolder: () => folder,
			getConfiguration: () => {
				if (options.configurationError) {
					throw options.configurationError;
				}
				return config;
			},
			fs: {
				stat: async () => ({ type: options.fileType ?? vscode.FileType.Directory }),
				readFile: async (uri: vscode.Uri) => uri.fsPath.startsWith(folder.uri.fsPath + path.sep)
					? Buffer.from(JSON.stringify(options.workspaceFilters || []))
					: Buffer.from(JSON.stringify(options.extraWorkspaceFilters || [])),
				createDirectory: async () => {},
				writeFile: async (_uri: vscode.Uri, content: Uint8Array) => {
					workspaceWrites.push(JSON.parse(Buffer.from(content).toString('utf8')));
				}
			}
		},
		window: {
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

	return { settings, state, handlers, messages, choices, updates, diagnostics, workspaceWrites, picks, inputs, inputBoxes, executed, folder, picker, selection, context, load, runCommand };
}
