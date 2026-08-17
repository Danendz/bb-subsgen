// Host permission for the model server.
//
// The extension cannot declare this up front: the base URL is a setting, so the
// origin isn't known until you type it. `optional_host_permissions` in the
// manifest already covers it, and this asks for the specific pattern at the
// moment it is needed — the same shape as turning the page reader on for a site.
//
// Why a permission is needed at all: an extension page can only fetch a
// cross-origin URL it holds permission for. Without it the request is blocked
// by CORS before it reaches the server, and the failure looks identical to the
// server being switched off.

import { permissionPatternFor } from '../llm/client'

export async function hasLlmPermission(baseUrl: string): Promise<boolean> {
  const origins = permissionPatternFor(baseUrl)
  if (!origins) return false
  return chrome.permissions.contains({ origins: [origins] })
}

/**
 * Asks for permission to reach `baseUrl`, returning false if declined.
 *
 * Must be called from a user gesture — `permissions.request` refuses otherwise,
 * which is why this belongs in a click handler and not in the worker.
 */
export async function requestLlmPermission(baseUrl: string): Promise<boolean> {
  const origins = permissionPatternFor(baseUrl)
  if (!origins) return false
  return chrome.permissions.request({ origins: [origins] })
}
