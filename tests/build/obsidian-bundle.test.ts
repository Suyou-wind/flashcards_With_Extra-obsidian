import { build } from "esbuild";
import { expect, it } from "vitest";

it("loads Obsidian through the plugin CommonJS loader, including dialog code", async () => {
  const result = await build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    packages: "external",
    format: "cjs",
    platform: "node",
    target: "es2020",
    metafile: true,
    write: false,
  });
  const hostImports = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports)
    .filter((entry) => entry.path === "obsidian");
  expect(hostImports.length).toBeGreaterThan(0);
  expect(hostImports.every((entry) => entry.kind === "require-call")).toBe(true);
});
