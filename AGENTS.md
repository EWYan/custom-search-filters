# Repository Guidelines

## Project Structure & Module Organization

This TypeScript extension manages reusable include/exclude filters for VS Code search.

- `src/extension.ts`: activation and command registration entry point.
- `src/commands.ts`: command handlers, prompts, and search interactions.
- `src/model/searchFilter.ts`: filter types, normalization, and pattern helpers.
- `src/storage/`: global settings, workspace files, and shared persistence operations.
- `src/migration.ts`: migration from legacy extension state.
- `src/test/`: extension tests; compiled JavaScript goes to `out/`.
- `package.json`: extension commands, menus, configuration schema, and npm scripts.

There is no dedicated asset directory. Keep generated `out/`, `dist/`, `.vscode-test/`, and `*.vsix` files out of commits.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run compile`: compile TypeScript into `out/`.
- `npm run watch`: recompile as source files change.
- `npm run lint`: check `src/` with ESLint.
- `npm test`: compile, lint, then run tests in a VS Code extension host; the runner may download VS Code.
- `code --extensionDevelopmentPath="$PWD"`: launch a development host from PowerShell after compiling. Exercise the **Custom Search** commands and Explorer context menus.

## Coding Style & Naming Conventions

Use strict TypeScript, targeting ES2022 with Node16 module semantics. Match existing source: tab indentation, single-quoted strings, semicolons, and braces around control-flow bodies. Use camelCase for functions, variables, and module filenames; PascalCase for interfaces and type aliases.

ESLint checks import naming, braces, strict equality, thrown errors, and semicolons. No dedicated formatter is configured. Keep command IDs under `custom-search-filters.*` and synchronize registrations with `package.json`.

## Testing Guidelines

Tests use Mocha `suite`/`test` functions and Node's `assert`. Name files `src/test/**/*.test.ts`; `.vscode-test.mjs` discovers compiled `out/test/**/*.test.js` files. Use descriptive behavior-based test names and clean up temporary files in `finally` blocks.

Run `npm test` before submitting code changes. Add regression tests for changed behavior, especially pattern deduplication, normalization, folder detection, storage, and migration. No coverage threshold is configured.

## Commit & Pull Request Guidelines

History uses plain-language change summaries with occasional issue references and release numbers; no consistent Conventional Commits prefix is established. Write concise, action-oriented subjects and keep commits focused.

PRs should explain the problem and resulting behavior, link relevant issues, and report validation. Include screenshots for visible UI changes. Update `README.md` for command or setting changes and `CHANGELOG.md` for release-facing changes.
