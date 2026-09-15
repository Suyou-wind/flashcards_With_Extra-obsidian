import { describe, expect, it } from "vitest";
import { mergeSettings } from "../../../src/core/config/settings.js";
import {
  mergeSyncScope,
  renameSyncScope,
  scopeExclusion,
} from "../../../src/core/config/sync-scope.js";

describe("sync scope", () => {
  it("preserves whole-vault eligibility on older settings", () => {
    expect(
      scopeExclusion("Root.md", mergeSettings({}).syncScope),
    ).toBeUndefined();
  });
  it("normalizes folder separators without altering filename identity", () => {
    expect(
      mergeSyncScope({
        includedFolders: [
          "Study/",
          "Study",
          "/",
          "../bad",
          "/absolute",
          "a//b",
          3,
        ],
        excludedNotes: [" spaced .md"],
      }),
    ).toEqual({
      includedFolders: ["Study"],
      excludedFolders: [],
      excludedNotes: [" spaced .md"],
    });
    expect(mergeSettings({ syncScope: null }).syncScope).toEqual(
      mergeSyncScope(null),
    );
  });
  const scope = mergeSyncScope({
    includedFolders: ["Study"],
    excludedFolders: ["Study/Drafts", "Study/Drafts/Private"],
    excludedNotes: ["Study/Skip.md"],
  });
  it.each([
    ["Study/Topic.md", undefined],
    ["Study/Nested/Topic.md", undefined],
    ["Study/Drafts-old/Topic.md", undefined],
    ["Study-old/Topic.md", { kind: "outside-includes" }],
    ["Root.md", { kind: "outside-includes" }],
    ["study/Topic.md", { kind: "outside-includes" }],
    ["Study/Skip.md", { kind: "note", path: "Study/Skip.md" }],
    ["Study/Nested/Skip.md", undefined],
    ["Study/Drafts/X.md", { kind: "folder", path: "Study/Drafts" }],
    [
      "Study/Drafts/Private/X.md",
      { kind: "folder", path: "Study/Drafts/Private" },
    ],
  ])("evaluates %s", (path, expected) =>
    expect(scopeExclusion(path, scope)).toEqual(expected),
  );
  it("exclusions override even explicitly included child folders", () => {
    expect(
      scopeExclusion("Study/Drafts/X.md", {
        ...scope,
        includedFolders: ["Study/Drafts"],
      })?.kind,
    ).toBe("folder");
  });
  it("renames nested explicit rules without matching sibling prefixes", () => {
    const result = renameSyncScope(
      { ...scope, excludedNotes: ["Study/Skip.md", "Study-old/Skip.md"] },
      "Study",
      "School",
    );
    expect(result).toEqual({
      includedFolders: ["School"],
      excludedFolders: ["School/Drafts", "School/Drafts/Private"],
      excludedNotes: ["School/Skip.md", "Study-old/Skip.md"],
    });
    expect(
      renameSyncScope(result, "School/Skip.md", "Other.md").excludedNotes,
    ).toEqual(["Other.md", "Study-old/Skip.md"]);
  });
});
