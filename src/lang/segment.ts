export interface Token {
  text: string
  pinyin: string | null
}

const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })

export function isHan(char: string): boolean {
  return /\p{Script=Han}/u.test(char)
}

function maxMatch(run: string, words: Map<string, string>): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < run.length) {
    let matched = false
    for (let len = run.length - i; len >= 1; len--) {
      const candidate = run.slice(i, i + len)
      const pinyin = words.get(candidate)
      if (pinyin !== undefined) {
        tokens.push({ text: candidate, pinyin })
        i += len
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push({ text: run[i], pinyin: null })
      i += 1
    }
  }
  return tokens
}

export function segment(text: string, words: Map<string, string>): Token[] {
  const baseSegments = Array.from(wordSegmenter.segment(text))

  const tokens: Token[] = []
  let hanziRun = ''

  const flushHanziRun = () => {
    if (hanziRun) {
      tokens.push(...maxMatch(hanziRun, words))
      hanziRun = ''
    }
  }

  for (const { segment: piece } of baseSegments) {
    if (isHan(piece[0])) {
      hanziRun += piece
    } else {
      flushHanziRun()
      tokens.push({ text: piece, pinyin: null })
    }
  }
  flushHanziRun()

  return tokens
}
