# Sync scope manual checks

## Load the prepared settings

The preset in `scope-settings.json` contains **2 included folders, 2 excluded
folders, and 5 excluded notes**. Only this scenario's `Study` and `Practice`
folders are included, keeping other test-vault scenarios out of vault sync.

If Obsidian is already open, disable **Flashcards** first, then run this from
the repository root and enable the plugin again:

```sh
node scripts/prepare-sync-scope-vault.mjs
```

The running plugin saves its settings on unload, so applying the preset before
disabling it can be overwritten. The script preserves all other settings and
note contents, and saves the original scope for restoration.

## Expected starting state

Paths below are relative to `scenarios/sync-scope/`. Each note contains one
inline card. No Anki operations have been performed by the setup script.

| Note | Expected result |
| --- | --- |
| `Study/Eligible.md` | Syncs: inside an included folder. |
| `Study/Nested/Eligible.md` | Syncs: included folders cover descendants. |
| `Practice/Eligible.md` | Syncs: inside the second included folder. |
| `Study/Individual.md` | Skips: explicit note exclusion. |
| `Practice/Individual.md` | Skips: separate exclusion despite the identical filename. |
| `Study/Drafts/Alpha.md` | Skips: explicit note exclusion. |
| `Study/Drafts/Zebra.md` | Skips: explicit note exclusion. |
| `Study/Archive/Excluded.md` | Skips: excluded parent folder. |
| `Study/Archive/Also explicit.md` | Skips: explicit note exclusion; removing it still leaves the parent exclusion. |
| `Practice/Private/Excluded.md` | Skips: second excluded folder. |
| `Study-old/Outside.md` | Skips: folder-prefix lookalike is outside the includes. |
| `Outside.md` | Skips: outside both included folders. |

A vault update initially processes **3 eligible notes / 3 cards**. Subsequent
updates may skip unchanged notes. The excluded total includes all other
Markdown notes in the test vault, including this checklist. Existing Anki
cards from previous scenarios are kept.

## Check the UI

1. Open **Settings → Flashcards → Sync scope**. Expect counts **2 / 2 / 5**.
2. Check inline add buttons, compact × controls with path tooltips, muted
   descriptions, and aligned headings at normal and narrow window widths.
3. Excluded notes should form four collapsed groups: `Practice`, `Study`,
   `Study/Archive`, and `Study/Drafts` (displayed with full paths). Open Drafts
   and check that **Alpha** comes before **Zebra**, despite the preset order.
4. Search for `Individual`: expect two notes in two different folder groups.
   Search for `Drafts/Alpha`: expect one match. Clearing search restores groups.
5. Use **Add notes** to select multiple notes, then remove them again. Remove
   all note exclusions to check that search disappears; reapply the preset
   before continuing the starting-state checks.

## Check sync behavior

1. With Anki closed, attempt current-note sync and ribbon sync for each kind
   of skipped note. Expect its precise reason and a working **Open sync
   settings** action, without starting Anki. The status should say excluded.
2. Run vault sync and verify that only the three eligible notes get cards.
   Excluded notes must not acquire anchors or sync metadata.
3. Remove the individual exclusion for `Study/Archive/Also explicit.md` from
   its context menu. It must remain excluded, now explaining `Study/Archive`.
4. Temporarily include `Study/Archive` too. Its folder exclusion still wins.
5. Rename an explicitly excluded note inside Obsidian and check that its rule
   follows it. Rename `Study` and check that included, excluded-folder, and
   individual-note paths beneath it follow the rename.
6. Move a note excluded only through `Archive` into `Study/Nested`. It becomes
   eligible. An explicitly excluded note should stay excluded when moved.
7. Sync an eligible note, exclude it, and run vault sync. Its Anki card must
   remain. Re-include it and sync again: verify no duplicate card appears.
8. Exclude both included folders. Vault sync should report **No notes match
   your sync scope**, without launching Anki.

Undo test renames and moves in Obsidian before reapplying the preset. The
script resets settings only; it does not rewrite or remove note identities.

## Restore your previous scope

Disable Flashcards, run the following, then enable it again:

```sh
node scripts/prepare-sync-scope-vault.mjs --restore
```

This restores the original scope saved before the first preset application.
Other plugin settings and any cards created during testing remain unchanged.
