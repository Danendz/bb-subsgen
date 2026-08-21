// The closed class of words that do grammatical work rather than carry meaning.
//
// One table, three jobs:
//   1. Segmentation cost — a stranded function character is normal, a stranded
//      content character is a bad parse. See `segment`.
//   2. The dimmed treatment on screen: seeing at a glance which characters are
//      structure is most of what makes a line parseable by eye.
//   3. Pattern matching, which needs to know what a character *does* without a
//      part-of-speech tagger.
//
// Closed class means this file has an end. It is not a frequency list and it is
// not trying to be a dictionary — CC-CEDICT already is one. Every entry here is
// a word whose job is to hold other words together.

export type PartOfSpeech =
  /** Attaches to a word or clause and changes how it is read. Carries no meaning alone. */
  | 'particle'
  /** Stands in for a noun. */
  | 'pronoun'
  /** Points at something: this, that, which. */
  | 'demonstrative'
  /** Modifies a verb or adjective: degree, time, frequency, negation. */
  | 'adverb'
  /** Marks a noun's role in the sentence — the closest Chinese has to a preposition. */
  | 'coverb'
  /** Joins clauses or phrases. */
  | 'conjunction'
  /** Sits before a main verb: can, must, want to, should. */
  | 'auxiliary'
  /** The counter a number needs before a noun. */
  | 'measure'
  /** Numbers and quantity words. */
  | 'number'

export interface FunctionWord {
  word: string
  pos: PartOfSpeech
  /**
   * What the word does, in one plain-language line.
   *
   * Written to be read mid-sentence by someone who is stuck, so it says what the
   * word is doing here rather than what it translates to — several of these have
   * no translation at all.
   */
  does: string
  /**
   * The reading this character has by default, in CC-CEDICT's numeric notation.
   *
   * Declared rather than inferred, because ranking the dictionary gets function
   * characters exactly backwards. Sense count is a good guide for content
   * characters — 说 really is `shuo1` rather than `shui4` — but a particle's
   * grammatical reading is the commonest one on screen and the thinnest one in
   * the dictionary: 了 as `le5` carries three senses against `liao3`'s four, and
   * 那 as `na4` loses outright to an archaic `nuo2`.
   *
   * This is the *default*, not the grammatical reading. 过 is listed here as the
   * experience marker but reads `guo4`, because standing alone it is far more
   * often the ordinary verb. Context overrides it — see reading.ts.
   */
  reading?: string
}

export const FUNCTION_WORDS: readonly FunctionWord[] = [
  // Particles. The ones that carry no meaning and are therefore the hardest to
  // look up, because a dictionary can only describe them.
  {
    word: '的',
    pos: 'particle',
    reading: 'de5',
    does: 'Links a description to the noun it describes.',
  },
  {
    word: '地',
    pos: 'particle',
    reading: 'de5',
    does: 'Turns the word before it into a manner: "-ly".',
  },
  {
    word: '得',
    pos: 'particle',
    reading: 'de5',
    does: 'Joins a verb to how it goes — the complement follows.',
  },
  {
    word: '了',
    pos: 'particle',
    reading: 'le5',
    does: 'Marks a completed action, or a change of state.',
  },
  {
    word: '着',
    pos: 'particle',
    reading: 'zhe5',
    does: 'The action is ongoing — a state being held.',
  },
  {
    word: '过',
    pos: 'particle',
    reading: 'guo4',
    does: 'Marks experience: this has happened at least once.',
  },
  {
    word: '吗',
    pos: 'particle',
    reading: 'ma5',
    does: 'Turns the sentence into a yes/no question.',
  },
  { word: '呢', pos: 'particle', reading: 'ne5', does: 'Softens a question, or asks it back.' },
  {
    word: '吧',
    pos: 'particle',
    reading: 'ba5',
    does: 'Suggests, or supposes — makes a sentence less firm.',
  },
  {
    word: '啊',
    pos: 'particle',
    reading: 'a5',
    does: 'Softens the sentence and adds warmth or feeling.',
  },
  { word: '呀', pos: 'particle', reading: 'ya5', does: 'A softer 啊, used after a vowel sound.' },
  { word: '嘛', pos: 'particle', reading: 'ma5', does: 'Marks the obvious: "as you know".' },
  {
    word: '吗',
    pos: 'particle',
    reading: 'ma5',
    does: 'Turns the sentence into a yes/no question.',
  },
  { word: '的话', pos: 'particle', does: 'Closes an "if" clause.' },
  { word: '而已', pos: 'particle', does: '"and nothing more" — plays the sentence down.' },
  { word: '罢了', pos: 'particle', does: '"that is all" — plays the sentence down.' },

  // Pronouns.
  { word: '我', pos: 'pronoun', reading: 'wo3', does: 'I, me.' },
  { word: '你', pos: 'pronoun', reading: 'ni3', does: 'you.' },
  { word: '您', pos: 'pronoun', reading: 'nin2', does: 'you, politely.' },
  { word: '他', pos: 'pronoun', reading: 'ta1', does: 'he, him.' },
  { word: '她', pos: 'pronoun', reading: 'ta1', does: 'she, her.' },
  { word: '它', pos: 'pronoun', reading: 'ta1', does: 'it.' },
  { word: '我们', pos: 'pronoun', does: 'we, us.' },
  { word: '你们', pos: 'pronoun', does: 'you, plural.' },
  { word: '他们', pos: 'pronoun', does: 'they, them.' },
  { word: '她们', pos: 'pronoun', does: 'they, them — all female.' },
  { word: '咱们', pos: 'pronoun', does: 'we, including you.' },
  { word: '自己', pos: 'pronoun', does: 'oneself.' },
  { word: '大家', pos: 'pronoun', does: 'everyone.' },
  { word: '别人', pos: 'pronoun', does: 'other people.' },
  { word: '谁', pos: 'pronoun', reading: 'shei2', does: 'who.' },
  { word: '什么', pos: 'pronoun', does: 'what.' },
  { word: '怎么', pos: 'pronoun', does: 'how.' },
  { word: '为什么', pos: 'pronoun', does: 'why.' },
  { word: '多少', pos: 'pronoun', does: 'how much, how many.' },

  // Demonstratives.
  { word: '这', pos: 'demonstrative', reading: 'zhe4', does: 'this.' },
  { word: '那', pos: 'demonstrative', reading: 'na4', does: 'that.' },
  { word: '哪', pos: 'demonstrative', reading: 'na3', does: 'which.' },
  { word: '这个', pos: 'demonstrative', does: 'this one.' },
  { word: '那个', pos: 'demonstrative', does: 'that one.' },
  { word: '哪个', pos: 'demonstrative', does: 'which one.' },
  { word: '这些', pos: 'demonstrative', does: 'these.' },
  { word: '那些', pos: 'demonstrative', does: 'those.' },
  { word: '这样', pos: 'demonstrative', does: 'like this.' },
  { word: '那样', pos: 'demonstrative', does: 'like that.' },
  { word: '这里', pos: 'demonstrative', does: 'here.' },
  { word: '那里', pos: 'demonstrative', does: 'there.' },
  { word: '这儿', pos: 'demonstrative', does: 'here.' },
  { word: '那儿', pos: 'demonstrative', does: 'there.' },
  { word: '每', pos: 'demonstrative', reading: 'mei3', does: 'every.' },
  { word: '各', pos: 'demonstrative', reading: 'ge4', does: 'each.' },
  { word: '某', pos: 'demonstrative', reading: 'mou3', does: 'a certain.' },

  // Adverbs — degree, time, frequency, negation, mood.
  {
    word: '很',
    pos: 'adverb',
    reading: 'hen3',
    does: 'Marks a plain adjective. Often weaker than "very".',
  },
  { word: '太', pos: 'adverb', reading: 'tai4', does: 'too, excessively.' },
  { word: '更', pos: 'adverb', reading: 'geng4', does: 'more, still more.' },
  { word: '最', pos: 'adverb', reading: 'zui4', does: 'most — the superlative.' },
  { word: '非常', pos: 'adverb', does: 'extremely.' },
  { word: '特别', pos: 'adverb', does: 'especially.' },
  { word: '十分', pos: 'adverb', does: 'thoroughly, fully.' },
  {
    word: '不',
    pos: 'adverb',
    reading: 'bu4',
    does: 'Negates. Used for habits, states and the future.',
  },
  { word: '没', pos: 'adverb', reading: 'mei2', does: 'Negates a completed action, or 有.' },
  { word: '没有', pos: 'adverb', does: 'Negates a completed action: it did not happen.' },
  { word: '别', pos: 'adverb', reading: 'bie2', does: "don't — a negative command." },
  { word: '都', pos: 'adverb', reading: 'dou1', does: 'all — sums up what came before it.' },
  { word: '也', pos: 'adverb', reading: 'ye3', does: 'also, too.' },
  { word: '还', pos: 'adverb', reading: 'hai2', does: 'still, in addition.' },
  {
    word: '又',
    pos: 'adverb',
    reading: 'you4',
    does: 'again — of something that already happened.',
  },
  { word: '再', pos: 'adverb', reading: 'zai4', does: 'again — of something still to happen.' },
  {
    word: '就',
    pos: 'adverb',
    reading: 'jiu4',
    does: 'Then, right away — sooner or easier than expected.',
  },
  {
    word: '才',
    pos: 'adverb',
    reading: 'cai2',
    does: 'Only then — later or harder than expected.',
  },
  { word: '已经', pos: 'adverb', does: 'already.' },
  { word: '曾经', pos: 'adverb', does: 'once, formerly.' },
  { word: '正在', pos: 'adverb', does: 'Marks an action in progress right now.' },
  { word: '刚', pos: 'adverb', reading: 'gang1', does: 'just now.' },
  { word: '刚才', pos: 'adverb', does: 'a moment ago.' },
  { word: '马上', pos: 'adverb', does: 'immediately.' },
  { word: '立刻', pos: 'adverb', does: 'at once.' },
  { word: '常常', pos: 'adverb', does: 'often.' },
  { word: '经常', pos: 'adverb', does: 'frequently.' },
  { word: '总是', pos: 'adverb', does: 'always.' },
  { word: '一直', pos: 'adverb', does: 'continuously, all along.' },
  { word: '从来', pos: 'adverb', does: 'ever — nearly always with a negative.' },
  { word: '一定', pos: 'adverb', does: 'certainly.' },
  { word: '可能', pos: 'adverb', does: 'possibly.' },
  { word: '也许', pos: 'adverb', does: 'perhaps.' },
  { word: '大概', pos: 'adverb', does: 'roughly, probably.' },
  { word: '几乎', pos: 'adverb', does: 'almost.' },
  { word: '只', pos: 'adverb', reading: 'zhi3', does: 'only.' },
  { word: '甚至', pos: 'adverb', does: 'even — pushing to an extreme.' },
  { word: '却', pos: 'adverb', reading: 'que4', does: 'yet, contrary to expectation.' },
  { word: '竟然', pos: 'adverb', does: 'unexpectedly — marks surprise.' },
  { word: '居然', pos: 'adverb', does: 'unexpectedly — marks surprise.' },
  { word: '反而', pos: 'adverb', does: 'on the contrary.' },

  // Coverbs — the role-markers that read like prepositions.
  {
    word: '在',
    pos: 'coverb',
    reading: 'zai4',
    does: 'Marks where — or, before a verb, that it is ongoing.',
  },
  { word: '从', pos: 'coverb', reading: 'cong2', does: 'Marks the starting point: from.' },
  { word: '到', pos: 'coverb', reading: 'dao4', does: 'Marks the end point: to, until.' },
  { word: '向', pos: 'coverb', reading: 'xiang4', does: 'Marks the direction faced: towards.' },
  { word: '往', pos: 'coverb', reading: 'wang3', does: 'Marks the direction travelled: towards.' },
  {
    word: '对',
    pos: 'coverb',
    reading: 'dui4',
    does: 'Marks who or what is addressed: to, towards.',
  },
  { word: '跟', pos: 'coverb', reading: 'gen1', does: 'Marks who it is done with: with.' },
  { word: '给', pos: 'coverb', reading: 'gei3', does: 'Marks who benefits: for, to.' },
  { word: '为', pos: 'coverb', reading: 'wei4', does: 'Marks the reason or beneficiary: for.' },
  { word: '为了', pos: 'coverb', does: 'Marks the purpose: in order to.' },
  {
    word: '把',
    pos: 'coverb',
    reading: 'ba3',
    does: 'Moves the object in front of the verb, to say what was done to it.',
  },
  {
    word: '被',
    pos: 'coverb',
    reading: 'bei4',
    does: 'Marks the passive: the subject has it done to them.',
  },
  {
    word: '比',
    pos: 'coverb',
    reading: 'bi3',
    does: 'Marks a comparison: A 比 B is "A more than B".',
  },
  { word: '用', pos: 'coverb', reading: 'yong4', does: 'Marks the means: using, with.' },
  { word: '由', pos: 'coverb', reading: 'you2', does: 'Marks who does it, in formal writing.' },
  { word: '离', pos: 'coverb', reading: 'li2', does: 'Marks distance from a point.' },
  { word: '除了', pos: 'coverb', does: 'except for, besides.' },
  { word: '关于', pos: 'coverb', does: 'about, concerning.' },
  { word: '根据', pos: 'coverb', does: 'according to.' },
  { word: '按照', pos: 'coverb', does: 'in accordance with.' },
  { word: '通过', pos: 'coverb', does: 'by way of, through.' },
  { word: '随着', pos: 'coverb', does: 'along with, as.' },

  // Conjunctions.
  { word: '和', pos: 'conjunction', reading: 'he2', does: 'and — joins nouns, not clauses.' },
  { word: '或者', pos: 'conjunction', does: 'or — in a statement.' },
  { word: '还是', pos: 'conjunction', does: 'or — in a question.' },
  { word: '但是', pos: 'conjunction', does: 'but.' },
  { word: '可是', pos: 'conjunction', does: 'but.' },
  { word: '不过', pos: 'conjunction', does: 'though — a mild "but".' },
  { word: '然而', pos: 'conjunction', does: 'however.' },
  { word: '因为', pos: 'conjunction', does: 'because.' },
  { word: '所以', pos: 'conjunction', does: 'so, therefore.' },
  { word: '由于', pos: 'conjunction', does: 'owing to.' },
  { word: '因此', pos: 'conjunction', does: 'hence.' },
  { word: '虽然', pos: 'conjunction', does: 'although — 但是 usually follows.' },
  { word: '尽管', pos: 'conjunction', does: 'even though.' },
  { word: '如果', pos: 'conjunction', does: 'if.' },
  { word: '要是', pos: 'conjunction', does: 'if — more colloquial.' },
  { word: '那么', pos: 'conjunction', does: 'then, in that case.' },
  { word: '而且', pos: 'conjunction', does: "and what's more." },
  { word: '并且', pos: 'conjunction', does: 'and also.' },
  { word: '不但', pos: 'conjunction', does: 'not only — 而且 usually follows.' },
  { word: '不仅', pos: 'conjunction', does: 'not only.' },
  { word: '只要', pos: 'conjunction', does: 'as long as.' },
  { word: '只有', pos: 'conjunction', does: 'only if — 才 usually follows.' },
  { word: '除非', pos: 'conjunction', does: 'unless.' },
  { word: '无论', pos: 'conjunction', does: 'no matter what.' },
  { word: '不管', pos: 'conjunction', does: 'regardless of.' },

  // Auxiliaries.
  {
    word: '是',
    pos: 'auxiliary',
    reading: 'shi4',
    does: 'Links two nouns: is, am, are. Not used with adjectives.',
  },
  {
    word: '会',
    pos: 'auxiliary',
    reading: 'hui4',
    does: 'Knows how to — or, of the future, will.',
  },
  { word: '能', pos: 'auxiliary', reading: 'neng2', does: 'Is able to, is permitted to.' },
  { word: '可以', pos: 'auxiliary', does: 'may, is allowed to.' },
  { word: '要', pos: 'auxiliary', reading: 'yao4', does: 'wants to, is going to.' },
  { word: '想', pos: 'auxiliary', reading: 'xiang3', does: 'would like to.' },
  { word: '应该', pos: 'auxiliary', does: 'should, ought to.' },
  { word: '必须', pos: 'auxiliary', does: 'must.' },
  { word: '愿意', pos: 'auxiliary', does: 'is willing to.' },
  { word: '敢', pos: 'auxiliary', reading: 'gan3', does: 'dares to.' },
  { word: '需要', pos: 'auxiliary', does: 'needs to.' },
  { word: '有', pos: 'auxiliary', reading: 'you3', does: 'has — and marks existence: there is.' },

  // Measure words. The common ones only; CC-CEDICT carries the rest.
  {
    word: '个',
    pos: 'measure',
    reading: 'ge4',
    does: 'The general counter, used when no other fits.',
  },
  { word: '位', pos: 'measure', reading: 'wei4', does: 'Counts people, politely.' },
  { word: '条', pos: 'measure', reading: 'tiao2', does: 'Counts long, winding things.' },
  { word: '张', pos: 'measure', reading: 'zhang1', does: 'Counts flat things.' },
  { word: '本', pos: 'measure', reading: 'ben3', does: 'Counts books.' },
  { word: '件', pos: 'measure', reading: 'jian4', does: 'Counts matters and garments.' },
  { word: '双', pos: 'measure', reading: 'shuang1', does: 'Counts pairs.' },
  { word: '些', pos: 'measure', reading: 'xie1', does: 'some, a few.' },
  { word: '点', pos: 'measure', reading: 'dian3', does: 'a bit of.' },
  { word: '次', pos: 'measure', reading: 'ci4', does: 'Counts times an action happened.' },
  { word: '遍', pos: 'measure', reading: 'bian4', does: 'Counts times through, start to finish.' },
  { word: '下', pos: 'measure', reading: 'xia4', does: 'Counts brief goes at something.' },

  // Numbers.
  { word: '一', pos: 'number', reading: 'yi1', does: 'one.' },
  { word: '二', pos: 'number', reading: 'er4', does: 'two — counting.' },
  { word: '两', pos: 'number', reading: 'liang3', does: 'two — of things, before a measure word.' },
  { word: '三', pos: 'number', reading: 'san1', does: 'three.' },
  { word: '四', pos: 'number', reading: 'si4', does: 'four.' },
  { word: '五', pos: 'number', reading: 'wu3', does: 'five.' },
  { word: '六', pos: 'number', reading: 'liu4', does: 'six.' },
  { word: '七', pos: 'number', reading: 'qi1', does: 'seven.' },
  { word: '八', pos: 'number', reading: 'ba1', does: 'eight.' },
  { word: '九', pos: 'number', reading: 'jiu3', does: 'nine.' },
  { word: '十', pos: 'number', reading: 'shi2', does: 'ten.' },
  { word: '百', pos: 'number', reading: 'bai3', does: 'hundred.' },
  { word: '千', pos: 'number', reading: 'qian1', does: 'thousand.' },
  {
    word: '万',
    pos: 'number',
    reading: 'wan4',
    does: 'ten thousand — the unit Chinese counts in.',
  },
  { word: '零', pos: 'number', reading: 'ling2', does: 'zero.' },
  { word: '第', pos: 'number', reading: 'di4', does: 'Makes a number ordinal: 第一 is "first".' },
  { word: '半', pos: 'number', reading: 'ban4', does: 'half.' },
  { word: '几', pos: 'number', reading: 'ji3', does: 'a few — or, in a question, how many.' },
]

const BY_WORD: ReadonlyMap<string, FunctionWord> = new Map(
  FUNCTION_WORDS.map((entry) => [entry.word, entry]),
)

export function functionWord(word: string): FunctionWord | undefined {
  return BY_WORD.get(word)
}

export function isFunctionWord(word: string): boolean {
  return BY_WORD.has(word)
}

/** Classes that name or connect things, and so can never be the verb of a clause. */
const NOMINAL: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'pronoun',
  'demonstrative',
  'number',
  'measure',
  'conjunction',
])

/**
 * Whether a word names or connects rather than acts.
 *
 * The negative of "is this a verb", and deliberately so. Asking the positive
 * question needs a part-of-speech tagger, and approximating it as "outside the
 * closed class" gets 过 in 时间过得很快 wrong — it is listed here as the
 * experience marker but is plainly the main verb there. Asking which words can
 * *never* head a clause needs no tagger: they are named in the table above.
 *
 * Used by the reading rules to tell 得 `de5` from 得 `dei3`, and by the pattern
 * matcher to decide whether a complement has anything to attach to. One
 * definition, because two would drift apart.
 */
export function isNominal(word: string): boolean {
  const pos = BY_WORD.get(word)?.pos
  return pos !== undefined && NOMINAL.has(pos)
}
