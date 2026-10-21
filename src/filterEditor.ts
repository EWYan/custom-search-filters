import * as vscode from 'vscode';
import { FilterPatternTarget, SearchFilter, StoredSearchFilter, WorkspaceSearchFilter, scopeLabel, splitPatterns } from './model/searchFilter';
import { hasNameConflict, loadAllFilters, saveFilter } from './storage/filterRepository';
import { isPinned, setPinned } from './storage/pinnedFilters';

type EditorAction = 'name' | 'include' | 'exclude' | 'enabled' | 'pinned' | 'save' | 'saveAndSearch' | 'discard';

interface EditorItem extends vscode.QuickPickItem {
	action?: EditorAction;
}

interface PatternModeItem extends vscode.QuickPickItem {
	action: 'text' | 'keep';
}

export interface FilterEditResult {
	outcome: 'saved' | 'saveAndSearch' | 'cancelled';
	filter: StoredSearchFilter;
}

function isEnabled(filter: SearchFilter): boolean {
	return filter.enabled !== false;
}

function changedFields(original: SearchFilter, draft: SearchFilter): Record<'name' | 'include' | 'exclude' | 'enabled', boolean> {
	return {
		name: draft.name !== original.name,
		include: draft.include !== original.include,
		exclude: draft.exclude !== original.exclude,
		enabled: isEnabled(draft) !== isEnabled(original)
	};
}

function hasChanges(original: SearchFilter, draft: SearchFilter): boolean {
	return Object.values(changedFields(original, draft)).some(Boolean);
}

function fieldDescription(value: string, changed: boolean): string {
	return `${value || '(none)'}${changed ? '  ● modified' : ''}`;
}

// Pins are stored per workspace rather than in the filter, so they are tracked beside the draft.
interface PinState {
	original: boolean;
	draft: boolean;
}

function editorItems(original: SearchFilter, draft: SearchFilter, pin: PinState): EditorItem[] {
	const changed = changedFields(original, draft);
	const modified = hasChanges(original, draft) || pin.draft !== pin.original;
	return [
		{ label: '$(tag) Name', description: fieldDescription(draft.name, changed.name), action: 'name' },
		{ label: '$(add) Include', description: fieldDescription(draft.include, changed.include), action: 'include' },
		{ label: '$(remove) Exclude', description: fieldDescription(draft.exclude, changed.exclude), action: 'exclude' },
		{
			label: isEnabled(draft) ? '$(eye) Enabled' : '$(eye-closed) Enabled',
			description: fieldDescription(isEnabled(draft) ? 'Yes' : 'No', changed.enabled),
			detail: `Select to ${isEnabled(draft) ? 'hide this filter from' : 'show this filter in'} the search list`,
			action: 'enabled'
		},
		{
			label: pin.draft ? '$(pinned) Pinned' : '$(pin) Pinned',
			description: fieldDescription(pin.draft ? 'Yes' : 'No', pin.draft !== pin.original),
			detail: pin.draft ? 'Select to stop adding this filter to every search' : 'Select to add this filter to every search in this workspace',
			action: 'pinned'
		},
		{ label: '', kind: vscode.QuickPickItemKind.Separator },
		{ label: '$(check) Save', description: modified ? undefined : 'No changes', action: 'save' },
		{ label: '$(search) Save and Search', action: 'saveAndSearch' },
		{ label: modified ? '$(discard) Discard Changes' : '$(close) Close', action: 'discard' }
	];
}

async function editPattern(draft: SearchFilter, target: FilterPatternTarget, title: string): Promise<void> {
	const patterns = splitPatterns(draft[target]);
	let mode: PatternModeItem['action'] = 'text';
	if (patterns.length > 1) {
		const choice = await vscode.window.showQuickPick<PatternModeItem>([
			{ label: '$(edit) Edit as Text', description: draft[target], action: 'text' },
			{ label: '$(checklist) Choose Patterns to Keep', description: `${patterns.length} patterns`, action: 'keep' }
		], { title, placeHolder: `How do you want to edit the ${target} patterns?`, ignoreFocusOut: true });
		if (!choice) {
			return;
		}
		mode = choice.action;
	}

	if (mode === 'keep') {
		const kept = await vscode.window.showQuickPick(
			patterns.map(pattern => ({ label: pattern, picked: true })),
			{ title, placeHolder: 'Uncheck the patterns to remove', canPickMany: true, ignoreFocusOut: true }
		);
		if (kept) {
			draft[target] = kept.map(item => item.label).join(',');
		}
		return;
	}

	const value = await vscode.window.showInputBox({
		title,
		prompt: `Files to ${target} (comma-separated glob patterns)`,
		value: draft[target],
		placeHolder: target === 'include' ? 'e.g., src/**/*.ts' : 'e.g., **/node_modules/**,**/*.log',
		ignoreFocusOut: true
	});
	if (value !== undefined) {
		draft[target] = value;
	}
}

// Edits a copy of the filter field by field; nothing is written until the user saves.
export async function editFilterInteractively(original: StoredSearchFilter): Promise<FilterEditResult> {
	const scope = original.scope || 'global';
	const workspaceFolder = scope === 'workspace' ? (original as WorkspaceSearchFilter).workspaceFolder : undefined;
	const draft: StoredSearchFilter = { ...original, scope };
	const title = `Edit Filter: ${original.name} (${scopeLabel(original)})`;
	const scopeText = scope === 'workspace' ? 'project' : 'global';
	const existingFilters = await loadAllFilters();
	const pin: PinState = { original: isPinned(original), draft: isPinned(original) };
	const isModified = () => hasChanges(original, draft) || pin.draft !== pin.original;

	for (;;) {
		const selected = await vscode.window.showQuickPick(editorItems(original, draft, pin), {
			title,
			placeHolder: 'Select a field to change, then save',
			ignoreFocusOut: true
		});

		switch (selected?.action) {
			case 'name': {
				const name = await vscode.window.showInputBox({
					title,
					prompt: 'Filter name',
					value: draft.name,
					ignoreFocusOut: true,
					validateInput: text => {
						if (!text.trim()) {
							return 'Filter name cannot be empty.';
						}
						const candidate = text === original.name ? text : text.trim();
						return hasNameConflict(existingFilters, candidate, scope, workspaceFolder, original.name)
							? `A filter named '${text.trim()}' already exists in this ${scopeText} scope.`
							: null;
					}
				});
				if (name !== undefined) {
					// Keep stored names untouched unless the user actually changed them.
					draft.name = name === original.name ? name : name.trim();
				}
				break;
			}
			case 'include':
			case 'exclude':
				await editPattern(draft, selected.action, title);
				break;
			case 'enabled':
				draft.enabled = isEnabled(draft) ? false : (isEnabled(original) ? original.enabled : true);
				break;
			case 'pinned':
				pin.draft = !pin.draft;
				break;
			case 'save':
			case 'saveAndSearch': {
				const outcome = selected.action;
				if (!isModified()) {
					if (outcome === 'save') {
						vscode.window.showInformationMessage(`No changes made to filter '${original.name}'.`);
						return { outcome: 'cancelled', filter: draft };
					}
					return { outcome, filter: draft };
				}
				if (hasChanges(original, draft)) {
					if (hasNameConflict(await loadAllFilters(), draft.name, scope, workspaceFolder, original.name)) {
						vscode.window.showErrorMessage(`A filter named '${draft.name}' already exists in this ${scopeText} scope.`);
						break;
					}
					// A rename moves an existing pin to the new name before the pin change below.
					await saveFilter(draft, workspaceFolder, original.name);
				}
				if (pin.draft !== pin.original) {
					await setPinned(draft, pin.draft);
				}
				vscode.window.showInformationMessage(`Search filter '${draft.name}' saved successfully.`);
				return { outcome: outcome === 'save' ? 'saved' : outcome, filter: draft };
			}
			case 'discard':
				return { outcome: 'cancelled', filter: draft };
			default: {
				if (!isModified()) {
					return { outcome: 'cancelled', filter: draft };
				}
				const confirmed = await vscode.window.showWarningMessage(
					`Discard unsaved changes to filter '${original.name}'?`,
					{ modal: true },
					'Discard'
				);
				if (confirmed === 'Discard') {
					return { outcome: 'cancelled', filter: draft };
				}
			}
		}
	}
}
