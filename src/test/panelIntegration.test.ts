import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Native panel integration', () => {
	test('activates and opens the contributed panel in a real VS Code host', async function () {
		this.timeout(15000);
		const extension = vscode.extensions.getExtension('juzidaxia.custom-search-filters');
		assert.ok(extension);
		await extension.activate();
		await vscode.commands.executeCommand('custom-search-filters.showFilters');
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('custom-search-filters.applySelectedFilters'));
		assert.ok(commands.includes('custom-search-filters.filters.focus'));
		assert.ok(commands.includes('custom-search-filters.pinFilter'));
		assert.ok(commands.includes('custom-search-filters.unpinFilter'));
	});

	test('contributes a pin color that passes the VS Code color identifier schema', () => {
		const extension = vscode.extensions.getExtension('juzidaxia.custom-search-filters');
		assert.ok(extension);
		const colors = extension.packageJSON.contributes.colors as Array<{ id: string }>;
		assert.ok(colors.some(color => color.id === 'customSearchFilters.pinnedForeground'));
		colors.forEach(color => assert.match(color.id, /^\w+[.\w+]*$/));
	});
});
