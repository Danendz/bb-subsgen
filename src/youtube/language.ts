// Is this a Chinese video?
//
// A question Bilibili never has to ask. Every page the Bilibili adapter runs on
// is Chinese, so "no usable subtitle track" can mean "transcribe it" with no
// further thought. YouTube is not like that, and getting it wrong is not free:
// transcription there means spawning yt-dlp, pulling ~9MB through it, and
// occupying a GPU for minutes — to produce English subtitles that the segmenter
// will find no Han words in.
//
// So this is asked *before* anything is spent, from data the adapter has already
// fetched, and it answers in four grades rather than yes/no. The grades exist
// because the evidence genuinely differs in strength, and the right response to
// weak evidence is neither to spend nor to give up silently — it is to ask.

import { isHan } from '../lang/zh/segment'
import type { Confidence } from '../media/site'
import type { CaptionTrack } from './player-response'

/**
 * How much of a string is Han, as a share of its letters.
 *
 * Letters rather than characters: titles are full of spaces, punctuation,
 * hashes and digits, and counting those would drag every ratio toward zero by an
 * amount that depends on how fond of brackets the uploader is.
 */
export function hanRatio(text: string): number {
  const chars = [...text]
  const letters = chars.filter((char) => /\p{L}/u.test(char))
  if (!letters.length) return 0
  return letters.filter(isHan).length / letters.length
}

/**
 * The share of Han letters at which a string counts as Chinese.
 *
 * Measured rather than guessed. On real pages the two populations sit nowhere
 * near each other: `中国电视剧精选 Chinese Drama` scores 0.37 and the drama title
 * beside it 0.46, while `Rick Astley - Never Gonna Give You Up` and
 * `Lofi hip hop radio` score exactly 0. A bilingual title like
 * `【ENG SUB】甄嬛传 第1集` lands at 0.46 and is correctly read as Chinese — the
 * audio is, which is the only thing being asked about.
 */
export const HAN_THRESHOLD = 0.2

/**
 * Minimum Han letters before the ratio is trusted at all.
 *
 * A two-character channel name that happens to be Han would otherwise score 1.0
 * on no evidence worth the name.
 */
export const MIN_HAN_LETTERS = 2

export function looksChinese(text: string): boolean {
  const han = [...text].filter(isHan).length
  return han >= MIN_HAN_LETTERS && hanRatio(text) >= HAN_THRESHOLD
}

/** Whether a caption track's language is a Chinese one, in any of its spellings. */
export function isChineseLanguage(code: string): boolean {
  return /^zh(-|$)/i.test(code)
}

export interface LanguageEvidence {
  title: string
  author: string
  captionTracks: CaptionTrack[]
}

/**
 * Whether this video is worth transcribing as Chinese.
 *
 * The auto-generated caption track decides it outright when there is one, in
 * *both* directions. It is produced from the audio, so a Chinese one means the
 * audio is Chinese, and — the half that saves the GPU — a non-Chinese one means
 * the audio is not, however Chinese the rest of the page looks. That is exactly
 * the case a naive reading gets wrong: a Chinese caption track on an English
 * video is a human translation, and its text matches neither the audio nor
 * anything worth learning from.
 *
 * Failing that it falls back to the title and the channel name, which is not a
 * weaker answer so much as a different one — on drama re-uploads, the content
 * this feature is for, there is no auto-generated track at all, so this fallback
 * is the load-bearing path rather than the backstop.
 *
 * A Chinese *human* track is deliberately not counted as evidence. It is exactly
 * as consistent with a Chinese video as with a translated foreign one, and the
 * case where it is the only Chinese thing on the page is precisely the case it
 * would be wrong about.
 */
export function confidenceOf({ title, author, captionTracks }: LanguageEvidence): Confidence {
  const generated = captionTracks.find((track) => track.kind === 'asr')
  if (generated) return isChineseLanguage(generated.languageCode) ? 'certain' : 'negative'

  const clues = [looksChinese(title), looksChinese(author)].filter(Boolean).length
  if (clues === 2) return 'certain'
  if (clues === 1) return 'likely'
  return 'uncertain'
}
