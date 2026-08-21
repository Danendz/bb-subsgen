# Local models: translation, ASR, chat

Everything here talks to **local, OpenAI-compatible servers only** — LM Studio, Ollama,
whisper.cpp, speaches. No hosted providers, no API keys, not as a fallback and not behind a
setting. The extension is offline after install and that is a product decision, not an
oversight.

## Treat the model's reply as untrusted input

Long structured outputs come back with lines skipped and lines merged. **That is the normal path,
not an edge case.** Every line sent carries an explicit `id`, and the reply is validated against
what was sent before anything is used. If you add a new structured call, validate it the same way;
do not assume a one-to-one mapping between what you asked for and what came back.

## Streaming into a moving track

Results are addressed **by cue start time, not by index** — a transcribed track grows underneath
a translation pass that is already running, so index `12` is a different line by the time the
reply arrives.

## There is one GPU

Passes must yield to interactive work. Chat announces itself with `bb-subsgen:llm-busy`, and a
background pass re-orders itself around the playhead via `bb-subsgen:llm-playhead`. Anything new
that runs long has to participate in this, or it will make chat unusable while it works.

Retries back off (`ASR_BACKOFF_MS`) and only for plausibly transient failures. Retrying a 400
just burns the user's GPU.

## Prompts

Rebuilt from stored context on every send and never persisted — that way a prompt improvement
reaches conversations that already exist. Do not cache a rendered prompt.

Keep them short. These are small quantized models; three rules are followed more reliably than
ten, and the existing tutor prompt is brief on purpose. Adding a clause has a cost paid by every
other clause.

Prompt rules can be language-conditional. The Russian gender-agreement rule exists because
Chinese marks no gender on verbs or adjectives while Russian marks it on past-tense verbs, short
adjectives and participles — so the model is told to settle who is speaking *once* and keep every
ending in the sentence agreeing with that decision. It must not leak into `en`. Any prompt change
gets checked against both cases in `src/llm/batch.test.ts`.

## Glossaries

`rankEntries` in `src/lang/entries.ts` is the single ranking used by both the hover card and the
LLM glossary, deliberately: the model is told the same sense the learner just saw. Do not add a
second ranking for one of the two callers.

Glossaries cover words the learner does *not* know (`splitByKnown`, `glossFor`) so the model does
not re-teach 是 and 了.

## Dictionary data

Built at dev time by `tools/build-dict.ts` from CC-CEDICT into `public/dict/`. CC BY-SA 4.0 —
attribution is required wherever the derived data is shown or shipped.

Definitions go through the service worker (`src/background/defs-store.ts`, batched via
`lookupDefsIn`) rather than being loaded per page: a content script copy would be held once per
page origin.
