---
cards-deck: Flashcards Tests::Issue 233 Cloze Scroll
tags:
  - issue_233_scroll_demo
---

# Issue 233 — cloze answer scroll

This is deliberately oversized to reproduce a scrolling bug, not a recommended
card design. Open the card in Anki, keep the question at the top, and reveal the
answer. The broken template jumps to EXTRA INFORMATION, hiding the answer above.
Scroll back up to find the revealed word. A short review window makes it obvious.

```flashcard
type: cloze
front: **Watch this sentence when you reveal the answer.**

The capital of France is {1:Paris}.

### Spacer 01

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 02

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 03

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 04

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 05

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 06

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 07

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 08

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 09

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 10

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 11

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 12

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 13

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 14

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 15

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 16

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 17

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

### Spacer 18

This paragraph makes the card taller than the review window. It is only layout filler; the missing word is near the top.

back: ## EXTRA INFORMATION — the unwanted scroll destination

If this section jumps into view when you reveal the answer, you have reproduced
issue 233. The revealed word is in the sentence near the top, not in this section.

Scroll up to find it. Do not rate the card if you only want to inspect the bug.
```
