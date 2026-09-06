// The bring-your-own-file path, for when the curated downloads are not what you
// want — a private list, a broader frequency corpus, a language nothing is
// offered for yet.
//
// This used to be the *only* path, and carried what that cost: a table of four
// sources with their licences, a section on which of SUBTLEX's four downloads
// is the right one, and a shell snippet stitching HSK levels back onto files
// that keep the level in the filename. All three went when the Install buttons
// arrived — the snippet in particular was instructions to do by hand exactly
// what `wordlist-install.ts` now does. What survives is the part no button
// replaces: what the uploader accepts, and the one way a file is silently wrong.

import { useT } from '../i18n/useT'
import { Rich } from '../i18n/Rich'

export function WordListHelp() {
  const { t } = useT()

  return (
    <details class="help">
      <summary>{t('wordlist.help.summary')}</summary>

      <p>{t('wordlist.help.privacy')}</p>

      <h4>{t('wordlist.help.acceptsTitle')}</h4>
      <p>{t('wordlist.help.accepts')}</p>
      <p class="callout">
        <Rich
          text={t('wordlist.help.frequency')}
          slots={{ order: <strong>{t('wordlist.help.frequencyOrder')}</strong> }}
        />
      </p>
      <p>{t('wordlist.help.levels')}</p>
    </details>
  )
}
