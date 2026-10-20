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
	});
});
