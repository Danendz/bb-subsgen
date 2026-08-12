# bb-subsgen

Hover pinyin + CC-CEDICT glosses over Chinese text. A Chrome MV3 extension —
no backend, no account, works fully offline after install.

Two ways in:

- **Bilibili subtitles** — the player's subtitle track, re-rendered with pinyin
  above each word and a dictionary card on hover, characters broken down and all.
- **Page reader** — hold Shift on any site you opt into and point at a word to
  get the same card, characters broken down and all. Select a phrase — by
  dragging or by double-clicking — for a segmented card with its translation,
  and hover any word inside it for that word's own card.

While Shift is down the page turns selectable: links stop dragging, text a site
marked unselectable can be selected, and clicks don't reach the page, so
selecting a headline never navigates. Let go and the site behaves normally
again. The reader modifies no page markup — it finds words with
`caretPositionFromPoint`, reaching into shadow roots for sites like Bilibili's
comments, and marks them with the CSS Custom Highlight API, so nothing breaks
on dynamic sites.

The reader is off everywhere until you enable it per site from the extension
popup, which is also where Chrome asks for access to that origin. Sentence
translation uses Chrome's on-device Translator API (desktop Chrome 138+); where
it isn't available the card simply renders without it.

## Flashcards

Everything you look up is kept, and reviewed in an app that opens from the popup
(**Open flashcards**). It's a page inside the extension — no account, no server,
and it works offline.

Two tiers. Every word rendered on screen is *counted*, which is what powers "seen
12× in this video" and the per-video coverage figure. Only words you actually
stop on are *collected* into the deck, carrying the sentence they were met in —
and, on Bilibili, its timestamp, so a card can send you back to ten seconds
before the line to hear it again.

Subtitle lines are kept whenever they still contain a word you don't know. Early
on that's nearly every line; as your known set grows the same rule quietly
narrows to the lines still worth stopping for. Captured lines wait in a pool and
are let into the deck a few a day, fewest-unknown-words first — so an evening's
watching can collect hundreds of lines and the deck still only grows by the
daily limit, always offering the most learnable thing in it.

Reviews are SM-2, with words asked three ways in rotation: recognise it, type it,
or hear it. Sentences are clozed when exactly one word in them is unknown.

As words become known, the overlay stops annotating them — pinyin disappears from
words you've declared known or reviewed to maturity, and a line whose words you
all know loses its translation too. Hovering always brings both back, and doing
so is itself taken as a signal that the line was harder than its vocabulary
suggested, so it gets kept. **Alt+Q** hides everything at once, for testing
yourself against a video.

Moving between browsers is export and import. Import merges rather than
overwrites: the review logs from both sides are combined and the schedule
recomputed from them, so studying done on another machine still counts. You're
only asked about words declared known on one side and not the other.

## Development

```sh
npm install
npm run build:dict   # regenerate public/dict/{words.bin,defs.json} from tools/data/cedict_ts.u8
npm run dev
npm test
```

`build:dict` also emits `rank.bin` if you supply frequency or HSK data, which
enables frequency-ordered card introduction and the HSK progress bars. Neither
list ships with the repo — unlike CC-CEDICT, their redistribution terms need
checking first. Drop in either or both and re-run it:

- `tools/data/frequency.txt` — one word per line, most frequent first
- `tools/data/hsk.tsv` — `word<TAB>level` per line

Without them everything still works; cards are simply introduced in the order
you found them.

Load `dist/` as an unpacked extension via `chrome://extensions`.

## Attribution

Dictionary data is derived from [CC-CEDICT](https://cc-cedict.org), © MDBG and
contributors, licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
