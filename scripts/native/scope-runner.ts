import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createAnkiCall, removeOwnedNotes, requireProfile } from "./anki.ts";

import { createObsidianDriver } from "./obsidian.ts";
const repository = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name: string): string | undefined =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const profile = arg("anki-profile");
if (!profile)
  throw new Error(
    "Usage: npm run test:native:scope -- --anki-profile=Test (explicit dedicated test profile required)",
  );
const expectedProfile = profile;
const endpoint = "http://127.0.0.1:8765";
if (process.env.ANKICONNECT_URL && process.env.ANKICONNECT_URL !== endpoint) {
  throw new Error(
    "Native tests must use the same localhost AnkiConnect endpoint as the plugin.",
  );
}
const vaultPath = await realpath(path.join(repository, "test-vault"));
const vault = "test-vault";
const recoveryId = arg("recover");
if (recoveryId && !/^[a-f0-9]{32}$/.test(recoveryId))
  throw new Error("Recovery requires a run ID, not a path.");
const runId = recoveryId ?? randomUUID().replaceAll("-", "");
const config = {
  vaultPath,
  root: `scenarios/native-scope/run-${runId}`,
  tag: `native_scope_${runId}`,
  deck: `FlashcardsNativeScope_${runId}`,
};
const resultsDir = path.join(repository, ".native-test-results");
const output = path.join(resultsDir, runId);
await mkdir(output, { recursive: true });
const lockPath = path.join(resultsDir, "scope.lock");
const lock = await open(lockPath, "wx").catch(() => {
  throw new Error(
    `Native scope tests are already locked. Check ${lockPath} before starting another run.`,
  );
});
await lock.writeFile(JSON.stringify({ pid: process.pid, output, config }));
const call = createAnkiCall(endpoint, process.env.ANKICONNECT_API_KEY);
const report: {
  runId: string;
  profile: string;
  config: typeof config;
  startedAt: string;
  status: string;
  steps: Array<{
    name: string;
    status: string;
    details?: unknown;
    error?: string;
  }>;
  cleanupErrors: string[];
} = {
  runId,
  profile,
  config,
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
  cleanupErrors: [],
};
interface Snapshot {
  settings: Record<string, unknown>;
  activePath: string | null;
  settingsTab: string | null;
}
interface NoteInfo {
  noteId: number;
  cards: number[];
  fields: Record<string, { value: string }>;
  tags: string[];
}
let snapshot: Snapshot | undefined;
let installed = false;
let ankiOwned = false;
let interrupted = false;
const interrupt = (): void => {
  interrupted = true;
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const { cli, browser, runNpm } = createObsidianDriver({
  repository,
  vault,
  vaultPath,
  output,
});
async function installHost(): Promise<void> {
  const host = (
    await readFile(new URL("./scope-host.js", import.meta.url), "utf8")
  ).replace("export default function", "function");
  await browser(`return (${host})(${JSON.stringify(config)});`);
  installed = true;
}

async function saveReport(): Promise<void> {
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
async function step(
  name: string,
  action: () => Promise<unknown>,
  needsProfile = true,
): Promise<void> {
  if (interrupted) throw new Error("Native run interrupted; restoring state.");
  process.stdout.write(`• ${name}\n`);
  try {
    if (needsProfile) await requireProfile(call, expectedProfile);
    report.steps.push({ name, status: "passed", details: await action() });
  } catch (error) {
    report.steps.push({ name, status: "failed", error: message(error) });
    throw error;
  } finally {
    await saveReport();
  }
}
const ids = (): Promise<number[]> =>
  call("findNotes", { query: `tag:${config.tag}` });
const assert = (value: unknown, error: string): void => {
  if (!value) throw new Error(error);
};

try {
  if (recoveryId) {
    await requireProfile(call, expectedProfile);
    const journal = JSON.parse(
      await readFile(path.join(output, "restore.json"), "utf8"),
    ) as { config: typeof config; profile: string; snapshot: Snapshot };
    assert(
      journal.profile === expectedProfile &&
        JSON.stringify(journal.config) === JSON.stringify(config),
      "Recovery journal does not match this vault, profile and run ID.",
    );
    assert(
      journal.snapshot?.settings &&
        typeof journal.snapshot.settings === "object",
      "Invalid recovery settings snapshot.",
    );
    await browser(
      'if(app.plugins.plugins["flashcards-obsidian"]?.syncInFlight)throw new Error("Sync is running");return true;',
    );
    await readFile(path.join(output, "report.json"), "utf8")
      .then((data) =>
        writeFile(path.join(output, "report-before-recovery.json"), data),
      )
      .catch(() => {});
    await installHost();
    snapshot = journal.snapshot;
    ankiOwned = true;
    report.status = "passed";
    report.steps.push({ name: "Recover recorded run", status: "passed" });
  } else {
    await step("Lint (including Obsidian rules)", () => runNpm("lint"), false);
    await step(
      "Verify dedicated profile, vault, and enabled plugin",
      async () => {
        const state = await browser<{ syncing: boolean; loaded: boolean }>(
          'return {syncing:app.plugins.plugins["flashcards-obsidian"]?.syncInFlight,loaded:!!app.plugins.plugins["flashcards-obsidian"]};',
        );
        assert(
          state.loaded && !state.syncing,
          "Flashcards must be enabled and idle.",
        );
        assert((await ids()).length === 0, "Ownership tag already exists.");
        assert(
          !(await call<string[]>("deckNames")).includes(config.deck),
          "Test deck already exists.",
        );
        ankiOwned = true;
        return { profile: expectedProfile, vaultPath };
      },
    );
    await step("Build and reload the actual plugin", async () => {
      if (!process.argv.includes("--skip-build")) {
        await runNpm("build");
      }
      return await cli("plugin:reload", "id=flashcards-obsidian");
    });
    await installHost();
    snapshot = await browser<Snapshot>("return await n.snapshot();");
    await writeFile(
      path.join(output, "restore.json"),
      JSON.stringify({ config, profile, snapshot }, null, 2),
    );
    await step("Create isolated fixtures and apply scope", () =>
      browser("return await n.setup();"),
    );
    await step("Real settings: grouping, search, multi-select and remove", () =>
      browser("return await n.ui();"),
    );
    await step("Current-note and ribbon exclusion feedback", () =>
      browser("return await n.exclusions();"),
    );
    await step("File menus and note/folder rename persistence", () =>
      browser("return await n.rename();"),
    );
    await step("Scope survives plugin reload", async () => {
      await cli("plugin:reload", "id=flashcards-obsidian");
      return await browser(
        'n.check(JSON.stringify(n.plugin().settings.syncScope)===JSON.stringify(n.scope),"Scope changed on reload");return true;',
      );
    });
    let originalIds: number[] = [];
    let originalCards: number[] = [];
    let scheduling: unknown;
    await step("Vault sync creates only the three eligible cards", async () => {
      const notice = await browser<string>('return await n.sync("vault");');
      originalIds = (await ids()).sort();
      assert(
        originalIds.length === 3,
        `Expected 3 Anki notes, received ${originalIds.length}: ${notice}`,
      );
      const notes = await call<NoteInfo[]>("notesInfo", { notes: originalIds });
      originalCards = notes.flatMap((note) => note.cards).sort();
      assert(originalCards.length === 3, "Expected 3 cards.");
      await browser("return await n.assertExcludedUnchanged();");
      scheduling = await cardSchedule(originalCards);
      return { notice, noteIds: originalIds, cardIds: originalCards };
    });
    await step("Repeated vault sync does not duplicate cards", async () => {
      const notice = await browser('return await n.sync("vault");');
      assert(
        JSON.stringify((await ids()).sort()) === JSON.stringify(originalIds),
        "Repeat sync changed note IDs.",
      );
      return notice;
    });
    await step("Excluding a synced note preserves its Anki card", async () => {
      await browser(
        'await n.settings({syncScope:{...n.scope,excludedNotes:[...n.scope.excludedNotes,n.config.root+"/Study/Eligible.md"]}});return await n.sync("vault");',
      );
      assert(
        JSON.stringify((await ids()).sort()) === JSON.stringify(originalIds),
        "Exclusion deleted or duplicated an Anki note.",
      );
      assert(
        JSON.stringify(await cardSchedule(originalCards)) ===
          JSON.stringify(scheduling),
        "Exclusion changed scheduling.",
      );
      return { preserved: originalIds };
    });
    await step(
      "Re-inclusion updates content while preserving IDs and scheduling",
      async () => {
        await browser(
          'const f=n.file("Study/Eligible.md");await app.vault.modify(f,(await app.vault.read(f)).replace("Native scope answer.","Updated native scope answer."));await n.settings({syncScope:n.scope});return await n.sync("current-note","Study/Eligible.md");',
        );
        assert(
          JSON.stringify((await ids()).sort()) === JSON.stringify(originalIds),
          "Re-inclusion changed note IDs.",
        );
        const notes = await call<NoteInfo[]>("notesInfo", {
          notes: originalIds,
        });
        assert(
          notes.some((note) =>
            Object.values(note.fields).some((field) =>
              field.value.includes("Updated native scope answer."),
            ),
          ),
          "Re-included content did not reach Anki.",
        );
        assert(
          JSON.stringify(await cardSchedule(originalCards)) ===
            JSON.stringify(scheduling),
          "Re-inclusion changed scheduling or card IDs.",
        );
        return { preserved: originalIds, updated: true };
      },
    );
    await step("Empty scope stops before syncing", async () =>
      browser(
        'await n.settings({syncScope:{...n.scope,excludedFolders:[...n.scope.includedFolders]}});const result=await n.sync("vault");n.check(result.includes("No notes match your sync scope"),result);return result;',
      ),
    );
    await browser(
      "await n.settings({syncScope:n.scope});await n.showSettings();return true;",
    );
    await writeFile(
      path.join(output, "evidence.json"),
      JSON.stringify(await browser("return await n.evidence();"), null, 2),
    );
    await cli("dev:screenshot", `path=${path.join(output, "final.png")}`).catch(
      (error) => {
        report.steps.push({
          name: "Screenshot",
          status: "unavailable",
          error: message(error),
        });
      },
    );
    report.status = "passed";
  }
} catch (error) {
  report.status = "failed";
  report.steps.push({ name: "Run", status: "failed", error: message(error) });
  process.stderr.write(`${message(error)}\n`);
  if (installed) {
    await browser("return await n.evidence();")
      .then((value) =>
        writeFile(
          path.join(output, "failure-state.json"),
          JSON.stringify(value, null, 2),
        ),
      )
      .catch(() => {});
    await cli(
      "dev:screenshot",
      `path=${path.join(output, "failure.png")}`,
    ).catch(() => {});
  }
} finally {
  if (installed) await cli("dev:errors")
    .then((text) => writeFile(path.join(output, "obsidian-errors.txt"), text))
    .catch(() => {});
  let ankiClean = !ankiOwned;
  if (ankiOwned) {
    try {
      await requireProfile(call, expectedProfile);
      const owned = await ids();
      await writeFile(
        path.join(output, "cleanup-note-ids.json"),
        JSON.stringify(owned),
      );
      await removeOwnedNotes(call, expectedProfile, config.tag, owned);
      if ((await call<string[]>("deckNames")).includes(config.deck)) {
        assert(
          (await call<number[]>("findCards", { query: `deck:${config.deck}` }))
            .length === 0,
          "Test deck contains unexpected cards; preserving it.",
        );
        await requireProfile(call, expectedProfile);
        await call("deleteDecks", { decks: [config.deck], cardsToo: true });
      }
      assert((await ids()).length === 0, "Test notes remain after cleanup.");
      ankiClean = true;
    } catch (error) {
      report.cleanupErrors.push(message(error));
    }
  }
  if (installed && snapshot) {
    try {
      await browser(
        `return await n.restore(${JSON.stringify(snapshot)},${ankiClean});`,
      );
    } catch (error) {
      report.cleanupErrors.push(message(error));
    }
  }
  if (report.cleanupErrors.length) report.status = "failed";
  await saveReport();
  await writeFile(
    path.join(output, "report.md"),
    `# Native scope test: ${report.status}\n\nProfile: ${expectedProfile}\n\n${report.steps.map((step) => `- ${step.status}: ${step.name}${step.error ? ` — ${step.error}` : ""}`).join("\n")}\n\nCleanup: ${report.cleanupErrors.length ? report.cleanupErrors.join("; ") : "completed"}\n`,
  );
  await lock.close();
  await rm(lockPath);
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  process.stdout.write(
    `Native scope test ${report.status}. Report: ${output}\n`,
  );
  if (report.status !== "passed") process.exitCode = 1;
}

async function cardSchedule(cards: number[]): Promise<unknown> {
  const data = await call<Array<Record<string, unknown>>>("cardsInfo", {
    cards,
  });
  return data
    .map((card) =>
      Object.fromEntries(
        [
          "cardId",
          "note",
          "due",
          "interval",
          "factor",
          "reps",
          "lapses",
          "type",
          "queue",
        ].map((key) => [key, card[key]]),
      ),
    )
    .sort((a, b) => Number(a.cardId) - Number(b.cardId));
}
