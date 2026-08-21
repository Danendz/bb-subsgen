// Chinese, assembled out of the modules around it.
//
// The only file in this directory the rest of the codebase is allowed to reach,
// and it is reached through `packs.ts` rather than by name.

import type { LanguagePack } from '../pack'
import { loadChinese } from './lexicon'
import { isHan } from './segment'

export const chinesePack: LanguagePack = {
  code: 'zh',
  name: 'Chinese',
  displaysTones: true,

  inScript: isHan,
  containsScript: (text) => Array.from(text).some(isHan),

  load(raw) {
    return loadChinese(raw, this)
  },
}
