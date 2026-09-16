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
npm ci
npm run dev
```

## Checks and documentation

Run `npm run check` before submitting a change. It runs ESLint (including the recommended `obsidianmd` plugin rules), Markdown lint,
architecture boundary checks, dead-code checks, tests, and a production build.
ESLint warnings fail the check too.
Use `npm run dead-code:check` to check unused files, dependencies, and exports
independently.

Documentation ownership (link instead of copying detailed rules):

- [README](README.md): installation and a short overview.
- [Usage guide](docs/USAGE.md): settings, sync behavior, and troubleshooting.
- [Wiki](docs/wiki.md): card syntax reference; link to usage for settings.
- [Architecture](docs/architecture/overview.md): code boundaries and data flow.
- [Native testing](docs/NATIVE-TESTING.md): desktop setup, assertions, and recovery.
- [Unreleased notes](docs/releases/unreleased.md): upcoming user-visible changes;
  published release notes remain historical records.

For sync scope changes, run the [native integration workflow](docs/NATIVE-TESTING.md)
against the running test vault and a dedicated Anki profile:

```sh
npm run test:native:scope -- --anki-profile=Test
```

The [manual checklist](test-vault/scenarios/sync-scope/README.md) remains useful
for exploratory testing. The native workflow drives real settings, dialogs,
menus, renames, plugin reloads, and Anki card operations; it produces a report
and restores the previous scope afterwards.

Import Obsidian runtime APIs with static imports (`import { Modal } from
"obsidian"`). The CommonJS bundle resolves them through Obsidian's plugin
loader. Dynamic `import("obsidian")` survives bundling and fails in the app's
browser module resolver. `tests/build/obsidian-bundle.test.ts` checks the emitted
host imports so mocked UI tests cannot hide this incompatibility.
