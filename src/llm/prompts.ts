// What the model is told, and nothing about how it is asked.
//
// Pure string building, kept apart from the client and the UI so the wording can
// be read, diffed and tested on its own — the prompt is the part of this feature
// most likely to need tuning, and the part least likely to be covered by a test
// that goes through a network call.
//
// Prompts are rebuilt from a chat's stored context every time it is sent, never
// stored alongside it. An improvement here therefore reaches conversations that
// already exist.

import type { ChatContext } from '../chat/types'
import type { TranslationLang } from '../shared/settings'
import { glossLine } from './glossary'
import { LANGUAGE_NAME } from './languages'
import type { Translate } from '../i18n/t'

/**
 * The standing instruction for every conversation.
 *
 * Short on purpose. A long system prompt costs prefill on every turn, and the
 * small quantized models this is aimed at follow three clear rules better than
 * they follow ten.
 */
export function tutorSystem(lang: TranslationLang): string {
  return [
    'You are a patient Mandarin Chinese tutor. The learner is studying from Chinese video subtitles.',
    `Reply in ${LANGUAGE_NAME[lang]}. Write Chinese in simplified characters, and give pinyin the first time a word comes up.`,
    'Explain the line actually in front of you rather than the grammar point in general. Be brief and concrete.',
    'If a line is ambiguous, or you are not sure, say so instead of inventing a rule.',
  ].join('\n')
}

/**
 * The passage, with the line under discussion marked.
 *
 * The surrounding lines are given as context and explicitly not as the subject:
 * without that, models tend to summarize the whole passage rather than answer
 * about the one line. Chinese needs the window — dropped pronouns and topic
 * chains mean a line often cannot be read on its own — so the fix is to include
 * it and say what it is for.
 */
export function contextBlock(context: ChatContext): string {
  const parts: string[] = []

  if (context.sourceTitle) parts.push(`From: ${context.sourceTitle}`)

  const passage = [...context.before, `>> ${context.line}`, ...context.after].join('\n')

  parts.push(
    'Here is the passage. The line marked >> is the one being asked about; the rest is context only.',
    passage,
  )

  if (context.target) {
    parts.push(`The learner is asking about the word 「${context.target}」 in the marked line.`)
  }

  // What the extension knows and the model does not. Both halves earn their
  // tokens: the glosses stop it inventing meanings for words it half-knows, and
  // the known list stops it spending the answer re-teaching 是 and 了.
  if (context.newWords?.length) {
    parts.push(
      [
        'Dictionary entries for the words in that line the learner has not learned yet:',
        ...context.newWords.map(glossLine),
      ].join('\n'),
    )
  }

  if (context.knownWords?.length) {
    parts.push(
      `The learner already knows these and does not need them explained: ${context.knownWords.join('、')}.`,
    )
  }

  return parts.join('\n\n')
}

/** The full system message for a conversation, with its passage when it has one. */
export function systemFor(lang: TranslationLang, context?: ChatContext): string {
  const base = tutorSystem(lang)
  return context ? `${base}\n\n${contextBlock(context)}` : base
}

/**
 * The opening turn of an explanation.
 *
 * Written in the target language rather than in English, unlike everything else
 * in this file: this one is not only sent to the model, it is rendered in the
 * transcript as the user's own message. A Spanish reader seeing an English
 * question they never typed is the thing this is here to avoid. The system
 * prompt already names the answer language, so the model is not being asked to
 * infer it from this.
 */
export function explainQuestion(t: Translate, target?: string): string {
  return target ? t('explain.questionAbout', { word: target }) : t('explain.question')
}
