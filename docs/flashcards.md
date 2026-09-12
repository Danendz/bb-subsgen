# The deck

Everything you look up is kept, and reviewed in an app that opens from the popup
(**Open flashcards**). It's a page inside the extension — no account, no server, and it
works offline.

## Counted, and collected

Every word rendered on screen is *counted*, which is what powers "seen 12× in this
video" and the per-video coverage figure.

What gets *collected* is a subtitle line still containing a word you don't know, together
with those words — each carrying the sentence it was met in, and on Bilibili its
timestamp, so a card can send you back to ten seconds before the line to hear it again.

## Collecting is generous; intake is not

Lines and words both wait in a pool and are let into the deck a few a day:

- **lines**, fewest-unknown-words first, so the most learnable thing you have collected
  comes next;
- **words**, most-seen first, so an evening's watching offers up the vocabulary that
  actually kept recurring in it.

That's what lets capture take hundreds of lines a night while the deck still only grows
by the daily limit.

Stopping on a word is the exception. Hovering one puts it straight into the deck — that
lookup says more than any amount of passing exposure — and it pulls a word out of the
pool if it was waiting there.

## Reviews

Reviews answer one question — did you get it or not — and each card climbs a seven-rung
ladder, one rung up for right and one down for wrong, so the rung itself is the mastery
the app shows you. Choose how you're asked (recall, typing, audio, or all three in
rotation), what's included, and how many cards a sitting takes.

The rung also decides how demanding a question a card is allowed to ask. A word you've
just met is asked to be recognised — its characters and four meanings, or its sound and
four meanings — and only from the third rung is it asked to be produced. Unlocks add up
rather than replace, so a word you've known for months can still come up as a quick
recognition question, and rotation mixes over everything that card has unlocked. Getting
one wrong drops it a rung, and the next question it asks eases with it.

From the fifth rung a word is asked to be *used*: it turns up blanked inside one of the
real lines you captured it from — a subtitle from a video, a sentence from a page — with
its meaning beside the gap. This is the one exercise that reads past a card's most recent
context, so a word you've met across ten videos is met again in each of them in turn.

A sitting is never empty. Once what's due and the day's new material run out, the rest is
filled with practice drawn from the deck — coldest first, most frequent among cards last
met on the same day, so it works through everything you've collected rather than the same
twenty words each time.

Practice doesn't move a card up the ladder: answering early shows you know it today,
which isn't what the interval claimed. Getting one wrong does count, because failing a
card ahead of its due date says the interval was too long.

## What you know stops being annotated

As words become known, the overlay stops annotating them — the reading disappears from
words you've declared known or reviewed to maturity, and a line whose words you all know
loses its translation too.

Hovering always brings both back, and doing so is itself taken as a signal that the line
was harder than its vocabulary suggested, so it gets kept.

## Moving between browsers

Export and import. Import merges rather than overwrites: the review logs from both sides
are combined and the schedule recomputed from them, so studying done on another machine
still counts. You're only asked about words declared known on one side and not the other.

## Frequency lists

None ships with the extension, but the app's **Data** screen will fetch one. For Chinese
it offers two, both from [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)
(MIT): frequency order, and HSK 3.0 levels. Installing is one button and a few seconds.

The frequency list is HSK vocabulary — about 11,000 words — ranked by how often each turns
up in film and TV subtitles, which is the corpus that matches what this extension reads.
A word outside HSK stays unranked, and unranked words are introduced last.

You can still upload your own file for anything the downloads don't cover — a broader
frequency corpus, a private list, or a language nothing is offered for yet. That path is
unchanged, and nothing you upload leaves the browser.

Without any list everything still works; new cards are simply introduced in the order you
found them.
