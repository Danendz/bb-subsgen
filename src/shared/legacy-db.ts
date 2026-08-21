// Storage housekeeping for databases the extension no longer writes.
//
// Sits here rather than beside the lexicon it used to live next to: deleting a
// database an old version left behind is not a question about any language, and
// keeping it in `lang/zh/` would have made every page-origin surface import a
// Chinese module to do it.

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
