# Cross-context messages

Read `src/shared/messages.ts` before adding one. It is the whole protocol in a single file, and
it documents why each message is shaped the way it is. This rule covers only the conventions a
new message has to follow.

## The conventions

**Namespace the type**: `bb-subsgen:<verb>`. The extension shares a message channel with whatever
else is running; an unnamespaced `'lookup'` will eventually collide.

**Write a type guard by hand**: `isXMessage(msg: unknown): msg is X`, checking the shape
defensively — `typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === …`.
Messages cross a trust boundary, so the parameter is `unknown` and stays that way until the guard
has run. A cast is not a check.

**Pick the right grouping**:

- A fire-and-forget write joins an existing union and its `Set<string>` of type strings —
  `FlashcardsMessage` / `FLASHCARDS_TYPES`, `LlmMessage` / `LLM_TYPES`, `AsrMessage` /
  `ASR_TYPES`. One guard covers the set.
- A request/response pair gets its own interface plus a matching `…Response` interface. See
  `GetLexiconMessage` and `DictStatusMessage`.
- A single-member notification that fits none of the existing unions gets its own guard rather
  than being forced into one — see `DictChangedMessage`. Forcing it into an existing union would
  mean widening that union's dispatch for a message unrelated to what the union is for; a second
  guard costs one `if` in `src/background.ts`.

Say in a comment which one it is and why. A message that needs an answer and does not get one is
a bug that shows up as silence.

**Wire up the dispatch**: the `switch` in `src/background.ts` is exhaustive with no `default`, so
a new variant surfaces as a type error where it needs handling. Do not add a `default` to quiet
it.

**Give callers a wrapper**, next to the existing ones in `src/shared/dict-client.ts` and
`src/shared/flashcards-client.ts`, rather than having call sites build message objects inline.

## Streaming results

Address a streamed result by **cue start time, not array index**. A transcribed track grows
underneath a translation pass, so an index means something different by the time the reply lands.
This has already caused one class of bug; see `src/llm/batch.ts`.

## When you add or change a message

Update this file's trigger row in `maintaining-rules.md` if the set of unions changes, and note
the new type in `src/shared/messages.ts` with its reasoning — that file is the documentation.
