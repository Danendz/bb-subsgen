// Remembering what you said when we asked.
//
// Keyed by whatever the site calls a publisher — `Video.transcribe.approvalKey`,
// which is a channel id on YouTube and empty on Bilibili, which never asks.
//
// The two answers are kept differently on purpose, and the asymmetry is the
// whole design:
//
//   Yes → the channel, forever. Saying yes to one video of 中国电视剧精选 is
//   really the statement "this channel is Chinese", which is true of every other
//   video on it. Keeping it per video would re-ask on all six you watch tonight,
//   which is the friction that makes people turn a feature off.
//
//   No → this video, this session. A "no" means "not this, not now", and a
//   wrongly-remembered one is invisible: the overlay would simply never appear
//   again on a channel, with nothing on screen to say why or to undo it. A wrong
//   yes costs one transcription you can watch happening; a wrong permanent no
//   costs a feature you cannot find.

const APPROVED_KEY = 'transcribe:approvedPublishers'

/**
 * Videos declined in this tab's lifetime.
 *
 * In memory rather than in storage, which is exactly the lifetime wanted: the
 * content script survives SPA navigation between videos, so a refusal sticks for
 * as long as you keep browsing, and a reload is a fresh start.
 */
const refused = new Set<string>()

export function refuseForNow(videoId: string): void {
  refused.add(videoId)
}

export function isRefused(videoId: string): boolean {
  return refused.has(videoId)
}

async function approvedKeys(): Promise<string[]> {
  const stored = await chrome.storage.local.get(APPROVED_KEY)
  const list = stored[APPROVED_KEY]
  return Array.isArray(list) ? (list as string[]) : []
}

export async function isApproved(approvalKey: string): Promise<boolean> {
  if (!approvalKey) return false
  return (await approvedKeys()).includes(approvalKey)
}

/** Records a yes. Idempotent, because the notice can be answered twice on a remount. */
export async function approve(approvalKey: string): Promise<void> {
  if (!approvalKey) return
  const current = await approvedKeys()
  if (current.includes(approvalKey)) return
  await chrome.storage.local.set({ [APPROVED_KEY]: [...current, approvalKey] })
}
