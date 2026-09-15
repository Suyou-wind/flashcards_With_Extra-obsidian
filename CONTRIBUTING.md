# Contributing

Contributions via bug reports and bug fixes are welcome. For new features,
open an issue first so we can discuss the best way to implement it.

## How to build

Clone, install, and run the watch build. esbuild copies `main.js` +
`manifest.json` into `test-vault/.obsidian/plugins/flashcards-obsidian/`
on every successful rebuild, so reloading Obsidian picks up the change.

```sh
git clone git@github.com:reuseman/flashcards-obsidian.git
cd flashcards-obsidian
npm install
npm run dev
```

## Checks and documentation

Run `npm run check` before submitting a change. It runs lint, Markdown lint,
architecture boundary checks, dead-code checks, tests, and a production build.
Use `npm run dead-code:check` to check unused files, dependencies, and exports
independently.

The [architecture overview](docs/architecture/overview.md) describes the layers
and scope filtering. Keep the [usage guide](docs/USAGE.md),
[wiki](docs/wiki.md), and README aligned when user-visible behavior changes.
Record upcoming changes in [unreleased notes](docs/releases/unreleased.md),
leaving published release notes as historical records.

For sync scope changes, also run the
[test-vault manual checks](test-vault/scenarios/sync-scope/README.md) in Obsidian.
Automated adapter tests use host mocks; they do not replace verifying actual
settings, menus, rename events, and Anki behavior in the app.

Import Obsidian runtime APIs with static imports (`import { Modal } from
"obsidian"`). The CommonJS bundle resolves them through Obsidian's plugin
loader. Dynamic `import("obsidian")` survives bundling and fails in the app's
browser module resolver. `tests/build/obsidian-bundle.test.ts` checks the emitted
host imports so mocked UI tests cannot hide this incompatibility.
