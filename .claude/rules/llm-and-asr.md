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

`LANGUAGE_NAME` and `LANGUAGE_RULES` both live in `src/llm/languages.ts` — one table, imported
by `prompts.ts` and `batch.ts` alike. They were a copy each and had drifted.

**Prompts are English; `explainQuestion` is the one exception.** Everything else in
`prompts.ts` is an instruction to the model and stays in English, where the small quantized
models this targets are strongest. `explainQuestion` is not only sent — it is rendered in the
transcript as the *user's own* opening message, and an English question a Spanish reader never
typed is exactly the defect `src/i18n/` exists to remove. It therefore takes a `Translate` and
reads from the locale table. The system prompt already names the answer language, so nothing
depends on the model inferring it from the question.

A rule set carries its own one-line `reminder`, repeated next to the lines in `batchUser`.
That is a field rather than a literal at the call site because the literal was gendered and
was emitted for *any* language that had rules at all: German has rules, marks no gender on its
predicates, and would have been told to agree endings it does not inflect.

Prompt rules can be language-conditional. The Russian gender-agreement rule exists because
Chinese marks no gender on verbs or adjectives while Russian marks it on past-tense verbs, short
adjectives and participles — so the model is told to settle who is speaking *once* and keep every
ending in the sentence agreeing with that decision. It must not leak into `en`. Any prompt change
gets checked against both cases in `src/llm/batch.test.ts`.

## Glossaries

**One ranking per language.** `pack.rank` is what the hover card, the LLM glossary and the
install-time reading choice all go through — `rank` in `src/lang/zh/entries.ts` for Chinese. The
point is unchanged: the model is told the same sense the learner just saw. What changed in #9 is
where it lives, because a ranking has to read an entry's fields and CC-CEDICT's are not JMdict's.
Do not add a second ranking for one caller of a language's pack.

The glossary holds an `Entry`, not a dictionary row, so `Glossed.pinyin` is display form —
`了 (le)`, not `了 (le5)`. A prompt that quotes tone digits is quoting notation the learner has
never been shown.

**The glossary stays English whatever the target is**, even though the hover card no longer
does. CC-CEDICT and JMdict ship English and the learner-facing glosses are now translated out
of it (`src/dict/gloss-translate.ts`); the glossary is not, because it is telling the model
which sense was meant rather than showing anyone a definition, and a sense round-tripped
through a second translator is a worse answer to that question, not a better one.

Glossaries cover words the learner does *not* know (`splitByKnown`, `glossFor`) so the model does
not re-teach 是 and 了.

## Dictionary data

Downloaded and parsed at install time, from the setup wizard — see `src/dict/` in
`architecture.md`. CC-CEDICT and JMdict are both CC BY-SA 4.0 — © MDBG and © the Electronic
Dictionary Research and Development Group respectively — and attribution is required wherever
either's derived data is shown or shipped. `DICT_SOURCES` carries the line to print; use it rather
than writing one out.

Definitions go through the service worker (`src/dict/store.ts`, batched via `lookupDefsIn`) rather
than being loaded per page: a content script copy would be held once per page origin.
