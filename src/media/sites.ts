// Which site a URL belongs to.
//
// Separate from `site.ts` so the interface does not import its implementations:
// everything that only needs the shape imports that, and only the content
// script's entry point needs this.

import { bilibiliSite } from '../bilibili/site'
import { youtubeSite } from '../youtube/site'
import type { Site } from './site'

const SITES: readonly Site[] = [bilibiliSite, youtubeSite]

/**
 * Matched on hostname rather than on whether the id parses.
 *
 * The two are not the same question: a Bilibili homepage belongs to Bilibili and
 * has no video on it, and the overlay has to be able to tell that apart from a
 * page it does not serve at all. `parseVideoId` answers the first; this answers
 * the second.
 */
const HOSTS: ReadonlyArray<{ pattern: RegExp; site: Site }> = [
  { pattern: /(^|\.)bilibili\.com$/, site: bilibiliSite },
  { pattern: /(^|\.)youtube\.com$/, site: youtubeSite },
]

export function siteFor(url: string): Site | null {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  return HOSTS.find((entry) => entry.pattern.test(host))?.site ?? null
}

export { SITES }
