// The toolbar badge: whether there is a dictionary problem the popup would
// otherwise be the only place to discover.
//
// Two things put it up — no language enabled at all, or an enabled language
// whose dictionary was never installed (or was deleted). Both mean the same
// thing to a learner: open the popup and go to setup.
import { loadSettings } from '../shared/settings'
import { dictDb, getAllMeta } from '../dict/store'

const NEEDS_SETUP_COLOR = '#ff8a8a' // --tone-1 in src/app/style.css, the palette's "wrong" red

async function setNeedsSetupBadge(): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: NEEDS_SETUP_COLOR })
  await chrome.action.setBadgeText({ text: '!' })
}

export async function refreshBadge(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.enabledLanguages.length) {
    await setNeedsSetupBadge()
    return
  }

  const meta = await getAllMeta(await dictDb())
  const missing = settings.enabledLanguages.some((lang) => !meta[lang])
  if (missing) {
    await setNeedsSetupBadge()
  } else {
    await chrome.action.setBadgeText({ text: '' })
  }
}
