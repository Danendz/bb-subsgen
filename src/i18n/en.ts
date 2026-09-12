// The English strings, and by construction the key union every other locale is
// checked against (`keys.ts`).
//
// Keys are `<surface>.<thing>`, ordered by the file they are rendered from, so
// that converting a component means reading one contiguous block rather than
// hunting through an alphabetised list.
//
// Not here on purpose: the subtitle and page-reader overlays in `src/content/`
// and `src/reader/`. Those are imperative DOM in a shadow root over somebody
// else's video and carry almost no chrome — a handful of aria labels — so
// wiring a table into them would cost a bundle and buy a word.

export const en = {
  // --- App shell (src/app/App.tsx) ---
  'app.title': 'Flashcards',
  'app.subtitle': 'Everything bb-subsgen has collected while you were reading.',
  'app.tab.overview': 'Overview',
  'app.tab.review': 'Review',
  'app.tab.chat': 'Chat',
  'app.tab.dictionary': 'Dictionary',
  'app.tab.videos': 'Videos',
  'app.tab.data': 'Data',
  'app.tab.settings': 'Settings',

  // --- Language filter (src/settings/LanguageFilter.tsx) ---
  'filter.studying': 'Studying',
  'filter.all': 'All languages',
  'filter.notInstalled': '{language} \u2014 not installed',

  // --- Shared controls (src/settings/controls.tsx, SectionRail.tsx) ---
  'controls.notSet': 'Not set',
  'controls.sections': 'Sections',

  // --- Settings, shared across sections (src/settings/sections.tsx) ---
  'settings.enabled': 'Enabled',
  'settings.server': 'Server',
  'settings.connect': 'Connect',
  'settings.connecting': 'Connecting\u2026',
  'settings.connected': 'Connected.',
  'settings.connectedModels': {
    one: 'Connected \u2014 {count} model.',
    other: 'Connected \u2014 {count} models.',
  },

  // --- Settings \u203a Studying ---
  'settings.studying.title': 'Studying',
  'settings.studying.quizMode': 'Quiz mode (Alt+Q)',
  'settings.studying.wholeLines': 'Study whole lines',
  'settings.studying.newLines': 'New lines / day',
  'settings.studying.hint':
    'Quiz mode holds back readings and translations until you hover. Every word you collect is studiable straight away.',
  'settings.studying.hintLinesOn': 'Whole lines are let in a few a day, easiest first.',
  'settings.studying.hintLinesOff':
    'Lines are still collected while you read \u2014 turn this on whenever you want them.',
  'settings.studying.voice': 'Card voice',
  'settings.studying.voiceAuto': 'Automatic (best available)',
  'settings.studying.voiceNetworked': '{name} \u2014 networked',
  'settings.studying.noVoice':
    'No voice for the language you are studying is installed on this computer, so cards cannot be spoken.',
  'settings.studying.voiceSpeed': 'Voice speed',
  'settings.studying.testVoice': 'Test voice',
  'settings.studying.testVoiceIn': 'Test {language} voice',
  'settings.studying.voiceHint':
    'Networked voices sound best but are synthesised by Google, so the card text leaves your computer and they go quiet offline \u2014 a local voice takes over when that happens.',

  // --- Settings \u203a Language ---
  'settings.language.title': 'Language',
  'settings.language.translateTo': 'Translate to',
  'settings.language.noOnDevice':
    'Chrome has no on-device translator for this pair, so lines are translated by your local model instead. Slower, and nothing is translated while the model is off.',
  'settings.language.toneColors': 'Tone colors',
  'settings.language.traditional': 'Show traditional in definitions',

  // --- Coming soon (src/settings/ComingSoon.tsx, src/lang/gaps.ts) ---
  comingSoon: 'Coming soon',
  'comingSoon.summary': 'Still being built for {language}: {missing}.',
  'gap.patterns.row': '{language} grammar patterns',
  'gap.patterns.title':
    'No grammar table ships for {language} yet, so hover cards and review explain the words in a line but not the structures around them.',
  'gap.patterns.noun': 'grammar patterns',
  'gap.onDevice.row': '{language} on-device translation',
  'gap.onDevice.title':
    "Chrome's on-device translator is only wired up for Chinese, so {language} lines are translated by your local model instead.",
  'gap.onDevice.noun': 'on-device translation',

  // --- Language names (src/lang/pack.ts, `nameKey`) ---
  'language.zh': 'Chinese',
  'language.ja': 'Japanese',

  // --- Settings \u203a Local model ---
  'settings.llm.title': 'Local model',
  'settings.llm.noModels': 'Connected, but the server has no models loaded.',
  'settings.llm.needsPermission':
    'Chrome needs permission to reach that address before the model can be used.',
  'settings.llm.chatModel': 'Chat model',
  'settings.llm.translateSubtitles': 'Translate subtitles',
  'settings.llm.translationModel': 'Translation model',
  'settings.llm.verboseLog': 'Verbose logging',
  'settings.llm.hint':
    "Explanations and chat use the chat model, and only when you ask for them. Subtitle translation runs in the background on the translation model and takes over from Chrome's translator once it is far enough ahead \u2014 pick something fast for it. The debug log is on the flashcards Data tab.",

  // --- Settings \u203a Speech to text ---
  'settings.asr.title': 'Speech to text',
  'settings.asr.needsPermission':
    'Chrome needs permission to reach that address before it can be used.',
  'settings.asr.helperAnswered': 'The helper answered {status}.',
  'settings.asr.unreachable': 'Could not reach it: {error}',
  'settings.asr.noModelList':
    'Reachable. This server lists no models \u2014 type the name it was started with.',
  'settings.asr.enable': 'Transcribe videos with no subtitles',
  'settings.asr.model': 'Model',
  'settings.asr.hint':
    "Most of bangumi ships without subtitles, and this transcribes the audio so those episodes can still be read. It runs once per episode and the result is cached, so a rewatch costs nothing. Start a server with {script} in the extension's repository \u2014 it is a separate program from the chat model above.",
  'settings.asr.helper': 'YouTube audio helper',
  'settings.asr.helperHint':
    "Only needed for YouTube. It serves a video's audio to the extension, because YouTube no longer publishes an address the browser can fetch one from. Run it with {ytdlp} in the extension's repository, or {services} to start it alongside the speech server above. Needs {ytdlpBin} and {ffmpeg} installed.",

  // --- Settings \u203a Page reader ---
  'settings.reader.holdKey': 'Hold key',
  'settings.reader.translateSentence': 'Translate the sentence',

  // --- Settings \u203a Subtitles ---
  'settings.subtitles.showPinyin': 'Show pinyin',
  'settings.subtitles.fontSize': 'Font size',
  'settings.subtitles.wordSpacing': 'Word spacing',
  'settings.subtitles.backdrop': 'Backdrop opacity',
  'settings.subtitles.height': 'Height',
  'settings.subtitles.lift': 'Lift above player controls',
  'settings.subtitles.translation': 'Translation',
  'settings.subtitles.translationSize': 'Translation size',
  'settings.subtitles.translationLayout': 'Translation layout',
  'settings.subtitles.layoutInline': 'Same card',
  'settings.subtitles.layoutCard': 'Separate card',

  // --- Shared prose ---
  'common.loading': 'Loading\u2026',

  // --- Settings tab (src/app/Settings.tsx) ---
  'settings.rail.general': 'General',
  'settings.rail.models': 'Local models',
  'settings.pageReader.title': 'Page reader',
  'settings.pageReader.hint':
    'Hold {key} and point at a word; click it for characters. Select Chinese text for a phrase card.',
  'settings.sites.remove': 'Remove',
  'settings.sites.add': 'Add site',
  'settings.sites.badAddress': 'That does not look like a site address. Try zhihu.com.',
  'settings.sites.already': '{host} is already on.',
  'settings.sites.needsPermission':
    'Chrome needs permission to reach that site before the reader can run there.',
  'settings.sites.hint':
    'Chrome asks before each site is added, and turning one off hands that access straight back. Bilibili is already covered.',
  'settings.subtitles.title': 'Subtitles',
  'settings.subtitles.hint':
    'Shortcuts: Alt+P toggles pinyin, Alt+S cycles font size \u2014 for fullscreen.',
  'settings.session.title': 'Session',
  'settings.session.note':
    'How you are asked, what is included and how long a sitting runs are set where you start one \u2014 they read better next to the counts they change.',
  'settings.session.open': 'Open Review',
  'settings.dicts.title': 'Dictionaries',
  'settings.dicts.manage': 'Manage dictionaries',
  'settings.dicts.hint': 'Add a language you study, or check an installed one for an update.',

  // --- Overview (src/app/Overview.tsx) ---
  'overview.nothingToShow': 'Nothing to show yet.',
  'overview.emptyTitle': 'Nothing collected yet.',
  'overview.emptyBody':
    'Watch a subtitled Bilibili video, or hold the reader key on a page you have enabled, and the words you look up will land here.',
  'overview.stat.words': 'words collected',
  'overview.stat.known': 'words known',
  'overview.stat.sentences': 'sentences',
  'overview.stat.grammar': 'patterns',
  'overview.stat.pool': 'waiting',
  'overview.discovered': 'Discovered',
  'overview.discoveredOf': '{found} of the {total} most common words',
  'overview.hsk': 'HSK',
  'overview.hskLevel': 'HSK {level}',
  'overview.noWordList':
    'No word list loaded, so new cards are introduced in the order you found them and there is no denominator to measure progress against. Load one from {data} \u2014 it explains where to get one.',

  // --- Mastery pips (src/app/mastery.tsx) ---
  'mastery.known': 'Known \u2014 you marked this one yourself',
  'mastery.mastered': 'Mastered \u2014 {level} of {max}',
  'mastery.learning': '{level} of {max} \u00b7 still learning',
  'mastery.next': {
    one: '{level} of {max} \u00b7 next in {count} day',
    other: '{level} of {max} \u00b7 next in {count} days',
  },

  // --- Review tab (src/app/Review.tsx) ---
  'review.noPack': 'No language pack for {lang}.',
  'review.streak': { one: '{count} day in a row', other: '{count} days in a row' },
  'review.stat.due': 'due for review',
  'review.stat.newWords': 'words not started',
  'review.stat.newLines': 'new lines today',
  'review.stat.pooled': 'lines waiting',
  'review.change': 'Change',
  'review.done': 'Done',
  'review.start': 'Start studying',
  'review.cards': { one: '{count} card', other: '{count} cards' },
  'review.breakdown': '{scheduled} scheduled, {drilled} practice',
  'review.waiting': '{count} waiting',
  'review.teaching': {
    one: '{count} new word, taught first',
    other: '{count} new words, taught first',
  },
  'review.shortfall.words': 'that is every word ready \u2014 switch to lines too for more',
  'review.shortfall.sentences': 'that is every line ready \u2014 switch to words too for more',
  'review.shortfall.all': 'that is everything ready',
  'review.emptyTitle': 'Nothing to study yet.',
  'review.emptyPooled': {
    one: '{count} line is waiting its turn \u2014 they are let in a few a day, easiest first.',
    other:
      '{count} lines are waiting their turn \u2014 they are let in a few a day, easiest first.',
  },
  'review.emptyBody': 'Go and read something; whatever you look up will show up here.',

  // --- Explanation drawer (src/app/Embed.tsx) ---
  'embed.title': 'Explain',
  'embed.openInApp': 'Open in flashcards',
  'embed.close': 'Close',
  'embed.noLine': 'There was no line to explain.',
  'embed.failed': 'Could not start that conversation. The model log in Data has the details.',
  'embed.reading': 'Reading the scene\u2026',

  // --- Word list uploader help (src/app/WordListHelp.tsx) ---
  'wordlist.help.summary': 'Use your own file instead',
  'wordlist.help.privacy':
    'Nothing here is uploaded anywhere. The file is read in your browser and stays in it.',
  'wordlist.help.acceptsTitle': 'What the uploader accepts',
  'wordlist.help.accepts':
    'One word per line, or any tab- or comma-separated file with a column of the language you study in it, or a JSON array. A header row is detected and skipped, and the word column is found wherever it sits.',
  'wordlist.help.frequency':
    'A frequency list is ranked by {order}, most common first. Any number in the file is ignored, because the same number means opposite things in different lists \u2014 a rank counts up as words get rarer, a raw count counts down. So check the preview before importing: for Chinese it should start \u7684, \u4e00, \u662f. If it starts \u7231, \u7231\u597d, \u516b the file is in alphabetical order and needs sorting by frequency first.',
  'wordlist.help.frequencyOrder': 'the order words appear in the file',
  'wordlist.help.levels':
    'A level list needs a column of levels from 1 to 9 alongside the words. Those are read as given, not renumbered.',

  // --- Session setup (src/app/review/Setup.tsx) ---
  'setup.howAsked': 'How you are asked',
  'setup.whatIncluded': 'What is included',
  'setup.length': 'Session length',
  'setup.lengthAria': 'Cards per session',
  'setup.lengthNote':
    'Counted as distinct cards. One you get wrong comes back before the session ends without making it longer.',
  'setup.mode.mixed': 'Mixed',
  'setup.mode.mixedHint': 'A different angle each sitting',
  'setup.mode.remember': 'Remembering',
  'setup.mode.rememberHint': 'Recall it, then say how it went',
  'setup.mode.type': 'Typing',
  'setup.mode.typeHint': 'Build it from the meaning',
  'setup.mode.audio': 'Listening',
  'setup.mode.audioHint': 'Build it from the sound',
  'setup.mode.noVoiceTitle': 'No voice for this language is installed on this computer',
  'setup.mode.noVoiceHint': 'No voice installed',
  'setup.include.both': 'Everything',
  'setup.include.words': 'Words only',
  'setup.include.sentences': 'Lines only',
  'setup.include.grammar': 'Grammar only',
  'setup.summary': '{mode} \u00b7 {include} \u00b7 {count} cards',
  'setup.summary.both': 'words + lines + grammar',
  'setup.summary.words': 'words only',
  'setup.summary.sentences': 'lines only',
  'setup.summary.grammar': 'grammar only',

  // --- Word bank (src/app/review/WordBank.tsx) ---
  'bank.placeholder': 'Tap the words in order',
  'bank.remove': 'Remove {word}',

  // --- Study session (src/app/review/Session.tsx) ---
  'session.complete': 'Session complete',
  'session.summary.total': '{n} cards',
  'session.summary.right': '{n} right first time',
  'session.summary.best': '{n} best run',
  'session.end': 'End session',
  'session.combo': '{count} in a row',
  'session.score': '{right} / {total}',
  'session.playAgain': 'Play again',
  'session.listen': 'Listen',
  'session.noDefinitionShort': '(no definition)',
  'session.noDefinition': 'No definition found',
  'session.typeLine': 'Type the line\u2026',
  'session.typeChars': 'Type the characters\u2026',
  'session.useBank': 'Use the word bank',
  'session.typeInstead': 'Type it instead',
  'session.correct': 'Correct',
  'session.notQuite': 'Not quite',
  'session.notQuiteWith': 'Not quite \u2014 you put {attempt}',
  'session.structure': 'Structure',
  'session.watchAgain': 'Watch it again from {time}',
  'session.translationsHidden': '\u2014 translations stay hidden',
  'session.asrWarning': 'Transcribed from the audio \u2014 this line may be misheard.',
  'session.explain': 'Explain this line',
  'session.check': 'Check',
  'session.continue': 'Continue',
  'session.cardsSettled': 'Cards settled',
  'session.mastered': 'Mastered',
  'session.backSoon': 'Back in a few minutes',
  'session.backIn': { one: 'Back in {count} day', other: 'Back in {count} days' },
  'session.stillDueIn': { one: 'Still due in {count} day', other: 'Still due in {count} days' },
  'session.practice': 'Practice \u00b7 {when}',
  'task.introduce': 'A new word',
  'task.pattern.tiles': 'Build this line using the shape',
  'task.audio.word': 'Type what you hear',
  'task.audio.line': 'Build what you hear',
  'task.gloss': 'Build the word',
  'task.translation': 'Build this line in {language}',
  'task.cloze': 'Which word is missing?',
  'task.meaning.word': 'What does this mean?',
  'task.meaning.line': 'What does this line mean?',
  'task.choice.word': 'Pick the meaning',
  'task.choice.line': 'Pick what this line means',
  'task.choice.pattern': 'Pick what this shape does',

  // --- Videos tab (src/app/Videos.tsx) ---
  'videos.verdict.comfortable': 'comfortable',
  'videos.verdict.stretch': 'a stretch',
  'videos.verdict.hard': 'hard going',
  'videos.coverage':
    '{percent}% of what is said \u2014 {verdict}. You know {known} of {total} distinct words here.',
  'videos.emptyTitle': 'No videos yet.',
  'videos.emptyBody': 'Watch a Bilibili video with a subtitle track and it will show up here.',
  'videos.lines': { one: '{count} line', other: '{count} lines' },
  'videos.unknown': "That video isn't in your history.",
  'videos.back': '\u2190 Videos',
  'videos.openOnBilibili': 'Open on Bilibili',
  'videos.speak': 'Speak',
  'videos.known': 'known',
  'videos.showMore': 'Show more ({count} left)',
  'videos.times': '{count}\u00d7',

  // --- Model log (src/app/LlmLog.tsx) ---
  'log.title': 'Model log',
  'log.blurb':
    'Every request the local model was sent, and everything that came back or went wrong. Newest first, capped at the last 500. Also mirrored to the browser console.',
  'log.level.all': 'Everything',
  'log.level.warn': 'Warnings and errors',
  'log.level.error': 'Errors only',
  'log.kind.all': 'All activity',
  'log.kind.chat': 'Chat',
  'log.kind.explain': 'Explain',
  'log.kind.translate': 'Translation',
  'log.kind.models': 'Model list',
  'log.kind.connect': 'Connection',
  'log.refresh': 'Refresh',
  'log.copy': 'Copy',
  'log.clear': 'Clear',
  'log.reading': 'Reading\u2026',
  'log.noMatches': 'Nothing matches those filters.',
  'log.empty': 'Nothing logged yet. Anything the model is asked will show up here.',
  'log.request': 'request {id}',
  'log.duration': '{ms}ms',

  // --- Chat (src/app/chat/) ---
  'chat.when.today': 'today',
  'chat.when.yesterday': 'yesterday',
  'chat.when.daysAgo': { one: '{count} day ago', other: '{count} days ago' },
  'chat.new': 'New chat',
  'chat.deleteConfirm': 'Delete this conversation?',
  'chat.empty': 'Nothing yet. Start one here, or press Explain on a card while reviewing.',
  'chat.fromCard': 'from a card',
  'chat.pick': 'Pick a conversation, or start a new one.',
  'chat.pickHint': 'Explanations opened from a card while reviewing land here too.',
  'chat.none': 'No conversation selected.',
  'chat.stop': 'Stop',
  'chat.thinking': 'Thinking\u2026',
  'chat.placeholder': 'Ask about this line, or anything else\u2026',
  'chat.send': 'Send',
  'chat.context': {
    one: 'Context sent \u2014 {count} line',
    other: 'Context sent \u2014 {count} lines',
  },
  'chat.contextFrom': 'from {title}',
  'chat.openFullWidth': 'Open full width',

  // --- Dictionary tab (src/app/Dictionary.tsx) ---
  'dict.filter.all': 'All',
  'dict.filter.learning': 'Still learning',
  'dict.filter.known': 'Known',
  'dict.filter.sentences': 'Sentences',
  'dict.noPack': 'No language pack for {lang}.',
  'dict.thisLanguage': 'this language',
  'dict.search': 'Search the words you have collected\u2026',
  'dict.notCollected': 'Not collected yet.',
  'dict.nothingHere': 'Nothing here yet.',
  'dict.lookSomethingUp': 'Look a word up and it will appear.',
  'dict.dictionaryHasThese': 'None of your words match that, but the dictionary has these.',
  'dict.noMatch': 'No collected word matches that.',
  'dict.pool': 'pool',
  'dict.speak': 'Speak',
  'dict.timesSeen': 'Times seen',
  'dict.times': '{count}\u00d7',
  'dict.markKnown': 'I already know this',
  'dict.unmarkKnown': 'Stop treating this as known',
  'dict.isKnown': 'Known',
  'dict.iKnowThis': 'I know this',
  'dict.notInDeck': 'Not in your deck yet',
  'dict.addToDeck': 'Add to the deck',
  'dict.add': 'Add',
  'dict.addedNote':
    'Added words are studiable straight away \u2014 they go in exactly where a word you hovered would.',
  'dict.showMore': 'Show more ({count} left)',

  // --- Setup wizard (src/app/SetupWizard.tsx) ---
  'wizard.title': 'Set up your dictionaries',
  'wizard.whatStudying': 'What are you studying?',
  'wizard.pickHint':
    'Choosing a language just remembers it \u2014 nothing downloads until the next step.',
  'wizard.required': 'Required',
  'wizard.installedOn': 'Installed {date}',
  'wizard.downloading': 'Downloading',
  'wizard.importing': 'Importing',
  'wizard.downloadingBusy': 'Downloading\u2026',
  'wizard.importingBusy': 'Importing\u2026',
  'wizard.redownload': 'Re-download',
  'wizard.install': 'Install',
  'wizard.checking': 'Checking\u2026',
  'wizard.checkForUpdate': 'Check for update',
  'wizard.updateAvailable': 'A newer export is available \u2014 install above to get it.',
  'wizard.noChange': 'Re-downloaded \u2014 no change from what was installed.',
  'wizard.installFailed': 'Could not download the dictionary. Check your connection and try again.',
  'wizard.optional':
    "Optional: a local LLM for chat and translation, ASR for videos with no subtitles, yt-dlp for YouTube audio, Chrome's built-in Translator, a Chinese TTS voice, and per-site reader permission. Each is configured from Settings once the dictionary above is installed \u2014 none of them are required to get started.",
  'wizard.done': 'Done',

  // --- Word list parse errors (src/flashcards/wordlist.ts) ---
  'wordlist.error.empty': 'That file is empty.',
  'wordlist.error.binary':
    'That looks like a zip or a spreadsheet. Unzip it first, or open it and save as CSV.',
  'wordlist.error.noChinese':
    'No Chinese found. Check it is the right file \u2014 and if it came from an older dataset, it may not be saved as UTF-8, which would arrive here as garbled text.',
  'wordlist.error.noLevels': 'Found the words, but no HSK level column (a number from 1 to 9).',

  // --- Data tab (src/app/Data.tsx) ---
  'data.rail.backup': 'Backup',
  'data.rail.wordLists': 'Word lists',
  'data.rail.storage': 'Storage',
  'data.rail.diagnostics': 'Diagnostics',

  'data.snapshots.title': 'Deck snapshots',
  'data.snapshots.blurb':
    'Taken automatically just before a database upgrade rewrote the deck. Download one and hand it to Import below if an upgrade lost something.',
  'data.snapshots.row': 'Before schema {version}, taken {date}',
  'data.snapshots.download': 'Download',

  'data.lists.title': 'Word lists',
  'data.lists.blurb':
    'Optional. None ships with the extension, but the ones below download on demand.',
  'data.lists.noDictionary':
    'No dictionary installed yet, so there is no language to file a list under.',
  'data.lists.frequency': 'Frequency list',
  'data.lists.levels': '{standard} levels',
  'data.lists.frequencyBlurb':
    'Orders which new words you meet first, and gives progress a denominator.',
  'data.lists.levelsBlurb':
    'Groups the dictionary by {standard} level and adds the progress bars on Overview.',
  'data.lists.loaded': '{name} \u2014 {count} words, added {date}',
  'data.lists.install': 'Install {name}',
  'data.lists.downloading': 'Downloading',
  'data.lists.nothingToDownload':
    'Nothing to download for {language} yet \u2014 upload your own file below.',
  'data.lists.delete': 'Delete',
  'data.lists.downloadFailed': 'Could not download the list. Check your connection and try again.',
  'data.lists.checkFirst': 'Check this before importing',
  'data.lists.previewSummary': '{file} \u2014 {shape} \u2014 {count} words',
  'data.lists.previewFrequency':
    'Those should be among the commonest words in {language}. If they are not, the file is not sorted by frequency.',
  'data.lists.previewLevels': 'Levels are read from the file as given.',
  'data.lists.theLanguageYouStudy': 'the language you study',
  'data.lists.import': 'Import',
  'data.lists.cancel': 'Cancel',
  'data.shape.json': 'JSON',
  'data.shape.tab': 'tab-separated',
  'data.shape.comma': 'comma-separated',
  'data.shape.lines': 'one word per line',
  'data.shape.headerSkipped': 'header skipped',
  'data.shape.wordColumn': 'words in column {n}',

  'data.cache.title': 'Model translations',
  'data.cache.confirm': 'Delete every translation the local model has produced?',
  'data.cache.loaded': {
    one: '{lines} lines across {videos} video. Kept so a second viewing is instant instead of costing the same half hour again.',
    other:
      '{lines} lines across {videos} videos. Kept so a second viewing is instant instead of costing the same half hour again.',
  },
  'data.cache.empty':
    'Nothing cached yet. Subtitle lines the local model translates are kept here, so rewatching costs nothing.',

  'data.transcripts.title': 'Transcripts',
  'data.transcripts.confirm':
    'Delete every transcript? Videos with no subtitle track of their own will have to be transcribed again before they show any lines.',
  'data.transcripts.loaded': {
    one: '{lines} lines across {videos} video. Kept so an episode is listened to once ever, rather than once per viewing.',
    other:
      '{lines} lines across {videos} videos. Kept so an episode is listened to once ever, rather than once per viewing.',
  },
  'data.transcripts.empty':
    'Nothing transcribed yet. Lines the speech model hears in videos with no subtitle track are kept here, so watching one again costs nothing.',
  'data.clear': 'Clear',

  'data.export.title': 'Export',
  'data.export.blurb':
    'One JSON file with every card, the full review log, exposure counts and video history. Dwell samples and word lists are left out \u2014 the first is calibration for this machine, the second you load per browser.',
  'data.export.download': 'Download',
  'data.import.title': 'Import',
  'data.import.blurb':
    'Merged, not replaced. Review logs from both sides are combined and the schedule is recomputed from them, so studying you did in another browser still counts. Counts add up and videos merge by id.',
  'data.import.badJson': 'That file is not valid JSON.',
  'data.import.notABackup': 'That does not look like a bb-subsgen export.',
  'data.import.merged': 'Merged. {cards} cards and {reviews} reviews in total.',
  'data.import.failed': 'Import failed \u2014 nothing was changed.',
  'data.conflicts.title': { one: '{count} word disagrees', other: '{count} words disagree' },
  'data.conflicts.blurb':
    'These are marked known on one side and not the other. Everything else merges on its own \u2014 only a declaration has no evidence to settle it.',
  'data.conflicts.more': '\u2026 +{count}',
  'data.conflicts.keepMine': 'Keep mine ({count} stay known)',
  'data.conflicts.useFile': 'Use the file ({count} become known)',

  'data.clearAll.title': 'Clear everything',
  'data.clearAll.blurb':
    'Deletes all cards, reviews and counts. Word lists are kept. Export first \u2014 there is no undo.',
  'data.clearAll.confirm': 'Delete every card, review and count? This cannot be undone.',
  'data.clearAll.done': 'Everything cleared.',

  // --- Pass progress (src/llm/progress.ts) ---
  'progress.translating': 'Translating with {model}',
  'progress.lines': '{done} / {total} lines',
  'progress.transcribing': 'Transcribing with {model}',
  'progress.chunks': '{done} / {total} chunks',
  'progress.starting': 'starting\u2026',
  'progress.stopped': 'Transcription stopped',
  'progress.missing': {
    one: '{count} stretch missing',
    other: '{count} stretches missing',
  },
  'progress.nothingTranscribed': 'nothing was transcribed',

  // --- Popup (src/popup/App.tsx) ---
  'popup.status.loading': 'Loading subtitles\u2026',
  'popup.status.noTrack': 'No subtitle track on this video.',
  'popup.status.active': 'Active on this video.',
  'popup.status.noVideo': 'Open a Bilibili or YouTube video for subtitles.',
  'popup.status.noDictionary': 'No dictionary installed for this language.',
  'popup.coverage': 'You know {percent} of what is said here \u2014 {types}.',
  'popup.coveragePercent': '{percent}%',
  'popup.coverageTypes': '{known} of {total} words',
  'popup.verdict.comfortable': 'Comfortable.',
  'popup.verdict.stretch': 'A stretch.',
  'popup.verdict.hard': 'Hard going.',
  'popup.retrying': 'Retrying\u2026',
  'popup.retry': 'Retry the missing parts',
  'popup.needsDictionary': 'A language you study has no dictionary installed yet.',
  'popup.noLanguage': "You haven't set up a language to study yet.",
  'popup.goToSetup': 'Go to setup',
  'popup.openApp': 'Open flashcards',
  'popup.readerOn': 'Reader on {host}',
  'popup.readerUnavailable': "The reader can't run on this page.",

  // --- Explain, and the chat it opens (src/app/chat/, src/llm/prompts.ts) ---
  'explain.chatTitle': 'Explain \u300c{word}\u300d',
  'explain.chatTitleLine': 'Explain a line',
  'explain.question': 'What is this line saying, and what is going on grammatically?',
  'explain.questionAbout':
    'Why is \u300c{word}\u300d used in this line, and what is the line saying?',
  'chat.noModel': 'Set a model server and a chat model in the extension popup first.',
}
