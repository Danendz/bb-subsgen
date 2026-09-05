# bb-subsgen

Learn Chinese or Japanese from the videos and pages you already watch and read.

Hover any word for its reading and what it means — pinyin over hanzi, furigana over
kanji — and every word you look up becomes a flashcard you review later.

A Chrome extension that runs entirely on your machine. No account, no server, works
offline.

## What it does

- **Video subtitles** — on Bilibili and YouTube, the player's own track re-rendered with
  the reading over each word and a dictionary card on hover.
  [More](docs/reader.md#video-subtitles)
- **Page reader** — hold Shift on any site you opt into and point at a word for the same
  card. Select a phrase for a segmented card with its translation.
  [More](docs/reader.md#page-reader)
- **Flashcards** — everything you look up is kept and paced into a deck a few cards a
  day, so an evening's watching doesn't bury you. [More](docs/flashcards.md)
- **Two languages, per site** — Chinese from CC-CEDICT, Japanese from JMdict, with
  conjugations resolved back to the dictionary form. Which language a site is read in is
  a property of that site, so a Japanese blog and a Chinese one can both be open.
  [More](docs/reader.md#which-language-a-page-is-read-in)
- **Videos with no subtitles** — transcribed from the audio.
  *Needs a local speech server* — [see docs](docs/local-models.md)
- **Chat tutor and better translation** — ask about a line you didn't get.
  *Needs a local model server* — [see docs](docs/local-models.md)

The last two are off until you set them up. Everything above them works with nothing
installed but the extension.

## Install

Not on the Chrome Web Store — build it yourself:

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and
pick the `dist/` folder.

The first run opens a wizard: pick the languages you study and it downloads their
dictionaries — 3.9MB from MDBG for Chinese, 10.5MB from the EDRDG for Japanese. After
that nothing leaves your machine.

Open the flashcards app from the extension popup. The page reader is off everywhere until
you enable it per site, also from the popup.

## Development

```sh
npm run dev        # Vite; load dist/ unpacked
npm test           # Vitest, single run
npx tsc --noEmit   # typecheck
npm run format     # Prettier; CI checks this with `npm run format:check`
npm run services   # the local ASR / LLM / yt-dlp processes, together
```

Conventions are written down in `CLAUDE.md` and `.claude/rules/` — worth reading before a
first change, agent or not. Nearly every module opens with a comment explaining why it
exists and what it deliberately is not; that's where the reasoning lives.

## Attribution

No dictionary or word list ships in the extension; each is downloaded from its own
host when you install it.

Definitions come from [CC-CEDICT](https://cc-cedict.org), © MDBG and contributors,
and from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), © the Electronic
Dictionary Research and Development Group. Both are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The optional Chinese word lists come from
[complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary),
© Yanis Zafirópulos, [MIT](https://opensource.org/licenses/MIT); their frequency
data derives from [SUBTLEX-CH](http://crr.ugent.be/programs-data/subtitle-frequencies).
