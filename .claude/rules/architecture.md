# Architecture invariants

Constraints that are invisible from the file you are editing. Most of these compile cleanly,
pass the test suite, and fail only in a real browser — which is why they are written down.

Where a module header already argues a point, this file points at it rather than restating
it. A copy goes stale; the original does not.

## Origin rules

**Anything that fetches `localhost` must run on the extension origin** — the service worker,
the offscreen document, or an extension page. A content script carries the *page's* origin,
and Chrome's private-network rules block a public page from reaching localhost at all. There
is no CORS header that fixes this. If a content script needs an LLM or ASR result, it sends a
message and the worker does the fetch.

**The reverse holds for site CDNs.** Bilibili audio can only be fetched by the page, so the
content script resolves an `AudioSource` and hands the answer to the worker rather than the
worker guessing a URL.

Both directions are reasoned out in the headers of `src/llm/client.ts`,
`src/background/llm-translate.ts` and `src/offscreen/main.ts`.

**Chrome's Translator API is the mirror image of both.** It does not exist in a
worker at all (`src/lang/translate.ts`), so the service worker can neither translate a
subtitle nor a dictionary gloss — but the `glosses` cache lives in IndexedDB on the
extension origin, which a content script cannot reach. So the *caller* translates and the
*worker* remembers: `bb-subsgen:lookup-glosses` reads the cache and
`bb-subsgen:put-glosses` writes it, with `translatedGlosses` in `src/shared/dict-client.ts`
tying the two together for both surfaces. Anything that moves the translating into the
worker will compile and then find no `Translator` at runtime.

## Which UI toolkit goes where

**No Preact in `src/content/` or `src/reader/`.** Those surfaces are imperative DOM inside a
shadow root attached to somebody else's page; they hide the native subtitles and return a
`teardown`. Preact belongs to `src/app/`, `src/popup/` and `src/settings/`.

The page reader modifies no page markup — it uses `caretPositionFromPoint` and the CSS Custom
Highlight API. Anything that would insert or rewrite nodes in the host page is the wrong
approach.

## Where a colour comes from

Plain CSS, no preprocessor and no utility framework — deliberately, because `src/settings/`
renders the same markup into the popup and into the app and only the stylesheets differ. Tailwind
or CSS modules would put the styling in the component and take that away.

Three files, and a new value belongs in exactly one of them:

- **`src/shared/tokens.css`** — the palette, the type stacks, the radii, and the density tokens
  (`--rail-w`, `--row-y`, `--r-ctl`, `--lip`/`--lip-sunk`, `--btn-size`/`--btn-pad`, `--grow-min`,
  `--range-w`, `--url-w`). Every extension page imports it. A hardcoded hex in a page stylesheet
  is a bug waiting for the second page to disagree.
- **`src/settings/skin.css`** — the control base (`button`, inputs, `:focus-visible`, `.panel`)
  and the shared settings rows. Imported by both pages.
- **`src/popup/style.css` / `src/app/style.css`** — only what that page alone renders.

**Three surface levels, and `--action` is spent on one thing.** `--ink` is the page, `--raised`
is a panel, and `--lifted` is a panel sitting on a panel — the session card, the open chat
against the chat list, the section rail against its pane. Reaching for `--raised-hot` to get a
fourth level is how the nesting stopped reading in the first place. `--action` is violet because
it is the one hue the five tones leave free, and it means "press this": primary buttons,
`:focus-visible`, the active navigation item. Anything that is merely selected, active or
decorative takes `--edge-lit` or `--text-2` — an active-tab underline and a range thumb in the
action colour is what made the old pink stop reading as emphasis.

**A popup/app difference is a token, not an override.** The two hosts differ in density, and the
tokens above are the whole list of ways they are allowed to. If a difference cannot be expressed
as one of them it is a different design rather than a different density — `.settings-group` is
the standing example, a titled panel on the page and a bare divider in the popup — and it belongs
in the page's own stylesheet, not as an override of a rule in `skin.css`.

Chromium-only, so native CSS nesting is available and used. `@layer` is not; the tokens are meant
to prevent the override fights it exists to arbitrate.

None of this reaches `src/content/` or `src/reader/`. Their styles are template literals adopted
into a shadow root, and they draw over somebody else's moving video, where a near-neutral scrim
is the right answer and a warm surface palette is not. The tones are what they share.

## Stored data

Five IndexedDB databases, separated by how bad it is to lose them:

| Database | Contents | Losing it means |
|---|---|---|
| `bb-subsgen` | dictionary: definitions, lexicon text and per-language install state, all keyed by language; plus `glosses`, definitions machine-translated out of English and keyed `${lang}:${headword}:${target}` (schema 3, `src/dict/store.ts`) | re-download from the setup wizard, and re-translate on next hover |
| `bb-subsgen-llm` | debug log of model calls | nothing |
| `bb-subsgen-chat` | conversations | annoying |
| `bb-subsgen-flashcards` | review history; every key carries its language since schema 4 — card ids are `w:zh:生`, and `exposures` / `videoWords` / `ranks` key on `[lang, headword]`; since schema 5 every captured `Context` also carries the `translationLang` its translation is in (`src/flashcards/db.ts`) | **irreplaceable** |
| `bb-subsgen-flashcards-snapshots` | the deck as it stood before each schema migration (`src/flashcards/snapshot.ts`) | the undo for a bad migration |

Bumping a `VERSION` requires a numbered migration note in the module header, next to the ones
already there. Treat the flashcards database as data you cannot regenerate: migrations there
get a test.

**Migration steps run one after another, never all at once**, and **the snapshot happens
before the open, not inside the migration.** Both are load-bearing and both have a bug behind
them — read the JSDoc on `sequence()` and the header of `src/flashcards/snapshot.ts` before
bumping a version.

All five go through the thin wrapper in `src/shared/idb.ts` rather than raw IndexedDB —
including the connection itself. Do not re-introduce a per-module `let ready` memo; that
file's header explains what happened to the four that had one.

## `src/lang/`

Everything that knows what language the text is in. One directory per language — `zh` and
`ja` today. Everything directly under `src/lang/` is language-neutral. The three-file split
(`pack.ts` for the interface, `packs.ts` for the registry, `<code>/pack.ts` for an
implementation) is modelled on `Site` / `siteFor` in `src/media/`, and both `pack.ts` and
`packs.ts` say why in their headers.

**A second pack shares an interface, not an algorithm.** `zh/segment.ts` scores whole parses
and `ja/segment.ts` is a plain longest match, because the two languages are hard in different
places. That is the interface working, not being worked around. What is *not* allowed is
widening `Entry` or `Tag` so that one language's fields ride on every language's shape.

**A capability flag hides a control; `comingSoon` badges one.** `displaysTones`,
`usesTraditional`, `speechSample` and `voiceLang` say what a language *is*, and a row they
do not apply to is not rendered at all — kana carry no tone, so there is no tone switch to
show switched off. `LanguagePack.comingSoon` is the other case: work that is planned and has
not shipped, listed as named `Gap`s and turned into prose by `src/lang/gaps.ts`. The two must
not be swapped. A hidden row for planned work leaves the reader hunting for a setting that
was never there; a badge on something the language will never have is a promise with a timer
on it, which is why pitch accent is hidden and Japanese grammar patterns are badged.

**Nothing outside a language's directory imports a module from inside it.** That is the point
of the directory: an import of `zh/segment` from `reader/` is a Chinese assumption that
compiles cleanly and is invisible from the file it sits in. The exceptions are the surfaces
the PRD pins to Chinese on purpose, and each says so where it names the language:

- `src/youtube/language.ts` and `src/llm/glossary.ts` reach Chinese through `packFor('zh')`
  rather than by importing the table, so the surviving `'zh'` literals read as an inventory of
  what is still pinned.
- `src/dict/cedict.ts` and `src/dict/jmdict.ts` are each their language by definition. They
  import from `src/lang/<code>/` — that is the direction that is allowed; nothing in
  `src/lang/` imports either of them.

Tests may import a language's modules directly — a fixture has to name a language.

**`Match.dictionary` and `Token.dictionary` are position and identity coming apart.** A
Japanese surface is rarely its own headword — 食べる appears as 食べて, 食べた, 食べません — so
a cut carries both the span as it is written and the headword it is a form of. Everything that
*draws* reads `text`: the highlight range, `word.dataset.text`, the furigana, the pattern
lookup against the segmented line. Everything that *identifies* reads `dictionary ?? text`:
the definitions lookup, `discoverWord`, `markKnown`, the known-set test, `vocabularyIn`, the
card's headword. Collapse the two and one of them breaks — a subtitle rendering 食べる where
the video says 食べて, or a deck with one card per conjugation. This is the same kind of slot
as `ReadingPart.tone`, not the widening forbidden above. Chinese never sets it.

## `src/dict/`

The dictionary, end to end: `sources.ts` is the registry of downloadable sources (one per
language), `store.ts` is the schema-2 database above, and `install.ts` streams a download
straight into it. **One installer, two formats** — `parser.ts` is the seam, `cedict.ts` and
`jmdict.ts` implement it, and `install.ts` reads no format. Those three headers carry the
reasoning, including why the seam is incremental and why JMdict is not parsed with `DOMParser`.

`parsers.ts` maps a language to its parser and is imported by `install.ts` and nothing else.
It is deliberately not a field on `DictSource`, for the reason `packs.ts` records against
merging itself into `sources.ts`: the popup and the badge import `sources.ts` only to ask
where a dictionary comes from, and a parser hanging off that record would pull every format
into both of their bundles.

**The store holds opaque rows.** `DictRow` is `unknown`, and what a row *is* belongs to the
language — `src/lang/zh/cedict-row.ts` for Chinese, with a hand-written guard because a row
read back out of IndexedDB was written by whichever install ran last. `pack.entriesFrom` is
the only place a row's fields are read. Converting at install time and storing `Entry`
instead would bake the traditional/simplified choice into the database, and flipping that
setting would become a re-install — the hover card reads it live today.

Nothing here is a build step: it all runs in the extension at install time, from
`src/app/SetupWizard.tsx`, which is why `install.ts` takes `fetch` as an injected parameter
(`.claude/rules/testing.md`).

## Word lists

The same three-part shape as `src/dict/`, one level down and for the same reasons:
`src/flashcards/wordlist-sources.ts` is the registry, `wordlist-readers.ts` is the seam that
knows a payload's format, and `wordlist-install.ts` reads neither. `readerFor` is imported by
the installer and nothing else — `Data.tsx` and `SetupWizard.tsx` import only the registry, to
ask what exists for a language, so a reader hanging off `WordListSource` would pull every
payload format into the app bundle. The wizard installs the `frequency` list beside the
dictionary, because an empty rank store is a deck with no order to it; `sourcesFor` returning
empty is a normal answer and renders no step at all rather than a button that installs
nothing.

Two things here are deliberately *not* the dictionary's shape. There is no
`DecompressionStream` and no incremental parser: these are ~3MB of plain JSON and `JSON.parse`
needs the whole string, so the seam that makes a 63MB dictionary streamable would buy nothing.
And a download skips the confirmation preview an upload gets — that step exists to show a
format *guess* to someone who can check it, and a pinned commit of a known payload has no
guess in it.

**`wordlist.ts` and `wordlist-readers.ts` are not the same job**, however similar their output
looks. The first sniffs a file nobody has seen before — delimiter, header row, which column
holds the language — and the second reads a payload we chose and pinned. Running a download
through the sniffer would re-guess a shape already known, and would then apply
`byPosition`'s rule to a file that has a real frequency field.

Every source is pinned to a commit SHA, not a branch. A word list that changes under an
installed deck re-ranks every card with nothing to say so, and `main` gives
`WordListMeta.ref` nothing to compare against. Each new host also costs a `host_permissions`
entry in `manifest.json` — that allowlist is explicit, and `optional_host_permissions` is not
the pattern the dictionary sources follow.

## The setup surface

`src/app/SetupWizard.tsx` (route `#/setup`) is deliberately **not** one of the tabs in
`src/app/App.tsx`'s `TABS` array — it's reached from the popup when nothing is installed, and
from a link in Settings, not from primary navigation. Its header explains why it runs the
download itself rather than asking the service worker to.

## Build-time shape

- `src/reader/main.ts` must stay a self-contained IIFE. It is listed in `standaloneFiles` in
  `vite.config.ts` because it is registered at runtime rather than declared in the manifest,
  so it cannot rely on module imports being loaded for it.
- A new HTML entry point needs a `rollupOptions.input` entry whenever the manifest does not
  name it. That is why `flashcards` and `offscreen` are listed there explicitly.

## Routing

The app is a `chrome-extension://` page with no server behind it, so a real path would 404 on
reload. Routing is hash-based, via `useRoute()` / `navigate()` in `src/app/hooks.ts`.

## Settings

`chrome.storage`, through `src/shared/settings.ts` (`DEFAULT_SETTINGS`, `loadSettings`,
`saveSettings(patch)` as read-modify-write, `onSettingsChanged`). A new setting needs a
default there. In UI, go through `useSettings()` in `src/settings/useSettings.ts`, which
reconciles optimistic local edits against storage echoes — writing to `chrome.storage`
directly from a component reintroduces the flicker that hook exists to remove.

## `src/i18n/`

The UI's own strings, in the six languages of `TranslationLang`. **Not `chrome.i18n`** — that
resolves against the *browser's* UI locale and cannot be pointed at a setting, and the whole
point here is that the app speaks whatever `translationLang` says.

`en.ts` is authored and `keys.ts` derives `MessageKey` from it, so every other locale is a
`Record<MessageKey, Message>` and **a string left out of one is a compile error**. A `Message`
is a bare string or a set of plural forms picked with `Intl.PluralRules`; five of the six
targets inflect after a number and `n === 1 ? '' : 's'` cannot express 1 карточка / 2 карточки /
5 карточек.

**Components read `useT()`, never `useSettings()` for the language.** That hook keeps one
`chrome.storage` listener for the whole page: a `useSettings()` per component would open thirty
subscriptions on open and flash English while they landed. The roots — `App.tsx`, `Embed.tsx`,
`popup/App.tsx` — gate on its `ready` for that same reason, and it is `useT` that writes
`document.documentElement.lang`.

**A module that renders prose outside a component takes `t: Translate` as a parameter.**
`src/llm/progress.ts`, `src/flashcards/wordlist.ts`'s `errorMessage` and `mastery.tsx`'s
`masteryTitle` all do; their tests bind English with `translateIn('en')`. A message with
markup in the middle of it — a `<code>`, a link — goes through `Rich` rather than being split
into a before-key and an after-key, because where the markup lands in the clause is not the
same in every language.

**Out of scope, deliberately:** `src/content/` and `src/reader/`. Those are imperative DOM in a
shadow root over somebody else's video and carry almost no chrome. The log *entries* the model
pipeline writes are out too — they are diagnostics that get pasted into bug reports, and the
service worker that writes most of them has no `document` to read a locale from. The `LlmLog`
screen around them is translated.
