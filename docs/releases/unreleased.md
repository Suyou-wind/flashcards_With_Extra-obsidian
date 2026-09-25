# Unreleased

## Extra content on reversed cards

A fenced reversed card can now carry an optional `extra:` field. Its text
appears on the back of both generated cards, below the answer. This mirrors
yanki's optional "extra" content while keeping Flashcards' many-cards-per-file
model, so one note can hold any number of reversed cards, each with its own
`extra:`.

`extra:` is recognised only on `type: reversed` fenced cards. On any other type
it is ignored with a warning, and an empty `extra:` is treated as absent. The
Anki `Extra` field is added to existing `Obsidian-basic-reversed` notes in
place via `modelFieldAdd`, and `{{#Extra}}` conditional rendering keeps the
back of old cards unchanged, so review history is preserved.
