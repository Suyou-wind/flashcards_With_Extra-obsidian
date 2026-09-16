# Unreleased

## Choose which folders and notes sync

The new **Sync scope** settings let you include folders, exclude folders and
their descendants, or exclude individual notes. The whole vault remains
eligible by default. Exclusions apply to vault updates, current-note updates,
and the ribbon button.

- Search and select multiple notes, then manage exclusions in collapsible,
  alphabetically sorted folder groups.
- Exclude a note directly from its context menu.
- Get a specific explanation and access to the scope editor when trying to
  update an excluded note.
- Keep explicit rules through file and folder renames within a running
  Obsidian session.

Excluded notes are skipped before migration, note processing, and cached Anki
checks. Existing Anki cards remain intact. Vault summaries distinguish scope
exclusions from unchanged notes.

See the [usage guide](../USAGE.md#choose-which-notes-sync) for rule precedence,
examples, and troubleshooting.

## Fixes

- Keep the scope editor up to date when settings are in another window.
- Report settings-save failures after migration dialogs and release the sync
  lock so another attempt can run.
