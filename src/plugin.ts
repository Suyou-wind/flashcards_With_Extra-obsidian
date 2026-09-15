import { scopeExclusion } from "./core/config/sync-scope.js";
import { exclusionMessage } from "./adapters/obsidian/sync-scope-ui.js";
import { registerSyncScopeEvents } from "./adapters/obsidian/sync-scope-events.js";
import { Notice, Plugin, TFile, debounce } from "obsidian";

import { registerPluginCommands } from "./adapters/obsidian/commands.js";
import { ObsidianFileLogger } from "./adapters/obsidian/file-logger.js";
import { ObsidianMarkdownRepository } from "./adapters/obsidian/obsidian-markdown-repository.js";
import type { PluginHost } from "./adapters/obsidian/plugin-host.js";
import { FlashcardsSettingTab } from "./adapters/obsidian/settings-tab.js";
import {
  registerFlashcardsRibbon,
  setRibbonVisibility,
} from "./adapters/obsidian/ribbon.js";
import {
  computeActiveNoteStatus,
  computePendingV1Count,
  renderActiveNoteStatus,
  renderPendingV1,
} from "./adapters/obsidian/status-bar.js";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type FlashcardsSettings,
} from "./core/config/settings.js";
import {
  CompositeLogger,
  ConsoleLogger,
  NoopLogger,
  type Logger,
} from "./core/logging/logger.js";
import { registerRenderPreview } from "./render-preview/index.js";

export default class FlashcardsPlugin extends Plugin implements PluginHost {
  override settings: FlashcardsSettings = DEFAULT_SETTINGS;
  logger: Logger = new NoopLogger();
  private syncing = false;
  get syncInFlight(): boolean {
    return this.syncing;
  }
  set syncInFlight(value: boolean) {
    if (value === this.syncing) return;
    this.syncing = value;
    document.dispatchEvent(new Event("flashcards-scope-changed"));
  }

  private fileLogger: ObsidianFileLogger | undefined;
  private activeNoteStatusEl: HTMLElement | undefined;
  private pendingV1StatusEl: HTMLElement | undefined;
  private ribbonEl: HTMLElement | undefined;

  override async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.rebuildLogger();

    this.activeNoteStatusEl = this.addStatusBarItem();
    this.pendingV1StatusEl = this.addStatusBarItem();
    renderActiveNoteStatus(this.activeNoteStatusEl, null);
    renderPendingV1(this.pendingV1StatusEl, 0);

    this.addSettingTab(new FlashcardsSettingTab(this.app, this));
    const actions = registerPluginCommands(this);
    this.ribbonEl = registerFlashcardsRibbon(
      this,
      actions.updateAnkiFromCurrentNote,
    );
    setRibbonVisibility(this.ribbonEl, this.settings.showRibbonIcon);

    this.registerWorkspaceEvents();
    registerSyncScopeEvents(this);
    registerRenderPreview(this, () => this.settings);

    // Initial paint — defer to next tick so workspace is ready.
    this.app.workspace.onLayoutReady(() => {
      void this.refreshActiveNoteStatus();
      void this.refreshPendingV1Status();
    });

    this.logger.info("plugin loaded", { version: this.manifest.version });
    new Notice("Flashcards v2 scaffold loaded.");
  }

  override onunload(): void {
    this.logger.info("plugin unloading");
    // Obsidian calls `onunload` synchronously and ignores a returned promise,
    // so returning one only creates a floating promise nothing ever awaits.
    // Kick the flush off explicitly and let it settle in the background.
    void this.flushOnUnload();
  }

  private async flushOnUnload(): Promise<void> {
    try {
      await this.settingsWrites;
      await this.fileLogger?.flush();
      await this.saveData(this.settings);
    } catch (error) {
      this.logger.error("failed to flush state on unload", error);
    }
  }

  private settingsWrites: Promise<void> = Promise.resolve();

  updateSettings(next: Partial<FlashcardsSettings>): Promise<void> {
    const write = this.settingsWrites.then(() => this.applySettings(next));
    this.settingsWrites = write.catch(() => {});
    return write;
  }

  private async applySettings(
    next: Partial<FlashcardsSettings>,
  ): Promise<void> {
    const prev = this.settings;
    this.settings = { ...this.settings, ...next };
    try {
      await this.saveData(this.settings);
    } catch (error) {
      this.settings = prev;
      throw error;
    }
    if (prev.syncScope !== this.settings.syncScope) {
      this.refreshStatusBars();
      document.dispatchEvent(new Event("flashcards-scope-changed"));
    }
    if (
      prev.logLevel !== this.settings.logLevel ||
      prev.logToFile !== this.settings.logToFile
    ) {
      this.rebuildLogger();
    }
    if (
      prev.v1MigrationDecisionMade !== this.settings.v1MigrationDecisionMade
    ) {
      void this.refreshPendingV1Status();
    }
    if (prev.showRibbonIcon !== this.settings.showRibbonIcon && this.ribbonEl) {
      setRibbonVisibility(this.ribbonEl, this.settings.showRibbonIcon);
    }
  }

  /** Called by commands after a sync completes. */
  refreshStatusBars(): void {
    void this.refreshActiveNoteStatus();
    void this.refreshPendingV1Status();
  }

  private rebuildLogger(): void {
    const sinks: Logger[] = [new ConsoleLogger(this.settings.logLevel)];
    if (this.settings.logToFile) {
      const path = `${this.manifest.dir ?? this.app.vault.configDir + "/plugins/" + this.manifest.id}/sync.log`;
      this.fileLogger = new ObsidianFileLogger(
        this.app.vault.adapter,
        path,
        this.settings.logLevel,
      );
      sinks.push(this.fileLogger);
    } else {
      this.fileLogger = undefined;
    }
    this.logger = sinks.length === 1 ? sinks[0]! : new CompositeLogger(sinks);
  }

  private registerWorkspaceEvents(): void {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.refreshActiveNoteStatus();
      }),
    );
    // Debounce vault-wide recompute so heavy editing doesn't thrash.
    const debouncedV1 = debounce(
      () => {
        void this.refreshPendingV1Status();
      },
      1500,
      true,
    );
    const debouncedActive = debounce(
      () => {
        void this.refreshActiveNoteStatus();
      },
      400,
      true,
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const active = this.app.workspace.getActiveFile();
        if (active && active.path === file.path) debouncedActive();
        debouncedV1();
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") debouncedV1();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") debouncedV1();
      }),
    );
  }

  private activeStatusRevision = 0;
  private pendingStatusRevision = 0;

  private async refreshActiveNoteStatus(): Promise<void> {
    const revision = ++this.activeStatusRevision;
    if (!this.activeNoteStatusEl) return;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      renderActiveNoteStatus(this.activeNoteStatusEl, null);
      return;
    }
    const reason = scopeExclusion(file.path, this.settings.syncScope);
    this.activeNoteStatusEl.title = reason ? exclusionMessage(reason) : "";
    if (reason) {
      renderActiveNoteStatus(this.activeNoteStatusEl, "Flashcards: excluded");
      return;
    }
    try {
      const markdown = await this.app.vault.read(file);
      if (revision !== this.activeStatusRevision) return;
      const text = computeActiveNoteStatus(markdown, file.path, this.settings);
      renderActiveNoteStatus(this.activeNoteStatusEl, text);
    } catch (e) {
      if (revision !== this.activeStatusRevision) return;
      this.logger.warn("refreshActiveNoteStatus failed", {
        path: file.path,
        error: e instanceof Error ? e.message : String(e),
      });
      renderActiveNoteStatus(this.activeNoteStatusEl, null);
    }
  }

  private async refreshPendingV1Status(): Promise<void> {
    const revision = ++this.pendingStatusRevision;
    if (!this.pendingV1StatusEl) return;
    // Hide once the user has decided — don't keep nagging.
    if (this.settings.v1MigrationDecisionMade) {
      renderPendingV1(this.pendingV1StatusEl, 0);
      return;
    }
    try {
      const repository = new ObsidianMarkdownRepository(
        this.app,
        this.settings.syncScope,
      );
      const count = await computePendingV1Count(repository);
      if (revision !== this.pendingStatusRevision) return;
      renderPendingV1(this.pendingV1StatusEl, count);
    } catch (e) {
      if (revision !== this.pendingStatusRevision) return;
      this.logger.warn("refreshPendingV1Status failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      renderPendingV1(this.pendingV1StatusEl, 0);
    }
  }
}
