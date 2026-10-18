import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import { SearchFilter } from '../../model/searchFilter';

interface FixtureOptions {
	settings?: Record<string, unknown>;
	legacy?: unknown;
	workspaceFilters?: unknown[];
	fileType?: vscode.FileType;
	beforeUpdate?: (key: string, value: unknown) => Promise<void>;
	configurationError?: Error;
}

interface PickerItem {
	filter?: SearchFilter;
	action?: string;
}

export function createExtensionFixture(options: FixtureOptions = {}) {
	const settings = new Map<string, unknown>(Object.entries(options.settings || {}));
	const state = new Map<string, unknown>([['customSearchFilters', options.legacy || []]]);
	const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
	const messages: string[] = [];
	const choices: PickerItem[][] = [];
	const updates: string[] = [];
	const diagnostics: unknown[][] = [];
	const folder: vscode.WorkspaceFolder = {
		name: 'fixture', index: 0,
		uri: vscode.Uri.file(path.join(os.tmpdir(), 'custom-search-filters-fixture'))
	};
	const picker = {
		items: [] as PickerItem[],
		dispose() {}, show() {}, onDidAccept() {}, onDidHide() {}, onDidTriggerItemButton() {}
	};
	const selection = { action: 'overwrite' };
	const config = {
		get: (key: string, fallback: unknown) => settings.has(key) ? settings.get(key) : fallback,
		inspect: (key: string) => ({ key, globalValue: settings.get(key) }),
		update: async (key: string, value: unknown) => {
			await options.beforeUpdate?.(key, value);
			settings.set(key, value);
			updates.push(key);
		}
	};
	const api = {
		Uri: vscode.Uri, FileType: vscode.FileType, FileSystemError: vscode.FileSystemError,
		ConfigurationTarget: vscode.ConfigurationTarget, ThemeIcon: vscode.ThemeIcon,
		workspace: {
			workspaceFolders: [folder],
			getWorkspaceFolder: () => folder,
			getConfiguration: () => {
				if (options.configurationError) {
					throw options.configurationError;
				}
				return config;
			},
			fs: {
				stat: async () => ({ type: options.fileType ?? vscode.FileType.Directory }),
				readFile: async () => Buffer.from(JSON.stringify(options.workspaceFilters || []))
			}
		},
		window: {
			showInformationMessage: async (message: string) => { messages.push(message); },
			showErrorMessage: async (message: string) => { messages.push(message); },
			showQuickPick: async (items: PickerItem[]) => {
				choices.push(items);
				return items.find(item => item.action === selection.action) || items.find(item => item.filter);
			},
			createQuickPick: () => picker
		},
		commands: {
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

	return { settings, state, handlers, messages, choices, updates, diagnostics, folder, picker, selection, context, load, runCommand };
}
