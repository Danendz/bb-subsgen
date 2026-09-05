// The bring-your-own-file path, for when the curated downloads are not what you
// want — a private list, a broader frequency corpus, a language nothing is
// offered for yet.
//
// This used to be the *only* path, and carried what that cost: a table of four
// sources with their licences, a section on which of SUBTLEX's four downloads
// is the right one, and a shell snippet stitching HSK levels back onto files
// that keep the level in the filename. All three went when the Install buttons
// arrived — the snippet in particular was instructions to do by hand exactly
// what `wordlist-install.ts` now does. What survives is the part no button
// replaces: what the uploader accepts, and the one way a file is silently wrong.

export function WordListHelp() {
  return (
    <details class="help">
      <summary>Use your own file instead</summary>

      <p>Nothing here is uploaded anywhere. The file is read in your browser and stays in it.</p>

      <h4>What the uploader accepts</h4>
      <p>
        One word per line, or any tab- or comma-separated file with a column of the language you
        study in it, or a JSON array. A header row is detected and skipped, and the word column is
        found wherever it sits.
      </p>
      <p class="callout">
        A frequency list is ranked by <strong>the order words appear in the file</strong>, most
        common first. Any number in the file is ignored, because the same number means opposite
        things in different lists — a rank counts up as words get rarer, a raw count counts down. So
        check the preview before importing: for Chinese it should start 的, 一, 是. If it starts 爱,
        爱好, 八 the file is in alphabetical order and needs sorting by frequency first.
      </p>
      <p>
        A level list needs a column of levels from 1 to 9 alongside the words. Those are read as
        given, not renumbered.
      </p>
    </details>
  )
}
