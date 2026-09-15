import {
  scopeExclusion,
  type SyncScopeSettings,
} from "../../core/config/sync-scope.js";
import type { App, TFile } from "obsidian";
import type {
  MarkdownNote,
  MarkdownRepository,
} from "../../application/ports.js";
import type { MarkdownNoteDescriptor } from "./incremental-vault-sync.js";

export class ObsidianMarkdownRepository implements MarkdownRepository {
  constructor(
    private readonly app: App,
    private readonly scope?: SyncScopeSettings,
    private readonly targetPath?: string,
  ) {}

  private eligibleFiles(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => !scopeExclusion(file.path, this.scope));
  }

  get excludedNoteCount(): number {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => scopeExclusion(file.path, this.scope)).length;
  }

  async getAllMarkdownNotes(): Promise<MarkdownNote[]> {
    const files = this.eligibleFiles();
    return Promise.all(
      files.map(async (file) => ({
        file,
        markdown: await this.app.vault.read(file),
        name: file.basename,
        path: file.path,
      })),
    );
  }

  async listMarkdownNotes(): Promise<MarkdownNoteDescriptor[]> {
    return this.eligibleFiles().map((file) => ({
      file,
      mtime: file.stat.mtime,
      name: file.basename,
      path: file.path,
      size: file.stat.size,
    }));
  }

  async readMarkdownNote(
    descriptor: MarkdownNoteDescriptor,
  ): Promise<MarkdownNote> {
    // The port types `file` as `unknown` so the core stays free of Obsidian
    // types. Rather than casting the opaque handle back to a `TFile`, look the
    // path up again — that returns a properly typed file and surfaces the case
    // where the note was deleted or renamed since it was listed.
    const file = this.requireFile(descriptor.path);
    return {
      file,
      markdown: await this.app.vault.cachedRead(file),
      name: descriptor.name,
      path: descriptor.path,
    };
  }

  async getActiveNote(): Promise<MarkdownNote | null> {
    const file =
      this.targetPath === undefined
        ? this.app.workspace.getActiveFile()
        : this.app.vault.getFileByPath(this.targetPath);
    if (!file || scopeExclusion(file.path, this.scope)) {
      return null;
    }

    return {
      file,
      markdown: await this.app.vault.read(file),
      name: file.basename,
      path: file.path,
    };
  }

  async saveNote(note: MarkdownNote, markdown: string): Promise<void> {
    // As in `readMarkdownNote`: resolve by path instead of unwrapping the
    // opaque `note.file` handle.
    await this.app.vault.modify(this.requireFile(note.path), markdown);
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(path);
    if (file === null) {
      throw new Error(`Markdown note no longer exists in the vault: ${path}`);
    }
    return file;
  }
}
