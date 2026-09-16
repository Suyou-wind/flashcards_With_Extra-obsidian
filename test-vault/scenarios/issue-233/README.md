# Issue 233: cloze answer scrolling

Use `cloze-scroll.md` as an intentionally long test card. Its fenced `front`
becomes Text; `back` becomes Extra. The cloze answer is near the top.

1. Use the test vault and a dedicated Anki test profile. Include this folder in
   sync scope if necessary, then update Anki from `cloze-scroll.md`.
2. Open deck **Flashcards Tests::Issue 233 Cloze Scroll**. Keep the question at
   the top and reveal the answer without rating the card.
3. With the old template, the view jumps down to **EXTRA INFORMATION**, hiding
   the revealed word above. Use a short review window if needed.
4. Run **Flashcards: Apply v2 Anki card style** in Obsidian. Confirm the preview;
   this backs up and replaces the listed models' templates and CSS.
5. Reopen the card's question, then reveal it. It should no longer jump to Extra.
   The divider and Extra text remain; note/card IDs and scheduling stay intact.

New Anki models use the corrected template immediately. Normal sync preserves
existing templates. The old cloze template has `id="answer"` on the divider
before Extra; the corrected template has no answer ID anywhere on the cloze card.
Basic and reversed cards still use that ID at their actual answer boundary.

Keep committed fixtures free of generated anchors and identity metadata. For
live demos, sync a copy under the ignored `scenarios/native-scope/` folder.
