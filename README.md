# bb-subsgen

Hover pinyin + CC-CEDICT glosses over Chinese text. A Chrome MV3 extension —
no backend, no account, works fully offline after install.

Two ways in:

- **Bilibili subtitles** — the player's subtitle track, re-rendered with pinyin
  above each word and a dictionary card on hover.
- **Page reader** — hold Shift on any site you opt into and point at a word to
  get the same card; click it for a per-character breakdown, or select a phrase
  for a segmented card with its translation. The reader modifies no page markup:
  it finds words with `caretPositionFromPoint` and marks them with the CSS
  Custom Highlight API, so nothing breaks on dynamic sites.

The reader is off everywhere until you enable it per site from the extension
popup, which is also where Chrome asks for access to that origin. Sentence
translation uses Chrome's on-device Translator API (desktop Chrome 138+); where
it isn't available the card simply renders without it.

## Development

```sh
npm install
npm run build:dict   # regenerate public/dict/{words.bin,defs.json} from tools/data/cedict_ts.u8
npm run dev
npm test
```

Load `dist/` as an unpacked extension via `chrome://extensions`.

## Attribution

Dictionary data is derived from [CC-CEDICT](https://cc-cedict.org), © MDBG and
contributors, licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
