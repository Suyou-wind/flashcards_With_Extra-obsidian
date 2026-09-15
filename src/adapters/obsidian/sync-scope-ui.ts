import { Modal, Notice } from "obsidian";
import {
  scopeExclusion,
  type ScopeExclusion,
  type SyncScopeSettings,
} from "../../core/config/sync-scope.js";
import type { PluginHost } from "./plugin-host.js";

const labels: Record<keyof SyncScopeSettings, string> = {
  includedFolders: "Included folders",
  excludedFolders: "Excluded folders",
  excludedNotes: "Excluded notes",
};
const compare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true }) ||
  (a < b ? -1 : a > b ? 1 : 0);

function parentFolder(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

export function exclusionMessage(reason: ScopeExclusion): string {
  switch (reason.kind) {
    case "note":
      return `This note is explicitly excluded: ${reason.path}.`;
    case "folder":
      return `It belongs to the excluded folder ${reason.path}/.`;
    case "outside-includes":
      return "It is outside the included folders.";
  }
}

export function showScopeExclusion(
  plugin: PluginHost,
  reason: ScopeExclusion,
): void {
  const fragment = createFragment();
  const text = createEl("p");
  text.textContent = `This note is excluded from Flashcards sync. ${exclusionMessage(reason)}`;
  fragment.append(text);
  const button = createEl("button");
  button.textContent = "Open sync settings";
  fragment.append(button);
  const notice = new Notice(fragment, 15000);
  button.addEventListener("click", () => {
    notice.hide();
    void openSyncScope(plugin);
  });
}

/** A supported modal gives notices and file menus direct access to the same editor. */
export function openSyncScope(plugin: PluginHost): void {
  const modal = new Modal(plugin.app);
  modal.titleEl.textContent = "Flashcards sync scope";
  const dispose = renderSyncScope(modal.contentEl, plugin);
  modal.onClose = dispose;
  modal.open();
}

function button(
  parent: HTMLElement,
  text: string,
  action: () => void,
): HTMLButtonElement {
  const el = createEl("button");
  el.type = "button";
  el.textContent = text;
  el.addEventListener("click", action);
  parent.append(el);
  return el;
}

async function saveScope(
  plugin: PluginHost,
  scope: SyncScopeSettings,
): Promise<boolean> {
  if (plugin.syncInFlight) {
    new Notice("Sync is in progress. Edit sync scope after it finishes.");
    return false;
  }
  try {
    await plugin.updateSettings({ syncScope: scope });
    return true;
  } catch (error) {
    new Notice(
      `Could not save sync scope: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function openPicker(
  plugin: PluginHost,
  key: keyof SyncScopeSettings,
  changed: () => void,
): void {
  const modal = new Modal(plugin.app);
  modal.titleEl.textContent =
    key === "excludedNotes"
      ? "Exclude notes"
      : `Add ${labels[key].toLowerCase()}`;
  const selected = new Set<string>();
  const search = createEl("input");
  search.type = "search";
  search.placeholder = "Search full paths";
  search.setAttribute("aria-label", "Search full paths");
  modal.contentEl.append(search);
  const list = createDiv();
  list.className = "flashcards-scope-picker";
  modal.contentEl.append(list);
  const paths = (
    key === "excludedNotes"
      ? plugin.app.vault.getMarkdownFiles()
      : plugin.app.vault.getAllFolders(false)
  )
    .map((file) => file.path)
    .filter((path) => !plugin.settings.syncScope[key].includes(path))
    .sort(compare);
  const render = (): void => {
    list.replaceChildren();
    const matches = paths.filter((path) =>
      path.toLowerCase().includes(search.value.toLowerCase()),
    );
    if (!matches.length) list.textContent = "No matching paths.";
    for (const path of matches) {
      const label = createEl("label");
      const input = createEl("input");
      input.type = "checkbox";
      input.checked = selected.has(path);
      input.addEventListener("change", () => {
        if (input.checked) selected.add(path);
        else selected.delete(path);
        add.textContent = `Add selected (${selected.size})`;
        add.disabled = selected.size === 0 || plugin.syncInFlight;
      });
      label.append(input, document.createTextNode(path));
      list.append(label);
    }
  };
  const add = button(modal.contentEl, "Add selected (0)", () => {
    add.disabled = true;
    void saveScope(plugin, {
      ...plugin.settings.syncScope,
      [key]: [...new Set([...plugin.settings.syncScope[key], ...selected])],
    }).then((saved) => {
      if (saved) {
        changed();
        modal.close();
      } else add.disabled = false;
    });
  });
  add.disabled = true;
  search.addEventListener("input", render);
  render();
  modal.open();
  search.focus();
}

/** Returns cleanup for the event listeners used by an independently opened editor. */
export function renderSyncScope(
  container: HTMLElement,
  plugin: PluginHost,
): () => void {
  container.classList.add("flashcards-sync-scope");
  const expanded = new Set<string>();
  const search = createEl("input");
  search.type = "search";
  search.placeholder = "Search excluded notes";
  search.setAttribute("aria-label", "Search excluded notes");
  const content = createDiv();
  container.append(content);
  let disposed = false;
  const render = (): void => {
    if (disposed) return;
    const focused = container.ownerDocument.activeElement as HTMLElement | null;
    const focusKey = focused?.dataset.scopeFocus;
    content.replaceChildren();
    for (const key of Object.keys(labels) as Array<keyof SyncScopeSettings>) {
      const section = createEl("section");
      const header = createDiv();
      header.className = "flashcards-scope-header";
      const heading = createEl("h4");
      heading.className = "flashcards-scope-heading";
      const paths = [...plugin.settings.syncScope[key]].sort(compare);
      heading.textContent = `${labels[key]} (${paths.length})`;
      header.append(heading);
      section.append(header);
      const add = button(
        header,
        key === "excludedNotes" ? "Add notes" : "Add folder",
        () => {
          void openPicker(plugin, key, render);
        },
      );
      add.dataset.scopeFocus = `add-${key}`;
      add.disabled = plugin.syncInFlight;
      const description = createEl("p");
      description.className = "flashcards-scope-description";
      description.textContent =
        key === "includedFolders"
          ? "Empty means the whole vault. Exclusions always win."
          : key === "excludedFolders"
            ? "Skip these folders and everything inside them."
            : "Skip individual notes in every sync command.";
      section.append(description);
      content.append(section);
      if (key === "excludedNotes" && paths.length > 0) section.append(search);
      else if (key === "excludedNotes") search.value = "";
      const visible = paths.filter(
        (path) =>
          key !== "excludedNotes" ||
          path.toLowerCase().includes(search.value.toLowerCase()),
      );
      if (!visible.length && paths.length > 0) {
        const empty = createEl("p");
        empty.className = "flashcards-scope-description";
        empty.textContent = "No matching notes.";
        section.append(empty);
      }
      const counts = new Map<string, number>();
      if (key === "excludedNotes") {
        visible.sort(
          (a, b) => compare(parentFolder(a), parentFolder(b)) || compare(a, b),
        );
        for (const path of visible) {
          const folder = parentFolder(path);
          counts.set(folder, (counts.get(folder) ?? 0) + 1);
        }
      }
      const groups = new Map<string, HTMLElement>();
      for (const path of visible) {
        let parent: HTMLElement = section;
        if (key === "excludedNotes") {
          const folder = parentFolder(path);
          let group = groups.get(folder);
          if (!group) {
            const details = createEl("details");
            details.open = Boolean(search.value) || expanded.has(folder);
            details.addEventListener("toggle", () => {
              if (!search.value && details.isConnected) {
                if (details.open) expanded.add(folder);
                else expanded.delete(folder);
              }
            });
            const summary = createEl("summary");
            const count = counts.get(folder) ?? 0;
            summary.textContent = `${folder || "Vault root"} (${count})`;
            details.append(summary);
            section.append(details);
            group = details;
            groups.set(folder, group);
          }
          parent = group;
        }
        const row = createDiv();
        row.className = "flashcards-scope-row";
        const label = createSpan();
        label.textContent =
          key === "excludedNotes"
            ? path.slice(path.lastIndexOf("/") + 1)
            : `${path}/`;
        label.title = path;
        if (!plugin.app.vault.getAbstractFileByPath(path))
          label.append(" — Not found");
        if (key === "excludedNotes") {
          const inherited = scopeExclusion(path, {
            ...plugin.settings.syncScope,
            excludedNotes: [],
          });
          if (inherited) label.append(` — ${exclusionMessage(inherited)}`);
        }
        row.append(label);
        const remove = button(row, "×", () => {
          remove.disabled = true;
          void saveScope(plugin, {
            ...plugin.settings.syncScope,
            [key]: plugin.settings.syncScope[key].filter(
              (item) => item !== path,
            ),
          }).then(() => {
            render();
            content
              .querySelector<HTMLButtonElement>(
                `[data-scope-focus="add-${key}"]`,
              )
              ?.focus();
          });
        });
        remove.className = "flashcards-scope-remove";
        remove.title = `Remove ${path}`;
        remove.setAttribute("aria-label", `Remove ${path}`);
        remove.disabled = plugin.syncInFlight;
        parent.append(row);
      }
    }
    if (focused === search) search.focus();
    else if (focusKey)
      [...container.querySelectorAll<HTMLElement>("[data-scope-focus]")]
        .find((el) => el.dataset.scopeFocus === focusKey)
        ?.focus();
  };
  search.addEventListener("input", render);
  container.ownerDocument.addEventListener("flashcards-scope-changed", render);
  render();
  return () => {
    disposed = true;
    container.ownerDocument.removeEventListener(
      "flashcards-scope-changed",
      render,
    );
  };
}
