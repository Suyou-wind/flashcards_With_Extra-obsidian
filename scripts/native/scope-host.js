/* global app, window */
// Executed inside Obsidian by its CLI, never bundled into the plugin.
export default function installScopeHarness(config) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(
    app.vault.adapter.basePath === config.vaultPath,
    "Wrong Obsidian vault path",
  );
  const plugin = () => {
    const value = app.plugins.plugins["flashcards-obsidian"];
    check(value, "Flashcards is not enabled");
    return value;
  };
  const wait = async (predicate, message, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error(`Timed out: ${message}`);
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  };
  const settingsRoot = () => app.setting.activeTab?.containerEl;
  const documents = () => [
    ...new Set(
      [window.document, settingsRoot()?.ownerDocument].filter(Boolean),
    ),
  ];
  const queryAll = (selector) =>
    documents().flatMap((doc) => [...doc.querySelectorAll(selector)]);
  const button = (root, name) => {
    const found = [...root.querySelectorAll("button")].find(
      (el) => (el.getAttribute("aria-label") || el.textContent) === name,
    );
    check(found && !found.disabled, `Enabled button missing: ${name}`);
    found.click();
  };
  const root = config.root;
  check(
    /^scenarios\/native-scope\/run-[a-f0-9]{32}$/.test(root),
    "Invalid owned fixture root",
  );
  const file = (relative) => {
    const value = app.vault.getFileByPath(`${root}/${relative}`);
    check(value, `Missing fixture: ${relative}`);
    return value;
  };
  const openFile = async (relative) => {
    app.setting.close();
    await app.workspace.getLeaf(false).openFile(file(relative));
    check(
      app.workspace.getActiveFile()?.path === `${root}/${relative}`,
      "Wrong active note after open",
    );
  };
  const scope = {
    includedFolders: [`${root}/Study`, `${root}/Practice`],
    excludedFolders: [`${root}/Study/Archive`, `${root}/Practice/Private`],
    excludedNotes: [
      `${root}/Study/Individual.md`,
      `${root}/Practice/Individual.md`,
      `${root}/Study/Archive/Explicit.md`,
      `${root}/Study/Drafts/Zebra.md`,
      `${root}/Study/Drafts/Alpha.md`,
    ],
  };
  const fixtures = {
    "Study/Eligible.md": "Main eligible note",
    "Study/Nested/Eligible.md": "Nested eligible note",
    "Practice/Eligible.md": "Second included folder",
    "Study/Individual.md": "Individually excluded study note",
    "Practice/Individual.md": "Individually excluded practice note",
    "Study/Archive/Excluded.md": "Excluded parent folder",
    "Study/Archive/Explicit.md": "Explicit and inherited exclusion",
    "Practice/Private/Excluded.md": "Second excluded folder",
    "Study/Drafts/Alpha.md": "Alphabetically first excluded note",
    "Study/Drafts/Zebra.md": "Alphabetically last excluded note",
    "Study-old/Outside.md": "Folder boundary lookalike",
    "Outside.md": "Outside all includes",
  };
  const markdown = (relative) =>
    `${fixtures[relative]} ${config.tag}::Native scope answer.\n`;
  const settings = async (value) => {
    check(!plugin().syncInFlight, "Sync already running");
    await plugin().updateSettings(value);
  };
  const showSettings = async () => {
    app.setting.open();
    app.setting.openTabById("flashcards-obsidian");
    await wait(
      () => settingsRoot()?.querySelector(".flashcards-sync-scope"),
      "scope settings",
    );
    return settingsRoot();
  };
  const clearNotices = () => queryAll(".notice").forEach((el) => el.remove());
  const notices = () =>
    queryAll(".notice")
      .map((el) => el.textContent)
      .join("\n");
  const sync = async (target, relative, ribbon = false) => {
    if (relative) await openFile(relative);
    else app.setting.close();
    clearNotices();
    if (ribbon) {
      const icon = window.document.querySelector(
        '.side-dock-ribbon-action[aria-label="Update Anki from current note"]',
      );
      check(icon, "Flashcards ribbon missing");
      icon.click();
    } else {
      check(
        app.commands.executeCommandById(
          `flashcards-obsidian:flashcards-sync-${target}`,
        ),
        "Sync command missing",
      );
    }
    await wait(() => !plugin().syncInFlight, "sync completion");
    const message = notices();
    check(!/Sync failed|Could not|Sync cancelled/.test(message), message);
    return message;
  };
  const menu = async (relative, title) => {
    await openFile(relative);
    const explorer = app.workspace.getLeavesOfType("file-explorer")[0]?.view;
    check(explorer?.revealInFolder, "File explorer unavailable");
    explorer.revealInFolder(file(relative));
    await wait(
      () => explorer.fileItems[`${root}/${relative}`]?.selfEl.isConnected,
      "visible file explorer entry",
    );
    const el = explorer.fileItems[`${root}/${relative}`].selfEl;
    el.dispatchEvent(
      new el.ownerDocument.defaultView.MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 100,
        clientY: 100,
      }),
    );
    await wait(
      () => queryAll(".menu-item-title").some((el) => el.textContent === title),
      `file menu: ${title}`,
    );
    queryAll(".menu-item-title")
      .find((el) => el.textContent === title)
      .click();
  };
  const api = {
    config,
    scope,
    fixtures,
    plugin,
    wait,
    check,
    button,
    settingsRoot,
    queryAll,
    showSettings,
    settings,
    sync,
    menu,
    openFile,
    notices,
    file,
    async snapshot() {
      check(!plugin().syncInFlight, "Sync already running");
      return {
        settings: JSON.parse(JSON.stringify(plugin().settings)),
        activePath: app.workspace.getActiveFile()?.path ?? null,
        settingsTab: app.setting.containerEl.isConnected
          ? app.setting.activeTab?.id
          : null,
      };
    },
    async setup() {
      check(
        !app.vault.getAbstractFileByPath(root),
        "Fixture root already exists",
      );
      for (const relative of Object.keys(fixtures)) {
        const segments = `${root}/${relative}`.split("/");
        for (let i = 1; i < segments.length; i++) {
          const path = segments.slice(0, i).join("/");
          if (!app.vault.getAbstractFileByPath(path))
            await app.vault.createFolder(path);
        }
        await app.vault.create(`${root}/${relative}`, markdown(relative));
      }
      await settings({
        syncScope: scope,
        defaultDeck: config.deck,
        folderBasedDecks: false,
        folderBasedTags: false,
        defaultTags: [config.tag],
        v1MigrationDecisionMade: true,
        showRibbonIcon: true,
        ankiLaunch: { ...plugin().settings.ankiLaunch, enabled: false },
      });
      return Object.keys(fixtures).length;
    },
    async ui() {
      const el = await showSettings();
      const headings = [
        ...el.querySelectorAll(".flashcards-scope-heading"),
      ].map((el) => el.textContent);
      check(
        JSON.stringify(headings) ===
          JSON.stringify([
            "Included folders (2)",
            "Excluded folders (2)",
            "Excluded notes (5)",
          ]),
        "Wrong settings counts",
      );
      const groups = [...el.querySelectorAll("details")];
      check(
        groups.length === 4 && groups.every((el) => !el.open),
        "Groups should start collapsed",
      );
      const search = el.querySelector(
        'input[aria-label="Search excluded notes"]',
      );
      const input = (value) => {
        search.value = value;
        search.dispatchEvent(
          new search.ownerDocument.defaultView.Event("input", {
            bubbles: true,
          }),
        );
      };
      input("Individual");
      check(
        el.querySelectorAll("details").length === 2,
        "Full-path search did not find both names",
      );
      input("Drafts");
      check(
        [...el.querySelectorAll(".flashcards-scope-row span")]
          .slice(-2)
          .map((el) => el.textContent.split(" — ")[0])
          .join(",") === "Alpha.md,Zebra.md",
        "Excluded notes not alphabetized",
      );
      input("");
      button(el, "Add notes");
      await wait(
        () => queryAll(".flashcards-scope-picker").length === 1,
        "native picker",
      );
      const picker = queryAll(".flashcards-scope-picker")[0];
      const modal = picker.closest(".modal");
      for (const path of [
        `${root}/Study/Eligible.md`,
        `${root}/Practice/Eligible.md`,
      ]) {
        const label = [...picker.querySelectorAll("label")].find(
          (el) => el.textContent === path,
        );
        check(label, `Picker path missing: ${path}`);
        label.querySelector("input").click();
      }
      button(modal, "Add selected (2)");
      await wait(
        () =>
          plugin().settings.syncScope.excludedNotes.length === 7 &&
          !picker.isConnected &&
          [...el.querySelectorAll("button")].some(
            (button) =>
              button.getAttribute("aria-label") ===
              `Remove ${root}/Study/Eligible.md`,
          ),
        "picker persistence and settings render",
      );
      for (const relative of ["Study/Eligible.md", "Practice/Eligible.md"]) {
        button(el, `Remove ${root}/${relative}`);
        await wait(
          () =>
            !plugin().settings.syncScope.excludedNotes.includes(
              `${root}/${relative}`,
            ) &&
            ![...el.querySelectorAll("button")].some(
              (button) =>
                button.getAttribute("aria-label") ===
                `Remove ${root}/${relative}`,
            ),
          "remove persistence and render",
        );
      }
      await settings({ syncScope: { ...scope, excludedNotes: [] } });
      await wait(
        () =>
          el.querySelector(".flashcards-scope-heading:last-of-type") &&
          !el.querySelector('input[aria-label="Search excluded notes"]'),
        "external settings update in the open settings window",
      );
      await settings({ syncScope: scope });
      await wait(
        () => el.querySelector('input[aria-label="Search excluded notes"]'),
        "restored exclusions in open settings window",
      );
      return {
        headings,
        separateSettingsWindow: el.ownerDocument !== window.document,
        compactRemoveControls: el.querySelectorAll(".flashcards-scope-remove")
          .length,
      };
    },
    async exclusions() {
      const cases = [
        ["Study/Individual.md", "explicitly excluded"],
        ["Study/Archive/Excluded.md", "excluded folder"],
        ["Study-old/Outside.md", "outside the included folders"],
      ];
      const results = [];
      for (const [relative, reason] of cases) {
        for (const ribbon of [false, true]) {
          const before = await app.vault.read(file(relative));
          const message = await sync("current-note", relative, ribbon);
          check(
            message.includes(reason),
            `Missing reason for ${relative}: ${message}`,
          );
          check(
            (await app.vault.read(file(relative))) === before,
            `Excluded note changed: ${relative}`,
          );
          results.push({ relative, ribbon, message });
        }
      }
      const action = queryAll(".notice button").find(
        (el) => el.textContent === "Open sync settings",
      );
      check(action, "Exclusion notice has no action");
      action.click();
      await wait(
        () => queryAll(".modal .flashcards-sync-scope").length > 0,
        "notice scope dialog",
      );
      const modal = queryAll(".modal .flashcards-sync-scope")[0].closest(
        ".modal-container",
      );
      modal?.querySelector(".modal-close-button")?.click();
      return results;
    },
    async rename() {
      await menu("Study/Archive/Explicit.md", "Remove note exclusion");
      await wait(
        () =>
          !plugin().settings.syncScope.excludedNotes.includes(
            `${root}/Study/Archive/Explicit.md`,
          ),
        "context menu removal",
      );
      const message = await sync("current-note", "Study/Archive/Explicit.md");
      check(
        message.includes("excluded folder"),
        "Individual removal bypassed folder exclusion",
      );
      await menu("Study/Eligible.md", "Exclude from Flashcards sync");
      await wait(
        () =>
          plugin().settings.syncScope.excludedNotes.includes(
            `${root}/Study/Eligible.md`,
          ),
        "context menu exclusion",
      );
      await app.fileManager.renameFile(
        file("Study/Individual.md"),
        `${root}/Study/Renamed.md`,
      );
      await wait(
        () =>
          plugin().settings.syncScope.excludedNotes.includes(
            `${root}/Study/Renamed.md`,
          ),
        "note rename rule",
      );
      await app.fileManager.renameFile(
        file("Study/Renamed.md"),
        `${root}/Study/Individual.md`,
      );
      await wait(
        () =>
          plugin().settings.syncScope.excludedNotes.includes(
            `${root}/Study/Individual.md`,
          ),
        "note rename restore",
      );
      await app.fileManager.renameFile(
        app.vault.getAbstractFileByPath(`${root}/Study`),
        `${root}/School`,
      );
      await wait(
        () =>
          plugin().settings.syncScope.includedFolders.includes(
            `${root}/School`,
          ) &&
          plugin().settings.syncScope.excludedFolders.includes(
            `${root}/School/Archive`,
          ),
        "folder rename rules",
      );
      await app.fileManager.renameFile(
        app.vault.getAbstractFileByPath(`${root}/School`),
        `${root}/Study`,
      );
      await wait(
        () =>
          plugin().settings.syncScope.includedFolders.includes(`${root}/Study`),
        "folder rename restore",
      );
      await settings({ syncScope: scope });
      return { contextMenu: true, noteRename: true, folderRename: true };
    },
    async assertExcludedUnchanged() {
      const eligible = [
        "Study/Eligible.md",
        "Study/Nested/Eligible.md",
        "Practice/Eligible.md",
      ];
      for (const relative of Object.keys(fixtures).filter(
        (path) => !eligible.includes(path),
      )) {
        check(
          (await app.vault.read(file(relative))) === markdown(relative),
          `Excluded fixture modified: ${relative}`,
        );
      }
      return true;
    },
    async evidence() {
      return {
        activePath: app.workspace.getActiveFile()?.path,
        menus: queryAll(".menu").map((el) => el.outerHTML),
        notices: notices(),
        scope: plugin().settings.syncScope,
        settingsHTML: settingsRoot()?.innerHTML ?? "",
        sources: Object.fromEntries(
          await Promise.all(
            app.vault
              .getMarkdownFiles()
              .filter((file) => file.path.startsWith(`${root}/`))
              .map(async (file) => [file.path, await app.vault.read(file)]),
          ),
        ),
      };
    },
    async restore(snapshot, removeFiles) {
      await wait(() => !plugin().syncInFlight, "sync before cleanup");
      for (const el of queryAll(".modal .flashcards-sync-scope"))
        el.closest(".modal-container")
          ?.querySelector(".modal-close-button")
          ?.click();
      await settings(snapshot.settings);
      if (snapshot.activePath && app.vault.getFileByPath(snapshot.activePath))
        await app.workspace
          .getLeaf(false)
          .openFile(app.vault.getFileByPath(snapshot.activePath));
      if (removeFiles) {
        const folder = app.vault.getAbstractFileByPath(root);
        if (folder) await app.vault.delete(folder, true);
      }
      app.setting.close();
      if (snapshot.settingsTab) {
        app.setting.open();
        app.setting.openTabById(snapshot.settingsTab);
      }
      delete window.__flashcardsScopeNative;
      return true;
    },
  };
  window.__flashcardsScopeNative = api;
  return { installed: true };
}
