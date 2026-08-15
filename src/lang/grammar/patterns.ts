// The structures a sentence is built out of, and what each one does.
//
// This is the layer the dictionary cannot be: CC-CEDICT can tell you 啊 is an
// "interjection of surprise" and 得 means "to obtain", and both are true of the
// characters in isolation and useless in 时间过得很快啊. A gloss describes a
// word. This describes a *shape*, and shapes are what stop a line being
// decodable once it is longer than "I am X".
//
// Written by hand, for three reasons. It stays offline, which is the promise the
// extension makes. It is deterministic, so it can be tested — every entry below
// carries the line it was written against, and a test walks all of them. And a
// pattern has a stable identity, which is what lets a grammar flashcard exist at
// all; a generated explanation has nothing for a review history to hang on.
//
// Explanations say what the shape does to the meaning, in the plainest words
// that are still true. They are read by someone stuck mid-sentence, not by a
// linguist, so "says how the action goes" beats "post-verbal degree complement".

import type { Rule } from './match'

export interface Pattern {
  /** Stable slug. A grammar card's id derives from this, so it must never move. */
  id: string
  /** What the structure is called, in words that mean something to a learner. */
  name: string
  /** The shape, written out: `V + 得 + ADJ`. */
  skeleton: string
  /** What it does to the meaning. One or two sentences. */
  explanation: string
  /** Roughly where this shows up, for intake ordering. */
  hsk: number
  /** How to recognise it. See match.ts. */
  rule: Rule
  /**
   * A line this pattern matches, as `text/reading` pairs.
   *
   * Doubles as documentation and as the table's own regression test — every
   * pattern is asserted to match its example, so the data cannot quietly drift
   * away from the matcher.
   */
  example: string
}

export const PATTERNS: readonly Pattern[] = [
  // ---------------------------------------------------------------- particles
  {
    id: 'de-complement',
    name: 'Degree complement',
    skeleton: 'V + 得 + how',
    explanation:
      'Says how the action goes, rather than what it is. 得 joins the verb to a description of it — 过得很快 is not "passing" plus "fast" but "passes quickly".',
    hsk: 3,
    rule: {
      anchor: '得',
      reading: 'de5',
      before: ['verbal'],
      notAfter: ['了'],
      extent: 'clause',
    },
    example: '过/guo4 得/de5 很/hen3 快/kuai4',
  },
  {
    id: 'de-attributive',
    name: 'Description marker',
    skeleton: 'description + 的 + noun',
    explanation:
      'Everything before 的 describes the noun after it. It is what turns a phrase, or a whole clause, into an adjective.',
    hsk: 1,
    rule: { anchor: '的', reading: 'de5', after: ['content'] },
    example: '我/wo3 的/de5 书/shu1',
  },
  {
    id: 'di-manner',
    name: 'Manner marker',
    skeleton: 'description + 地 + V',
    explanation:
      'Turns the word before it into the manner of the action — the "-ly" ending English would use. 慢慢地走 is "to walk slowly".',
    hsk: 3,
    rule: { anchor: '地', reading: 'de5', before: ['content'], after: ['content'] },
    example: '慢慢/man4man4 地/de5 走/zou3',
  },
  {
    id: 'le-completed-action',
    name: 'Completed action',
    skeleton: 'V + 了 + object',
    explanation:
      'The action is finished. 了 sits straight after the verb — this is about the action being complete, not about when it happened.',
    hsk: 1,
    rule: { anchor: '了', reading: 'le5', before: ['verbal'], after: ['content'] },
    example: '我/wo3 吃/chi1 了/le5 饭/fan4',
  },
  {
    id: 'le-change-of-state',
    name: 'Change of state',
    skeleton: 'sentence + 了',
    explanation:
      'Something is different now from how it was. At the end of a sentence 了 reports the change, not the completion — 我知道了 is "I know now", not "I knew".',
    hsk: 1,
    rule: { anchor: '了', reading: 'le5', atEnd: true },
    example: '我/wo3 知道/zhi1dao4 了/le5',
  },
  {
    id: 'guo-experience',
    name: 'Experience marker',
    skeleton: 'V + 过',
    explanation:
      'This has happened at least once, at some point. It is about having the experience, not about when — 去过中国 is "have been to China".',
    hsk: 2,
    // Recognised by position, not by reading. CC-CEDICT distinguishes the marker
    // (`guo5`) from the verb "to cross" (`guo4`), but only the verb reading
    // survives into real text — it is the declared default, and rightly so,
    // since 时间过得很快 is the verb. What separates them is what follows: the
    // marker takes an object, while the verb here takes a complement with 得.
    rule: {
      anchor: '过',
      before: ['verbal'],
      after: ['content'],
      notAfter: ['得', '的', '地'],
    },
    example: '我/wo3 去/qu4 过/guo4 中国/zhong1guo2',
  },
  {
    id: 'zhe-ongoing',
    name: 'Ongoing state',
    skeleton: 'V + 着',
    explanation:
      'The action is being held rather than happening — a state you could photograph. 站着 is "standing", not "stands up".',
    hsk: 3,
    rule: { anchor: '着', reading: 'zhe5', before: ['verbal'] },
    example: '他/ta1 站/zhan4 着/zhe5',
  },

  // --------------------------------------------------------------- what a
  // sentence is doing: questions, suggestions, mood
  {
    id: 'ma-question',
    name: 'Yes/no question',
    skeleton: 'statement + 吗',
    explanation:
      'Turns a plain statement into a yes/no question without changing anything else about it.',
    hsk: 1,
    rule: { anchor: '吗', atEnd: true },
    example: '你/ni3 是/shi4 学生/xue2sheng1 吗/ma5',
  },
  {
    id: 'ne-question',
    name: 'Question thrown back',
    skeleton: 'topic + 呢',
    explanation:
      'Asks the same question back about something else — "and you?". It also softens a question already asked.',
    hsk: 1,
    rule: { anchor: '呢', atEnd: true },
    example: '你/ni3 呢/ne5',
  },
  {
    id: 'ba-suggestion',
    name: 'Suggestion',
    skeleton: 'sentence + 吧',
    explanation:
      'Makes the sentence a suggestion rather than an instruction, or marks it as a guess. 走吧 is "let\'s go", not "go".',
    hsk: 2,
    rule: { anchor: '吧', atEnd: true },
    example: '走/zou3 吧/ba5',
  },
  {
    id: 'sentence-final-a',
    name: 'Softening particle',
    skeleton: 'sentence + 啊',
    explanation:
      'Adds warmth or feeling to the sentence and softens it. It carries no meaning you can translate — the dictionary calls 啊 an interjection of surprise, but at the end of a sentence it is only tone of voice.',
    hsk: 2,
    rule: { anchor: '啊', atEnd: true },
    example: '很/hen3 好/hao3 啊/a5',
  },
  {
    id: 'haishi-choice',
    name: 'Either/or question',
    skeleton: 'A + 还是 + B',
    explanation:
      'Offers a choice between two things. 还是 is the "or" of questions; a statement uses 或者 instead.',
    hsk: 2,
    rule: { anchor: '还是', after: ['any'] },
    example: '喝茶/he1cha2 还是/hai2shi4 喝水/he1shui3',
  },

  // ------------------------------------------------------ rearranging the
  // sentence: 把, 被, comparison, 是…的
  {
    id: 'ba-construction',
    name: 'Disposal construction',
    skeleton: '把 + object + V',
    explanation:
      'Moves the object in front of the verb to say what was *done to* it. Used when the action changes or moves the object, so the verb almost always carries a result after it.',
    hsk: 3,
    rule: { anchor: '把', reading: 'ba3', after: ['content', 'content'], extent: 'clause' },
    example: '我/wo3 把/ba3 书/shu1 放/fang4 好/hao3',
  },
  {
    id: 'bei-passive',
    name: 'Passive',
    skeleton: 'subject + 被 + doer + V',
    explanation:
      'The subject has the action done to them. Often, though not always, about something unwelcome.',
    hsk: 3,
    rule: { anchor: '被', reading: 'bei4', after: ['content'], extent: 'clause' },
    example: '他/ta1 被/bei4 老师/lao3shi1 批评/pi1ping2 了/le5',
  },
  {
    id: 'bi-comparison',
    name: 'Comparison',
    skeleton: 'A + 比 + B + adjective',
    explanation:
      'A is more ___ than B. The adjective takes no 很 here — 他比我高 is "he is taller than me".',
    hsk: 2,
    rule: { anchor: '比', reading: 'bi3', before: ['any'], after: ['any'], extent: 'clause' },
    example: '他/ta1 比/bi3 我/wo3 高/gao1',
  },
  {
    id: 'shi-de',
    name: 'Focus frame',
    skeleton: '是 + detail + V + 的',
    explanation:
      'Points at one detail of something already known to have happened — when, where, or how. 我是昨天来的 answers "when did you come", not "did you come".',
    hsk: 3,
    rule: { anchor: '的', reading: 'de5', atEnd: true, requires: ['是'] },
    example: '我/wo3 是/shi4 昨天/zuo2tian1 来/lai2 的/de5',
  },
  {
    id: 'zhengzai-progressive',
    name: 'Happening right now',
    skeleton: '正在 + V',
    explanation: 'The action is in progress at this moment.',
    hsk: 2,
    rule: { anchor: '正在', after: ['content'] },
    example: '他/ta1 正在/zheng4zai4 吃饭/chi1fan4',
  },

  // ------------------------------------------------------------ paired
  // conjunctions: the shapes that span a whole sentence
  {
    id: 'yinwei-suoyi',
    name: 'Because / so',
    skeleton: '因为 … 所以 …',
    explanation:
      'Cause then result. Chinese keeps both halves where English would drop one — saying both 因为 and 所以 is normal, not redundant.',
    hsk: 2,
    rule: { anchor: '所以', requires: ['因为'], after: ['any'], extent: 'clause' },
    example: '因为/yin1wei4 累/lei4 所以/suo3yi3 睡/shui4',
  },
  {
    id: 'suiran-danshi',
    name: 'Although / but',
    skeleton: '虽然 … 但是 …',
    explanation:
      'Concession then contrast. Again both halves are said, where English uses only one.',
    hsk: 3,
    rule: { anchor: '但是', requires: ['虽然'], after: ['any'], extent: 'clause' },
    example: '虽然/sui1ran2 累/lei4 但是/dan4shi4 高兴/gao1xing4',
  },
  {
    id: 'ruguo-jiu',
    name: 'If / then',
    skeleton: '如果 … 就 …',
    explanation: 'A condition and what follows from it. 就 marks the second half as the consequence.',
    hsk: 3,
    rule: { anchor: '就', requires: ['如果'], after: ['any'], extent: 'clause' },
    example: '如果/ru2guo3 下雨/xia4yu3 就/jiu4 回家/hui2jia1',
  },
  {
    id: 'budan-erqie',
    name: 'Not only / but also',
    skeleton: '不但 … 而且 …',
    explanation: 'Adds a second, stronger point to the first rather than merely listing it.',
    hsk: 3,
    rule: { anchor: '而且', requires: ['不但'], after: ['any'], extent: 'clause' },
    example: '不但/bu4dan4 好/hao3 而且/er2qie3 便宜/pian2yi5',
  },
  {
    id: 'zhiyao-jiu',
    name: 'As long as',
    skeleton: '只要 … 就 …',
    explanation: 'States the one condition that is enough for the result to follow.',
    hsk: 4,
    rule: { anchor: '就', requires: ['只要'], after: ['any'], extent: 'clause' },
    example: '只要/zhi3yao4 努力/nu3li4 就/jiu4 行/xing2',
  },
  {
    id: 'zhiyou-cai',
    name: 'Only if',
    skeleton: '只有 … 才 …',
    explanation:
      'States the one condition without which the result cannot happen. Stronger than 只要 — 才 marks the result as hard-won.',
    hsk: 4,
    rule: { anchor: '才', requires: ['只有'], after: ['any'], extent: 'clause' },
    example: '只有/zhi3you3 努力/nu3li4 才/cai2 行/xing2',
  },
  {
    id: 'cong-dao',
    name: 'From / to',
    skeleton: '从 … 到 …',
    explanation: 'Marks a span with two ends, in time or in space.',
    hsk: 2,
    rule: { anchor: '到', requires: ['从'], after: ['any'], extent: 'clause' },
    example: '从/cong2 北京/bei3jing1 到/dao4 上海/shang4hai3',
  },

  // ------------------------------------------------------------- coverbs
  {
    id: 'gei-benefactive',
    name: 'Done for someone',
    skeleton: '给 + person + V',
    explanation: 'Marks who the action is done for, or given to.',
    hsk: 2,
    rule: { anchor: '给', reading: 'gei3', after: ['any', 'content'] },
    example: '我/wo3 给/gei3 他/ta1 打电话/da3dian4hua4',
  },
  {
    id: 'dui-towards',
    name: 'Directed at',
    skeleton: '对 + person + V',
    explanation:
      'Marks who or what the action is aimed at — 对我说 is "said to me". Also used for attitudes towards something.',
    hsk: 3,
    rule: { anchor: '对', reading: 'dui4', after: ['any', 'content'] },
    example: '他/ta1 对/dui4 我/wo3 说/shuo1',
  },
  {
    id: 'zai-location',
    name: 'Where it happens',
    skeleton: '在 + place + V',
    explanation:
      'Marks where the action takes place. The place comes before the verb, not after it as in English.',
    hsk: 1,
    rule: { anchor: '在', reading: 'zai4', after: ['content', 'content'] },
    example: '我/wo3 在/zai4 家/jia1 吃饭/chi1fan4',
  },
  {
    id: 'yong-instrument',
    name: 'Done with',
    skeleton: '用 + thing + V',
    explanation: 'Marks the tool or means the action is carried out with.',
    hsk: 3,
    rule: { anchor: '用', reading: 'yong4', after: ['content', 'content'] },
    example: '他/ta1 用/yong4 筷子/kuai4zi5 吃/chi1',
  },
]
