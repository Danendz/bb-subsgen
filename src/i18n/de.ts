// Deutsch. Draft, not reviewed by a native speaker — see the PR body.
//
// Duzt durchgehend, wie die Sprachregel für Deutsch in `src/llm/languages.ts`.

import type { Messages } from './keys'

export const de: Messages = {
  'app.title': 'Karteikarten',
  'app.nav.label': 'Hauptnavigation',
  'app.nav.learn': 'Lernen',
  'app.nav.review': 'Wiederholen',
  'app.nav.chat': 'Chat',
  'app.nav.dictionary': 'Wörterbuch',
  'app.nav.videos': 'Videos',
  'app.nav.data': 'Daten',
  'app.nav.settings': 'Einstellungen',

  'filter.studying': 'Ich lerne',
  'filter.all': 'Alle Sprachen',
  'filter.notInstalled': '{language} \u2014 nicht installiert',

  'controls.notSet': 'Nicht gesetzt',
  'controls.sections': 'Bereiche',

  'settings.enabled': 'Aktiviert',
  'settings.server': 'Server',
  'settings.connect': 'Verbinden',
  'settings.connecting': 'Verbinde…',
  'settings.connected': 'Verbunden.',
  'settings.connectedModels': {
    one: 'Verbunden — {count} Modell.',
    other: 'Verbunden — {count} Modelle.',
  },

  'settings.studying.title': 'Lernen',
  'settings.studying.quizMode': 'Quizmodus (Alt+Q)',
  'settings.studying.wholeLines': 'Ganze Sätze lernen',
  'settings.studying.newLines': 'Neue Sätze pro Tag',
  'settings.studying.hint':
    'Der Quizmodus hält Lesungen und Übersetzungen zurück, bis du mit der Maus darüberfährst. Jedes gesammelte Wort ist sofort lernbar.',
  'settings.studying.hintLinesOn':
    'Ganze Sätze kommen ein paar pro Tag dazu, die leichtesten zuerst.',
  'settings.studying.hintLinesOff':
    'Sätze werden beim Lesen trotzdem gesammelt — schalte das ein, wenn du sie lernen willst.',
  'settings.studying.voice': 'Kartenstimme',
  'settings.studying.voiceAuto': 'Automatisch (beste verfügbare)',
  'settings.studying.voiceNetworked': '{name} — über das Netz',
  'settings.studying.noVoice':
    'Für die Sprache, die du lernst, ist auf diesem Rechner keine Stimme installiert, daher können Karten nicht vorgelesen werden.',
  'settings.studying.voiceSpeed': 'Sprechtempo',
  'settings.studying.testVoice': 'Stimme testen',
  'settings.studying.testVoiceIn': 'Stimme für {language} testen',
  'settings.studying.voiceHint':
    'Netzstimmen klingen am besten, werden aber von Google erzeugt — der Kartentext verlässt also deinen Rechner, und offline verstummen sie: dann übernimmt eine lokale Stimme.',

  'settings.language.title': 'Sprache',
  'settings.language.translateTo': 'Übersetzen nach',
  'settings.language.noOnDevice':
    'Chrome hat für dieses Sprachpaar keinen Übersetzer auf dem Gerät, deshalb übersetzt dein lokales Modell die Zeilen. Das ist langsamer, und solange das Modell aus ist, wird nichts übersetzt.',
  'settings.language.toneColors': 'Tonfarben',
  'settings.language.traditional': 'Langzeichen in Definitionen zeigen',

  comingSoon: 'Demnächst',
  'comingSoon.summary': 'Noch in Arbeit für {language}: {missing}.',
  'gap.patterns.row': 'Grammatikmuster ({language})',
  'gap.patterns.title':
    'Für {language} gibt es noch keine Grammatiktabelle, daher erklären Hover-Karten und Wiederholungen die Wörter, aber nicht die Strukturen darum herum.',
  'gap.patterns.noun': 'Grammatikmuster',
  'gap.onDevice.row': 'Übersetzung auf dem Gerät ({language})',
  'gap.onDevice.title':
    'Chromes eingebauter Übersetzer ist nur für Chinesisch angebunden, daher übersetzt dein lokales Modell die Zeilen auf {language}.',
  'gap.onDevice.noun': 'die Übersetzung auf dem Gerät',

  // --- Language names (src/lang/pack.ts, `nameKey`) ---
  'language.zh': 'Chinesisch',
  'language.ja': 'Japanisch',

  'settings.llm.title': 'Lokales Modell',
  'settings.llm.noModels': 'Verbunden, aber auf dem Server ist kein Modell geladen.',
  'settings.llm.needsPermission':
    'Chrome braucht die Erlaubnis, diese Adresse zu erreichen, bevor das Modell benutzt werden kann.',
  'settings.llm.chatModel': 'Chat-Modell',
  'settings.llm.translateSubtitles': 'Untertitel übersetzen',
  'settings.llm.translationModel': 'Übersetzungsmodell',
  'settings.llm.verboseLog': 'Ausführliches Protokoll',
  'settings.llm.hint':
    'Erklärungen und Chat nutzen das Chat-Modell, und nur wenn du danach fragst. Die Untertitelübersetzung läuft im Hintergrund auf dem Übersetzungsmodell und löst den Übersetzer von Chrome ab, sobald sie weit genug voraus ist — nimm dafür etwas Schnelles. Das Debug-Protokoll findest du im Reiter „Daten“.',

  'settings.asr.title': 'Sprache zu Text',
  'settings.asr.needsPermission':
    'Chrome braucht die Erlaubnis, diese Adresse zu erreichen, bevor sie benutzt werden kann.',
  'settings.asr.helperAnswered': 'Der Helfer hat mit {status} geantwortet.',
  'settings.asr.unreachable': 'Nicht erreichbar: {error}',
  'settings.asr.noModelList':
    'Erreichbar. Dieser Server listet keine Modelle — gib den Namen ein, mit dem er gestartet wurde.',
  'settings.asr.enable': 'Videos ohne Untertitel transkribieren',
  'settings.asr.model': 'Modell',
  'settings.asr.hint':
    'Der größte Teil von bangumi erscheint ohne Untertitel, und das hier transkribiert den Ton, damit sich diese Folgen trotzdem lesen lassen. Es läuft einmal pro Folge und das Ergebnis wird zwischengespeichert, ein erneutes Ansehen kostet also nichts. Starte einen Server mit {script} im Repository der Erweiterung — das ist ein eigenes Programm, nicht das Chat-Modell oben.',
  'settings.asr.helper': 'YouTube-Audio-Helfer',
  'settings.asr.helperHint':
    'Nur für YouTube nötig. Er liefert der Erweiterung den Ton eines Videos, weil YouTube keine Adresse mehr veröffentlicht, von der der Browser ihn holen könnte. Starte ihn mit {ytdlp} im Repository der Erweiterung, oder mit {services}, um ihn zusammen mit dem Spracherkennungsserver oben zu starten. Braucht {ytdlpBin} und {ffmpeg}.',

  'settings.reader.holdKey': 'Halte-Taste',
  'settings.reader.translateSentence': 'Den Satz übersetzen',

  'settings.subtitles.showPinyin': 'Pinyin anzeigen',
  'settings.subtitles.fontSize': 'Schriftgröße',
  'settings.subtitles.wordSpacing': 'Wortabstand',
  'settings.subtitles.backdrop': 'Deckkraft des Hintergrunds',
  'settings.subtitles.height': 'Höhe',
  'settings.subtitles.lift': 'Über die Player-Steuerung heben',
  'settings.subtitles.translation': 'Übersetzung',
  'settings.subtitles.translationSize': 'Größe der Übersetzung',
  'settings.subtitles.translationLayout': 'Anordnung der Übersetzung',
  'settings.subtitles.layoutInline': 'Auf derselben Karte',
  'settings.subtitles.layoutCard': 'Auf einer eigenen Karte',

  'common.loading': 'Lädt…',

  'settings.rail.general': 'Allgemein',
  'settings.rail.models': 'Lokale Modelle',
  'settings.pageReader.title': 'Seitenleser',
  'settings.pageReader.hint':
    'Halte {key} und zeige auf ein Wort; klick es an, um die Zeichen zu sehen. Markiere chinesischen Text für eine Satzkarte.',
  'settings.sites.remove': 'Entfernen',
  'settings.sites.add': 'Seite hinzufügen',
  'settings.sites.badAddress': 'Das sieht nicht nach einer Seitenadresse aus. Versuch zhihu.com.',
  'settings.sites.already': '{host} ist bereits aktiviert.',
  'settings.sites.needsPermission':
    'Chrome braucht die Erlaubnis für diese Seite, bevor der Leser dort laufen kann.',
  'settings.sites.hint':
    'Chrome fragt vor jeder hinzugefügten Seite nach, und das Ausschalten gibt diesen Zugriff sofort zurück. Bilibili ist bereits abgedeckt.',
  'settings.subtitles.title': 'Untertitel',
  'settings.subtitles.hint':
    'Tastenkürzel: Alt+P schaltet Pinyin um, Alt+S wechselt die Schriftgröße — für den Vollbildmodus.',
  'settings.session.title': 'Sitzung',
  'settings.session.note':
    'Wie du abgefragt wirst, was dazugehört und wie lange eine Sitzung läuft, stellst du dort ein, wo du sie startest — dort stehen sie neben den Zahlen, die sie verändern.',
  'settings.session.open': 'Wiederholen öffnen',
  'settings.dicts.title': 'Wörterbücher',
  'settings.dicts.manage': 'Wörterbücher verwalten',
  'settings.dicts.hint':
    'Füge eine Sprache hinzu, die du lernst, oder prüfe ein installiertes Wörterbuch auf Aktualisierungen.',

  'pill.notInstalled': 'nicht installiert',
  'pill.addLanguage': 'Sprache hinzufügen',

  'learn.soonTitle': 'Hier entsteht dein Pfad.',
  'learn.soonBody':
    'Kreise aus acht Wörtern, jeder davon geöffnet, indem du seinen Wörtern beim Schauen begegnest. Bis dahin plant „Wiederholen“ weiterhin das ganze Deck.',
  'learn.review': 'Zum Wiederholen',

  'aside.today': 'Heute',
  'aside.streakDays': { one: 'Tag in Folge', other: 'Tage in Folge' },
  'aside.reviewsToday': { one: 'Wiederholung heute', other: 'Wiederholungen heute' },
  'aside.deck': 'Dein Deck',
  'aside.stat.words': 'Wörter gesammelt',
  'aside.stat.known': 'Wörter bekannt',
  'aside.stat.sentences': 'Sätze',
  'aside.stat.grammar': 'Muster',
  'aside.stat.toStudy': 'zu lernen',
  'aside.stat.pool': 'Zeilen warten',
  'aside.discovered': 'Entdeckt',
  'aside.discoveredOf': '{found} der {total} häufigsten Wörter',
  'aside.waiting': 'Wartende Wörter',
  'aside.waitingEmpty': 'Nichts wartet \u2014 alles Gesammelte ist in Arbeit.',
  'aside.startReview': 'Jetzt wiederholen',
  'aside.fromVideos': 'Aus deinen Videos',
  'aside.videoWords': { one: '{count} Wort', other: '{count} Wörter' },
  'aside.noVideos': 'Noch nichts aus einem Video erfasst.',

  'mastery.known': 'Bekannt — das hast du selbst markiert',
  'mastery.mastered': 'Beherrscht — {level} von {max}',
  'mastery.learning': '{level} von {max} · noch im Lernen',
  'mastery.next': {
    one: '{level} von {max} · wieder in {count} Tag',
    other: '{level} von {max} · wieder in {count} Tagen',
  },

  'review.noPack': 'Kein Sprachpaket für „{lang}“.',
  'review.streak': { one: '{count} Tag in Folge', other: '{count} Tage in Folge' },
  'review.stat.due': 'zur Wiederholung fällig',
  'review.stat.newWords': 'Wörter noch nicht begonnen',
  'review.stat.newLines': 'neue Sätze heute',
  'review.stat.pooled': 'Sätze in der Warteschlange',
  'review.change': 'Ändern',
  'review.done': 'Fertig',
  'review.start': 'Lernen starten',
  'review.cards': { one: '{count} Karte', other: '{count} Karten' },
  'review.breakdown': '{scheduled} geplant, {drilled} zur Übung',
  'review.waiting': '{count} warten',
  'review.teaching': {
    one: '{count} neues Wort, zuerst erklärt',
    other: '{count} neue Wörter, zuerst erklärt',
  },
  'review.shortfall.words':
    'das sind alle Wörter, die bereit sind — nimm auch Sätze dazu, wenn du mehr willst',
  'review.shortfall.sentences':
    'das sind alle Sätze, die bereit sind — nimm auch Wörter dazu, wenn du mehr willst',
  'review.shortfall.all': 'das ist alles, was bereit ist',
  'review.emptyTitle': 'Noch nichts zu lernen.',
  'review.emptyPooled': {
    one: '{count} Satz wartet noch — es kommen ein paar pro Tag dazu, die leichtesten zuerst.',
    other: '{count} Sätze warten noch — es kommen ein paar pro Tag dazu, die leichtesten zuerst.',
  },
  'review.emptyBody': 'Lies etwas; alles, was du nachschlägst, taucht hier auf.',

  'embed.title': 'Erklären',
  'embed.openInApp': 'In den Karteikarten öffnen',
  'embed.close': 'Schließen',
  'embed.noLine': 'Es gab keine Zeile zu erklären.',
  'embed.failed':
    'Das Gespräch ließ sich nicht starten. Die Einzelheiten stehen im Modellprotokoll unter „Daten“.',
  'embed.reading': 'Lese die Szene…',

  'wordlist.help.summary': 'Stattdessen eigene Datei benutzen',
  'wordlist.help.privacy':
    'Hier wird nichts irgendwohin hochgeladen. Die Datei wird in deinem Browser gelesen und bleibt dort.',
  'wordlist.help.acceptsTitle': 'Was der Upload annimmt',
  'wordlist.help.accepts':
    'Ein Wort pro Zeile, oder eine beliebige Datei mit Tabulatoren oder Kommas und einer Spalte in der Sprache, die du lernst, oder ein JSON-Array. Eine Kopfzeile wird erkannt und übersprungen, und die Wortspalte wird gefunden, wo immer sie steht.',
  'wordlist.help.frequency':
    'Eine Häufigkeitsliste wird nach {order} sortiert, das häufigste zuerst. Zahlen in der Datei werden ignoriert, weil dieselbe Zahl in verschiedenen Listen Gegenteiliges bedeutet: ein Rang steigt, je seltener die Wörter werden, eine Rohzahl fällt. Prüf also die Vorschau vor dem Import: für Chinesisch sollte sie mit 的, 一, 是 anfangen. Fängt sie mit 爱, 爱好, 八 an, ist die Datei alphabetisch sortiert und muss erst nach Häufigkeit sortiert werden.',
  'wordlist.help.frequencyOrder': 'die Reihenfolge der Wörter in der Datei',
  'wordlist.help.levels':
    'Eine Stufenliste braucht neben den Wörtern eine Spalte mit Stufen von 1 bis 9. Sie werden so gelesen, wie sie dastehen, und nicht neu nummeriert.',

  'setup.howAsked': 'Wie du abgefragt wirst',
  'setup.whatIncluded': 'Was dazugehört',
  'setup.length': 'Länge der Sitzung',
  'setup.lengthAria': 'Karten pro Sitzung',
  'setup.lengthNote':
    'Gezählt werden verschiedene Karten. Eine, die du falsch hast, kommt vor dem Ende der Sitzung wieder, ohne sie zu verlängern.',
  'setup.mode.mixed': 'Gemischt',
  'setup.mode.mixedHint': 'Jede Sitzung ein anderer Blickwinkel',
  'setup.mode.remember': 'Erinnern',
  'setup.mode.rememberHint': 'Ruf es ab und sag dann, wie es lief',
  'setup.mode.type': 'Tippen',
  'setup.mode.typeHint': 'Bau es aus der Bedeutung',
  'setup.mode.audio': 'Hören',
  'setup.mode.audioHint': 'Bau es aus dem Klang',
  'setup.mode.noVoiceTitle': 'Für diese Sprache ist auf diesem Rechner keine Stimme installiert',
  'setup.mode.noVoiceHint': 'Keine Stimme installiert',
  'setup.include.both': 'Alles',
  'setup.include.words': 'Nur Wörter',
  'setup.include.sentences': 'Nur Sätze',
  'setup.include.grammar': 'Nur Grammatik',
  'setup.summary': '{mode} · {include} · {count} Karten',
  'setup.summary.both': 'Wörter + Sätze + Grammatik',
  'setup.summary.words': 'nur Wörter',
  'setup.summary.sentences': 'nur Sätze',
  'setup.summary.grammar': 'nur Grammatik',

  'bank.placeholder': 'Tippe die Wörter der Reihe nach an',
  'bank.remove': '{word} entfernen',

  'session.complete': 'Sitzung abgeschlossen',
  'session.summary.total': '{n} Karten',
  'session.summary.right': '{n} auf Anhieb richtig',
  'session.summary.best': '{n} beste Serie',
  'session.end': 'Sitzung beenden',
  'session.combo': '{count} in Folge',
  'session.score': '{right} / {total}',
  'session.playAgain': 'Nochmal abspielen',
  'session.listen': 'Anhören',
  'session.noDefinitionShort': '(keine Definition)',
  'session.noDefinition': 'Keine Definition gefunden',
  'session.typeLine': 'Tippe den Satz…',
  'session.typeChars': 'Tippe die Zeichen…',
  'session.useBank': 'Zurück zu den Wörtern',
  'session.typeInstead': 'Lieber tippen',
  'session.correct': 'Richtig',
  'session.notQuite': 'Nicht ganz',
  'session.notQuiteWith': 'Nicht ganz — du hattest {attempt}',
  'session.structure': 'Struktur',
  'session.watchAgain': 'Ab {time} noch einmal ansehen',
  'session.translationsHidden': '— Übersetzungen bleiben verborgen',
  'session.asrWarning':
    'Aus dem Ton transkribiert — dieser Satz kann falsch verstanden worden sein.',
  'session.explain': 'Diesen Satz erklären',
  'session.check': 'Prüfen',
  'session.continue': 'Weiter',
  'session.cardsSettled': 'Erledigte Karten',
  'session.mastered': 'Beherrscht',
  'session.backSoon': 'In ein paar Minuten wieder da',
  'session.backIn': { one: 'Wieder in {count} Tag', other: 'Wieder in {count} Tagen' },
  'session.stillDueIn': {
    one: 'Immer noch fällig in {count} Tag',
    other: 'Immer noch fällig in {count} Tagen',
  },
  'session.practice': 'Übung · {when}',
  'task.introduce': 'Ein neues Wort',
  'task.pattern.tiles': 'Bau diesen Satz mit dem Muster',
  'task.audio.word': 'Tippe, was du hörst',
  'task.audio.line': 'Bau, was du hörst',
  'task.gloss': 'Bau das Wort',
  'task.translation': 'Bau diesen Satz auf {language}',
  'task.cloze': 'Welches Wort fehlt?',
  'task.meaning.word': 'Was heißt das?',
  'task.meaning.line': 'Was sagt dieser Satz?',
  'task.choice.word': 'Wähle die Bedeutung',
  'task.choice.line': 'Wähle, was dieser Satz sagt',
  'task.choice.pattern': 'Wähle, was dieses Muster macht',

  'videos.verdict.comfortable': 'bequem',
  'videos.verdict.stretch': 'grenzwertig',
  'videos.verdict.hard': 'schwer',
  'videos.coverage':
    '{percent} % von dem, was gesagt wird — {verdict}. Du kennst {known} der {total} verschiedenen Wörter hier.',
  'videos.emptyTitle': 'Noch keine Videos.',
  'videos.emptyBody': 'Sieh dir ein Bilibili-Video mit Untertitelspur an, dann taucht es hier auf.',
  'videos.lines': { one: '{count} Zeile', other: '{count} Zeilen' },
  'videos.unknown': 'Dieses Video ist nicht in deinem Verlauf.',
  'videos.back': '← Videos',
  'videos.openOnBilibili': 'Auf Bilibili öffnen',
  'videos.speak': 'Vorlesen',
  'videos.known': 'bekannt',
  'videos.showMore': 'Mehr anzeigen (noch {count})',
  'videos.times': '{count}×',

  'log.title': 'Modellprotokoll',
  'log.blurb':
    'Jede Anfrage an das lokale Modell und alles, was zurückkam oder schiefging. Neueste zuerst, begrenzt auf die letzten 500. Wird auch in die Browser-Konsole gespiegelt.',
  'log.level.all': 'Alles',
  'log.level.warn': 'Warnungen und Fehler',
  'log.level.error': 'Nur Fehler',
  'log.kind.all': 'Alle Aktivität',
  'log.kind.chat': 'Chat',
  'log.kind.explain': 'Erklärungen',
  'log.kind.translate': 'Übersetzung',
  'log.kind.models': 'Modellliste',
  'log.kind.connect': 'Verbindung',
  'log.refresh': 'Aktualisieren',
  'log.copy': 'Kopieren',
  'log.clear': 'Leeren',
  'log.reading': 'Lese…',
  'log.noMatches': 'Nichts passt zu diesen Filtern.',
  'log.empty': 'Noch nichts protokolliert. Alles, was das Modell gefragt wird, taucht hier auf.',
  'log.request': 'Anfrage {id}',
  'log.duration': '{ms} ms',

  'chat.when.today': 'heute',
  'chat.when.yesterday': 'gestern',
  'chat.when.daysAgo': { one: 'vor {count} Tag', other: 'vor {count} Tagen' },
  'chat.new': 'Neuer Chat',
  'chat.deleteConfirm': 'Dieses Gespräch löschen?',
  'chat.empty':
    'Noch nichts. Fang hier eines an, oder drück beim Wiederholen auf einer Karte auf „Erklären“.',
  'chat.fromCard': 'von einer Karte',
  'chat.pick': 'Wähl ein Gespräch, oder fang ein neues an.',
  'chat.pickHint':
    'Erklärungen, die du beim Wiederholen von einer Karte aus öffnest, landen ebenfalls hier.',
  'chat.none': 'Kein Gespräch ausgewählt.',
  'chat.stop': 'Stopp',
  'chat.thinking': 'Denkt nach…',
  'chat.placeholder': 'Frag zu diesem Satz, oder zu irgendetwas anderem…',
  'chat.send': 'Senden',
  'chat.context': {
    one: 'Kontext gesendet — {count} Zeile',
    other: 'Kontext gesendet — {count} Zeilen',
  },
  'chat.contextFrom': 'aus „{title}“',
  'chat.openFullWidth': 'In voller Breite öffnen',

  'dict.filter.all': 'Alle',
  'dict.filter.learning': 'Noch am Lernen',
  'dict.filter.known': 'Bekannt',
  'dict.filter.sentences': 'Sätze',
  'dict.noPack': 'Kein Sprachpaket für „{lang}“.',
  'dict.thisLanguage': 'diese Sprache',
  'dict.search': 'Unter den gesammelten Wörtern suchen…',
  'dict.notCollected': 'Noch nicht gesammelt.',
  'dict.nothingHere': 'Hier ist noch nichts.',
  'dict.lookSomethingUp': 'Schlag ein Wort nach, dann taucht es auf.',
  'dict.dictionaryHasThese': 'Keins deiner Wörter passt dazu, aber das Wörterbuch kennt diese.',
  'dict.noMatch': 'Kein gesammeltes Wort passt dazu.',
  'dict.pool': 'Warteschlange',
  'dict.speak': 'Vorlesen',
  'dict.timesSeen': 'Wie oft gesehen',
  'dict.times': '{count}×',
  'dict.markKnown': 'Das kenne ich schon',
  'dict.unmarkKnown': 'Nicht mehr als bekannt behandeln',
  'dict.isKnown': 'Bekannt',
  'dict.iKnowThis': 'Kenne ich',
  'dict.notInDeck': 'Noch nicht in deinem Stapel',
  'dict.addToDeck': 'Zum Stapel hinzufügen',
  'dict.add': 'Hinzufügen',
  'dict.addedNote':
    'Hinzugefügte Wörter sind sofort lernbar — sie kommen genau dorthin, wohin auch ein Wort käme, über das du mit der Maus gefahren wärst.',
  'dict.showMore': 'Mehr anzeigen (noch {count})',

  'wizard.title': 'Richte deine Wörterbücher ein',
  'wizard.whatStudying': 'Was lernst du?',
  'wizard.pickHint':
    'Eine Sprache auszuwählen merkt sie sich nur — heruntergeladen wird erst im nächsten Schritt.',
  'wizard.required': 'Erforderlich',
  'wizard.installedOn': 'Installiert am {date}',
  'wizard.downloading': 'Lade herunter',
  'wizard.importing': 'Importiere',
  'wizard.downloadingBusy': 'Lade herunter…',
  'wizard.importingBusy': 'Importiere…',
  'wizard.redownload': 'Erneut herunterladen',
  'wizard.install': 'Installieren',
  'wizard.checking': 'Prüfe…',
  'wizard.checkForUpdate': 'Nach Aktualisierung suchen',
  'wizard.updateAvailable':
    'Es gibt eine neuere Ausgabe — installiere sie oben, um sie zu bekommen.',
  'wizard.noChange': 'Erneut heruntergeladen — keine Änderung gegenüber dem Installierten.',
  'wizard.installFailed':
    'Das Wörterbuch ließ sich nicht herunterladen. Prüf deine Verbindung und versuch es noch einmal.',
  'wizard.listFailed':
    'Die Wortliste ließ sich nicht herunterladen. Prüf deine Verbindung und versuch es noch einmal.',
  'wizard.optional':
    'Optional: ein lokales LLM für Chat und Übersetzung, Spracherkennung für Videos ohne Untertitel, yt-dlp für YouTube-Ton, der eingebaute Übersetzer von Chrome, eine chinesische Sprachausgabe und die Leser-Berechtigung pro Seite. All das richtest du in den Einstellungen ein, sobald das Wörterbuch oben installiert ist — zum Anfangen brauchst du nichts davon.',
  'wizard.done': 'Fertig',

  'wordlist.error.empty': 'Diese Datei ist leer.',
  'wordlist.error.binary':
    'Das sieht nach einem ZIP oder einer Tabelle aus. Entpack es zuerst, oder öffne es und speichere es als CSV.',
  'wordlist.error.noChinese':
    'Kein Chinesisch gefunden. Prüf, ob es die richtige Datei ist — und falls sie aus einem älteren Datensatz stammt, ist sie vielleicht nicht als UTF-8 gespeichert, was hier als kaputter Text ankäme.',
  'wordlist.error.noLevels':
    'Die Wörter wurden gefunden, aber keine Spalte mit HSK-Stufen (eine Zahl von 1 bis 9).',

  'data.rail.backup': 'Sicherung',
  'data.rail.wordLists': 'Wortlisten',
  'data.rail.storage': 'Speicher',
  'data.rail.diagnostics': 'Diagnose',

  'data.snapshots.title': 'Stapel-Momentaufnahmen',
  'data.snapshots.blurb':
    'Werden automatisch angelegt, kurz bevor eine Datenbankaktualisierung den Stapel umschreibt. Lade eine herunter und gib sie unten dem Import-Knopf, falls eine Aktualisierung etwas verloren hat.',
  'data.snapshots.row': 'Vor Schema {version}, aufgenommen am {date}',
  'data.snapshots.download': 'Herunterladen',

  'data.lists.title': 'Wortlisten',
  'data.lists.blurb':
    'Optional. Mit der Erweiterung kommt keine mit, aber die unten lassen sich bei Bedarf herunterladen.',
  'data.lists.noDictionary':
    'Es ist noch kein Wörterbuch installiert, also gibt es keine Sprache, unter der eine Liste abgelegt werden könnte.',
  'data.lists.frequency': 'Häufigkeitsliste',
  'data.lists.levels': '{standard}-Stufen',
  'data.lists.frequencyBlurb':
    'Bestimmt, welche neuen Wörter dir zuerst begegnen, und gibt dem Fortschritt einen Nenner.',
  'data.lists.levelsBlurb':
    'Gruppiert das Wörterbuch nach {standard}-Stufe, sodass sich das Deck Stufe für Stufe messen lässt.',
  'data.lists.loaded': '{name} — {count} Wörter, hinzugefügt am {date}',
  'data.lists.install': '{name} installieren',
  'data.lists.downloading': 'Lade herunter',
  'data.lists.nothingToDownload':
    'Für {language} gibt es noch nichts zum Herunterladen — lade unten deine eigene Datei hoch.',
  'data.lists.delete': 'Löschen',
  'data.lists.downloadFailed':
    'Die Liste ließ sich nicht herunterladen. Prüf deine Verbindung und versuch es noch einmal.',
  'data.lists.checkFirst': 'Prüf das vor dem Import',
  'data.lists.previewSummary': '{file} — {shape} — {count} Wörter',
  'data.lists.previewFrequency':
    'Das sollten mit die häufigsten Wörter in {language} sein. Wenn nicht, ist die Datei nicht nach Häufigkeit sortiert.',
  'data.lists.previewLevels': 'Die Stufen werden so gelesen, wie sie in der Datei stehen.',
  'data.lists.theLanguageYouStudy': 'der Sprache, die du lernst',
  'data.lists.import': 'Importieren',
  'data.lists.cancel': 'Abbrechen',
  'data.shape.json': 'JSON',
  'data.shape.tab': 'durch Tabulatoren getrennt',
  'data.shape.comma': 'durch Kommas getrennt',
  'data.shape.lines': 'ein Wort pro Zeile',
  'data.shape.headerSkipped': 'Kopfzeile übersprungen',
  'data.shape.wordColumn': 'Wörter in Spalte {n}',

  'data.cache.title': 'Modellübersetzungen',
  'data.cache.confirm': 'Alle Übersetzungen löschen, die das lokale Modell erzeugt hat?',
  'data.cache.loaded': {
    one: '{lines} Zeilen aus {videos} Video. Aufgehoben, damit ein zweites Ansehen sofort geht, statt noch einmal dieselbe halbe Stunde zu kosten.',
    other:
      '{lines} Zeilen aus {videos} Videos. Aufgehoben, damit ein zweites Ansehen sofort geht, statt noch einmal dieselbe halbe Stunde zu kosten.',
  },
  'data.cache.empty':
    'Noch nichts zwischengespeichert. Untertitelzeilen, die das lokale Modell übersetzt, werden hier aufgehoben, sodass erneutes Ansehen nichts kostet.',

  'data.transcripts.title': 'Transkripte',
  'data.transcripts.confirm':
    'Alle Transkripte löschen? Videos ohne eigene Untertitelspur müssen erst wieder transkribiert werden, bevor sie überhaupt Zeilen zeigen.',
  'data.transcripts.loaded': {
    one: '{lines} Zeilen aus {videos} Video. Aufgehoben, damit eine Folge ein für alle Mal abgehört wird und nicht einmal pro Ansehen.',
    other:
      '{lines} Zeilen aus {videos} Videos. Aufgehoben, damit eine Folge ein für alle Mal abgehört wird und nicht einmal pro Ansehen.',
  },
  'data.transcripts.empty':
    'Noch nichts transkribiert. Zeilen, die das Sprachmodell in Videos ohne Untertitelspur hört, werden hier aufgehoben, sodass erneutes Ansehen nichts kostet.',
  'data.clear': 'Leeren',

  'data.export.title': 'Exportieren',
  'data.export.blurb':
    'Eine JSON-Datei mit allen Karten, dem vollständigen Wiederholungsprotokoll, den Begegnungszählern und dem Videoverlauf. Verweilzeit-Messungen und Wortlisten bleiben draußen — die einen sind eine Kalibrierung für diesen Rechner, die anderen lädst du pro Browser.',
  'data.export.download': 'Herunterladen',
  'data.import.title': 'Importieren',
  'data.import.blurb':
    'Wird zusammengeführt, nicht ersetzt. Die Wiederholungsprotokolle beider Seiten werden vereint und der Plan daraus neu berechnet, sodass auch das zählt, was du in einem anderen Browser gelernt hast. Zähler addieren sich, Videos werden über die Kennung zusammengeführt.',
  'data.import.badJson': 'Diese Datei ist kein gültiges JSON.',
  'data.import.notABackup': 'Das sieht nicht nach einem bb-subsgen-Export aus.',
  'data.import.merged': 'Zusammengeführt. Insgesamt {cards} Karten und {reviews} Wiederholungen.',
  'data.import.failed': 'Der Import ist fehlgeschlagen — es wurde nichts geändert.',
  'data.conflicts.title': {
    one: '{count} Wort widerspricht sich',
    other: '{count} Wörter widersprechen sich',
  },
  'data.conflicts.blurb':
    'Sie sind auf der einen Seite als bekannt markiert und auf der anderen nicht. Alles andere führt sich von selbst zusammen — nur eine Erklärung hat keinen Beleg, der sie entscheiden könnte.',
  'data.conflicts.more': '… +{count}',
  'data.conflicts.keepMine': 'Meine behalten ({count} bleiben bekannt)',
  'data.conflicts.useFile': 'Die Datei nehmen ({count} werden bekannt)',

  'data.clearAll.title': 'Alles löschen',
  'data.clearAll.blurb':
    'Löscht alle Karten, Wiederholungen und Zähler. Wortlisten bleiben erhalten. Exportier vorher — es gibt kein Zurück.',
  'data.clearAll.confirm':
    'Alle Karten, Wiederholungen und Zähler löschen? Das lässt sich nicht rückgängig machen.',
  'data.clearAll.done': 'Alles gelöscht.',

  'progress.translating': 'Übersetze mit {model}',
  'progress.lines': '{done} / {total} Zeilen',
  'progress.transcribing': 'Transkribiere mit {model}',
  'progress.chunks': '{done} / {total} Abschnitte',
  'progress.starting': 'startet…',
  'progress.stopped': 'Transkription gestoppt',
  'progress.missing': {
    one: '{count} Passage fehlt',
    other: '{count} Passagen fehlen',
  },
  'progress.nothingTranscribed': 'nichts wurde transkribiert',

  'popup.status.loading': 'Lade Untertitel…',
  'popup.status.noTrack': 'Dieses Video hat keine Untertitelspur.',
  'popup.status.active': 'Bei diesem Video aktiv.',
  'popup.status.noVideo': 'Öffne ein Bilibili- oder YouTube-Video, um Untertitel zu bekommen.',
  'popup.status.noDictionary': 'Für diese Sprache ist kein Wörterbuch installiert.',
  'popup.coverage': 'Du kennst {percent} von dem, was hier gesagt wird — {types}.',
  'popup.coveragePercent': '{percent} %',
  'popup.coverageTypes': '{known} von {total} Wörtern',
  'popup.verdict.comfortable': 'Bequem.',
  'popup.verdict.stretch': 'Grenzwertig.',
  'popup.verdict.hard': 'Schwer.',
  'popup.retrying': 'Versuche erneut…',
  'popup.retry': 'Fehlende Teile erneut versuchen',
  'popup.needsDictionary': 'Für eine Sprache, die du lernst, ist noch kein Wörterbuch installiert.',
  'popup.noLanguage': 'Du hast noch keine Sprache zum Lernen eingerichtet.',
  'popup.goToSetup': 'Zur Einrichtung',
  'popup.openApp': 'Karteikarten öffnen',
  'popup.readerOn': 'Leser auf {host}',
  'popup.readerUnavailable': 'Auf dieser Seite kann der Leser nicht laufen.',

  'explain.chatTitle': '「{word}」 erklären',
  'explain.chatTitleLine': 'Einen Satz erklären',
  'explain.question': 'Was sagt dieser Satz, und was passiert darin grammatisch?',
  'explain.questionAbout': 'Warum wird 「{word}」 in diesem Satz benutzt, und was sagt der Satz?',
  'chat.noModel':
    'Stell zuerst im Popup der Erweiterung einen Modellserver und ein Chat-Modell ein.',
}
