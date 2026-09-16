import { Notice } from "obsidian";
import { scopeExclusion } from "../../core/config/sync-scope.js";
import { showScopeExclusion } from "./sync-scope-ui.js";
import type { PluginHost } from "./plugin-host.js";
import { createAnkiClient } from "./anki-availability.js";
import { ObsidianMarkdownRepository } from "./obsidian-markdown-repository.js";
import { MigrationModal } from "./migration-modal.js";
import { backfillV1Vault } from "../../application/backfill-v1-vault.js";
import { migrationCheck } from "../../application/migration-check.js";
import { dispatch, type SyncTarget } from "./sync-execution.js";

export function runWithMigrationCheck(
  plugin: PluginHost,
  target: SyncTarget,
): Promise<void> {
  return runExclusiveSync(plugin, () =>
    prepareSyncWithMigrationCheck(plugin, target),
  );
}

/** Includes deferred migration actions: every rejection releases the lock and reaches a notice. */
async function runExclusiveSync(
  plugin: PluginHost,
  action: () => Promise<void>,
): Promise<void> {
  if (plugin.syncInFlight) {
    new Notice("Sync already in progress.");
    return;
  }
  plugin.syncInFlight = true;
  try {
    await action();
  } catch (error) {
    plugin.logger.error("Sync preparation failed", error);
    new Notice(
      `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    plugin.syncInFlight = false;
    plugin.refreshStatusBars();
  }
}

async function prepareSyncWithMigrationCheck(
  plugin: PluginHost,
  target: SyncTarget,
): Promise<void> {
  const selectedPath =
    target === "current"
      ? plugin.app.workspace.getActiveFile()?.path
      : undefined;
  if (target === "current" && !selectedPath) {
    new Notice("No active Markdown note.");
    return;
  }
  if (selectedPath) {
    const reason = scopeExclusion(selectedPath, plugin.settings.syncScope);
    if (reason) {
      showScopeExclusion(plugin, reason);
      return;
    }
  }
  const repository = new ObsidianMarkdownRepository(
    plugin.app,
    plugin.settings.syncScope,
    selectedPath,
  );
  if (
    target === "vault" &&
    (await repository.listMarkdownNotes()).length === 0
  ) {
    new Notice("No notes match your sync scope.");
    return;
  }
  const ankiClient = createAnkiClient(plugin);
  const vaultName = plugin.app.vault.getName();

  // Fast path: decision already made → no vault scan.
  if (plugin.settings.v1MigrationDecisionMade) {
    await dispatch(plugin, ankiClient, vaultName, target, selectedPath);
    return;
  }

  // Scan vault for v1 anchors.
  const notes = await repository.getAllMarkdownNotes();
  const decision = migrationCheck({
    decisionMade: plugin.settings.v1MigrationDecisionMade,
    notes,
  });

  if (decision.decision === "skip") {
    if (!plugin.settings.v1MigrationDecisionMade) {
      await plugin.updateSettings({ v1MigrationDecisionMade: true });
    }
    await dispatch(plugin, ankiClient, vaultName, target, selectedPath);
    return;
  }

  // decision.decision === "ask"
  const modal = new MigrationModal(plugin.app, {
    affectedNoteCount: decision.affectedNoteCount,
    onCancel: () => {
      new Notice("Sync cancelled.");
    },
    onMigrate: () => {
      void runExclusiveSync(plugin, async () => {
        if (selectedPath) {
          const reason = scopeExclusion(
            selectedPath,
            plugin.settings.syncScope,
          );
          if (reason) {
            showScopeExclusion(plugin, reason);
            return;
          }
        }
        try {
          const result = await backfillV1Vault({
            repository: new ObsidianMarkdownRepository(
              plugin.app,
              plugin.settings.syncScope,
            ),
            settings: plugin.settings,
          });
          new Notice(
            `Migrated ${result.totalBackfilledCount} anchors across ${result.notesUpdated} notes.`,
          );
        } catch (error) {
          new Notice(
            `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        await plugin.updateSettings({ v1MigrationDecisionMade: true });
        await dispatch(plugin, ankiClient, vaultName, target, selectedPath);
      });
    },
    onSkip: () => {
      void runExclusiveSync(plugin, async () => {
        await plugin.updateSettings({ v1MigrationDecisionMade: true });
        await dispatch(plugin, ankiClient, vaultName, target, selectedPath);
      });
    },
    unmigratedCount: decision.unmigratedCount,
  });
  modal.open();
}
