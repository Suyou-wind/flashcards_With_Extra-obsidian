import { describe, expect, it, vi } from "vitest";
import {
  removeOwnedNotes,
  requireProfile,
  type AnkiCall,
} from "../../scripts/native/anki.ts";

const tag = `native_scope_${"a".repeat(32)}`;
function fixture(profile = "Test", ownedTag = tag) {
  const actions: string[] = [];
  const call = vi.fn(async (action: string) => {
    actions.push(action);
    if (action === "getActiveProfile") return profile;
    if (action === "notesInfo") return [{ noteId: 123, tags: [ownedTag] }];
    return null;
  }) as unknown as AnkiCall;
  return { call, actions };
}

describe("native Anki safety", () => {
  it("refuses a missing expected profile", async () => {
    const { call, actions } = fixture();
    await expect(requireProfile(call, "")).rejects.toThrow("explicit");
    expect(actions).toEqual([]);
  });
  it("refuses cleanup in the wrong active profile", async () => {
    const { call, actions } = fixture("Personal");
    await expect(removeOwnedNotes(call, "Test", tag, [123])).rejects.toThrow(
      "profile mismatch",
    );
    expect(actions).toEqual(["getActiveProfile"]);
  });
  it("preserves notes whose ownership tag does not match", async () => {
    const { call, actions } = fixture("Test", "personal");
    await expect(removeOwnedNotes(call, "Test", tag, [123])).rejects.toThrow(
      "ownership",
    );
    expect(actions).not.toContain("deleteNotes");
  });
  it("rejects IDs returned for a different note", async () => {
    const { call, actions } = fixture();
    await expect(removeOwnedNotes(call, "Test", tag, [456])).rejects.toThrow(
      "ownership",
    );
    expect(actions).not.toContain("deleteNotes");
  });
  it("rechecks the profile immediately before deleting owned notes", async () => {
    const { call, actions } = fixture();
    await removeOwnedNotes(call, "Test", tag, [123]);
    expect(actions).toEqual([
      "getActiveProfile",
      "notesInfo",
      "getActiveProfile",
      "deleteNotes",
    ]);
  });
  it("stops if the profile changes during ownership verification", async () => {
    let reads = 0;
    const actions: string[] = [];
    const call = (async (action: string) => {
      actions.push(action);
      if (action === "getActiveProfile")
        return ++reads === 1 ? "Test" : "Personal";
      return [{ noteId: 123, tags: [tag] }];
    }) as AnkiCall;
    await expect(removeOwnedNotes(call, "Test", tag, [123])).rejects.toThrow(
      "profile mismatch",
    );
    expect(actions).not.toContain("deleteNotes");
  });
});
