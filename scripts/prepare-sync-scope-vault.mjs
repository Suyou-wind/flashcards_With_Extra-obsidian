import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Only changes sync scope. Run with Flashcards disabled (or Obsidian closed)
// so the running plugin cannot save its previous in-memory settings over it.
const pluginDir = new URL(
  "../test-vault/.obsidian/plugins/flashcards-obsidian/",
  import.meta.url,
);
const settingsPath = new URL("data.json", pluginDir);
const backupPath = new URL("scope-settings-before-test.json", pluginDir);
const presetPath = new URL(
  "../test-vault/scenarios/sync-scope/scope-settings.json",
  import.meta.url,
);
const restore = process.argv.includes("--restore");
await mkdir(pluginDir, { recursive: true });
let settings;
try {
  settings = JSON.parse(await readFile(settingsPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  settings = {};
}
if (restore) {
  const previous = JSON.parse(await readFile(backupPath, "utf8"));
  if (previous.syncScope === undefined) delete settings.syncScope;
  else settings.syncScope = previous.syncScope;
} else {
  // Keep the original scope even if the preset is applied several times.
  try {
    await writeFile(
      backupPath,
      JSON.stringify({ syncScope: settings.syncScope }, null, 2) + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  settings.syncScope = JSON.parse(await readFile(presetPath, "utf8"));
}
await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.info(
  restore
    ? "Previous test-vault sync scope restored."
    : "Test-vault scope prepared: 2 included folders, 2 excluded folders, 5 excluded notes.",
);
console.info(
  "Enable Flashcards to load the settings. Note contents and other plugin settings were preserved.",
);
