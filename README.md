# bb-subsgen

Hover pinyin + CC-CEDICT glosses over Chinese text. A Chrome MV3 extension —
no backend, no account. A first-run wizard downloads the ~4MB CC-CEDICT export
from MDBG; everything after that runs offline.

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

Every word rendered on screen is *counted*, which is what powers "seen 12× in
this video" and the per-video coverage figure. What gets *collected* is a
subtitle line still containing a word you don't know, together with those words —
each carrying the sentence it was met in, and on Bilibili its timestamp, so a
card can send you back to ten seconds before the line to hear it again.

Collecting is generous; intake is not. Lines and words both wait in a pool and
are let into the deck a few a day: lines fewest-unknown-words first, so the most
learnable thing you have collected comes next; words most-seen first, so an
evening's watching offers up the vocabulary that actually kept recurring in it.
That's what lets capture take hundreds of lines a night while the deck still
only grows by the daily limit.

Stopping on a word is the exception. Hovering one puts it straight into the
deck — that lookup says more than any amount of passing exposure — and it pulls
a word out of the pool if it was waiting there.

Reviews answer one question — did you get it or not — and each card climbs a
seven-rung ladder, one rung up for right and one down for wrong, so the rung
itself is the mastery the app shows you. Choose how you're asked (recall, typing,
audio, or all three in rotation), what's included, and how many cards a sitting
takes.

A sitting is never empty. Once what's due and the day's new material run out,
the rest is filled with practice drawn from the deck — coldest first, most
frequent among cards last met on the same day, so it works through everything
you've collected rather than the same twenty words each time. Practice doesn't
move a card up the ladder: answering early shows you know it today, which isn't
what the interval claimed. Getting one wrong does count, because failing a card
ahead of its due date says the interval was too long.

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

No word list ships with the extension — every usable frequency or HSK list
belongs to someone, so you supply your own and nothing is redistributed. Load
one from the app's **Data** screen, which lists where to get them, what their
licences are, and which file to take. Without one everything still works; new
cards are simply introduced in the order you found them.

## Development

```sh
npm install
npm run dev
npm test
npm run format     # Prettier; CI checks this with `npm run format:check`
```

Load `dist/` as an unpacked extension via `chrome://extensions`.

The tree was reformatted with Prettier in one commit, which `git blame` will
otherwise attribute every touched line to. Look past it with:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Conventions for this codebase are written down in `CLAUDE.md` and
`.claude/rules/` — worth reading before a first change, agent or not.

## Attribution

Dictionary data is derived from [CC-CEDICT](https://cc-cedict.org), © MDBG and
contributors, licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
