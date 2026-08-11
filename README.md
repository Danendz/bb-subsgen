# bb-subsgen

Hover pinyin + CC-CEDICT glosses over Bilibili subtitles. A Chrome MV3 extension —
no backend, no account, works fully offline after install.

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
