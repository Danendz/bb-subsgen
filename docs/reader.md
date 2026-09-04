# Reading on video and on the page

Two surfaces annotate text, and they share a dictionary card.

## Video subtitles

On Bilibili and YouTube the player's own subtitle track is hidden and re-rendered,
with the reading above each word and a dictionary card on hover, characters broken
down and all.

Where a video has no subtitle track at all — most of bangumi — the audio can be
transcribed locally instead, and the transcript annotated the same way. That needs
a speech server running; see [local-models.md](local-models.md).

**Alt+Q** hides every annotation at once, for testing yourself against a video.

## Page reader

Hold Shift on any site you have opted into and point at a word to get the same card.
Select a phrase — by dragging, or by double-clicking — for a segmented card with its
translation, and hover any word inside it for that word's own card.

While Shift is down the page turns selectable: links stop dragging, text a site marked
unselectable can be selected, and clicks don't reach the page, so selecting a headline
never navigates. Let go and the site behaves normally again.

The reader modifies no page markup. It finds words with `caretPositionFromPoint`,
reaching into shadow roots for sites like Bilibili's comments, and marks them with the
CSS Custom Highlight API — so nothing breaks on dynamic sites.

It is off everywhere until you enable it per site from the extension popup, which is
also where Chrome asks for access to that origin.

Sentence translation uses Chrome's on-device Translator API (desktop Chrome 138+).
Where it isn't available the card simply renders without it.

## Which language a page is read in

A property of the site, not a global switch — so a Japanese blog and a Chinese one can
both be open. Where the guess is wrong, a card offers to reread the page in another
installed language for as long as the tab is open; nothing is written down, so a reload
goes back to the site's own setting.

## Japanese

Words are found in the form they are written in. 食べる turns up as 食べました, 食べて,
食べさせられなかった, and none of those is a dictionary headword — the reader undoes the
conjugation, shows you the dictionary form, and files that in the deck rather than one
card per ending.

Furigana lands over the kanji it reads, and nothing is drawn over the kana.

*(The alignment and the deinflection table live in `src/lang/ja/`; each module says why
it works the way it does.)*
