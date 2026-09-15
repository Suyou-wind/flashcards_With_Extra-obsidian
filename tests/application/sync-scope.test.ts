import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/core/config/settings.js";
import { syncNote } from "../../src/application/sync-note.js";
import { syncVault } from "../../src/application/sync-vault.js";
import { backfillV1Vault } from "../../src/application/backfill-v1-vault.js";
import type { AnkiGateway, MarkdownNote } from "../../src/application/ports.js";

const note: MarkdownNote = {
  file: {},
  name: "Card",
  path: "Archive/Card.md",
  markdown: "Q::A ^1234567890123",
};
const settings = {
  ...DEFAULT_SETTINGS,
  syncScope: {
    includedFolders: [],
    excludedFolders: ["Archive"],
    excludedNotes: [],
  },
};
function fixture() {
  const repository = {
    getAllMarkdownNotes: vi.fn(async () => [note]),
    getActiveNote: vi.fn(async () => note),
    saveNote: vi.fn(),
  };
  const contacted = vi.fn(() => {
    throw new Error("Excluded note contacted Anki");
  });
  const ankiClient = new Proxy({}, { get: contacted }) as AnkiGateway;
  return { repository, contacted, ankiClient, settings, vaultName: "Vault" };
}

describe("application sync exclusions", () => {
  it("skips before generating identities, media or contacting Anki", async () => {
    const input = fixture();
    const generateBlockId = vi.fn(() => "q-abcd");
    const result = await syncNote({ ...input, note, generateBlockId });
    expect(result).toMatchObject({
      status: "skipped",
      scopeExclusion: { kind: "folder", path: "Archive" },
      identityWritesApplied: 0,
      writebackEditsApplied: 0,
    });
    expect(generateBlockId).not.toHaveBeenCalled();
    expect(input.contacted).not.toHaveBeenCalled();
    expect(input.repository.saveNote).not.toHaveBeenCalled();
  });
  it("filters streamed notes before batch preflight, preserving excluded Anki cards", async () => {
    const input = fixture();
    async function* notes() {
      yield note;
    }
    const result = await syncVault({
      ...input,
      notes: notes(),
      cachedAtomicCues: [{ notePath: note.path, cues: ["same"] }],
    });
    expect(result).toMatchObject({
      noteCount: 0,
      excludedNoteCount: 1,
      totalDeletes: 0,
      totalCreates: 0,
      totalUpdates: 0,
      lints: [],
    });
    expect(input.contacted).not.toHaveBeenCalled();
    expect(input.repository.saveNote).not.toHaveBeenCalled();
  });
  it("does not backfill excluded legacy notes", async () => {
    const input = fixture();
    expect(await backfillV1Vault(input)).toEqual({
      notesUpdated: 0,
      totalBackfilledCount: 0,
    });
    expect(input.repository.saveNote).not.toHaveBeenCalled();
  });
});
