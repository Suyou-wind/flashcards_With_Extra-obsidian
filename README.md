# Flashcards

[![Latest release](https://img.shields.io/github/v/release/reuseman/flashcards-obsidian?style=for-the-badge&sort=semver)](https://github.com/reuseman/flashcards-obsidian/releases/latest)
![Total downloads](https://img.shields.io/github/downloads/reuseman/flashcards-obsidian/total?style=for-the-badge)

![Flashcards logo](logo.png)

Create Anki flashcards in [Obsidian](https://obsidian.md/) with normal
Markdown. Review them in Anki and keep Obsidian as the source of truth.

This README describes Flashcards v2. The previous implementation and its
documentation remain available on the [legacy v1 branch](https://github.com/reuseman/flashcards-obsidian/tree/v1).

## How it works

You write and organize cards in Obsidian. The plugin creates or updates the
matching notes in Anki.

- Obsidian owns card content, card type, deck, and authored tags.
- Anki owns review history and scheduling.
- Cards created directly in Anki are not changed.
- Each Anki card links back to its exact source in Obsidian.

This is one-way authoring, not two-way editing. If you change a linked card in
Anki, the next update restores the content from Obsidian.

## Requirements

- Obsidian 1.13.0 or newer.
- The desktop version of Anki.
- The [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159).
- Anki running when you update cards. If it is closed, Flashcards starts it for
  you and waits — see [Starting Anki](#starting-anki).

## Install

1. In Obsidian, open **Settings → Community plugins**.
2. Select **Browse**, search for **Flashcards**, and install the plugin.
3. Enable **Flashcards**.
4. In Anki, open **Tools → Add-ons → Get Add-ons**.
5. Enter the AnkiConnect code `2055492159` and restart Anki.
6. Keep Anki open while updating cards from Obsidian, or let Flashcards start
   it for you.

Flashcards 2.0.1 and later work with AnkiConnect's default settings. You do not
need to add `app://obsidian.md` to `webCorsOriginList`.

AnkiConnect uses `http://127.0.0.1:8765` by default. If you set an AnkiConnect
API key, select the secret containing that key in the Flashcards settings.

### Starting Anki

If Anki is closed when you update cards, Flashcards starts it and continues the
update as soon as AnkiConnect answers — no need to re-run the command. Click the
waiting notice to cancel.

Settings live under **Anki connection**:

- **Start Anki automatically** — on by default. Turn it off to be prompted to
  start Anki yourself instead; the update still resumes once Anki is up.
- **Anki launch command** — leave empty to use the standard install location
  (`/Applications/Anki.app` on macOS, `%LOCALAPPDATA%\Programs\Anki\anki.exe`
  on Windows, `anki` on `PATH` or the flatpak export on Linux). Set it for an
  AppImage, a custom prefix, or flatpak (`flatpak run net.ankiweb.Anki`). Quote
  paths containing spaces.
- **Wait for Anki** — how long an update waits before giving up. Default 60s.
- **Test** — checks the connection, starting Anki if needed, and reports what
  happened. Use it after changing the launch command.

A profile password prompt or Anki's own AnkiWeb sync dialog holds AnkiConnect
back until you dismiss it; if that takes longer than the wait, run the command
again once Anki is ready.

### AnkiConnect connection problems

If Flashcards cannot reach AnkiConnect:

1. In **Obsidian → Settings → Community plugins**, check for updates and update
   Flashcards to 2.0.1 or later. Restart Obsidian after updating.
2. Open Anki and confirm that AnkiConnect appears under **Tools → Add-ons**.
3. Restart Anki if you installed or changed AnkiConnect.
4. Open <http://127.0.0.1:8765> in a browser. It should show `Anki-Connect`.
   This checks that AnkiConnect is running. Then try updating your cards again.

## Quick start

Write a basic card in any Markdown note:

```markdown
What is the capital of France?::Paris
```

Keep Anki open. Then run **Flashcards: Update Anki from current note** from the
Obsidian command palette. You can also use the Flashcards button in the left
sidebar.

The plugin adds a small `^q-xxxx` anchor and a managed `flashcards` property.
They connect the Obsidian card to its Anki note. Do not edit them by hand.

## Card types

### Basic

```markdown
What does HTTP mean?::Hypertext Transfer Protocol
```

### Reversed

```markdown
TCP:::Transmission Control Protocol
```

A reversed note creates cards in both directions. Use it only when both
directions are useful.

### Cloze

```markdown
The mitochondria is the ==powerhouse== of the cell.
The {1:heart} pumps blood through the {1:circulatory system}.
```

`==text==` creates numbered clozes in source order. `{N:text}` lets you choose
the number. Reuse a number when several parts should be hidden together.

### Heading card

```markdown
## What is recursion? #card

A function that calls itself and has a base case.
```

A heading card can contain several paragraphs, lists, code blocks, and lower
headings. The next heading at the same or a higher level ends the answer.

### Reminder

```markdown
Prefer reversible decisions when uncertainty is high. #card-reminder
```

A reminder has one piece of content and no answer. It returns through Anki's
normal schedule.

### Explicit multi-line card

````markdown
```flashcard
front: What does CSS stand for?
back: Cascading Style Sheets
type: reversed
```
````

The default `type` is `basic`. Other values are `reversed`, `cloze`, and
`reminder`. Reminder blocks use `content:` instead of `front:` and `back:`.

The plugin also supports card callouts, cards in lists, and atomic note cards.
See the [v2 wiki](docs/wiki.md) for their exact rules and examples.

## Markdown content

Cards can contain:

- emphasis, links, lists, quotes, and code;
- LaTeX math;
- Obsidian wikilinks, including heading and block links;
- images and audio attachments.

Card markers inside code, math, HTML comments, and ordinary blockquotes are not
parsed as new cards.

## Decks, tags, and context

Set a deck for one note with frontmatter:

```yaml
---
cards-deck: Knowledge::Biology
tags:
  - biology
  - exam
---
```

By default:

- the note folder selects the deck when `cards-deck` is absent;
- the fallback deck is `Default`;
- every card gets the `obsidian` tag;
- parent headings appear as context above the review question;
- removing a linked card asks for confirmation before Anki deletes it.

You can change these defaults in the Flashcards settings.

## Commands

- **Flashcards: Update Anki from current note** updates the active note.
- **Flashcards: Update Anki from vault** updates every eligible Markdown note in the vault.
- **Flashcards: Check vault for v2 syntax migration** reports old syntax in eligible notes and
  opens its source without changing files.
- **Flashcards: Apply v2 Anki card style** previews, backs up, and updates
  compatible managed Anki note types.

Running an update again does not duplicate unchanged cards. Vault updates keep
a disposable index to skip unchanged notes, verifying existing cards against
Anki before reusing their cached state. Deleting the index is safe; the next
update rebuilds it.

## Choose which notes sync

Under **Settings → Flashcards → Sync scope**, choose included folders, excluded
folders, and excluded notes. Empty included folders means the whole vault;
folder rules cover descendants, and exclusions always win.

Exclusions apply to both update commands and the ribbon button. Right-click a
note to **Exclude from Flashcards sync**, or use the searchable settings picker
to add several notes at once. Excluded notes are grouped by folder in settings.
An attempted update of an excluded note explains the reason and offers access
to the scope editor.

Existing Anki cards are kept when a note is excluded. Explicit rules follow
renames and moves made while the plugin is running in Obsidian.
See the [sync scope guide](docs/USAGE.md#choose-which-notes-sync) for examples,
rule precedence, and missing-path handling.

## Existing cards and v1 notes

Normal updates preserve Anki scheduling and review history when the note can be
changed in place. Destructive changes ask first by default.

V2 uses one strict syntax. Run **Flashcards: Check vault for v2 syntax
migration** to find old markers and open each source location. The report is
read-only.

## Documentation

- [V2 wiki](docs/wiki.md): complete syntax, defaults, and edge cases.
- [Usage guide](docs/USAGE.md): setup and detailed update behavior.
- [Syntax gallery](https://reuseman.github.io/flashcards-obsidian/): visual reference for authoring forms,
  parsed fields, card counts, and source boundaries.

## Optional agent skill

The repository includes
[`$create-obsidian-flashcards`](.agents/skills/create-obsidian-flashcards/SKILL.md)
for compatible coding agents. It can turn source notes into a selective set of
retrieval cards, choose supported v2 syntax, and revise weak cards. It does not
write the plugin's managed IDs or update Anki unless you ask.

## Support

If Flashcards is useful to you, you can support its development:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V0ABKAF)
