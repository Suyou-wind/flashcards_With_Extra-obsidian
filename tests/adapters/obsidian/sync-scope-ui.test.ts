import { createRequire } from "node:module";
// Obsidian has no JS package entrypoint; a node test with an explicit DOM keeps
// Vitest's mocked host boundary out of Vite's browser dependency resolution.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => {
    window: { document: Document; Event: typeof Event; close(): void };
  };
};
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/core/config/settings.js";
import type { PluginHost } from "../../../src/adapters/obsidian/plugin-host.js";
import {
  openSyncScope,
  renderSyncScope,
  showScopeExclusion,
} from "../../../src/adapters/obsidian/sync-scope-ui.js";
import { registerSyncScopeEvents } from "../../../src/adapters/obsidian/sync-scope-events.js";
import type { Menu, MenuItem, TFile } from "obsidian";

const mocks = vi.hoisted(() => ({
  modals: [] as Array<{
    contentEl: HTMLElement;
    titleEl: HTMLElement;
    close: () => void;
  }>,
  notices: [] as Array<string | DocumentFragment>,
}));
vi.mock("obsidian", () => ({
  Notice: class {
    constructor(message: string | DocumentFragment) {
      mocks.notices.push(message);
    }
    hide() {}
  },
  Modal: class {
    contentEl = document.createElement("div");
    titleEl = document.createElement("h2");
    onClose = () => {};
    constructor() {
      mocks.modals.push(this);
    }
    open() {
      document.body.append(this.titleEl, this.contentEl);
    }
    close() {
      this.onClose();
      this.contentEl.remove();
      this.titleEl.remove();
    }
  },
  TFile: class {
    extension = "md";
    constructor(public path: string) {}
  },
}));

const disposers: Array<() => void> = [];
beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Event", dom.window.Event);
  disposers.push(() => dom.window.close());
  vi.stubGlobal("createEl", (tag: string) => document.createElement(tag));
  vi.stubGlobal("createDiv", () => document.createElement("div"));
  vi.stubGlobal("createSpan", () => document.createElement("span"));
  vi.stubGlobal("createFragment", () => document.createDocumentFragment());
  mocks.modals.length = 0;
  mocks.notices.length = 0;
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function host() {
  const stateListeners = new Set<() => void>();
  const notify = () => stateListeners.forEach((listener) => listener());
  const paths = ["Z/Note.md", "A/Zebra.md", "A/Alpha.md", "Root.md"];
  const listeners: Record<string, (...args: never[]) => void> = {};
  const on = vi.fn((name: string, callback: (...args: never[]) => void) => {
    listeners[name] = callback;
    return {};
  });
  const plugin = {
    app: {
      vault: {
        getMarkdownFiles: () => paths.map((path) => ({ path })),
        getAllFolders: () => [{ path: "Z" }, { path: "A" }],
        getAbstractFileByPath: (path: string) =>
          paths.includes(path) || path === "A" ? {} : null,
        on,
      },
      workspace: { on },
    },
    settings: structuredClone(DEFAULT_SETTINGS),
    syncInFlight: false,
    onStateChange(listener: () => void) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    registerEvent: vi.fn(),
    refreshStatusBars: vi.fn(),
    logger: { error: vi.fn() },
    updateSettings: vi.fn(async (next) => {
      plugin.settings = { ...plugin.settings, ...next };
    }),
  } as unknown as PluginHost;
  return { plugin, listeners, notify };
}
function mount(plugin: PluginHost) {
  const el = document.createElement("div");
  document.body.append(el);
  disposers.push(renderSyncScope(el, plugin));
  return el;
}
function clickText(el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Button missing: ${text}`);
  button.click();
}
async function settled() {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("sync scope editor", () => {
  it("groups notes alphabetically, searches full paths and restores collapsed groups", () => {
    const { plugin } = host();
    plugin.settings.syncScope.excludedNotes = [
      "Z/Note.md",
      "A/Zebra.md",
      "Root.md",
      "A/Alpha.md",
    ];
    const el = mount(plugin);
    expect(
      [...el.querySelectorAll("summary")].map((item) => item.textContent),
    ).toEqual(["Vault root (1)", "A (2)", "Z (1)"]);
    expect(
      [...el.querySelectorAll("details")].every((item) => !item.open),
    ).toBe(true);
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.focus();
    input.value = "A/Alpha";
    input.dispatchEvent(new Event("input"));
    expect(el.querySelector("summary")?.textContent).toBe("A (1)");
    expect(el.querySelector("details")?.open).toBe(true);
    expect(document.activeElement).toBe(input);
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(
      [...el.querySelectorAll("details")].every((item) => !item.open),
    ).toBe(true);
  });
  it("adds multiple notes through the picker while preserving settings search", async () => {
    const { plugin } = host();
    plugin.settings.syncScope.excludedNotes = ["Root.md"];
    const el = mount(plugin);
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "A/";
    clickText(el, "Add notes");
    await vi.waitFor(() => expect(mocks.modals).toHaveLength(1));
    const modal = mocks.modals[0]!;
    const search = modal.contentEl.querySelector<HTMLInputElement>("input")!;
    search.value = "A/";
    search.dispatchEvent(new Event("input"));
    const boxes = modal.contentEl.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => box.click());
    clickText(modal.contentEl, "Add selected (2)");
    await settled();
    expect(plugin.settings.syncScope.excludedNotes).toEqual([
      "Root.md",
      "A/Alpha.md",
      "A/Zebra.md",
    ]);
    expect(input.value).toBe("A/");
    expect(el.querySelector("summary")?.textContent).toBe("A (2)");
  });
  it("removes only the individual rule and keeps the inherited explanation", async () => {
    const { plugin } = host();
    plugin.settings.syncScope.excludedFolders = ["A"];
    plugin.settings.syncScope.excludedNotes = ["A/Alpha.md"];
    const el = mount(plugin);
    expect(el.textContent).toContain("It belongs to the excluded folder A/");
    el.querySelector<HTMLButtonElement>(
      '[aria-label="Remove A/Alpha.md"]',
    )!.click();
    await settled();
    expect(plugin.settings.syncScope.excludedNotes).toEqual([]);
    expect(plugin.settings.syncScope.excludedFolders).toEqual(["A"]);
    expect(document.activeElement?.textContent).toBe("Add notes");
    expect(el.querySelector('input[type="search"]')).toBeNull();
  });
  it("marks missing paths and disables edits during sync", () => {
    const { plugin } = host();
    plugin.settings.syncScope.excludedNotes = ["Missing.md"];
    plugin.syncInFlight = true;
    const el = mount(plugin);
    expect(el.textContent).toContain("Not found");
    expect(
      [...el.querySelectorAll("button")].every((item) => item.disabled),
    ).toBe(true);
  });
  it("opens the same editor from an actionable exclusion notice", async () => {
    const { plugin } = host();
    showScopeExclusion(plugin, { kind: "folder", path: "Archive" });
    const fragment = mocks.notices[0] as DocumentFragment;
    expect(fragment.textContent).toContain("Archive/");
    fragment.querySelector("button")!.click();
    await vi.waitFor(() => expect(mocks.modals).toHaveLength(1));
    expect(mocks.modals[0]!.contentEl.textContent).toContain(
      "Excluded notes (0)",
    );
    mocks.modals[0]!.close();
  });
  it("refreshes an open modal when exclusions change elsewhere", async () => {
    const { plugin, notify } = host();
    openSyncScope(plugin);
    plugin.settings.syncScope.excludedNotes = ["Root.md"];
    notify();
    expect(mocks.modals[0]!.contentEl.textContent).toContain(
      "Excluded notes (1)",
    );
    mocks.modals[0]!.close();
  });
});

it("context menu exclusions and rapid rename events share persisted settings", async () => {
  const { plugin, listeners } = host();
  registerSyncScopeEvents(plugin);
  const { TFile: File } = await import("obsidian");
  const file = Object.assign(new File(), {
    path: "A/Alpha.md",
    extension: "md",
  });
  const items: Array<{ title: string; action?: () => Promise<void> }> = [];
  const menu = {
    addItem(callback: (item: MenuItem) => void) {
      const data: (typeof items)[number] = { title: "" };
      const item = {
        setTitle(title: string) {
          data.title = title;
          return item;
        },
        setIcon() {
          return item;
        },
        setDisabled() {
          return item;
        },
        onClick(action: () => Promise<void>) {
          data.action = action;
          return item;
        },
      };
      callback(item as unknown as MenuItem);
      items.push(data);
      return menu;
    },
  };
  (listeners["file-menu"] as unknown as (menu: Menu, file: TFile) => void)(
    menu as Menu,
    file,
  );
  expect(items[0]?.title).toBe("Exclude from Flashcards sync");
  await items[0]!.action!();
  expect(plugin.settings.syncScope.excludedNotes).toEqual(["A/Alpha.md"]);
  const rename = listeners.rename as unknown as (
    file: { path: string },
    oldPath: string,
  ) => void;
  rename({ path: "B" }, "A");
  rename({ path: "C" }, "B");
  await vi.waitFor(() =>
    expect(plugin.settings.syncScope.excludedNotes).toEqual(["C/Alpha.md"]),
  );
});

it("refreshes a settings editor hosted in another window's document", () => {
  const { plugin, notify } = host();
  const popupDocument = document.implementation.createHTMLDocument("Settings");
  const el = popupDocument.createElement("div");
  popupDocument.body.append(el);
  disposers.push(renderSyncScope(el, plugin));
  plugin.settings.syncScope.excludedNotes = ["Root.md"];
  notify();
  expect(el.textContent).toContain("Excluded notes (1)");
});

it("updates busy controls and stops listening when the editor closes", () => {
  const { plugin, notify } = host();
  const el = document.createElement("div");
  const dispose = renderSyncScope(el, plugin);
  plugin.syncInFlight = true;
  notify();
  expect(
    [...el.querySelectorAll("button")].every((button) => button.disabled),
  ).toBe(true);
  plugin.syncInFlight = false;
  notify();
  expect(
    [...el.querySelectorAll("button")].every((button) => !button.disabled),
  ).toBe(true);
  dispose();
  plugin.settings.syncScope.excludedNotes = ["Root.md"];
  notify();
  expect(el.textContent).toContain("Excluded notes (0)");
});
