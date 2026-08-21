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

Four IndexedDB databases, separated by how bad it is to lose them:

| Database | Contents | Losing it means |
|---|---|---|
| `bb-subsgen` | dictionary: definitions, lexicon text and per-language install state, all keyed by language (schema 2, `src/dict/store.ts`) | re-download from the setup wizard |
| `bb-subsgen-llm` | debug log of model calls | nothing |
| `bb-subsgen-chat` | conversations | annoying |
| `bb-subsgen-flashcards` | review history | **irreplaceable** |

Bumping a `VERSION` requires a numbered migration note in the module header, next to the ones
already there. Treat the flashcards database as data you cannot regenerate: migrations there get
a test.

All four go through the thin wrapper in `src/shared/idb.ts` rather than raw IndexedDB.

## `src/dict/`

The dictionary, end to end: `cedict.ts` parses CC-CEDICT text, `sources.ts` is the registry of
downloadable sources (one per language), `store.ts` is the schema-2 database above, and
`install.ts` streams a download straight into it. Nothing here is a build step — everything runs
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
