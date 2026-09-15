import { describe, expect, it, vi } from "vitest";

import { ObsidianMarkdownRepository } from "../../../src/adapters/obsidian/obsidian-markdown-repository.js";

function createApp(activeFile: object | null = null) {
  const files = [
    { basename: "First", path: "First.md", stat: { mtime: 10, size: 20 } },
    {
      basename: "Second",
      path: "Folder/Second.md",
      stat: { mtime: 11, size: 21 },
    },
  ];
  const read = vi.fn(async (file: { path: string }) => `content:${file.path}`);
  const cachedRead = vi.fn(
    async (file: { path: string }) => `cached:${file.path}`,
  );
  const modify = vi.fn(async () => undefined);
  const app = {
    vault: {
      // The real Vault resolves any path in the vault, including the active
      // note, which the fixture keeps outside `files`.
      getFileByPath: (path: string) =>
        [...files, activeFile].find(
          (file): file is (typeof files)[number] =>
            (file as { path?: string } | null)?.path === path,
        ) ?? null,
      getMarkdownFiles: () => files,
      cachedRead,
      modify,
      read,
    },
    workspace: { getActiveFile: () => activeFile },
  };

  return { app, cachedRead, files, modify, read };
}

describe("ObsidianMarkdownRepository", () => {
  it("reads every Markdown file into the application port shape", async () => {
    const { app, files } = createApp();
    const repository = new ObsidianMarkdownRepository(app as never);

    const notes = await repository.getAllMarkdownNotes();

    expect(notes).toEqual([
      {
        file: files[0],
        markdown: "content:First.md",
        name: "First",
        path: "First.md",
      },
      {
        file: files[1],
        markdown: "content:Folder/Second.md",
        name: "Second",
        path: "Folder/Second.md",
      },
    ]);
  });

  it("returns null when there is no active file", async () => {
    const { app, read } = createApp();
    const repository = new ObsidianMarkdownRepository(app as never);

    await expect(repository.getActiveNote()).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("lists file stamps without reading Markdown content", async () => {
    const { app, cachedRead, files, read } = createApp();
    const repository = new ObsidianMarkdownRepository(app as never);

    const descriptors = await repository.listMarkdownNotes();

    expect(descriptors).toEqual([
      {
        file: files[0],
        mtime: 10,
        name: "First",
        path: "First.md",
        size: 20,
      },
      {
        file: files[1],
        mtime: 11,
        name: "Second",
        path: "Folder/Second.md",
        size: 21,
      },
    ]);
    expect(read).not.toHaveBeenCalled();
    expect(cachedRead).not.toHaveBeenCalled();
  });

  it("uses Obsidian's cached read for a selected vault note", async () => {
    const { app, cachedRead } = createApp();
    const repository = new ObsidianMarkdownRepository(app as never);
    const [descriptor] = await repository.listMarkdownNotes();

    const note = await repository.readMarkdownNote(descriptor!);

    expect(note.markdown).toBe("cached:First.md");
    expect(cachedRead).toHaveBeenCalledOnce();
  });

  it("saves through Vault.modify against the file resolved from the note path", async () => {
    const file = { basename: "Active", path: "Active.md" };
    const { app, modify } = createApp(file);
    const repository = new ObsidianMarkdownRepository(app as never);
    const note = await repository.getActiveNote();
    if (!note) throw new Error("Expected an active note fixture.");

    await repository.saveNote(note, "changed");

    expect(modify).toHaveBeenCalledWith(file, "changed");
  });

  it("refuses to save a note that has disappeared from the vault", async () => {
    const { app, modify } = createApp({ basename: "Active", path: "Active.md" });
    const repository = new ObsidianMarkdownRepository(app as never);
    const note = await repository.getActiveNote();
    if (!note) throw new Error("Expected an active note fixture.");

    await expect(
      repository.saveNote({ ...note, path: "Gone.md" }, "changed"),
    ).rejects.toThrow("Gone.md");
    expect(modify).not.toHaveBeenCalled();
  });
});

it("filters folder and file rules before full or incremental content reads", async () => {
  const { app, read, cachedRead } = createApp();
  const repository = new ObsidianMarkdownRepository(app as never, { includedFolders: [], excludedFolders: ["Folder"], excludedNotes: ["First.md"] });
  expect(await repository.getAllMarkdownNotes()).toEqual([]);
  expect(await repository.listMarkdownNotes()).toEqual([]);
  expect(repository.excludedNoteCount).toBe(2);
  expect(read).not.toHaveBeenCalled();
  expect(cachedRead).not.toHaveBeenCalled();
});

it("keeps the selected note when the active tab changes", async () => {
  const { app } = createApp({ path: "Other.md", basename: "Other" });
  const repository = new ObsidianMarkdownRepository(app as never, undefined, "First.md");
  expect((await repository.getActiveNote())?.path).toBe("First.md");
});
