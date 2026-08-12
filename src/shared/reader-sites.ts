// Turning the page reader on and off for a given site.
//
// Two things have to move together: Chrome's host permission (without it the
// reader cannot be injected at all) and a registered content script (without
// it nothing is injected even though it could be). The `readerOrigins` setting
// is the third, and is what the popup renders and the reader itself checks.

import { loadSettings, saveSettings, type Settings } from './settings'

const SCRIPT_ID_PREFIX = 'bb-subsgen-reader'

/** Origins the reader already reaches through a manifest-declared script. */
const DECLARED_ORIGINS = ['https://www.bilibili.com']

export function readerEnabledFor(settings: Settings, origin: string): boolean {
  return settings.readerOrigins.includes(origin)
}

/** `https://zhihu.com` → `https://zhihu.com/*`, the shape Chrome wants. */
export function originPattern(origin: string): string {
  return `${origin}/*`
}

/** The origin of a tab URL, or null for pages the reader can never run on. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { protocol, origin } = new URL(url)
    // chrome://, about:, file:, and the Web Store are all off limits to
    // content scripts no matter what permissions are granted.
    if (protocol !== 'https:' && protocol !== 'http:') return null
    return origin
  } catch {
    return null
  }
}

function scriptId(origin: string): string {
  return `${SCRIPT_ID_PREFIX}-${origin}`
}

/**
 * The built reader bundle's path, read from the manifest rather than hardcoded.
 *
 * The build emits it as a self-contained IIFE (crxjs `standaloneFiles`) because
 * a dynamically-registered script can't use the ESM loader that declared
 * content scripts get. Reading the path back means a rename can't silently
 * leave registration pointing at a file that no longer exists.
 */
function readerScriptPath(): string | null {
  const declared = chrome.runtime.getManifest().content_scripts ?? []
  for (const script of declared) {
    const file = script.js?.find((path) => path.includes('reader/main'))
    if (file) return file
  }
  return null
}

async function register(origin: string): Promise<void> {
  const file = readerScriptPath()
  if (!file) throw new Error('reader script missing from the manifest')

  // Already-registered ids throw rather than update, and a stale registration
  // from a previous session is the normal case after a browser restart.
  await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] }).catch(() => {})
  await chrome.scripting.registerContentScripts([
    {
      id: scriptId(origin),
      js: [file],
      matches: [originPattern(origin)],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ])
}

/**
 * Enables the reader on `origin`, asking for the host permission if needed.
 *
 * Must be called from a user gesture — `permissions.request` refuses otherwise,
 * which is why this lives in the popup's click handler and not in the worker.
 * Returns false when the prompt was declined.
 */
export async function enableReaderFor(origin: string): Promise<boolean> {
  const granted = await chrome.permissions.request({ origins: [originPattern(origin)] })
  if (!granted) return false

  // Bilibili already has a manifest-declared reader script; registering a
  // second one would inject it twice.
  if (!DECLARED_ORIGINS.includes(origin)) await register(origin)

  const { readerOrigins } = await loadSettings()
  if (!readerOrigins.includes(origin)) {
    await saveSettings({ readerOrigins: [...readerOrigins, origin] })
  }
  return true
}

/**
 * Disables the reader on `origin` and hands the host permission back.
 *
 * The permission is dropped as well as the registration, so turning a site off
 * actually revokes the access rather than leaving it granted but unused.
 */
export async function disableReaderFor(origin: string): Promise<void> {
  const { readerOrigins } = await loadSettings()
  await saveSettings({ readerOrigins: readerOrigins.filter((o) => o !== origin) })

  await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] }).catch(() => {})
  // Never give away the permissions the manifest declares — Bilibili's subtitle
  // overlay needs them whatever the reader is doing.
  if (!DECLARED_ORIGINS.includes(origin)) {
    await chrome.permissions.remove({ origins: [originPattern(origin)] }).catch(() => {})
  }
}
