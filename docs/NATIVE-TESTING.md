# Native desktop integration tests

The native scope test drives the real Flashcards plugin through Obsidian's CLI
and verifies the resulting cards through AnkiConnect. It is deliberately
separate from `npm run check`: it needs running desktop applications and a
dedicated Anki test profile.

## Requirements

- Open this repository's `test-vault` in Obsidian, enable Flashcards, and leave
  the File explorer core plugin enabled.
- Enable Obsidian's CLI and ensure `obsidian` is available on PATH.
- Open Anki with AnkiConnect enabled and a **dedicated test profile** selected.
  The runner never switches profiles or starts Anki for you.
- Avoid interacting with either app during a run; the runner changes the active
  note, settings panels, and menus temporarily.

The runner verifies the exact absolute test-vault path and the active Anki
profile before setting up fixtures. It checks the profile again before each
stage and immediately before cleanup deletions. Missing or mismatched profile
information fails the run; there is no implicit default profile.

## Run

From the repository root, when your dedicated profile is named `Test`:

```sh
npm run test:native:scope -- --anki-profile=Test
```

Replace `Test` with the exact name of your dedicated test profile. Quoting the
whole argument supports spaces, for example `"--anki-profile=Plugin Tests"`.
Every test run starts with ESLint, including the recommended Obsidian rules,
with warnings treated as failures, then builds and reloads the plugin. `--skip-build` uses the existing build but
still runs lint and reloads. Recovery skips lint/build so broken code cannot
prevent cleanup. Run `npm run check` for the full automated suite.

Optional environment variables:

| Variable              | Default    | Purpose                                                                                                                    |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `OBSIDIAN_CLI`        | `obsidian` | Path to the Obsidian CLI executable.                                                                                       |
| `ANKICONNECT_API_KEY` | Unset      | Key for AnkiConnect assertions and cleanup, if authentication is enabled. The plugin also needs its own configured secret. |

Run the CLI, test runner, and Anki on the same workstation. The runner uses
`http://127.0.0.1:8765`, matching the plugin; an `ANKICONNECT_URL` override to a
different endpoint is rejected so assertions cannot guard the wrong instance.

Arguments are passed to the CLI as an argument array, without shell evaluation.
The runner uses the app's current settings object to apply/restore settings;
it does not race the running plugin by rewriting `data.json` on disk.

## What it checks

1. **Lint and preflight:** Obsidian ESLint rules, exact vault path, enabled/idle plugin, expected active profile,
   and unused test deck/tag.
2. **Setup:** build/reload, save settings and the active note, create 12 temporary
   notes with three eligible notes, and apply a controlled scope.
3. **Actual settings UI:** counts, collapsed folder groups, alphabetical sorting,
   full-path search, picker multi-selection, removal, and updates when settings
   are hosted in a separate window.
4. **Exclusions:** current-note and ribbon commands report individual, inherited,
   and outside-include reasons without modifying the excluded note. The notice
   action opens the actual scope dialog.
5. **Native file menus and renames:** remove an individual rule under an excluded
   parent, exclude a note through its context menu, and rename notes/folders
   while checking that the rules follow.
6. **Persistence:** reload the plugin and verify scope settings survive.
7. **Anki:** vault sync creates exactly three tagged notes/cards; another sync
   preserves IDs; excluding a synced note preserves its card and scheduling;
   re-including it updates content while keeping the same IDs and scheduling.
8. **Empty scope:** an update reports that no notes match.
9. **Cleanup:** remove run-owned Anki notes and the empty test deck, restore
   settings/active note/settings panel, and delete the run's temporary folder.

These tests complement the unit tests. For example, unchanged excluded note
contents and Anki IDs prove no mutations, while mocked command tests separately
assert that an excluded-note path does not contact or launch Anki at all. The
native runner does not shut down Anki to simulate an offline environment.

## Isolation and cleanup

Every run gets a random 32-character identifier and owns only:

- `test-vault/scenarios/native-scope/run-<id>/`
- Anki deck `FlashcardsNativeScope_<id>`
- Anki tag `native_scope_<id>`

The existing prepared `scenarios/sync-scope/` examples are not modified. The
runner records the original settings before changing them, and uses `finally`
for cleanup after success, assertion failures, or handled interrupt signals.
Anki cleanup verifies both the active profile and the ownership tag of every
note ID before deleting it. It refuses to delete a deck containing unexpected
cards. Shared Anki note types are not deleted; the plugin may create its usual
managed note types if they were absent from the dedicated test profile.

A process kill, application crash, or profile change can prevent full cleanup.
If Anki cleanup is blocked, temporary source notes are kept for diagnosis and
the report lists the problem. Do not delete broadly by deck prefix or use the
general test-vault reset command as a substitute for inspecting the report.

## Reports and failures

Artifacts are written under `.native-test-results/<id>/` (gitignored):

- `lint.txt` and `build.txt`: check output (build omitted with `--skip-build`).
- `report.json` and `report.md`: passed/failed stages and cleanup errors.
- `restore.json`: original settings and active note, plus the run's profile,
  fixture path, deck, and ownership tag.
- `evidence.json` or `failure-state.json`: note contents, scope, notices, and
  actual settings DOM.
- `final.png` or `failure.png`: screenshot from Obsidian's developer CLI, when
  available. The CLI may capture the main window rather than a separate
  settings window; the settings DOM in the evidence file covers that case.
- `obsidian-errors.txt`: captured Obsidian errors, which can include earlier
  errors from the app session.
- `cleanup-note-ids.json`: the exact note IDs considered for run-owned cleanup.

A `.native-test-results/scope.lock` file prevents concurrent runs. If a process
was killed, first verify the recorded PID is no longer running and inspect
`restore.json` and the owned paths before removing a stale lock. Interrupted
cleanup may require restoring the recorded settings and removing only the
recorded run's fixtures/cards in the dedicated profile.

## Recover an interrupted run

After selecting the same dedicated profile and reopening the test vault, use
the run ID from its report:

```sh
npm run test:native:scope -- --anki-profile=Test --recover=<32-character-run-id>
```

Recovery validates the saved journal against the exact vault path, profile,
fixture root, deck, and tag. It runs only cleanup and settings restoration; it
does not create new fixtures or sync cards. The earlier report is preserved as
`report-before-recovery.json`. A stale lock must be inspected and removed first,
as described above. Recover an interrupted run before starting another one so
an old settings snapshot cannot replace newer test configuration.

## Maintenance

`scripts/native/obsidian.ts` owns CLI transport and lint/build logs; `anki.ts`
owns profile and deletion guards. `scope-runner.ts` owns scenario assertions,
journaling, and cleanup. Reuse the transport and guards for new scenarios.

The host script in `scripts/native/scope-host.js` uses Obsidian's actual DOM and
some internal UI hooks, such as settings tab navigation and file explorer
reveal. Keep those details in the test harness rather than the shipping plugin.
Obsidian updates can change these hooks; failures should report the missing
control rather than silently bypassing the UI with a direct settings mutation.

The profile and note-ownership guards have unit tests in
`tests/native/anki-safety.test.ts`. Keep those tests in the ordinary check suite.

References: [Obsidian CLI](https://obsidian.md/help/cli) and
[AnkiConnect](https://git.sr.ht/~foosoft/anki-connect). The installed CLI's
`--help` and AnkiConnect's `apiReflect` action identify the commands actually
available in the running applications.
