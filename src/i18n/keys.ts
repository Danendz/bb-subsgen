// The key union, derived from the English table rather than declared beside it.
//
// `en.ts` is authored; every other locale is a `Messages`, so leaving a string
// out of ru/es/fr/de/pt is a compile error rather than a runtime hole. Deriving
// the union from `en` instead of hand-maintaining a list means adding a key is
// one edit, not two that can drift apart.

import type { en } from './en'
import type { Message } from './message'

export type MessageKey = keyof typeof en

/** What every non-English locale has to be. Nothing here is optional. */
export type Messages = Record<MessageKey, Message>
