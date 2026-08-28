// Guessing which dictionary form a conjugated Japanese word came from.
//
// 食べる appears on the page as 食べて, 食べた, 食べません, and none of those is
// a headword. This is the table that undoes that, and the reason `ja/segment.ts`
// can be a plain longest match: the segmenter tries the literal span first and
// only asks here on a miss.
//
// **Nothing here is looked up.** The module imports no index and holds no
// dictionary — it is a pure function over a string, which is what lets the table
// be tested without a JMdict install. Validating a candidate is the caller's
// job, and it has to be: 言った and 行った are both real past tenses of real
// verbs, and only the dictionary can say that 行つ is not a word while 言う is.
//
// **Intermediates are never candidates for a lookup either.** 食べさせられ is
// not a headword, and a table that stopped to check would reject every stacked
// form. Each step just hands the next one a string and the class that string
// would have to be.
//
// **Classes are JMdict's own codes**, which is what makes validation free:
// `WORD_CLASSES` in `entries.ts` already writes exactly one of them per headword
// into the lexicon line, so the caller compares two strings. The four `stem-*`
// classes below are the exception — they name a 未然形 / 連用形 / 仮定形 / 意向形
// mid-chain, are matched by nothing in the lexicon, and exist so that ない and
// ます do not each need one rule per godan row.

/** One step back toward the dictionary form. */
interface Rule {
  /** The inflected ending, as it appears on the page. */
  from: string
  /** What it becomes one step back toward the dictionary form. */
  to: string
  /** The class the *surface* must be, or null for any. */
  fromClass: string | null
  /** The class the result is, and what the next rule up must accept. */
  toClass: string
  /**
   * The form this undoes, for the reader of the table. `'past'`, `'te'`, …
   *
   * Empty on the `stem-*` rules: resolving a 連用形 to its dictionary form is
   * bookkeeping inside the table, not a form a learner conjugated.
   */
  form: string
}

export interface Candidate {
  /** The guessed dictionary form. */
  text: string
  /** The class it must have in `index.classes` to be accepted. */
  class: string
  /** The forms peeled off, outermost first — `['past', 'causative']`. */
  forms: string[]
}

/**
 * How many suffixes may be peeled off one word.
 *
 * 使わせられたくなかった is five stacked suffixes over the base, and nothing
 * natural has been found deeper. The rules are mutually recursive — な undoes to
 * ない which undoes again — so an adversarial kana run walks forever without a
 * bound.
 */
const MAX_DEINFLECTIONS = 6

/** One godan row, in the four stems every auxiliary attaches to. */
interface GodanRow {
  /** 未然形 — ない, れる, せる. */
  a: string
  /** 連用形 — ます, たい. */
  i: string
  /** 仮定形 and the bare imperative — ば. */
  e: string
  /** 意向形 — う. */
  o: string
  /** The dictionary ending the four resolve to. */
  dict: string
  /** JMdict's class for a verb with that ending. */
  cls: string
}

// One entry per class rather than per ending, because two classes can share an
// ending and only the dictionary can separate them: 行く is `v5k-s` and 書く is
// `v5k`, which is the whole reason 行った does not resolve to 行つ.
const GODAN_ROWS: GodanRow[] = [
  { a: 'か', i: 'き', e: 'け', o: 'こ', dict: 'く', cls: 'v5k' },
  { a: 'か', i: 'き', e: 'け', o: 'こ', dict: 'く', cls: 'v5k-s' },
  { a: 'が', i: 'ぎ', e: 'げ', o: 'ご', dict: 'ぐ', cls: 'v5g' },
  { a: 'さ', i: 'し', e: 'せ', o: 'そ', dict: 'す', cls: 'v5s' },
  { a: 'た', i: 'ち', e: 'て', o: 'と', dict: 'つ', cls: 'v5t' },
  { a: 'な', i: 'に', e: 'ね', o: 'の', dict: 'ぬ', cls: 'v5n' },
  { a: 'ば', i: 'び', e: 'べ', o: 'ぼ', dict: 'ぶ', cls: 'v5b' },
  { a: 'ま', i: 'み', e: 'め', o: 'も', dict: 'む', cls: 'v5m' },
  { a: 'ら', i: 'り', e: 'れ', o: 'ろ', dict: 'る', cls: 'v5r' },
  { a: 'ら', i: 'り', e: 'れ', o: 'ろ', dict: 'る', cls: 'v5r-i' },
  { a: 'ら', i: 'り', e: 'れ', o: 'ろ', dict: 'る', cls: 'v5aru' },
  { a: 'わ', i: 'い', e: 'え', o: 'お', dict: 'う', cls: 'v5u' },
  { a: 'わ', i: 'い', e: 'え', o: 'お', dict: 'う', cls: 'v5u-s' },
]

/** A 未然形 / 連用形 / 仮定形 / 意向形 put back into a dictionary form. */
const STEM_RULES: Rule[] = [
  ...GODAN_ROWS.flatMap((row): Rule[] => [
    { from: row.a, to: row.dict, fromClass: 'stem-a', toClass: row.cls, form: '' },
    { from: row.i, to: row.dict, fromClass: 'stem-i', toClass: row.cls, form: '' },
    { from: row.e, to: row.dict, fromClass: 'stem-e', toClass: row.cls, form: '' },
    { from: row.o, to: row.dict, fromClass: 'stem-o', toClass: row.cls, form: '' },
  ]),
  // An ichidan stem carries no ending of its own — 食べ is 食べる minus る — so
  // the rule appends rather than replaces. It is also what reaches a godan
  // potential: 書けない peels to 書け, which is the 未然形 of the ichidan verb
  // 書ける, and the `potential` rules below then take that the rest of the way.
  { from: '', to: 'る', fromClass: 'stem-a', toClass: 'v1', form: '' },
  { from: '', to: 'る', fromClass: 'stem-a', toClass: 'v1-s', form: '' },
  { from: '', to: 'る', fromClass: 'stem-i', toClass: 'v1', form: '' },
  { from: '', to: 'る', fromClass: 'stem-i', toClass: 'v1-s', form: '' },
  // する and 来る, whose stems are not any row above. `vs` is the class JMdict
  // gives the *noun* in 勉強する, so the headword to look up is 勉強 with the し
  // and everything after it gone.
  { from: 'し', to: 'する', fromClass: 'stem-a', toClass: 'vs-i', form: '' },
  { from: 'し', to: 'する', fromClass: 'stem-i', toClass: 'vs-i', form: '' },
  { from: 'し', to: '', fromClass: 'stem-a', toClass: 'vs', form: '' },
  { from: 'し', to: '', fromClass: 'stem-i', toClass: 'vs', form: '' },
  { from: 'さ', to: 'する', fromClass: 'stem-a', toClass: 'vs-i', form: '' },
  { from: 'こ', to: 'くる', fromClass: 'stem-a', toClass: 'vk', form: '' },
  { from: 'き', to: 'くる', fromClass: 'stem-i', toClass: 'vk', form: '' },
  { from: '来', to: '来る', fromClass: 'stem-a', toClass: 'vk', form: '' },
  { from: '来', to: '来る', fromClass: 'stem-i', toClass: 'vk', form: '' },
]

/**
 * The godan te/ta sound changes, which are per consonant and not per verb.
 *
 * 書いた, 泳いだ, 飲んだ, 買った: four different endings for one tense, and the
 * voicing on 泳いだ is the kind of thing that is silently wrong rather than
 * obviously wrong — 泳いた resolves to nothing at all, which looks like a word
 * the dictionary is missing.
 */
const CONNECTIVE: { ta: string; te: string; dict: string; cls: string }[] = [
  { ta: 'いた', te: 'いて', dict: 'く', cls: 'v5k' },
  { ta: 'いだ', te: 'いで', dict: 'ぐ', cls: 'v5g' },
  { ta: 'した', te: 'して', dict: 'す', cls: 'v5s' },
  { ta: 'んだ', te: 'んで', dict: 'ぬ', cls: 'v5n' },
  { ta: 'んだ', te: 'んで', dict: 'ぶ', cls: 'v5b' },
  { ta: 'んだ', te: 'んで', dict: 'む', cls: 'v5m' },
  { ta: 'った', te: 'って', dict: 'う', cls: 'v5u' },
  { ta: 'った', te: 'って', dict: 'つ', cls: 'v5t' },
  { ta: 'った', te: 'って', dict: 'る', cls: 'v5r' },
  { ta: 'った', te: 'って', dict: 'る', cls: 'v5r-i' },
  { ta: 'った', te: 'って', dict: 'る', cls: 'v5aru' },
  // 行く is the one godan verb whose te-form does not follow its ending: it is
  // 行った, not 行いた. Without this row 行った peels to 行つ, which the class
  // check then has to throw away — and 行く never comes back at all.
  { ta: 'った', te: 'って', dict: 'く', cls: 'v5k-s' },
  // 問う, 訪う — the `-s` in `v5u-s` is exactly this: 問うた, not 問った.
  { ta: 'うた', te: 'うて', dict: 'う', cls: 'v5u-s' },
]

const RULES: Rule[] = [
  ...STEM_RULES,

  ...CONNECTIVE.flatMap((row): Rule[] => [
    { from: row.ta, to: row.dict, fromClass: null, toClass: row.cls, form: 'past' },
    { from: row.te, to: row.dict, fromClass: null, toClass: row.cls, form: 'te' },
  ]),

  // The ichidan and irregular past and te-forms, which carry no sound change.
  { from: 'た', to: 'る', fromClass: null, toClass: 'v1', form: 'past' },
  { from: 'た', to: 'る', fromClass: null, toClass: 'v1-s', form: 'past' },
  { from: 'て', to: 'る', fromClass: null, toClass: 'v1', form: 'te' },
  { from: 'て', to: 'る', fromClass: null, toClass: 'v1-s', form: 'te' },
  { from: 'した', to: 'する', fromClass: null, toClass: 'vs-i', form: 'past' },
  { from: 'して', to: 'する', fromClass: null, toClass: 'vs-i', form: 'te' },
  { from: 'した', to: '', fromClass: null, toClass: 'vs', form: 'past' },
  { from: 'して', to: '', fromClass: null, toClass: 'vs', form: 'te' },
  { from: 'きた', to: 'くる', fromClass: null, toClass: 'vk', form: 'past' },
  { from: 'きて', to: 'くる', fromClass: null, toClass: 'vk', form: 'te' },
  { from: '来た', to: '来る', fromClass: null, toClass: 'vk', form: 'past' },
  { from: '来て', to: '来る', fromClass: null, toClass: 'vk', form: 'te' },

  // Everything that stacks on a te-form or a past goes back to it rather than
  // repeating the thirteen sound changes above: 飲んでいなかった peels ている
  // off to reach 飲んで, and only then becomes 飲む.
  { from: 'ている', to: 'て', fromClass: null, toClass: 'te', form: 'progressive' },
  { from: 'でいる', to: 'で', fromClass: null, toClass: 'te', form: 'progressive' },
  { from: 'てる', to: 'て', fromClass: null, toClass: 'te', form: 'progressive' },
  { from: 'でる', to: 'で', fromClass: null, toClass: 'te', form: 'progressive' },
  { from: 'たら', to: 'た', fromClass: null, toClass: 'ta', form: 'conditional' },
  { from: 'だら', to: 'だ', fromClass: null, toClass: 'ta', form: 'conditional' },

  // Negative. なかった is not listed: it is な + かった, and the い-adjective
  // past below already turns it into ない.
  { from: 'ない', to: '', fromClass: null, toClass: 'stem-a', form: 'negative' },
  { from: 'ず', to: '', fromClass: null, toClass: 'stem-a', form: 'negative' },
  { from: 'ぬ', to: '', fromClass: null, toClass: 'stem-a', form: 'negative' },

  // Polite. ませんでした is one rule rather than ません plus a past, because
  // でした is not a form of the verb — it is a different word entirely.
  { from: 'ます', to: '', fromClass: null, toClass: 'stem-i', form: 'polite' },
  { from: 'ました', to: '', fromClass: null, toClass: 'stem-i', form: 'polite past' },
  { from: 'ません', to: '', fromClass: null, toClass: 'stem-i', form: 'polite negative' },
  {
    from: 'ませんでした',
    to: '',
    fromClass: null,
    toClass: 'stem-i',
    form: 'polite negative past',
  },
  { from: 'まして', to: '', fromClass: null, toClass: 'stem-i', form: 'polite te' },
  { from: 'ましょう', to: '', fromClass: null, toClass: 'stem-i', form: 'polite volitional' },

  // Passive, causative and the ichidan potential. All three produce ichidan
  // verbs, so each needs two rules: one for the derived verb standing alone
  // (書かれる) and one for its stem carrying something further (書かれない).
  { from: 'られる', to: '', fromClass: null, toClass: 'stem-a', form: 'passive' },
  { from: 'られ', to: '', fromClass: null, toClass: 'stem-a', form: 'passive' },
  { from: 'れる', to: '', fromClass: null, toClass: 'stem-a', form: 'passive' },
  { from: 'れ', to: '', fromClass: null, toClass: 'stem-a', form: 'passive' },
  { from: 'させる', to: '', fromClass: null, toClass: 'stem-a', form: 'causative' },
  { from: 'させ', to: '', fromClass: null, toClass: 'stem-a', form: 'causative' },
  { from: 'せる', to: '', fromClass: null, toClass: 'stem-a', form: 'causative' },
  { from: 'せ', to: '', fromClass: null, toClass: 'stem-a', form: 'causative' },

  // The godan potential, which is an ichidan verb built on the 仮定形 — and so
  // is the one place a rule names the row's dictionary ending directly.
  ...GODAN_ROWS.map((row): Rule => ({
    from: `${row.e}る`,
    to: row.dict,
    fromClass: null,
    toClass: row.cls,
    form: 'potential',
  })),
  // The bare 仮定形 is also the godan imperative. Nothing is stripped, so this
  // cannot go through `stem-e`.
  ...GODAN_ROWS.map((row): Rule => ({
    from: row.e,
    to: row.dict,
    fromClass: null,
    toClass: row.cls,
    form: 'imperative',
  })),
  { from: 'ろ', to: 'る', fromClass: null, toClass: 'v1', form: 'imperative' },
  { from: 'よ', to: 'る', fromClass: null, toClass: 'v1', form: 'imperative' },

  // Conditional and volitional. れば and よう are spelled out for ichidan
  // because the godan route reaches them through a stem and ichidan has none.
  { from: 'ば', to: '', fromClass: null, toClass: 'stem-e', form: 'conditional' },
  { from: 'れば', to: 'る', fromClass: null, toClass: 'v1', form: 'conditional' },
  { from: 'すれば', to: 'する', fromClass: null, toClass: 'vs-i', form: 'conditional' },
  { from: 'くれば', to: 'くる', fromClass: null, toClass: 'vk', form: 'conditional' },
  { from: 'う', to: '', fromClass: null, toClass: 'stem-o', form: 'volitional' },
  { from: 'よう', to: '', fromClass: null, toClass: 'stem-a', form: 'volitional' },

  // Desiderative. たい is an い-adjective once it is attached, so たくない and
  // たかった are handled by the adjective rules below rather than repeated here.
  { from: 'たい', to: '', fromClass: null, toClass: 'stem-i', form: 'desiderative' },

  // い-adjectives. `かった` is what turns なかった into ない and たくなかった
  // into たくない, so it carries two jobs beyond 高かった.
  { from: 'かった', to: 'い', fromClass: null, toClass: 'adj-i', form: 'past' },
  { from: 'くない', to: 'い', fromClass: null, toClass: 'adj-i', form: 'negative' },
  { from: 'くて', to: 'い', fromClass: null, toClass: 'adj-i', form: 'te' },
  { from: 'ければ', to: 'い', fromClass: null, toClass: 'adj-i', form: 'conditional' },
  { from: 'く', to: 'い', fromClass: null, toClass: 'adj-i', form: 'adverbial' },
]

/** One string mid-walk, and the class it would have to be for the next rule. */
interface State {
  text: string
  /** null only for the surface itself, which is under no obligation yet. */
  cls: string | null
  forms: string[]
  depth: number
}

/**
 * Every dictionary form `surface` could be an inflection of, shallowest first.
 *
 * Over-generates on purpose. 行った comes back as both 行く and 言った's 言う
 * comes back beside 行く's spelling-mates, and a rule matching a kana tail it
 * has no business matching produces a word the dictionary has never heard of.
 * That is cheaper than the alternative — narrowing the table until it only
 * fires when it is certain, which is the point at which it stops firing on the
 * stacked forms it exists for. The caller throws the wrong ones away by
 * checking `class` against the lexicon.
 */
export function deinflect(surface: string): Candidate[] {
  const out: Candidate[] = []
  // Keyed on text *and* class: 食べ is a 連用形 and a 未然形, and which one it
  // is decides which rules may fire next. Shared across the whole walk, so the
  // shortest chain to a given pair is the one that is expanded.
  const seen = new Set<string>()
  const queue: State[] = [{ text: surface, cls: null, forms: [], depth: 0 }]

  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]
    if (state.depth >= MAX_DEINFLECTIONS) continue

    for (const rule of RULES) {
      if (rule.fromClass !== null && rule.fromClass !== state.cls) continue
      if (!state.text.endsWith(rule.from)) continue

      const text = state.text.slice(0, state.text.length - rule.from.length) + rule.to
      if (!text || text === state.text) continue

      const key = `${text} ${rule.toClass}`
      if (seen.has(key)) continue
      seen.add(key)

      const forms = rule.form ? [...state.forms, rule.form] : state.forms
      queue.push({ text, cls: rule.toClass, forms, depth: state.depth + 1 })
      out.push({ text, class: rule.toClass, forms })
    }
  }

  return out
}
