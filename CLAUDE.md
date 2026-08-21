# bb-subsgen

A Chrome MV3 extension that puts hover pinyin and CC-CEDICT glosses over Chinese text — on
Bilibili and YouTube subtitles, on opted-in web pages, and in a flashcards app. Chromium only.
No backend, no accounts; the only network calls go to `localhost`.

## Commands

| | |
|---|---|
| `npm run dev` | Vite dev server; load `dist/` unpacked in Chrome |
| `npx tsc --noEmit` | Typecheck. Run this, not `npm run build`, to check types |
| `npm test` | Vitest, single run |
| `npm run build:dict` | Regenerates `public/dict/`. **Must run before `build` on a fresh checkout** — `public/dict/` is gitignored and the manifest declares `dict/words.bin`, so crxjs refuses to bundle without it |
| `npm run build` | `tsc && vite build` |
| `npm run format` | Prettier, write |
| `npm run format:check` | Prettier, check only. This is what CI runs |
| `npm run ytdlp` | Local yt-dlp helper; YouTube audio needs it |
| `npm run services` | Supervises the ASR, LLM and yt-dlp processes together |

## Before you claim something works

Run `npx tsc --noEmit`, `npm test` and `npm run format:check`. Say which of them you ran and
what they reported. The test suite is `node`-environment and never opens a browser, so it cannot
tell you the extension works — if you did not load it in Chrome, say so rather than implying
otherwise.

## Rules

Always in effect:

@.claude/rules/code-style.md
@.claude/rules/comments-and-commits.md

Read before working in the area:

- `.claude/rules/architecture.md` — adding a module or surface, or changing stored data
- `.claude/rules/messaging.md` — any new or changed cross-context message
- `.claude/rules/testing.md` — writing or changing tests
- `.claude/rules/llm-and-asr.md` — `src/llm/`, `src/background/asr-pass.ts`, prompts
- `.claude/rules/maintaining-rules.md` — **changing any of these files, including this one**

These files are expected to change as the project does. `maintaining-rules.md` lists which
change obliges which update, and the bar a new rule has to clear.

## Where the reasoning lives

This codebase argues for its decisions in source. Nearly every module opens with a comment
explaining why it exists and what it deliberately is not. Read that header before changing the
module — these rule files deliberately do not duplicate it, because a copy goes stale and the
original does not.
