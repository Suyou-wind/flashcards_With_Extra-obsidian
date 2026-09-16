import { Notice } from "obsidian";
import { scopeExclusion } from "../../core/config/sync-scope.js";
import { exclusionMessage, showScopeExclusion } from "./sync-scope-ui.js";
import type { PluginHost } from "./plugin-host.js";
import type { AnkiConnectClient } from "../anki/anki-connect-client.js";
import { ensureAnkiAvailable } from "./anki-availability.js";
import { repairManagedSourceTemplates } from "../anki/repair-managed-source-templates.js";
import { uploadMedia } from "../anki/upload-media.js";
import { ObsidianMarkdownRepository } from "./obsidian-markdown-repository.js";
import { createDeleteConfirmer } from "./delete-confirm-modal.js";
import { createKindRecreationConfirmer } from "./kind-recreation-confirm-modal.js";
import { prepareIncrementalVaultSync } from "./incremental-vault-sync.js";
import { buildMediaRewriteMap, resolveMedia } from "./media-resolver.js";
import { createWikilinkResolver } from "./wikilink-resolver.js";
import {
  syncNote,
  type MediaPipeline,
  type SyncNoteResult,
} from "../../application/sync-note.js";
import {
  syncVault,
  type SyncVaultResult,
} from "../../application/sync-vault.js";
import type { SyncExecutionSession } from "../../application/ports.js";

export type SyncTarget = "current" | "vault";

function createMediaPipeline(
  plugin: PluginHost,
  ankiClient: AnkiConnectClient,
): MediaPipeline {
  return async (refs, sourcePath) => {
    const resolution = await resolveMedia(plugin.app, sourcePath, refs);
    return {
      rewriteMap: buildMediaRewriteMap(refs, resolution.resolved),
      errors: resolution.errors.map((e) => ({
        filename: e.filename,
        reason: e.reason,
      })),
      upload: () => uploadMedia(ankiClient, resolution.resolved.values()),
    };
  };
}

export async function dispatch(
  plugin: PluginHost,
  ankiClient: AnkiConnectClient,
  vaultName: string,
  target: SyncTarget,
  selectedPath?: string,
): Promise<void> {
  if (selectedPath) {
    const reason = scopeExclusion(selectedPath, plugin.settings.syncScope);
    if (reason) {
      showScopeExclusion(plugin, reason);
      return;
    }
  }
  const settings = plugin.settings;
  const repository = new ObsidianMarkdownRepository(
    plugin.app,
    settings.syncScope,
    selectedPath,
  );
  if (
    target === "vault" &&
    (await repository.listMarkdownNotes()).length === 0
  ) {
    new Notice("No notes match your sync scope.");
    return;
  }
  if (!(await ensureAnkiAvailable(plugin, ankiClient))) return;

  const resolveLink = createWikilinkResolver(plugin.app.metadataCache);
  const mediaPipeline = createMediaPipeline(plugin, ankiClient);
  const confirmDeletions = settings.confirmBeforeDelete
    ? createDeleteConfirmer(plugin.app, ankiClient)
    : undefined;
  const confirmKindRecreations = createKindRecreationConfirmer(plugin.app);
  const executionSession: SyncExecutionSession = {};
  try {
    const repair = await repairManagedSourceTemplates(
      ankiClient,
      executionSession,
    );
    if (repair.templatesUpdated > 0) {
      new Notice(
        `Updated ${repair.templatesUpdated} Anki ${
          repair.templatesUpdated === 1 ? "template" : "templates"
        } to show managed Context or Source fields.`,
      );
    }
    if (target === "current") {
      const note = await repository.getActiveNote();
      if (!note) {
        new Notice("No active Markdown note.");
        return;
      }
      const inProgress = new Notice(`Syncing ${note.path}…`, 0);
      let result: SyncNoteResult;
      try {
        result = await syncNote({
          ankiClient,
          ...(confirmDeletions ? { confirmDeletions } : {}),
          confirmKindRecreations,
          executionSession,
          logger: plugin.logger,
          mediaPipeline,
          note,
          repository,
          resolveLink,
          settings,
          vaultName,
        });
      } finally {
        inProgress.hide();
      }
      new Notice(summarizeNote(result));
    } else {
      const statusBar = plugin.addStatusBarItem();
      statusBar.setText("Flashcards: starting…");
      let result: SyncVaultResult;
      try {
        const pluginDirectory =
          plugin.manifest.dir ??
          `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
        const incremental = await prepareIncrementalVaultSync({
          adapter: plugin.app.vault.adapter,
          ankiClient,
          indexPath: `${pluginDirectory}/vault-scan-index.json`,
          syncScope: settings.syncScope,
          repository,
          settingsKey: JSON.stringify({
            pluginVersion: plugin.manifest.version,
            settings,
            vaultName,
          }),
        });
        result = await syncVault({
          ankiClient,
          cachedAtomicCues: incremental.cachedAtomicCues,
          excludedNoteCount: repository.excludedNoteCount,
          ...(confirmDeletions ? { confirmDeletions } : {}),
          confirmKindRecreations,
          executionSession,
          logger: plugin.logger,
          mediaPipeline,
          notes: incremental.notes,
          onProgress: (current, total, notePath) => {
            const name = notePath.split("/").pop() ?? notePath;
            statusBar.setText(`Flashcards: ${current}/${total} — ${name}`);
          },
          repository,
          resolveLink,
          settings,
          processedNoteCount: incremental.processedNoteCount,
          skippedUnchangedNoteCount: incremental.skippedUnchangedNoteCount,
          vaultName,
        });
        try {
          await incremental.finish(result.perNote);
        } catch (error) {
          plugin.logger.warn("Could not save disposable vault scan index", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        statusBar.remove();
      }
      new Notice(summarizeVault(result));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    plugin.logger.error("dispatch failed", { target, error: msg });
    new Notice(`Sync failed: ${msg}`);
  }
}

function countFailedOps(r: SyncNoteResult["ankiResults"]): number {
  if (!r) return 0;
  return (
    r.creates.filter((c) => c.status === "failed").length +
    r.updates.filter((u) => u.status === "failed").length +
    r.deletes.filter((d) => d.status === "failed").length
  );
}

function summarizeNote(result: SyncNoteResult): string {
  if (result.status === "failed") {
    return `Sync failed: ${result.error ?? "unknown error"} — see sync.log`;
  }
  if (result.status === "skipped") {
    return result.scopeExclusion
      ? `Excluded from Flashcards sync. ${exclusionMessage(result.scopeExclusion)}`
      : "No cards detected.";
  }
  const r = result.ankiResults;
  const creates = r ? r.creates.filter((c) => c.status === "ok").length : 0;
  const updates = r ? r.updates.filter((u) => u.status === "ok").length : 0;
  const deletes = r ? r.deletes.filter((d) => d.status === "ok").length : 0;
  const failedOps = countFailedOps(r);
  const failedSuffix =
    failedOps > 0
      ? ` (${failedOps} card op${failedOps === 1 ? "" : "s"} failed — see sync.log)`
      : "";
  const recovered = result.recoveredMissingCount;
  const recoveredSuffix =
    recovered > 0
      ? ` (${recovered} missing Anki card${recovered === 1 ? "" : "s"} recreated)`
      : "";
  return `Synced ${result.notePath}: +${creates} ~${updates} -${deletes}${recoveredSuffix}${failedSuffix}`;
}

function summarizeVault(result: SyncVaultResult): string {
  const failedOps = result.perNote.reduce(
    (sum, r) => sum + countFailedOps(r.ankiResults),
    0,
  );
  const parts: string[] = [];
  if (result.failedNotes > 0)
    parts.push(
      `${result.failedNotes} note${result.failedNotes === 1 ? "" : "s"} failed`,
    );
  if (failedOps > 0)
    parts.push(`${failedOps} card op${failedOps === 1 ? "" : "s"} failed`);
  const failedSuffix =
    parts.length > 0 ? ` (${parts.join(", ")} — see sync.log)` : "";
  return (
    `Vault sync: ${result.noteCount} notes` +
    (result.excludedNoteCount > 0
      ? ` (${result.excludedNoteCount} excluded by sync scope)`
      : "") +
    (result.skippedUnchangedNoteCount > 0
      ? ` (${result.skippedUnchangedNoteCount} unchanged verified notes skipped)`
      : "") +
    ", " +
    `+${result.totalCreates} ~${result.totalUpdates} -${result.totalDeletes}${failedSuffix}`
  );
}
