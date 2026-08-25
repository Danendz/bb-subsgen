# Architecture invariants

Constraints that are invisible from the file you are editing. Most of these compile cleanly, pass
the test suite, and fail only in a real browser — which is why they are written down.

## Origin rules

**Anything that fetches `localhost` must run on the extension origin** — the service worker, the
offscreen document, or an extension page. A content script carries the *page's* origin, and
Chrome's private-network rules block a public page from reaching localhost at all. There is no
CORS header that fixes this. If a content script needs an LLM or ASR result, it sends a message
and the worker does the fetch.

**The reverse holds for site CDNs.** Bilibili audio can only be fetched by the page, so the
content script resolves an `AudioSource` and hands the answer to the worker rather than the
worker guessing a URL.

Both directions are already reasoned out in the headers of `src/llm/client.ts`,
`src/background/llm-translate.ts` and `src/offscreen/main.ts`.

## Which UI toolkit goes where

**No Preact in `src/content/` or `src/reader/`.** Those surfaces are imperative DOM inside a
shadow root attached to somebody else's page; they hide the native subtitles and return a
`teardown`. Preact belongs to `src/app/`, `src/popup/` and `src/settings/`.

The page reader modifies no page markup — it uses `caretPositionFromPoint` and the CSS Custom
Highlight API. Anything that would insert or rewrite nodes in the host page is the wrong approach.

## Stored data

Five IndexedDB databases, separated by how bad it is to lose them:

| Database | Contents | Losing it means |
|---|---|---|
| `bb-subsgen` | dictionary: definitions, lexicon text and per-language install state, all keyed by language (schema 2, `src/dict/store.ts`) | re-download from the setup wizard |
| `bb-subsgen-llm` | debug log of model calls | nothing |
| `bb-subsgen-chat` | conversations | annoying |
| `bb-subsgen-flashcards` | review history; every key carries its language since schema 4 — card ids are `w:zh:生`, and `exposures` / `videoWords` / `ranks` key on `[lang, headword]` (`src/flashcards/db.ts`) | **irreplaceable** |
| `bb-subsgen-flashcards-snapshots` | the deck as it stood before each schema migration, one JSON string per version bump (`src/flashcards/snapshot.ts`) | the undo for a bad migration |

Bumping a `VERSION` requires a numbered migration note in the module header, next to the ones
already there. Treat the flashcards database as data you cannot regenerate: migrations there get
a test.

**Migration steps run one after another, never all at once.** `sequence()` in
`src/flashcards/db.ts` is what enforces it. A database several versions behind runs every
transform it is behind inside one versionchange transaction, and two of them touch the same
store: v3 drops and recreates `videoWords`, v4 does it again. Start both reads at once and the
second is against a store the first is about to delete, which aborts the transaction and takes
the whole upgrade with it. The quieter half is the same hazard for cursor walks — a `getAll`
issued beside a running cursor is served before that cursor's later `continue`s.

**The snapshot happens before the open, not inside the migration.** An IDB transaction is scoped
to one database, so a versionchange transaction on the deck physically cannot write the copy
anywhere else. `flashcardsDb`'s opener runs `snapshotIfOutdated` first, against a separate
connection at the old version. It probes with `indexedDB.databases()` rather than a bare
`indexedDB.open(name)` — a bare open on a fresh profile *creates* an empty v1 database, which the
`oldVersion >= 1` branch would then mistake for an existing deck.

All five go through the thin wrapper in `src/shared/idb.ts` rather than raw IndexedDB — including
the connection itself. `connection()` there owns the memo, the `onversionchange` / `onclose`
handlers and the probe that catches a connection which died without firing either. Do not
re-introduce a per-module `let ready` memo: four of them had one, all four handed out a dead
connection after an MV3 worker began teardown, and the fix only holds in one place.

## `src/lang/`

Everything that knows what language the text is in. One directory per language: `src/lang/zh/`
holds the Chinese implementation — the segmenter, the tone and reading rules, the CC-CEDICT entry
ranking, the grammar pattern table, the sentence terminators and the hover match. Everything
directly under `src/lang/` is language-neutral.

`src/lang/ja/` is the second one, added in #14: script classification, furigana alignment, the
JMdict entry ranking, a longest-match segmenter and the sentence terminators. It is a language
rather than a directory of modules because `PACKS` names it — `packs.test.ts` is what ties that to
there being a `ja` dictionary to download.

**A second pack shares an interface, not an algorithm.** `zh/segment.ts` scores whole parses and
`ja/segment.ts` is a plain longest match, because the two languages are hard in different places;
`zh/entries.ts` puts every ranking signal in `rank` and `ja/entries.ts` cannot, because whether a
spelling is the common one is a fact about a JMdict row and an `Entry` has nowhere to keep it. Both
of those are the interface working, not being worked around. What is *not* allowed is widening
`Entry` or `Tag` so that one language's fields ride on every language's shape.

Three files carry the split, modelled on `Site` / `siteFor` in `src/media/`:

- `pack.ts` — the `LanguagePack` interface and the vocabulary that goes with it. Imports no
  implementation.
- `packs.ts` — `PACKS` and `packFor(code)`, which is null for a code with no pack. Separate from
  `pack.ts` for the reason `sites.ts` is separate from `site.ts`: so that everything needing only
  the shape does not pull in every language.
- `zh/pack.ts` and `ja/pack.ts` — `chinesePack` and `japanesePack`, each assembled from the
  modules beside it, and each the only file in its directory anything outside reaches.

`PACKS` and `DICT_SOURCES` (`src/dict/sources.ts`) are keyed by the same codes and neither imports
the other — otherwise the popup and the badge, which only ever ask where a dictionary is
downloaded from, would transitively import a segmenter. `src/lang/packs.test.ts` asserts their key
sets agree, which is the part that has to stay true.

**Two levels, as `Site` → `Video` is two levels.** A `LanguagePack` is stateless and says what is
true of the language. `pack.load(raw)` returns a `Lexicon` whose methods close over the parsed
download, and which carries its own `pack` back-reference so code holding one never has to be
handed both. That split is what lets a language keep a private index — a deinflection table, a
reading map — without widening a record every other language would then carry.

**Nothing outside a language's directory imports a module from inside it.** That is the point of
the directory: an import of `zh/segment` from `reader/` is a Chinese assumption that compiles
cleanly and is invisible from the file it sits in, and `ja/script` would be the same the other
way round. The exceptions are the surfaces the PRD pins to Chinese
on purpose, and each says so where it names the language:

- `src/youtube/language.ts` and `src/llm/glossary.ts` reach Chinese through `packFor('zh')` rather
  than by importing the table, so the surviving `'zh'` literals read as an inventory of what is
  still pinned. `src/background/flashcards-store.ts` no longer belongs here: #12 gave the deck a
  language, so it resolves `packFor(lang)` from what the caller sends.
- `src/dict/cedict.ts` and `src/dict/jmdict.ts` are the two dictionaries' parsers, and each is its
  language by definition. They import from `src/lang/<code>/` — that is the direction that is
  allowed; nothing in `src/lang/` imports either of them.
Tests may import a language's modules directly — a fixture has to name a language.

## `src/dict/`

The dictionary, end to end: `sources.ts` is the registry of downloadable sources (one per
language), `store.ts` is the schema-2 database above, and `install.ts` streams a download straight
into it.

**One installer, two formats.** `install.ts` owns the download, the `DEFS_CHUNK_SIZE` chunking and
the rule that `meta` is written last; it reads no format. `parser.ts` is the `DictParser` seam —
`push` / `finish` / `lexiconText` — and `cedict.ts` and `jmdict.ts` implement it. The shape is
incremental because a record is a line in one format and a multi-line `<entry>` block in the other,
so where a record ends is the parser's answer and not the installer's.

`parsers.ts` maps a language to its parser, and is imported by `install.ts` and nothing else. It is
deliberately not a function field on `DictSource`, for the reason `packs.ts` records against
merging itself into `sources.ts`: the popup and the badge import `sources.ts` to ask where a
dictionary comes from, and a parser hanging off that record would pull every format into both of
their bundles.

There is no `DOMParser` in the `node` suite, so `jmdict.ts` is a hand-rolled regex parser over
strings. Reaching for jsdom to parse 63MB of XML is the smell `.claude/rules/testing.md` names, and
a fragment parse does not reliably expand JMdict's DTD entities — which is where every
part-of-speech code lives.

**The store holds opaque rows.** `DictRow` is `unknown`, and what a row *is* belongs to the
language — `src/lang/zh/cedict-row.ts` for Chinese, with a hand-written guard because a row read
back out of IndexedDB was written by whichever install ran last. `pack.entriesFrom` is the only
place a row's fields are read; everything downstream of the `bb-subsgen:lookup-defs` reply holds
an `Entry`. Converting at install time instead and storing `Entry` directly would bake the
traditional/simplified choice into the database, and flipping that setting would become a
re-install — the hover card reads it live today. Nothing here is a build step — everything runs
in the extension at install time, from `src/app/SetupWizard.tsx`, which is why `install.ts` takes
`fetch` as an injected parameter rather than calling the global (`.claude/rules/testing.md`).

## The setup surface

`src/app/SetupWizard.tsx` (route `#/setup`) is deliberately **not** one of the tabs in
`src/app/App.tsx`'s `TABS` array — it's reached from the popup when nothing is installed, and
from a link in Settings, not from primary navigation. The wizard runs the download itself rather
than asking the service worker to: the import is seconds of solid CPU, and an MV3 worker can be
idle-terminated or killed under memory pressure mid-write, where an extension page cannot.

## Build-time shape

- `src/reader/main.ts` must stay a self-contained IIFE. It is listed in `standaloneFiles` in
  `vite.config.ts` because it is registered at runtime rather than declared in the manifest, so
  it cannot rely on module imports being loaded for it.
- A new HTML entry point needs a `rollupOptions.input` entry whenever the manifest does not name
  it. That is why `flashcards` and `offscreen` are listed there explicitly.

## Routing

The app is a `chrome-extension://` page with no server behind it, so a real path would 404 on
reload. Routing is hash-based, via `useRoute()` / `navigate()` in `src/app/hooks.ts`.

## Settings

`chrome.storage`, through `src/shared/settings.ts` (`DEFAULT_SETTINGS`, `loadSettings`,
`saveSettings(patch)` as read-modify-write, `onSettingsChanged`). A new setting needs a default
there. In UI, go through `useSettings()` in `src/settings/useSettings.ts`, which reconciles
optimistic local edits against storage echoes — writing to `chrome.storage` directly from a
component reintroduces the flicker that hook exists to remove.

## Licensing

The dictionary derives from CC-CEDICT, which is CC BY-SA 4.0. Attribution is required wherever
the derived data is shown or redistributed.
