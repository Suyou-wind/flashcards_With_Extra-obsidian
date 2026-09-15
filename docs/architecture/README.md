# Architecture documentation

The plugin separates pure card logic, application use cases, and Obsidian/Anki
adapters. Start with [the architecture overview](overview.md), including the
sync scope rules that run before note processing.

## Enforced boundaries

`.dependency-cruiser.cjs` checks that:

- Core does not import application code, adapters, or Obsidian.
- Application code does not import adapters or Obsidian; it uses interfaces in
  `src/application/ports.ts` for I/O.
- Imports do not form cycles.

`npm run arch:check` runs these checks. It is also part of `npm run check`,
alongside lint, Markdown lint, dead-code checks, tests, and the production build.
The former concrete-adapter imports and plugin/adapter cycles have been
replaced with ports and the `PluginHost` interface.

Dependency checks enforce import boundaries; they do not prove the accuracy of
every runtime step in a diagram. Keep the prose and diagrams aligned with
changes to commands, application use cases, and adapter behavior.

## Views and tools

- [Overview](overview.md): Mermaid diagrams and a description of sync scope.
- `npm run arch:graph`: generate a dependency graph at
  `docs/architecture/graph.svg`; requires Graphviz `dot`.
- [LikeC4 model](likec4/model.c4): an optional high-level view of runtime
  collaboration. An application-to-adapter arrow represents a call through a
  port, not an application import of the adapter.
- `npm run arch:likec4`: open the interactive LikeC4 viewer.
- `npm run arch:likec4:build`: build the viewer into the ignored
  `docs/architecture/likec4/out/` directory.

The LikeC4 model is descriptive, not generated from source imports. Use
`arch:check` for boundary enforcement and tests for runtime behavior.
