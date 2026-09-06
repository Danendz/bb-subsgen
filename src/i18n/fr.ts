// Français. Draft, not reviewed by a native speaker — see the PR body.

import type { Messages } from './keys'

export const fr: Messages = {
  'app.title': 'Cartes',
  'app.subtitle': 'Tout ce que bb-subsgen a recueilli pendant que vous lisiez.',
  'app.tab.overview': 'Aperçu',
  'app.tab.review': 'Révision',
  'app.tab.chat': 'Discussion',
  'app.tab.dictionary': 'Dictionnaire',
  'app.tab.videos': 'Vidéos',
  'app.tab.data': 'Données',
  'app.tab.settings': 'Réglages',

  'filter.studying': 'J’étudie',
  'filter.all': 'Toutes les langues',
  'filter.notInstalled': '{language} \u2014 non installé',

  'controls.notSet': 'Non défini',
  'controls.sections': 'Sections',

  'settings.enabled': 'Activé',
  'settings.server': 'Serveur',
  'settings.connect': 'Se connecter',
  'settings.connecting': 'Connexion…',
  'settings.connected': 'Connecté.',
  'settings.connectedModels': {
    one: 'Connecté — {count} modèle.',
    other: 'Connecté — {count} modèles.',
  },

  'settings.studying.title': 'Étude',
  'settings.studying.quizMode': 'Mode quiz (Alt+Q)',
  'settings.studying.wholeLines': 'Étudier des phrases entières',
  'settings.studying.newLines': 'Nouvelles phrases / jour',
  'settings.studying.hint':
    'Le mode quiz masque les lectures et les traductions jusqu’au survol. Chaque mot que vous recueillez est étudiable immédiatement.',
  'settings.studying.hintLinesOn':
    'Les phrases entières arrivent quelques-unes par jour, de la plus facile à la plus difficile.',
  'settings.studying.hintLinesOff':
    'Les phrases continuent d’être recueillies pendant votre lecture — activez ceci quand vous voudrez les étudier.',
  'settings.studying.voice': 'Voix des cartes',
  'settings.studying.voiceAuto': 'Automatique (la meilleure disponible)',
  'settings.studying.voiceNetworked': '{name} — en réseau',
  'settings.studying.noVoice':
    'Aucune voix pour la langue que vous étudiez n’est installée sur cet ordinateur, les cartes ne peuvent donc pas être lues à voix haute.',
  'settings.studying.voiceSpeed': 'Vitesse de la voix',
  'settings.studying.testVoice': 'Tester la voix',
  'settings.studying.testVoiceIn': 'Tester la voix en {language}',
  'settings.studying.voiceHint':
    'Les voix en réseau sonnent le mieux, mais elles sont synthétisées par Google : le texte de la carte quitte donc votre ordinateur, et elles se taisent hors connexion — une voix locale prend alors le relais.',

  'settings.language.title': 'Langue',
  'settings.language.translateTo': 'Traduire vers',
  'settings.language.noOnDevice':
    'Chrome n’a pas de traducteur intégré pour cette paire : les phrases sont donc traduites par votre modèle local. C’est plus lent, et rien n’est traduit quand le modèle est éteint.',
  'settings.language.toneColors': 'Couleurs des tons',
  'settings.language.traditional': 'Afficher les traditionnels dans les définitions',

  comingSoon: 'Bientôt disponible',
  'comingSoon.summary': 'Encore en cours pour {language} : {missing}.',
  'gap.patterns.row': 'Structures grammaticales ({language})',
  'gap.patterns.title':
    "Aucune table de grammaire n'existe encore pour {language}, donc les cartes au survol et les révisions expliquent les mots mais pas les structures autour.",
  'gap.patterns.noun': 'les structures grammaticales',
  'gap.onDevice.row': "Traduction sur l'appareil ({language})",
  'gap.onDevice.title':
    "Le traducteur intégré de Chrome n'est branché que pour le chinois, donc les lignes en {language} sont traduites par votre modèle local.",
  'gap.onDevice.noun': "la traduction sur l'appareil",

  // --- Language names (src/lang/pack.ts, `nameKey`) ---
  'language.zh': 'chinois',
  'language.ja': 'japonais',

  'settings.llm.title': 'Modèle local',
  'settings.llm.noModels': 'Connecté, mais le serveur n’a chargé aucun modèle.',
  'settings.llm.needsPermission':
    'Chrome a besoin d’une autorisation pour joindre cette adresse avant que le modèle puisse être utilisé.',
  'settings.llm.chatModel': 'Modèle de discussion',
  'settings.llm.translateSubtitles': 'Traduire les sous-titres',
  'settings.llm.translationModel': 'Modèle de traduction',
  'settings.llm.verboseLog': 'Journal détaillé',
  'settings.llm.hint':
    'Les explications et la discussion utilisent le modèle de discussion, et seulement quand vous les demandez. La traduction des sous-titres tourne en arrière-plan sur le modèle de traduction et relaie le traducteur de Chrome dès qu’elle a assez d’avance — choisissez-en un rapide. Le journal de débogage est dans l’onglet Données.',

  'settings.asr.title': 'Reconnaissance vocale',
  'settings.asr.needsPermission':
    'Chrome a besoin d’une autorisation pour joindre cette adresse avant qu’elle puisse être utilisée.',
  'settings.asr.helperAnswered': 'L’assistant a répondu {status}.',
  'settings.asr.unreachable': 'Impossible de le joindre : {error}',
  'settings.asr.noModelList':
    'Joignable. Ce serveur ne liste aucun modèle — saisissez le nom avec lequel il a été démarré.',
  'settings.asr.enable': 'Transcrire les vidéos sans sous-titres',
  'settings.asr.model': 'Modèle',
  'settings.asr.hint':
    'La plus grande partie de bangumi sort sans sous-titres, et ceci transcrit l’audio pour que ces épisodes restent lisibles. Cela s’exécute une fois par épisode et le résultat est mis en cache : un second visionnage ne coûte donc rien. Démarrez un serveur avec {script} dans le dépôt de l’extension — c’est un programme distinct du modèle de discussion ci-dessus.',
  'settings.asr.helper': 'Assistant audio YouTube',
  'settings.asr.helperHint':
    'Nécessaire uniquement pour YouTube. Il fournit l’audio d’une vidéo à l’extension, parce que YouTube ne publie plus d’adresse depuis laquelle le navigateur pourrait le récupérer. Lancez-le avec {ytdlp} dans le dépôt de l’extension, ou avec {services} pour le démarrer en même temps que le serveur vocal ci-dessus. Nécessite {ytdlpBin} et {ffmpeg}.',

  'settings.reader.holdKey': 'Touche à maintenir',
  'settings.reader.translateSentence': 'Traduire la phrase',

  'settings.subtitles.showPinyin': 'Afficher le pinyin',
  'settings.subtitles.fontSize': 'Taille du texte',
  'settings.subtitles.wordSpacing': 'Espacement des mots',
  'settings.subtitles.backdrop': 'Opacité du fond',
  'settings.subtitles.height': 'Hauteur',
  'settings.subtitles.lift': 'Remonter au-dessus des commandes du lecteur',
  'settings.subtitles.translation': 'Traduction',
  'settings.subtitles.translationSize': 'Taille de la traduction',
  'settings.subtitles.translationLayout': 'Disposition de la traduction',
  'settings.subtitles.layoutInline': 'Sur la même carte',
  'settings.subtitles.layoutCard': 'Sur une carte séparée',

  'common.loading': 'Chargement…',

  'settings.rail.general': 'Général',
  'settings.rail.models': 'Modèles locaux',
  'settings.pageReader.title': 'Lecteur de pages',
  'settings.pageReader.hint':
    'Maintenez {key} et pointez un mot ; cliquez dessus pour voir les caractères. Sélectionnez du texte chinois pour créer une carte de phrase.',
  'settings.sites.remove': 'Retirer',
  'settings.sites.add': 'Ajouter un site',
  'settings.sites.badAddress': 'Cela ne ressemble pas à une adresse de site. Essayez zhihu.com.',
  'settings.sites.already': '{host} est déjà activé.',
  'settings.sites.needsPermission':
    'Chrome a besoin d’une autorisation pour accéder à ce site avant que le lecteur puisse y fonctionner.',
  'settings.sites.hint':
    'Chrome demande avant l’ajout de chaque site, et le désactiver rend cet accès aussitôt. Bilibili est déjà couvert.',
  'settings.subtitles.title': 'Sous-titres',
  'settings.subtitles.hint':
    'Raccourcis : Alt+P bascule le pinyin, Alt+S fait défiler la taille du texte — pour le plein écran.',
  'settings.session.title': 'Séance',
  'settings.session.note':
    'La façon dont on vous interroge, ce qui est inclus et la durée d’une séance se règlent là où vous la démarrez : ils se lisent mieux à côté des chiffres qu’ils modifient.',
  'settings.session.open': 'Ouvrir la révision',
  'settings.dicts.title': 'Dictionnaires',
  'settings.dicts.manage': 'Gérer les dictionnaires',
  'settings.dicts.hint':
    'Ajoutez une langue que vous étudiez, ou vérifiez la mise à jour d’une langue installée.',

  'overview.nothingToShow': 'Rien à afficher pour l’instant.',
  'overview.emptyTitle': 'Rien de recueilli pour l’instant.',
  'overview.emptyBody':
    'Regardez une vidéo Bilibili sous-titrée, ou maintenez la touche du lecteur sur une page que vous avez activée, et les mots que vous consultez arriveront ici.',
  'overview.stat.words': 'mots recueillis',
  'overview.stat.known': 'mots connus',
  'overview.stat.sentences': 'phrases',
  'overview.stat.grammar': 'structures',
  'overview.stat.pool': 'en attente',
  'overview.discovered': 'Découverts',
  'overview.discoveredOf': '{found} des {total} mots les plus fréquents',
  'overview.hsk': 'HSK',
  'overview.hskLevel': 'HSK {level}',
  'overview.noWordList':
    'Aucune liste de mots n’est chargée : les nouvelles cartes sont donc introduites dans l’ordre où vous les avez trouvées, et il n’y a pas de dénominateur pour mesurer la progression. Chargez-en une depuis {data} — on y explique où en trouver une.',

  'mastery.known': 'Connu — vous l’avez marqué vous-même',
  'mastery.mastered': 'Maîtrisé — {level} sur {max}',
  'mastery.learning': '{level} sur {max} · encore en apprentissage',
  'mastery.next': {
    one: '{level} sur {max} · de retour dans {count} jour',
    other: '{level} sur {max} · de retour dans {count} jours',
  },

  'review.noPack': 'Aucun pack de langue pour « {lang} ».',
  'review.streak': { one: '{count} jour d’affilée', other: '{count} jours d’affilée' },
  'review.stat.due': 'à réviser',
  'review.stat.newWords': 'mots non commencés',
  'review.stat.newLines': 'nouvelles phrases aujourd’hui',
  'review.stat.pooled': 'phrases en attente',
  'review.change': 'Modifier',
  'review.done': 'Terminé',
  'review.start': 'Commencer à étudier',
  'review.cards': { one: '{count} carte', other: '{count} cartes' },
  'review.breakdown': '{scheduled} programmées, {drilled} d’entraînement',
  'review.waiting': '{count} en attente',
  'review.shortfall.words':
    'c’est tout ce qui est prêt côté mots — activez aussi les phrases pour en avoir plus',
  'review.shortfall.sentences':
    'c’est tout ce qui est prêt côté phrases — activez aussi les mots pour en avoir plus',
  'review.shortfall.all': 'c’est tout ce qui est prêt',
  'review.emptyTitle': 'Rien à étudier pour l’instant.',
  'review.emptyPooled': {
    one: '{count} phrase attend son tour — elles arrivent quelques-unes par jour, de la plus facile à la plus difficile.',
    other:
      '{count} phrases attendent leur tour — elles arrivent quelques-unes par jour, de la plus facile à la plus difficile.',
  },
  'review.emptyBody': 'Allez lire quelque chose ; tout ce que vous consultez apparaîtra ici.',

  'embed.title': 'Expliquer',
  'embed.openInApp': 'Ouvrir dans les cartes',
  'embed.close': 'Fermer',
  'embed.noLine': 'Il n’y avait aucune phrase à expliquer.',
  'embed.failed':
    'Impossible de démarrer cette conversation. Le journal du modèle, dans Données, contient les détails.',
  'embed.reading': 'Lecture de la scène…',

  'wordlist.help.summary': 'Utiliser votre propre fichier',
  'wordlist.help.privacy':
    'Rien n’est envoyé nulle part. Le fichier est lu dans votre navigateur et y reste.',
  'wordlist.help.acceptsTitle': 'Ce que le chargeur accepte',
  'wordlist.help.accepts':
    'Un mot par ligne, ou n’importe quel fichier séparé par des tabulations ou des virgules comportant une colonne dans la langue que vous étudiez, ou un tableau JSON. Une ligne d’en-tête est détectée et ignorée, et la colonne des mots est trouvée où qu’elle se trouve.',
  'wordlist.help.frequency':
    'Une liste de fréquence est classée selon {order}, la plus courante en premier. Tout nombre présent dans le fichier est ignoré, car le même nombre signifie l’inverse d’une liste à l’autre : un rang monte à mesure que les mots se raréfient, un décompte brut descend. Vérifiez donc l’aperçu avant d’importer : pour le chinois, il devrait commencer par 的, 一, 是. S’il commence par 爱, 爱好, 八, le fichier est en ordre alphabétique et doit d’abord être trié par fréquence.',
  'wordlist.help.frequencyOrder': 'l’ordre d’apparition des mots dans le fichier',
  'wordlist.help.levels':
    'Une liste de niveaux demande une colonne de niveaux de 1 à 9 à côté des mots. Ils sont lus tels quels, sans renumérotation.',

  'setup.howAsked': 'Comment on vous interroge',
  'setup.whatIncluded': 'Ce qui est inclus',
  'setup.length': 'Durée de la séance',
  'setup.lengthAria': 'Cartes par séance',
  'setup.lengthNote':
    'Comptées en cartes distinctes. Une carte ratée revient avant la fin de la séance sans l’allonger.',
  'setup.mode.mixed': 'Mixte',
  'setup.mode.mixedHint': 'Un angle différent à chaque séance',
  'setup.mode.remember': 'Rappel',
  'setup.mode.rememberHint': 'Souvenez-vous, puis dites comment ça s’est passé',
  'setup.mode.type': 'Saisie',
  'setup.mode.typeHint': 'Reconstruisez-le à partir du sens',
  'setup.mode.audio': 'Écoute',
  'setup.mode.audioHint': 'Reconstruisez-le à partir du son',
  'setup.mode.noVoiceTitle': 'Aucune voix pour cette langue n’est installée sur cet ordinateur',
  'setup.mode.noVoiceHint': 'Aucune voix installée',
  'setup.include.both': 'Tout',
  'setup.include.words': 'Mots seulement',
  'setup.include.sentences': 'Phrases seulement',
  'setup.include.grammar': 'Grammaire seulement',
  'setup.summary': '{mode} · {include} · {count} cartes',
  'setup.summary.both': 'mots + phrases + grammaire',
  'setup.summary.words': 'mots seulement',
  'setup.summary.sentences': 'phrases seulement',
  'setup.summary.grammar': 'grammaire seulement',

  'bank.placeholder': 'Touchez les mots dans l’ordre',
  'bank.remove': 'Retirer {word}',

  'session.complete': 'Séance terminée',
  'session.summary.total': '{n} cartes',
  'session.summary.right': '{n} justes du premier coup',
  'session.summary.best': '{n} meilleure série',
  'session.end': 'Terminer la séance',
  'session.combo': '{count} d’affilée',
  'session.score': '{right} / {total}',
  'session.playAgain': 'Réécouter',
  'session.listen': 'Écouter',
  'session.noDefinitionShort': '(pas de définition)',
  'session.noDefinition': 'Aucune définition trouvée',
  'session.typeLine': 'Tapez la phrase…',
  'session.typeChars': 'Tapez les caractères…',
  'session.useBank': 'Revenir aux mots',
  'session.typeInstead': 'Taper à la place',
  'session.correct': 'Correct',
  'session.notQuite': 'Presque',
  'session.notQuiteWith': 'Presque — vous avez mis {attempt}',
  'session.structure': 'Structure',
  'session.watchAgain': 'Revoir à partir de {time}',
  'session.translationsHidden': '— les traductions restent masquées',
  'session.asrWarning': 'Transcrit depuis l’audio — cette phrase a pu être mal entendue.',
  'session.explain': 'Expliquer cette phrase',
  'session.showAnswer': 'Voir la réponse',
  'session.check': 'Vérifier',
  'session.didntKnow': 'Je ne savais pas',
  'session.knewIt': 'Je savais',
  'session.continue': 'Continuer',
  'session.cardsSettled': 'Cartes réglées',
  'session.mastered': 'Maîtrisée',
  'session.backSoon': 'De retour dans quelques minutes',
  'session.backIn': {
    one: 'De retour dans {count} jour',
    other: 'De retour dans {count} jours',
  },
  'session.stillDueIn': {
    one: 'Toujours à réviser dans {count} jour',
    other: 'Toujours à réviser dans {count} jours',
  },
  'session.practice': 'Entraînement · {when}',
  'task.pattern.tiles': 'Construisez cette phrase avec la structure',
  'task.pattern.reveal': 'Que fait cette structure ?',
  'task.audio.word': 'Tapez ce que vous entendez',
  'task.audio.line': 'Construisez ce que vous entendez',
  'task.gloss': 'Tapez les caractères',
  'task.translation': 'Construisez cette phrase en {language}',
  'task.cloze': 'Quel mot manque ?',
  'task.meaning.word': 'Qu’est-ce que cela veut dire ?',
  'task.meaning.line': 'Que veut dire cette phrase ?',
  'task.choice.word': 'Choisissez le sens',

  'videos.verdict.comfortable': 'confortable',
  'videos.verdict.stretch': 'un peu juste',
  'videos.verdict.hard': 'difficile',
  'videos.coverage':
    '{percent} % de ce qui est dit — {verdict}. Vous connaissez {known} des {total} mots distincts ici.',
  'videos.emptyTitle': 'Aucune vidéo pour l’instant.',
  'videos.emptyBody':
    'Regardez une vidéo Bilibili avec une piste de sous-titres et elle apparaîtra ici.',
  'videos.lines': { one: '{count} phrase', other: '{count} phrases' },
  'videos.unknown': 'Cette vidéo n’est pas dans votre historique.',
  'videos.back': '← Vidéos',
  'videos.openOnBilibili': 'Ouvrir sur Bilibili',
  'videos.speak': 'Prononcer',
  'videos.known': 'connu',
  'videos.showMore': 'Afficher plus ({count} restants)',
  'videos.times': '{count}×',

  'log.title': 'Journal du modèle',
  'log.blurb':
    'Chaque requête envoyée au modèle local, et tout ce qui est revenu ou a échoué. Les plus récentes d’abord, limitées aux 500 dernières. Également répercuté dans la console du navigateur.',
  'log.level.all': 'Tout',
  'log.level.warn': 'Avertissements et erreurs',
  'log.level.error': 'Erreurs seulement',
  'log.kind.all': 'Toute l’activité',
  'log.kind.chat': 'Discussion',
  'log.kind.explain': 'Explications',
  'log.kind.translate': 'Traduction',
  'log.kind.models': 'Liste des modèles',
  'log.kind.connect': 'Connexion',
  'log.refresh': 'Actualiser',
  'log.copy': 'Copier',
  'log.clear': 'Effacer',
  'log.reading': 'Lecture…',
  'log.noMatches': 'Rien ne correspond à ces filtres.',
  'log.empty':
    'Rien de consigné pour l’instant. Tout ce qui sera demandé au modèle apparaîtra ici.',
  'log.request': 'requête {id}',
  'log.duration': '{ms} ms',

  'chat.when.today': 'aujourd’hui',
  'chat.when.yesterday': 'hier',
  'chat.when.daysAgo': { one: 'il y a {count} jour', other: 'il y a {count} jours' },
  'chat.new': 'Nouvelle discussion',
  'chat.deleteConfirm': 'Supprimer cette conversation ?',
  'chat.empty':
    'Rien pour l’instant. Commencez-en une ici, ou appuyez sur Expliquer sur une carte pendant la révision.',
  'chat.fromCard': 'depuis une carte',
  'chat.pick': 'Choisissez une conversation, ou commencez-en une nouvelle.',
  'chat.pickHint':
    'Les explications ouvertes depuis une carte pendant la révision arrivent ici aussi.',
  'chat.none': 'Aucune conversation sélectionnée.',
  'chat.stop': 'Arrêter',
  'chat.thinking': 'Réflexion…',
  'chat.placeholder': 'Posez une question sur cette phrase, ou sur autre chose…',
  'chat.send': 'Envoyer',
  'chat.context': {
    one: 'Contexte envoyé — {count} phrase',
    other: 'Contexte envoyé — {count} phrases',
  },
  'chat.contextFrom': 'de « {title} »',
  'chat.openFullWidth': 'Ouvrir en pleine largeur',

  'dict.filter.all': 'Tous',
  'dict.filter.learning': 'En apprentissage',
  'dict.filter.known': 'Connus',
  'dict.filter.sentences': 'Phrases',
  'dict.noPack': 'Aucun pack de langue pour « {lang} ».',
  'dict.thisLanguage': 'cette langue',
  'dict.search': 'Chercher parmi les mots que vous avez recueillis…',
  'dict.notCollected': 'Pas encore recueilli.',
  'dict.nothingHere': 'Rien ici pour l’instant.',
  'dict.lookSomethingUp': 'Consultez un mot et il apparaîtra.',
  'dict.dictionaryHasThese':
    'Aucun de vos mots ne correspond, mais le dictionnaire propose ceux-ci.',
  'dict.noMatch': 'Aucun mot recueilli ne correspond.',
  'dict.pool': 'en attente',
  'dict.speak': 'Prononcer',
  'dict.timesSeen': 'Nombre de rencontres',
  'dict.times': '{count}×',
  'dict.markKnown': 'Je connais déjà ce mot',
  'dict.unmarkKnown': 'Ne plus le considérer comme connu',
  'dict.isKnown': 'Connu',
  'dict.iKnowThis': 'Je le connais',
  'dict.notInDeck': 'Pas encore dans votre paquet',
  'dict.addToDeck': 'Ajouter au paquet',
  'dict.add': 'Ajouter',
  'dict.addedNote':
    'Les mots ajoutés sont étudiables immédiatement — ils entrent exactement là où entrerait un mot que vous auriez survolé.',
  'dict.showMore': 'Afficher plus ({count} restants)',

  'wizard.title': 'Configurez vos dictionnaires',
  'wizard.whatStudying': 'Qu’étudiez-vous ?',
  'wizard.pickHint':
    'Choisir une langue ne fait que la mémoriser — rien n’est téléchargé avant l’étape suivante.',
  'wizard.required': 'Requis',
  'wizard.installedOn': 'Installé le {date}',
  'wizard.downloading': 'Téléchargement',
  'wizard.importing': 'Import',
  'wizard.downloadingBusy': 'Téléchargement…',
  'wizard.importingBusy': 'Import…',
  'wizard.redownload': 'Retélécharger',
  'wizard.install': 'Installer',
  'wizard.checking': 'Vérification…',
  'wizard.checkForUpdate': 'Chercher une mise à jour',
  'wizard.updateAvailable': 'Une version plus récente existe — installez-la ci-dessus.',
  'wizard.noChange': 'Retéléchargé — aucun changement par rapport à ce qui était installé.',
  'wizard.installFailed':
    'Impossible de télécharger le dictionnaire. Vérifiez votre connexion et réessayez.',
  'wizard.optional':
    'Facultatif : un LLM local pour la discussion et la traduction, la reconnaissance vocale pour les vidéos sans sous-titres, yt-dlp pour l’audio YouTube, le traducteur intégré de Chrome, une voix de synthèse chinoise et l’autorisation du lecteur par site. Tout cela se configure depuis les Réglages une fois le dictionnaire ci-dessus installé — rien de tout cela n’est nécessaire pour commencer.',
  'wizard.done': 'Terminé',

  'wordlist.error.empty': 'Ce fichier est vide.',
  'wordlist.error.binary':
    'Cela ressemble à une archive zip ou à un tableur. Décompressez-le d’abord, ou ouvrez-le et enregistrez-le en CSV.',
  'wordlist.error.noChinese':
    'Aucun chinois trouvé. Vérifiez que c’est le bon fichier — et s’il vient d’un jeu de données ancien, il n’est peut-être pas enregistré en UTF-8, ce qui arriverait ici sous forme de texte illisible.',
  'wordlist.error.noLevels':
    'Les mots ont été trouvés, mais pas de colonne de niveau HSK (un nombre de 1 à 9).',

  'data.rail.backup': 'Sauvegarde',
  'data.rail.wordLists': 'Listes de mots',
  'data.rail.storage': 'Stockage',
  'data.rail.diagnostics': 'Diagnostics',

  'data.snapshots.title': 'Instantanés du paquet',
  'data.snapshots.blurb':
    'Pris automatiquement juste avant qu’une mise à niveau de la base réécrive le paquet. Téléchargez-en un et confiez-le au bouton Importer ci-dessous si une mise à niveau a perdu quelque chose.',
  'data.snapshots.row': 'Avant le schéma {version}, pris le {date}',
  'data.snapshots.download': 'Télécharger',

  'data.lists.title': 'Listes de mots',
  'data.lists.blurb':
    'Facultatives. Aucune n’est fournie avec l’extension, mais celles ci-dessous se téléchargent à la demande.',
  'data.lists.noDictionary':
    'Aucun dictionnaire n’est encore installé : il n’y a donc pas de langue à laquelle rattacher une liste.',
  'data.lists.frequency': 'Liste de fréquence',
  'data.lists.levels': 'Niveaux {standard}',
  'data.lists.frequencyBlurb':
    'Détermine l’ordre dans lequel vous rencontrez les nouveaux mots, et donne un dénominateur à la progression.',
  'data.lists.levelsBlurb':
    'Regroupe le dictionnaire par niveau {standard} et ajoute les barres de progression de l’Aperçu.',
  'data.lists.loaded': '{name} — {count} mots, ajoutée le {date}',
  'data.lists.install': 'Installer {name}',
  'data.lists.downloading': 'Téléchargement',
  'data.lists.nothingToDownload':
    'Rien à télécharger pour {language} pour l’instant — importez votre propre fichier ci-dessous.',
  'data.lists.delete': 'Supprimer',
  'data.lists.downloadFailed':
    'Impossible de télécharger la liste. Vérifiez votre connexion et réessayez.',
  'data.lists.checkFirst': 'Vérifiez ceci avant d’importer',
  'data.lists.previewSummary': '{file} — {shape} — {count} mots',
  'data.lists.previewFrequency':
    'Ceux-ci devraient figurer parmi les mots les plus courants en {language}. Si ce n’est pas le cas, le fichier n’est pas trié par fréquence.',
  'data.lists.previewLevels': 'Les niveaux sont lus tels quels dans le fichier.',
  'data.lists.theLanguageYouStudy': 'la langue que vous étudiez',
  'data.lists.import': 'Importer',
  'data.lists.cancel': 'Annuler',
  'data.shape.json': 'JSON',
  'data.shape.tab': 'séparé par des tabulations',
  'data.shape.comma': 'séparé par des virgules',
  'data.shape.lines': 'un mot par ligne',
  'data.shape.headerSkipped': 'en-tête ignoré',
  'data.shape.wordColumn': 'mots dans la colonne {n}',

  'data.cache.title': 'Traductions du modèle',
  'data.cache.confirm': 'Supprimer toutes les traductions produites par le modèle local ?',
  'data.cache.loaded': {
    one: '{lines} phrases sur {videos} vidéo. Conservées pour qu’un second visionnage soit instantané au lieu de recoûter la même demi-heure.',
    other:
      '{lines} phrases sur {videos} vidéos. Conservées pour qu’un second visionnage soit instantané au lieu de recoûter la même demi-heure.',
  },
  'data.cache.empty':
    'Rien en cache pour l’instant. Les lignes de sous-titres traduites par le modèle local sont conservées ici, de sorte qu’un nouveau visionnage ne coûte rien.',

  'data.transcripts.title': 'Transcriptions',
  'data.transcripts.confirm':
    'Supprimer toutes les transcriptions ? Les vidéos sans piste de sous-titres devront être transcrites à nouveau avant d’afficher la moindre ligne.',
  'data.transcripts.loaded': {
    one: '{lines} phrases sur {videos} vidéo. Conservées pour qu’un épisode ne soit écouté qu’une seule fois, et non une fois par visionnage.',
    other:
      '{lines} phrases sur {videos} vidéos. Conservées pour qu’un épisode ne soit écouté qu’une seule fois, et non une fois par visionnage.',
  },
  'data.transcripts.empty':
    'Rien de transcrit pour l’instant. Les lignes que le modèle vocal entend dans les vidéos sans piste de sous-titres sont conservées ici, de sorte qu’en revoir une ne coûte rien.',
  'data.clear': 'Effacer',

  'data.export.title': 'Exporter',
  'data.export.blurb':
    'Un seul fichier JSON avec toutes les cartes, le journal complet des révisions, les compteurs de rencontres et l’historique des vidéos. Les mesures de temps de lecture et les listes de mots sont exclues : les premières calibrent cette machine, les secondes se chargent par navigateur.',
  'data.export.download': 'Télécharger',
  'data.import.title': 'Importer',
  'data.import.blurb':
    'Fusionné, pas remplacé. Les journaux de révision des deux côtés sont combinés et le calendrier est recalculé à partir d’eux : ce que vous avez étudié dans un autre navigateur compte donc toujours. Les compteurs s’additionnent et les vidéos fusionnent par identifiant.',
  'data.import.badJson': 'Ce fichier n’est pas du JSON valide.',
  'data.import.notABackup': 'Cela ne ressemble pas à un export bb-subsgen.',
  'data.import.merged': 'Fusionné. {cards} cartes et {reviews} révisions au total.',
  'data.import.failed': 'L’import a échoué — rien n’a été modifié.',
  'data.conflicts.title': {
    one: '{count} mot en désaccord',
    other: '{count} mots en désaccord',
  },
  'data.conflicts.blurb':
    'Ils sont marqués comme connus d’un côté et pas de l’autre. Tout le reste fusionne tout seul — seule une déclaration n’a aucune preuve pour la trancher.',
  'data.conflicts.more': '… +{count}',
  'data.conflicts.keepMine': 'Garder les miens ({count} restent connus)',
  'data.conflicts.useFile': 'Utiliser le fichier ({count} deviennent connus)',

  'data.clearAll.title': 'Tout effacer',
  'data.clearAll.blurb':
    'Supprime toutes les cartes, révisions et compteurs. Les listes de mots sont conservées. Exportez d’abord — il n’y a pas de retour en arrière.',
  'data.clearAll.confirm':
    'Supprimer toutes les cartes, révisions et compteurs ? C’est irréversible.',
  'data.clearAll.done': 'Tout a été effacé.',

  'progress.translating': 'Traduction avec {model}',
  'progress.lines': '{done} / {total} phrases',
  'progress.transcribing': 'Transcription avec {model}',
  'progress.chunks': '{done} / {total} fragments',
  'progress.starting': 'démarrage…',
  'progress.stopped': 'Transcription interrompue',
  'progress.missing': {
    one: '{count} passage manquant',
    other: '{count} passages manquants',
  },
  'progress.nothingTranscribed': 'rien n’a été transcrit',

  'popup.status.loading': 'Chargement des sous-titres…',
  'popup.status.noTrack': 'Cette vidéo n’a pas de piste de sous-titres.',
  'popup.status.active': 'Actif sur cette vidéo.',
  'popup.status.noVideo': 'Ouvrez une vidéo Bilibili ou YouTube pour avoir des sous-titres.',
  'popup.status.noDictionary': 'Aucun dictionnaire installé pour cette langue.',
  'popup.coverage': 'Vous connaissez {percent} de ce qui est dit ici — {types}.',
  'popup.coveragePercent': '{percent} %',
  'popup.coverageTypes': '{known} mots sur {total}',
  'popup.verdict.comfortable': 'Confortable.',
  'popup.verdict.stretch': 'Un peu juste.',
  'popup.verdict.hard': 'Difficile.',
  'popup.retrying': 'Nouvelle tentative…',
  'popup.retry': 'Réessayer les parties manquantes',
  'popup.needsDictionary': 'Une langue que vous étudiez n’a pas encore de dictionnaire installé.',
  'popup.noLanguage': 'Vous n’avez pas encore choisi de langue à étudier.',
  'popup.goToSetup': 'Aller à la configuration',
  'popup.openApp': 'Ouvrir les cartes',
  'popup.readerOn': 'Lecteur sur {host}',
  'popup.readerUnavailable': 'Le lecteur ne peut pas fonctionner sur cette page.',

  'explain.chatTitle': 'Expliquer 「{word}」',
  'explain.chatTitleLine': 'Expliquer une phrase',
  'explain.question': 'Que dit cette phrase, et que s’y passe-t-il grammaticalement ?',
  'explain.questionAbout':
    'Pourquoi 「{word}」 est-il employé dans cette phrase, et que dit la phrase ?',
  'chat.noModel':
    'Indiquez d’abord un serveur de modèles et un modèle de discussion dans la fenêtre de l’extension.',
}
