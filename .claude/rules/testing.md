# Tests

Vitest. `npm test` runs once; config is `vitest.config.ts`.

## Layout and naming

Co-located: `src/llm/timing.ts` is tested by `src/llm/timing.test.ts`. Never a `__tests__/`
directory. `describe` is named after the exported function under test.

Import `test`, not `it`: `import { describe, expect, test } from 'vitest'`.

Test names are lowercase prose describing the behaviour **and its reason**, not the mechanism.
From the existing suite:

```
'never outstays the cap, however long the silence'
'leaves the last line alone — there is nothing to hold it for'
'carry the gender-agreement rule for Russian and not for English'
```

`'returns null when input is empty'` describes the assertion. `'leaves the last line alone —
there is nothing to hold it for'` describes why anyone should care if it breaks. Write the
second kind. Where a case exists because of something real — a video that failed, a model that
merged two lines — say so in a comment.

## The environment is `node`

There is no DOM, and there are no component tests. The 24 `.tsx` files are untested by design;
logic is pushed out into plain `.ts` modules that can be tested directly. `src/app/review/tokens.ts`,
`src/app/chat/markdown.ts` and `src/content/transcribe-plan.ts` all exist for that reason.

So: when a component grows logic worth testing, extract the logic rather than reaching for a DOM
environment. Adding jsdom to a test file is a sign the extraction was skipped.

IndexedDB works — `fake-indexeddb/auto` is loaded via `setupFiles`.

## Never touch the network

`src/llm/client.ts` takes `fetch` and its logger as injected parameters precisely so tests can
pass fakes. Follow that pattern for anything new that talks to a server. A test that would hit a
real localhost endpoint is a test that fails on a machine where the model server is not running,
including CI.

## Small local helpers

Build fixtures with a short factory at the top of the file rather than repeating literals:

```ts
const cue = (start: number, end: number, text = '今天天气非常好啊'): Cue => ({ start, end, text })
```
