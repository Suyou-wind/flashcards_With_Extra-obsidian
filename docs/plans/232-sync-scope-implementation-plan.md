# Issue #232: Sync scope implementation plan

## Objective

Let users choose which folders can sync and exclude folders or individual notes. Enforce the same rules for vault sync, current-note sync, and the ribbon action. Make exclusions understandable and manageable even with many individual notes.

Source: [GitHub issue #232](https://github.com/reuseman/flashcards-obsidian/issues/232) and the subsequent product discussion. This document plans implementation; it does not implement the feature.

## Product contract

- Settings contain three separate lists: **Included folders**, **Excluded folders**, and **Excluded notes**.
- Empty included folders means the whole vault. Otherwise, only notes inside at least one included folder qualify.
- Folder rules cover all descendants. Exclusions always win, including individual-note exclusions inside included folders.
- Rules apply to every sync entry point. Explicitly syncing an excluded note does not bypass its exclusion.
- Excluding a note stops processing and future syncing. It does not delete or suspend existing Anki cards, or remove identity metadata from the note. Re-including resumes the normal reconciliation process.
- A searchable picker and the note context menu edit the same persisted settings. No frontmatter exclusion property, glob patterns, or force-sync override in this release.
- Exclusions are sync rules, not restrictions on resolving links or reading media referenced by eligible notes. Existing reading-mode syntax rendering is outside this change.

### Path semantics

- Persist exact vault-relative paths, using Obsidian's canonical slash-separated paths. Store folder paths without trailing slashes; display them as folders in the UI.
- Match a folder by a path-segment boundary: `Study` matches `Study/Topic.md`, never `Study-old/Topic.md`.
- Match individual notes by full path, not basename. Preserve case and filename whitespace; use exact canonical path comparisons.
- Root-level notes are eligible when includes are empty. The folder picker omits the vault root because an empty include list already represents it.
- Deduplicate identical entries. Preserve explicit child rules even if a parent exclusion currently makes them redundant, so removing the parent does not discard user intent.
- Resolve explanations in this order: explicit note exclusion, closest excluded ancestor folder, outside included folders. Every result includes enough information to explain the decision.

### Excluded-note feedback

Keep current-note sync available for Markdown notes so an attempted sync can explain why it was skipped. Display one actionable message, before launching or contacting Anki:

> This note is excluded from Flashcards sync.
> It belongs to the excluded folder `Archive/`.
> **Open sync settings**

Use equivalent reasons for an explicitly excluded note and a note outside the included folders. The action opens the Flashcards settings at the Sync scope section. Do not show a success message or generic connection error for an excluded note.

For a vault with no eligible notes, report **No notes match your sync scope** without launching Anki. Vault progress and totals count eligible notes, with excluded notes reported separately from unchanged notes.

## Current implementation and integration points

- `src/core/config/settings.ts`: persisted settings and backward-compatible merging; no scope fields exist today.
- `src/adapters/obsidian/obsidian-markdown-repository.ts`: both full-note enumeration and incremental descriptors currently include every Markdown file.
- `src/adapters/obsidian/commands.ts`: current-note and vault commands pass through `runWithMigrationCheck`; migration may enumerate and modify the vault before `dispatch`. Dispatch currently contacts Anki before selecting the active note.
- `src/adapters/obsidian/incremental-vault-sync.ts`: descriptors drive cache reuse and live Anki checks. Filtering only inside the note loop would be too late.
- `src/application/sync-note.ts` and `src/application/sync-vault.ts`: application entry points that also need scope enforcement for direct callers.
- `src/adapters/obsidian/settings-tab.ts`: declarative settings with existing custom render callbacks suitable for mounting scope controls.
- `src/plugin.ts`: owns settings persistence, workspace events, and active-note and migration status refreshes.
- `src/adapters/obsidian/status-bar.ts`: uses the shared sync preview to show pending operations; excluded notes need an explicit state instead.

## Implementation sequence

### 1. Define settings and one shared scope evaluator

Add `SyncScopeSettings` with `includedFolders`, `excludedFolders`, and `excludedNotes` arrays under `FlashcardsSettings.syncScope`. Default all arrays to empty to preserve existing behavior. Merge nested settings defensively, keeping valid string entries and canonicalizing/deduplicating paths without changing filename identity. Invalid persisted path values must not become a root-wide rule.

Create `src/core/config/sync-scope.ts` with a pure path evaluator returning either eligibility or a structured exclusion reason and matching path. Reuse it everywhere; UI code formats its reasons, while core code stays independent of Obsidian.

Validation: settings loaded from older versions; malformed nested data; exact file matches; nested folders; sibling-prefix boundaries; case; root notes; includes plus excludes; deterministic explanations.

### 2. Enforce scope before reads, migration, cache checks, and writes

Give the Obsidian repository an explicit scope option for sync-related enumeration. Filter file paths before reading Markdown bodies and before returning incremental descriptors. Preserve unscoped repository behavior for callers that intentionally need all notes.

In commands, resolve the target and evaluate scope before migration checks or Anki availability. Capture the selected current-note path across asynchronous dialogs so switching tabs cannot redirect the sync to another note. Revalidate the target before dispatch. Wire the ribbon through the same guarded command path.

Use scoped enumeration for automatic v1 detection and backfill, the explicit syntax migration report and its write actions, and pending-migration status. Preserve the existing migration decision semantics; changing scope must not silently opt users into a new migration or modify previously excluded notes.

Add an early scope guard to `syncNote`, returning its existing skipped status with an optional structured scope reason, before parsing, identity writes, media work, or Anki calls. Audit consumers of skipped results so excluded notes cannot be mistaken for empty notes.

In `syncVault`, filter provided notes and cached cue evidence before batched live-state checks. When no notes are provided, ensure the repository's enumeration is scoped before content reads. The application guard protects direct callers; adapter filtering avoids the read costs. Update counts/progress consistently and keep excluded counts distinct from unchanged counts.

Incremental sync must receive only eligible descriptors. Excluded cache entries must not contribute live checks, collision warnings, or unchanged totals. Settings already participate in `settingsKey`; ensure scope changes invalidate reuse and that re-inclusion processes a note normally. Do not interpret omission from the cache as an Anki deletion request.

Scope edits take effect on the next sync; disable scope mutation controls during an active sync. Recheck settings after migration dialogs, before executing the selected work.

Validation: command/ribbon exclusions with Anki offline; no excluded-note reads or writes; no migration prompts caused solely by excluded notes; no excluded-card Anki calls from the cache; no false cross-note collision; re-inclusion; no eligible notes; preserved existing Anki cards.

### 3. Build searchable, organized settings controls

Add a **Sync scope** group to the existing settings tab. Implement focused adapter components, for example `sync-scope-settings.ts` and `sync-scope-picker.ts`, to keep the main tab manageable.

- Included and excluded folders have separate alphabetically sorted lists, counts, add-folder pickers, and remove actions.
- Excluded notes are grouped by parent folder. Sort groups by full folder path and notes by filename with deterministic ties. Label root notes **Vault root**.
- Note groups are collapsible and show counts; start collapsed to keep large lists compact.
- Provide search across full note paths. While searching, reveal matching groups and show a clear empty-result state. Restore the prior expansion state when search clears.
- **Add notes** opens a searchable picker of Markdown files with full paths to disambiguate duplicate names. Support adding multiple notes without reopening it for every selection, and ignore existing entries.
- Save changes through `updateSettings`; keep search, collapse state, and keyboard focus stable after adding/removing entries.
- Show relevant inherited exclusion information on redundant note entries. Removing a note entry must not claim that the note is now eligible if a folder rule still blocks it.
- Provide clear empty-list descriptions, accessible control labels, keyboard operation, and layouts that fit mobile settings.

Use the installed Obsidian typings to confirm custom settings rendering, picker, and navigation APIs during implementation. If direct settings-section navigation requires unsupported APIs, expose the same scope editor through a supported modal and link the notice to it; do not rely on private app APIs.

Validation: alphabetical grouping; full-path search; root notes; duplicate filenames; multiple additions; removal under an excluded parent; collapse/focus preservation; large lists; persistence after reload.

### 4. Add note context-menu actions and rename handling

Register the workspace file-menu listener via plugin lifecycle cleanup, limiting note actions to Markdown files:

- Eligible note: **Exclude from Flashcards sync** adds its exact path.
- Explicitly excluded note: **Remove note exclusion** removes only that path. If a folder/include rule still blocks the note, explain the remaining reason.
- Note blocked only by a folder or include rule: show the reason and **Open sync settings**. Do not offer an action implying that an individual note can override the folder rule.

Register vault rename events and rewrite exact file entries and folder-boundary prefixes in all three lists. Moving a folder also updates explicit note rules and nested folder rules beneath it. Moving a note out of an excluded folder changes inherited eligibility; an explicit note exclusion follows the note.

Preserve missing paths rather than silently deleting rules. Mark them **Not found** in settings and allow removal. This retains intent across temporary absence or recreation. Renames made outside Obsidian while it is closed cannot reliably be tracked; document that limit. Serialize event-driven settings updates so rapid renames cannot lose changes.

Validation: file rename; folder rename with nested rules; moving notes into/out of excluded folders; sibling-prefix safety; deduplication; rapid events; missing paths; listener cleanup.

### 5. Align feedback and status displays

Create a shared adapter helper to format exclusion reasons and open the scope UI. Keep an excluded-note notice visible long enough to use its action.

Evaluate scope in the plugin's active-note status refresh before reading the file. Display **Flashcards: excluded**, with its reason available via tooltip or the settings action, instead of pending create/update/delete counts. Refresh active-note and migration status after scope edits and relevant renames. Ignore stale asynchronous status results after a note or scope change.

Update vault summaries to distinguish notes skipped by scope from unchanged eligible notes. Report scope exclusions as expected skips, never failed syncs.

Validation: consistent reasons in notice/menu/status; no content read for excluded active-note status; updates immediately after changing settings; action opens scope controls; no stale status after navigation.

### 6. Document and verify the complete feature

Add usage documentation in `docs/USAGE.md` explaining include/exclude precedence, current-note behavior, individual-note context menus, rename behavior, and preservation of existing Anki cards. Add a small manual scenario under `test-vault/scenarios/` with eligible notes, an excluded parent folder, and an individually excluded note.

Extend the existing settings, commands, repository, incremental-sync, application sync, and status-bar suites. Add focused tests for the scope evaluator and the new scope UI/menu/rename adapters. Verify behavior through observable reads, writes, calls, and user feedback rather than testing only helper calls.

Run focused suites during implementation, then `npm run check` for lint, Markdown lint, architecture, dead-code checks, tests, and production build. Manually verify the actual settings picker, actionable notice, file menu, and rename events in Obsidian, including a narrow/mobile-sized layout and a long list of excluded notes.

## Completion criteria

1. Existing installations retain whole-vault syncing with no configuration changes.
2. Every sync entry point respects includes and exclusions, with a specific explanation for a blocked current note.
3. Excluded notes do not enter migration/backfill, incremental Anki verification, parsing, or sync writes; existing Anki cards remain intact.
4. Users can add/remove individual exclusions from either settings or the note context menu, with one source of truth.
5. Settings remain searchable and readable with many entries, and in-Obsidian renames preserve explicit rules.
6. Re-including notes resumes normal sync, and scope changes are reflected correctly in progress, cache reuse, and status displays.
7. Automated checks pass and the actual Obsidian interactions have been manually verified.

## Implementation verification

Implemented the scope settings, shared evaluator, early command/repository filtering, migration and cache safeguards, settings editor, note context-menu actions, rename handling, and exclusion feedback. Settings changes are serialized and edits are guarded during active sync.

The notice and context menu open a supported Obsidian modal containing the same scope editor as settings; this avoids private settings-navigation APIs.

Automated coverage includes core rule precedence and path boundaries, application no-write/no-Anki guarantees, command/ribbon guards, cached-note exclusion and re-inclusion, repository selection, status feedback, picker interactions, grouping/search, and rename persistence. A browser smoke check with mocked Obsidian host APIs covered a 390-pixel viewport, 120 excluded notes, search focus, actionable notices, and multiple note selection without horizontal overflow.

Native Obsidian verification remains pending because no running Obsidian instance was available. The manual checks are in `test-vault/scenarios/sync-scope/README.md`; in particular, verify actual host menus/settings, file rename events, and Anki card preservation in the test vault before release.
