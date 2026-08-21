# Maintaining these rules

These files describe the project as it is now. That only stays true if updating them is part of
the change that made them wrong, so: **the documentation edit ships in the same commit as the
code.** A follow-up commit is a commit that does not happen.

## What obliges an update

| When you… | Update |
|---|---|
| add or change a `bb-subsgen:*` message | `messaging.md` |
| add a directory under `src/`, or a new surface | `architecture.md` |
| add, rename or remove an npm script | `CLAUDE.md` |
| bump an IndexedDB `VERSION`, or add a database | `architecture.md` |
| add an LLM preset, endpoint, or prompt rule | `llm-and-asr.md` |
| change `tsconfig.json`, `.prettierrc`, or CI | `code-style.md`, `CLAUDE.md` |
| get corrected on the same thing twice | add a rule (see the bar below) |
| delete the code a rule describes | delete the rule |

If a change fits none of these rows and none of the rules is now wrong, write nothing. Silence is
the correct output most of the time.

## The bar for a new rule

All three, or it does not go in:

1. **Non-obvious.** A competent developer reading the surrounding code would plausibly do
   otherwise. If the code already makes it clear, the code is doing the job.
2. **Load-bearing.** You can name the concrete breakage it prevents. "It fails at runtime in
   Chrome but passes CI" is the strongest possible case for a rule; "it's tidier" is not a case
   at all.
3. **It has actually bitten us.** A bug, a review comment, a platform constraint that cost time.
   Not a hypothetical.

Rejected by construction:

- generic advice — "write clear code", "handle errors", "keep functions small"
- restatements of what `tsconfig.json`, `vitest.config.ts` or CI already enforce, *unless* the
  consequence is surprising (the `erasableSyntaxOnly` → no-`enum` entry earns its place because
  the error message does not obviously lead you there)
- one-off preferences that nothing in the codebase actually follows
- anything already explained in a module header — link to the file instead

The founding set of rules in this folder was derived from the existing code and commit history
rather than from incidents, so it is grandfathered past criterion 3. Everything added afterwards
is not.

## Format

One topic per file. Each rule states **what**, **why**, and **what breaks if you ignore it** —
the third part is what makes it a rule instead of a preference. Prefer a real example from the
repo over an invented one.

Files under `.claude/rules/` are reached in two ways, and adding a file means choosing:

- `@`-imported from `CLAUDE.md`, so always in context. Reserved for rules that bear on nearly
  every edit. Adding one here taxes every session, including sessions about something else.
- listed in the index, read on demand. The default. Give it a trigger in `CLAUDE.md` that names
  when to open it, in the same "read before working in the area" form as the others.

## Deleting

Deletion is a duty, not an option. A rule that describes code that no longer exists is worse than
no rule: it is confidently wrong, and it teaches the reader to distrust the rest of the folder.
When the reason for a rule goes away, delete the rule in the same commit — do not soften it into
a vague version of itself.
