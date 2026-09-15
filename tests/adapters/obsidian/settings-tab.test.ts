import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../../src/core/config/settings.js";
import type { PluginHost } from "../../../src/adapters/obsidian/plugin-host.js";

vi.mock("obsidian", () => ({
  Notice: class {},
  PluginSettingTab: class {
    constructor(_app: unknown, _plugin: unknown) {}
  },
  SecretComponent: class {},
}));
vi.mock("../../../src/adapters/obsidian/anki-launcher.js", () => ({
  detectAnkiCommand: () => "/usr/local/bin/anki",
  launchAnkiCommand: vi.fn(),
}));

import { FlashcardsSettingTab } from "../../../src/adapters/obsidian/settings-tab.js";

describe("FlashcardsSettingTab", () => {
  let host: PluginHost;
  let tab: FlashcardsSettingTab;

  beforeEach(() => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const updateSettings = vi.fn(async (next) => {
      host.settings = { ...host.settings, ...next };
    });

    host = {
      app: {},
      settings,
      updateSettings,
    } as unknown as PluginHost;
    tab = new FlashcardsSettingTab(host.app, host);
  });

  it("declares the settings with explicit defaults", () => {
    expect(tab.getSettingDefinitions()).toEqual([
      expect.objectContaining({
        type: "group",
        heading: "Flashcards v2",
        items: expect.arrayContaining([
          expect.objectContaining({
            name: "Default deck",
            control: expect.objectContaining({
              type: "text",
              key: "defaultDeck",
              defaultValue: "Default",
            }),
          }),
          expect.objectContaining({
            name: "Context",
            control: expect.objectContaining({
              type: "dropdown",
              key: "contextStrategy",
              defaultValue: "headings",
            }),
          }),
          expect.objectContaining({
            name: "Context separator",
            control: expect.objectContaining({
              type: "text",
              key: "contextSeparator",
              defaultValue: " > ",
            }),
          }),
          expect.objectContaining({
            name: "Inline cards",
            control: expect.objectContaining({
              type: "toggle",
              key: "inline.enabled",
              defaultValue: true,
            }),
          }),
          expect.objectContaining({
            name: "Highlight clozes",
            control: expect.objectContaining({
              type: "toggle",
              key: "highlightCloze.enabled",
              defaultValue: true,
            }),
          }),
          expect.objectContaining({
            name: "Show ribbon button",
            control: expect.objectContaining({
              type: "toggle",
              key: "showRibbonIcon",
              defaultValue: true,
            }),
          }),
          expect.objectContaining({
            name: "Folder deck prefix",
            control: expect.objectContaining({
              type: "text",
              key: "folderDeckPrefix",
              defaultValue: "",
            }),
          }),
          expect.objectContaining({
            name: "Folder tags",
            control: expect.objectContaining({
              type: "toggle",
              key: "folderBasedTags",
              defaultValue: false,
            }),
          }),
        ]),
      }),
      expect.objectContaining({
        type: "group",
        heading: "Sync scope",
        items: [expect.objectContaining({ name: "", render: expect.any(Function) })],
      }),
      expect.objectContaining({
        type: "group",
        heading: "Anki connection",
        items: expect.arrayContaining([
          expect.objectContaining({
            name: "AnkiConnect API key",
            render: expect.any(Function),
          }),
          expect.objectContaining({
            name: "Start Anki automatically",
            control: expect.objectContaining({
              type: "toggle",
              key: "ankiLaunch.enabled",
              defaultValue: true,
            }),
          }),
          expect.objectContaining({
            name: "Anki launch command",
            control: expect.objectContaining({
              type: "text",
              key: "ankiLaunch.command",
              defaultValue: "",
              placeholder: "/usr/local/bin/anki",
            }),
          }),
          expect.objectContaining({
            name: "Wait for Anki",
            control: expect.objectContaining({
              type: "number",
              key: "ankiLaunch.waitSeconds",
              defaultValue: 60,
              min: 5,
              max: 300,
            }),
          }),
          expect.objectContaining({
            name: "Test connection",
            render: expect.any(Function),
          }),
        ]),
      }),
      expect.objectContaining({
        type: "group",
        heading: "Reading-mode rendering",
        items: expect.arrayContaining([
          expect.objectContaining({
            name: "Inline separator",
            control: expect.objectContaining({
              type: "toggle",
              key: "renderPreview.inlineSeparator",
              defaultValue: false,
            }),
          }),
        ]),
      }),
    ]);
  });

  it("reads current values through declarative control keys", () => {
    host.settings.defaultDeck = "Study";
    host.settings.inline.enabled = false;
    host.settings.renderPreview.features.cloze = false;
    host.settings.showRibbonIcon = false;

    expect(tab.getControlValue("defaultDeck")).toBe("Study");
    expect(tab.getControlValue("inline.enabled")).toBe(false);
    expect(tab.getControlValue("renderPreview.cloze")).toBe(false);
    expect(tab.getControlValue("showRibbonIcon")).toBe(false);
  });

  it("persists top-level and nested control changes", async () => {
    await tab.setControlValue("defaultDeck", "  Study  ");
    await tab.setControlValue("contextStrategy", "note-title");
    await tab.setControlValue("contextSeparator", " / ");
    await tab.setControlValue("inline.enabled", false);
    await tab.setControlValue("highlightCloze.enabled", false);
    await tab.setControlValue("folderDeckPrefix", "  Study  ");
    await tab.setControlValue("folderBasedTags", true);
    await tab.setControlValue("renderPreview.cloze", false);
    await tab.setControlValue("showRibbonIcon", false);

    expect(host.settings.defaultDeck).toBe("Study");
    expect(host.settings.contextStrategy).toBe("note-title");
    expect(host.settings.contextSeparator).toBe(" / ");
    expect(host.settings.inline.enabled).toBe(false);
    expect(host.settings.highlightCloze.enabled).toBe(false);
    expect(host.settings.folderDeckPrefix).toBe("Study");
    expect(host.settings.folderBasedTags).toBe(true);
    expect(host.settings.renderPreview.features).toEqual({
      ...DEFAULT_SETTINGS.renderPreview.features,
      cloze: false,
    });
    expect(host.settings.showRibbonIcon).toBe(false);
    expect(host.updateSettings).toHaveBeenCalledTimes(9);
  });

  it("round-trips the Anki launch settings", async () => {
    await tab.setControlValue("ankiLaunch.enabled", false);
    await tab.setControlValue("ankiLaunch.command", "  flatpak run Anki  ");
    await tab.setControlValue("ankiLaunch.waitSeconds", 90);

    expect(host.settings.ankiLaunch).toEqual({
      enabled: false,
      command: "flatpak run Anki",
      waitSeconds: 90,
    });
    expect(tab.getControlValue("ankiLaunch.enabled")).toBe(false);
    expect(tab.getControlValue("ankiLaunch.command")).toBe("flatpak run Anki");
    expect(tab.getControlValue("ankiLaunch.waitSeconds")).toBe(90);
  });

  it("rejects a wait outside the supported range", async () => {
    await tab.setControlValue("ankiLaunch.waitSeconds", 0);
    await tab.setControlValue("ankiLaunch.waitSeconds", 10_000);

    expect(host.updateSettings).not.toHaveBeenCalled();
    expect(host.settings.ankiLaunch.waitSeconds).toBe(60);
  });

  it("hides the launch command when auto-launch is off", () => {
    const launchCommand = findSetting(tab, "Anki launch command");
    expect(evaluateVisible(launchCommand)).toBe(true);

    host.settings.ankiLaunch.enabled = false;
    expect(evaluateVisible(findSetting(tab, "Anki launch command"))).toBe(false);
  });

  it("ignores values that do not match the control type", async () => {
    await tab.setControlValue("defaultDeck", "   ");
    await tab.setControlValue("contextStrategy", "invalid");
    await tab.setControlValue("renderPreview.enabled", "yes");

    expect(host.updateSettings).not.toHaveBeenCalled();
  });
});

interface NamedSetting {
  name: string;
  visible?: boolean | (() => boolean);
}

function findSetting(
  tab: FlashcardsSettingTab,
  name: string,
): NamedSetting | undefined {
  for (const group of tab.getSettingDefinitions()) {
    const items = (group as { items?: NamedSetting[] }).items ?? [];
    const match = items.find((item) => item.name === name);
    if (match) return match;
  }
  return undefined;
}

function evaluateVisible(setting: NamedSetting | undefined): boolean {
  const visible = setting?.visible;
  return typeof visible === "function" ? visible() : (visible ?? true);
}
