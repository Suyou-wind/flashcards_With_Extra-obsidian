import { Notice } from "obsidian";
import type { PluginHost } from "./plugin-host.js";
import { createAnkiClient, ensureAnkiAvailable } from "./anki-availability.js";
import {
  applyManagedModelStyle,
  inspectManagedModelStyle,
} from "../anki/manage-managed-model-style.js";
import { SyntaxMigrationModal } from "./syntax-migration-modal.js";
import { createAnkiStyleConfirmer } from "./anki-style-confirm-modal.js";
import { writeAnkiStyleBackup } from "./anki-style-backup.js";
import { ObsidianMarkdownRepository } from "./obsidian-markdown-repository.js";
import { buildSyntaxMigrationReport } from "../../application/build-syntax-migration-report.js";
import { runWithMigrationCheck } from "./sync-command.js";

export interface PluginActions {
  updateAnkiFromCurrentNote: () => void;
}

export function registerPluginCommands(plugin: PluginHost): PluginActions {
  const updateAnkiFromCurrentNote = (): void => {
    const activeFile = plugin.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new Notice("Open a Markdown note before updating Anki.");
      return;
    }
    void runWithMigrationCheck(plugin, "current");
  };

  plugin.addCommand({
    callback: () => {
      void runAnkiStyleMigration(plugin);
    },
    id: "flashcards-apply-v2-anki-style",
    name: "Apply v2 Anki card style",
  });

  plugin.addCommand({
    callback: () => {
      void showSyntaxMigrationReport(plugin);
    },
    id: "flashcards-check-v2-syntax",
    name: "Check vault for v2 syntax migration",
  });

  plugin.addCommand({
    checkCallback: (checking) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== "md") return false;
      if (!checking) updateAnkiFromCurrentNote();
      return true;
    },
    id: "flashcards-sync-current-note",
    name: "Update Anki from current note",
  });

  plugin.addCommand({
    callback: () => {
      void runWithMigrationCheck(plugin, "vault");
    },
    id: "flashcards-sync-vault",
    name: "Update Anki from vault",
  });

  return { updateAnkiFromCurrentNote };
}

async function runAnkiStyleMigration(plugin: PluginHost): Promise<void> {
  if (plugin.syncInFlight) {
    new Notice("Sync already in progress.");
    return;
  }

  plugin.syncInFlight = true;
  let backupPath: string | undefined;
  let stage: "apply" | "backup" | "inspect" = "inspect";
  try {
    const ankiClient = createAnkiClient(plugin);
    if (!(await ensureAnkiAvailable(plugin, ankiClient))) return;
    const plan = await inspectManagedModelStyle(ankiClient);
    if (plan.changes.length === 0) {
      if (plan.blocked.length === 0) {
        new Notice("Managed Anki models already use the v2 style.");
      } else {
        new Notice(
          `No compatible managed Anki models to update. ${plan.blocked
            .map((item) => `${item.modelName}: ${item.reason}`)
            .join("; ")}`,
        );
      }
      return;
    }

    const confirmed = await createAnkiStyleConfirmer(plugin.app)(plan);
    if (!confirmed) return;

    const pluginDirectory =
      plugin.manifest.dir ??
      `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
    stage = "backup";
    backupPath = await writeAnkiStyleBackup({
      adapter: plugin.app.vault.adapter,
      plan,
      pluginDirectory,
      pluginVersion: plugin.manifest.version,
    });
    stage = "apply";
    await applyManagedModelStyle(ankiClient, plan);

    const count = plan.changes.length;
    new Notice(
      `Applied v2 style to ${count} Anki ${
        count === 1 ? "model" : "models"
      }. Backup: ${backupPath}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    plugin.logger.error("Anki style migration failed", { error: message });
    if (stage === "inspect") {
      new Notice(`Anki style check failed: ${message}`);
    } else if (stage === "backup") {
      new Notice(`Anki style backup failed: ${message}. Anki was not changed.`);
    } else {
      new Notice(`Anki style update failed: ${message}. Backup: ${backupPath}`);
    }
  } finally {
    plugin.syncInFlight = false;
    plugin.refreshStatusBars();
  }
}

async function showSyntaxMigrationReport(plugin: PluginHost): Promise<void> {
  try {
    const repository = new ObsidianMarkdownRepository(
      plugin.app,
      plugin.settings.syncScope,
    );
    const items = buildSyntaxMigrationReport(
      await repository.getAllMarkdownNotes(),
    );
    if (items.length === 0) {
      new Notice("No flashcards v2 syntax migrations found.");
      return;
    }
    new SyntaxMigrationModal(plugin.app, {
      items,
      onOpenLocation: (item) => {
        void (async () => {
          await plugin.app.workspace.openLinkText(item.notePath, "", false);
          plugin.app.workspace.activeEditor?.editor?.setCursor({
            ch: Math.max(0, item.column - 1),
            line: Math.max(0, item.line - 1),
          });
        })();
      },
    }).open();
  } catch (error) {
    new Notice(
      `Syntax migration check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
