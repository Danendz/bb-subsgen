// Everything needed to go and find a word list, in the place you are standing
// when you need it. Deliberately not duplicated in the README — two copies of
// instructions drift, and this is the one a user will actually be looking at.

const HSK_SNIPPET = `for n in 1 2 3 4 5 6 7; do
  curl -sL "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/$n.json" \\
    | jq -r --arg n "$n" '.[] | "\\(.simplified)\\t\\($n)"'
done > hsk.tsv`

const SOURCES = [
  {
    name: 'SUBTLEX-CH',
    href: 'https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexch/overview.htm',
    kind: 'Frequency',
    licence: 'none stated',
    note: (
      <>
        Film and TV subtitles — the closest match to what is actually spoken on Bilibili. Take{' '}
        <strong>subtlexch131210.zip</strong>: it is the only one described as UTF-8. Unzip it and
        upload the file inside. States no licence, only a request to cite the paper, so treat it
        as yours to use rather than yours to share.
      </>
    ),
  },
  {
    name: 'wordfreq',
    href: 'https://github.com/rspeer/wordfreq',
    kind: 'Frequency',
    licence: 'CC BY-SA 4.0',
    note: (
      <>
        A clean licence, the same one CC-CEDICT uses. Frozen since 2024, when its author stopped
        updating it because AI-generated text had polluted the web corpus — for word frequency
        that is arguably a feature.
      </>
    ),
  },
  {
    name: 'complete-hsk-vocabulary',
    href: 'https://github.com/drkameleon/complete-hsk-vocabulary',
    kind: 'HSK + frequency',
    licence: 'MIT',
    note: (
      <>
        Levels for HSK 2.0 and 3.0, plus a frequency value — though only across HSK vocabulary,
        about 11,000 words, so anything outside it stays unranked.
      </>
    ),
  },
  {
    name: 'ivankra/hsk30',
    href: 'https://github.com/ivankra/hsk30',
    kind: 'HSK',
    licence: 'MIT',
    note: <>HSK 3.0 as CSV, cross-checked against several sources.</>,
  },
]

export function WordListHelp() {
  return (
    <details class="help">
      <summary>Where to get a list, and what it should look like</summary>

      <p>
        bb-subsgen ships no word list. Every usable one belongs to somebody, so you supply your
        own — which also means nothing here is uploaded anywhere. The file is read in your
        browser and stays in it.
      </p>

      <h4>What the uploader accepts</h4>
      <p>
        One word per line, or any tab- or comma-separated file with a column of Chinese in it, or
        a JSON array. A header row is detected and skipped, and the word column is found wherever
        it sits.
      </p>
      <p class="callout">
        A frequency list is ranked by <strong>the order words appear in the file</strong>, most
        common first. Any number in the file is ignored, because the same number means opposite
        things in different lists — a rank counts up as words get rarer, a raw count counts down.
        So check the preview before importing: it should start 的, 一, 是. If it starts 爱, 爱好,
        八 the file is in alphabetical order and needs sorting by frequency first.
      </p>
      <p>
        An HSK list needs a column of levels from 1 to 9 alongside the words. Those are read as
        given, not renumbered.
      </p>

      <h4>Where to get one</h4>
      <table class="sources">
        <thead>
          <tr>
            <th>List</th>
            <th>Gives</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((source) => (
            <tr key={source.name}>
              <td>
                <a href={source.href} target="_blank" rel="noreferrer">
                  {source.name}
                </a>
                <div class="muted small">{source.note}</div>
              </td>
              <td class="small">{source.kind}</td>
              <td class="small">{source.licence}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Which SUBTLEX file</h4>
      <p class="small muted">
        Four downloads are offered and three of them are wrong for this, each failing differently.{' '}
        <strong>CHR</strong> is single characters rather than words, so you would rank 学 and never
        学习. <strong>WF_PoS</strong> repeats every word once per part of speech.{' '}
        <strong>WF</strong> is the right data but its encoding is not stated, and anything that
        isn't UTF-8 arrives here as garbled text. <strong>subtlexch131210.zip</strong> is the one
        described as UTF-8.
      </p>

      <h4>Turning the HSK JSON into a file this accepts</h4>
      <p class="small muted">
        That repo splits HSK by level into one file per level, and the level is in the{' '}
        <em>filename</em> rather than inside the data — so uploading one of those files directly
        gives "no HSK level column", correctly. This stitches the level back on:
      </p>
      <pre>{HSK_SNIPPET}</pre>
      <p class="small muted">
        Needs <code>curl</code> and <code>jq</code>, and produces a two-column{' '}
        <code>hsk.tsv</code> of about 11,000 words to upload.
      </p>
    </details>
  )
}
