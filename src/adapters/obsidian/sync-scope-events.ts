import { Notice, TFile } from "obsidian";
import {
  renameSyncScope,
  scopeExclusion,
} from "../../core/config/sync-scope.js";
import type { PluginHost } from "./plugin-host.js";
import { exclusionMessage, openSyncScope } from "./sync-scope-ui.js";

export function registerSyncScopeEvents(plugin: PluginHost): void {
  plugin.registerEvent(
    plugin.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      const explicit = plugin.settings.syncScope.excludedNotes.includes(
        file.path,
      );
      const reason = scopeExclusion(file.path, plugin.settings.syncScope);
      if (explicit || !reason) {
        menu.addItem((item) =>
          item
            .setTitle(
              explicit
                ? "Remove note exclusion"
                : "Exclude from Flashcards sync",
            )
            .setIcon(explicit ? "circle-check" : "circle-slash")
            .setDisabled(plugin.syncInFlight)
            .onClick(async () => {
              if (plugin.syncInFlight) {
                new Notice(
                  "Sync is in progress. Edit sync scope after it finishes.",
                );
                return;
              }
              const scope = plugin.settings.syncScope;
              try {
                await plugin.updateSettings({
                  syncScope: {
                    ...scope,
                    excludedNotes: explicit
                      ? scope.excludedNotes.filter((path) => path !== file.path)
                      : [...new Set([...scope.excludedNotes, file.path])],
                  },
                });
                const remaining = scopeExclusion(
                  file.path,
                  plugin.settings.syncScope,
                );
                new Notice(
                  remaining
                    ? `Excluded from Flashcards sync. ${exclusionMessage(remaining)}`
                    : "Note exclusion removed.",
                );
              } catch (error) {
                new Notice(
                  `Could not save note exclusion: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }),
        );
      }
      if (reason) {
        menu.addItem((item) =>
          item.setTitle(exclusionMessage(reason)).setDisabled(true),
        );
        menu.addItem((item) =>
          item
            .setTitle("Open sync settings")
            .setIcon("settings")
            .onClick(() => {
              void openSyncScope(plugin);
            }),
        );
      }
    }),
  );
  let pending = Promise.resolve();
  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      const newPath = file.path;
      pending = pending
        .then(async () => {
          const next = renameSyncScope(
            plugin.settings.syncScope,
            oldPath,
            newPath,
          );
          if (
            JSON.stringify(next) !== JSON.stringify(plugin.settings.syncScope)
          ) {
            await plugin.updateSettings({ syncScope: next });
          } else {
            // Moves can change inherited eligibility even without changing rules.
            plugin.refreshStatusBars();
          }
        })
        .catch((error: unknown) => {
          plugin.logger.error(
            "Could not update sync scope after rename",
            error,
          );
          new Notice(
            "Could not update sync scope after rename. Check sync settings.",
          );
        });
    }),
  );
}
