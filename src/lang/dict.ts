/** Parses the `words.bin` build artifact (tab-separated `headword\tpinyin` lines) into a Map. */
export function parseWords(raw: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    words.set(line.slice(0, tab), line.slice(tab + 1))
  }
  return words
}

export async function loadWords(): Promise<Map<string, string>> {
  const url = chrome.runtime.getURL('dict/words.bin')
  const raw = await fetch(url).then((r) => r.text())
  return parseWords(raw)
}

export interface CedictEntry {
  simplified: string
  traditional: string
  pinyin: string
  definitions: string[]
}

/**
 * Removes the definition store earlier versions wrote into the *page's* origin.
 *
 * Definitions now live in the service worker (background/defs-store.ts), so any
 * database left under a site's origin is 31MB of dead weight. Deleting is a
 * no-op where it never existed, so this needs no flag — and it can't be done
 * from the worker, which has no access to another origin's storage.
 */
export function dropLegacyPageDefsDb(): void {
  try {
    indexedDB.deleteDatabase('bb-subsgen')
  } catch (e) {
    console.warn('[bb-subsgen] could not drop the legacy page-origin defs db', e)
  }
}
