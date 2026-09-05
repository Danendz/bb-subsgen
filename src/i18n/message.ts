// What a locale is allowed to hold, and how a key becomes a rendered string.
//
// Separate from the tables so that `en.ts` — which defines the key union every
// other locale is checked against — can be imported without dragging six
// locales into whatever bundle asked for a type.
//
// The plural shape exists because five of the six targets inflect nouns after a
// number and English barely does. Writing `1 card / 2 cards` as a ternary at the
// call site, which is what this code did before, is unrepresentable in Russian:
// 1 карточка, 2 карточки, 5 карточек. So a message may be a bare string or a
// set of forms, and `Intl.PluralRules` — a browser built-in, not a library —
// picks between them. A locale supplies only the categories its language has;
// `other` is required and is what an unlisted category falls back to.

/** The categories `Intl.PluralRules` can return. `other` is the only universal one. */
export interface PluralForms {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type Message = string | PluralForms

/** Values interpolated into `{name}` placeholders. `count` also picks the plural form. */
export type Params = Record<string, string | number>
