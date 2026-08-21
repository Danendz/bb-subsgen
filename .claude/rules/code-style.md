# Code style

Formatting is Prettier's job — run `npm run format`, do not hand-align. The settings that matter
when reading: no semicolons, single quotes, 2-space indent, trailing commas, 100 columns.
JSX attributes keep double quotes.

Everything below is not formatting, and Prettier will not catch any of it.

## Rejected by the compiler, but only at build time

`tsconfig.json` turns on four options whose consequences are easy to trip over:

- **`erasableSyntaxOnly`** — no `enum`, no parameter properties, no `namespace`. Use an
  `as const` object plus a derived union type instead. This is the most common way a
  reasonable-looking edit fails to compile.
- **`verbatimModuleSyntax`** — type-only imports must say so: `import type { Cue } from './cue'`,
  or inline as `import { send, type Message } from './messages'`. A plain import of a type is an
  error, not a warning.
- **`noUnusedLocals` / `noUnusedParameters`** — a leftover binding fails the build. Prefix an
  intentionally unused parameter with `_`.
- **`noFallthroughCasesInSwitch`** — see exhaustive switches below.

## Conventions

**Named exports only.** `grep -rn "^export default" src` returns nothing; keep it that way,
components included: `export function App()`. Default exports make a symbol renameable at each
import site, which breaks grep as a navigation tool.

**No path aliases.** Every import is relative. Do not add `@/`, and do not propose one — the
reader content script is bundled standalone and the tooling is simpler without a second
resolution scheme.

**`interface` for object shapes, `type` for unions.** Discriminated unions on a `type` field are
how cross-context messages are modelled.

**Exhaustive `switch`, no `default`.** Dispatch on a discriminated union without a `default`
clause so that adding a variant becomes a type error at every dispatch site. A `default` silently
swallows the new case; that is the whole reason it is absent.

**Magic numbers get a name and a reason.** An all-caps constant with a comment justifying the
value, in the style of `BATCH_SIZE = 25` or `PROBE_TIMEOUT_MS = 5000`. A bare literal in a
timeout or a retry loop is the thing this rule exists to prevent.

**File naming.** kebab-case for modules (`llm-translate.ts`, `function-words.ts`), PascalCase for
Preact components (`ChatDrawer.tsx`), camelCase for hook modules (`useSettings.ts`). A `.tsx` file
that exports helpers rather than a component is lowercase (`mastery.tsx`, `pinyin.tsx`).

**Preact, not React.** JSX uses `class=` and `for=`, never `className=` or `htmlFor=`. Hooks come
from `preact/hooks`. Props are destructured inline with an inline type literal.
