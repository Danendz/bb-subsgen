// Turning what someone types into an origin the reader can be granted.
//
// The popup never needed this: it reads the origin off the tab you are already
// looking at. A settings page has no tab, so the site has to be typed — and
// people type `zhihu.com`, not `https://zhihu.com/`. Everything downstream
// (`chrome.permissions`, the registered script, the `readerOrigins` setting)
// wants the exact origin, so the tidying happens once, here.

import { originOf } from '../shared/reader-sites'

/** Anything of the shape `scheme://`, which is what we must not double up. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * `zhihu.com/answer/1?x=2` → `https://zhihu.com`, and null for anything the
 * reader could never run on.
 *
 * https is assumed when no scheme is given: an http-only site is rare enough
 * that typing it out is the right cost, and defaulting the other way would
 * quietly ask for permission on a weaker origin than the one you meant.
 */
export function originFromInput(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return originOf(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`)
}

/** Short label for an origin — `https://www.zhihu.com` reads as `www.zhihu.com`. */
export function hostLabel(origin: string): string {
  return origin.replace(/^https?:\/\//, '')
}

/**
 * The enabled sites in a stable order, by what they are called rather than by
 * when they were switched on.
 *
 * `readerOrigins` grows in the order you granted, which is meaningless a week
 * later and makes a site you are looking for move about.
 */
export function sortedSites(origins: readonly string[]): string[] {
  return [...origins].sort((a, b) => hostLabel(a).localeCompare(hostLabel(b)))
}
