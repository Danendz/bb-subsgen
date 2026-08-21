# Comments and commits

Both halves of this file are about the same thing: writing down why, so the next person does not
have to reconstruct it.

## Comments

A module header says why the module exists, and often what it deliberately is *not* — the
alternative that was considered and rejected. JSDoc on an exported symbol does the same for that
symbol, including on interface fields where the field's purpose is not obvious from its name.

Where a number or a boundary came from measurement, record the measurement. `MAX_LOG_ENTRIES`
and `ASR_BACKOFF_MS` are worth more with the observation attached than without it.

Do not:

- write a header that restates the filename — `// Utilities for parsing` on `parse.ts` costs a
  line and tells nobody anything. If there is no decision to record, write no header.
- narrate the code beneath it. `// loop over the cues` is noise; the loop is right there.
- describe how something is done when the interesting part is why it is done that way.

## Commits

Subject: imperative, naming the user-visible outcome. No `feat:` / `fix:` / scope prefixes, no
ticket ids. Real examples from this repo:

```
Read the line while it is being said, not before
Lose five minutes of an episode, not the whole thing
Replace SM-2 with a mastery ladder you can actually see
Build the dictionary before asking crxjs to bundle it
```

Body: prose, hard-wrapped at about 80 columns. The shape is symptom → cause → what changed →
why it earned its own module or test. Close with a line stating what you verified and, when it
matters, what you did not:

```
Verified with `npx tsc --noEmit` and the full suite (78 files, 1243 tests). Not
yet confirmed in a browser on the video that reported it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Work on `feat/<topic>` branches, merged into `main` by pull request.

Do not:

- **force the "X, not Y" shape.** Several subjects above use a contrast because there was a real
  contrast to draw. Applied to a change that has none, it produces a subject that sounds like
  this repo and says less than a plain one would. Write the plain one.
- write a verification line for a command you did not run. This is the one failure here that
  actively misleads, because the line is the reason anyone trusts the rest.
- pad the body. A one-line change with an obvious cause gets a short body or none.
