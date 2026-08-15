import { describe, expect, test } from 'vitest'
import type { ChatContext } from '../chat/types'
import { contextBlock, explainQuestion, systemFor, tutorSystem } from './prompts'

const context: ChatContext = {
  target: '了',
  line: '我吃了饭',
  before: ['你饿吗', '有点'],
  after: ['那我们走吧'],
  sourceTitle: '中文播客 12',
}

describe('tutorSystem', () => {
  test('names the reply language', () => {
    expect(tutorSystem('en')).toContain('English')
    expect(tutorSystem('ru')).toContain('Russian')
  })
})

describe('contextBlock', () => {
  test('marks the line being asked about', () => {
    expect(contextBlock(context)).toContain('>> 我吃了饭')
  })

  test('keeps the surrounding lines in the order they were said', () => {
    const block = contextBlock(context)

    expect(block.indexOf('你饿吗')).toBeLessThan(block.indexOf('>> 我吃了饭'))
    expect(block.indexOf('>> 我吃了饭')).toBeLessThan(block.indexOf('那我们走吧'))
  })

  // Without this, models summarize the passage instead of answering about the line.
  test('says the surrounding lines are context and not the subject', () => {
    expect(contextBlock(context)).toContain('context only')
  })

  test('names the target word when there is one', () => {
    expect(contextBlock(context)).toContain('「了」')
  })

  test('omits the target sentence when the question is about the whole line', () => {
    const { target: _target, ...noTarget } = context

    expect(contextBlock(noTarget)).not.toContain('asking about the word')
  })

  test('includes the source when it is known', () => {
    expect(contextBlock(context)).toContain('中文播客 12')
  })

  test('copes with a line that has nothing around it', () => {
    const block = contextBlock({ line: '你好', before: [], after: [] })

    expect(block).toContain('>> 你好')
  })
})

describe('systemFor', () => {
  test('is the standing instruction alone when there is no passage', () => {
    expect(systemFor('en')).toBe(tutorSystem('en'))
  })

  test('appends the passage when there is one', () => {
    const system = systemFor('en', context)

    expect(system.startsWith(tutorSystem('en'))).toBe(true)
    expect(system).toContain('>> 我吃了饭')
  })
})

describe('explainQuestion', () => {
  test('asks about the word when the button was pressed on one', () => {
    expect(explainQuestion('了')).toContain('「了」')
  })

  test('asks about the line when it was not', () => {
    expect(explainQuestion()).toContain('this line')
  })
})
