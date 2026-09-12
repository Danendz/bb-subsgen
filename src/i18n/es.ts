// Español. Draft, not reviewed by a native speaker — see the PR body.

import type { Messages } from './keys'

export const es: Messages = {
  'app.title': 'Tarjetas',
  'app.subtitle': 'Todo lo que bb-subsgen ha recogido mientras leías.',
  'app.tab.overview': 'Resumen',
  'app.tab.review': 'Repaso',
  'app.tab.chat': 'Chat',
  'app.tab.dictionary': 'Diccionario',
  'app.tab.videos': 'Vídeos',
  'app.tab.data': 'Datos',
  'app.tab.settings': 'Ajustes',

  'filter.studying': 'Estudiando',
  'filter.all': 'Todos los idiomas',
  'filter.notInstalled': '{language} \u2014 no instalado',

  'controls.notSet': 'Sin definir',
  'controls.sections': 'Secciones',

  'settings.enabled': 'Activado',
  'settings.server': 'Servidor',
  'settings.connect': 'Conectar',
  'settings.connecting': 'Conectando…',
  'settings.connected': 'Conectado.',
  'settings.connectedModels': {
    one: 'Conectado — {count} modelo.',
    other: 'Conectado — {count} modelos.',
  },

  'settings.studying.title': 'Estudio',
  'settings.studying.quizMode': 'Modo examen (Alt+Q)',
  'settings.studying.wholeLines': 'Estudiar frases enteras',
  'settings.studying.newLines': 'Frases nuevas al día',
  'settings.studying.hint':
    'El modo examen oculta las lecturas y las traducciones hasta que pasas el ratón por encima. Cada palabra que recoges se puede estudiar de inmediato.',
  'settings.studying.hintLinesOn':
    'Las frases enteras entran unas pocas al día, de la más fácil a la más difícil.',
  'settings.studying.hintLinesOff':
    'Las frases se siguen recogiendo mientras lees: activa esto cuando quieras estudiarlas.',
  'settings.studying.voice': 'Voz de las tarjetas',
  'settings.studying.voiceAuto': 'Automática (la mejor disponible)',
  'settings.studying.voiceNetworked': '{name} — en red',
  'settings.studying.noVoice':
    'No hay ninguna voz del idioma que estudias instalada en este ordenador, así que las tarjetas no se pueden leer en voz alta.',
  'settings.studying.voiceSpeed': 'Velocidad de la voz',
  'settings.studying.testVoice': 'Probar la voz',
  'settings.studying.testVoiceIn': 'Probar la voz en {language}',
  'settings.studying.voiceHint':
    'Las voces en red suenan mejor, pero las sintetiza Google, de modo que el texto de la tarjeta sale de tu ordenador y enmudecen sin conexión: entonces toma el relevo una voz local.',

  'settings.language.title': 'Idioma',
  'settings.language.translateTo': 'Traducir a',
  'settings.language.noOnDevice':
    'Chrome no tiene traductor en el dispositivo para este par, así que las frases las traduce tu modelo local. Es más lento, y no se traduce nada mientras el modelo está apagado.',
  'settings.language.toneColors': 'Colores de tono',
  'settings.language.traditional': 'Mostrar tradicionales en las definiciones',

  comingSoon: 'Próximamente',
  'comingSoon.summary': 'Todavía en desarrollo para {language}: {missing}.',
  'gap.patterns.row': 'Patrones gramaticales ({language})',
  'gap.patterns.title':
    'Aún no hay tabla de gramática para {language}, así que las tarjetas al pasar el ratón y el repaso explican las palabras pero no las estructuras que las rodean.',
  'gap.patterns.noun': 'los patrones gramaticales',
  'gap.onDevice.row': 'Traducción en el dispositivo ({language})',
  'gap.onDevice.title':
    'El traductor integrado de Chrome solo está conectado para el chino, así que las líneas en {language} las traduce tu modelo local.',
  'gap.onDevice.noun': 'la traducción en el dispositivo',

  // --- Language names (src/lang/pack.ts, `nameKey`) ---
  'language.zh': 'chino',
  'language.ja': 'japonés',

  'settings.llm.title': 'Modelo local',
  'settings.llm.noModels': 'Conectado, pero el servidor no tiene ningún modelo cargado.',
  'settings.llm.needsPermission':
    'Chrome necesita permiso para acceder a esa dirección antes de poder usar el modelo.',
  'settings.llm.chatModel': 'Modelo de chat',
  'settings.llm.translateSubtitles': 'Traducir los subtítulos',
  'settings.llm.translationModel': 'Modelo de traducción',
  'settings.llm.verboseLog': 'Registro detallado',
  'settings.llm.hint':
    'Las explicaciones y el chat usan el modelo de chat, y solo cuando los pides. La traducción de subtítulos corre en segundo plano con el modelo de traducción y releva al traductor de Chrome en cuanto va suficientemente por delante: elige uno rápido. El registro de depuración está en la pestaña Datos.',

  'settings.asr.title': 'Voz a texto',
  'settings.asr.needsPermission':
    'Chrome necesita permiso para acceder a esa dirección antes de poder usarla.',
  'settings.asr.helperAnswered': 'El ayudante respondió {status}.',
  'settings.asr.unreachable': 'No se ha podido contactar: {error}',
  'settings.asr.noModelList':
    'Accesible. Este servidor no lista modelos: escribe el nombre con el que se arrancó.',
  'settings.asr.enable': 'Transcribir los vídeos sin subtítulos',
  'settings.asr.model': 'Modelo',
  'settings.asr.hint':
    'La mayor parte de bangumi sale sin subtítulos, y esto transcribe el audio para que esos episodios se puedan leer igualmente. Se ejecuta una vez por episodio y el resultado se guarda, así que volver a verlo no cuesta nada. Arranca un servidor con {script} en el repositorio de la extensión: es un programa aparte del modelo de chat de arriba.',
  'settings.asr.helper': 'Ayudante de audio de YouTube',
  'settings.asr.helperHint':
    'Solo hace falta para YouTube. Sirve el audio de un vídeo a la extensión, porque YouTube ya no publica una dirección de la que el navegador pueda descargarlo. Arráncalo con {ytdlp} en el repositorio de la extensión, o con {services} para levantarlo junto al servidor de voz de arriba. Necesita {ytdlpBin} y {ffmpeg} instalados.',

  'settings.reader.holdKey': 'Tecla que se mantiene',
  'settings.reader.translateSentence': 'Traducir la frase',

  'settings.subtitles.showPinyin': 'Mostrar pinyin',
  'settings.subtitles.fontSize': 'Tamaño de letra',
  'settings.subtitles.wordSpacing': 'Espacio entre palabras',
  'settings.subtitles.backdrop': 'Opacidad del fondo',
  'settings.subtitles.height': 'Altura',
  'settings.subtitles.lift': 'Subir por encima de los controles',
  'settings.subtitles.translation': 'Traducción',
  'settings.subtitles.translationSize': 'Tamaño de la traducción',
  'settings.subtitles.translationLayout': 'Disposición de la traducción',
  'settings.subtitles.layoutInline': 'En la misma tarjeta',
  'settings.subtitles.layoutCard': 'En una tarjeta aparte',

  'common.loading': 'Cargando…',

  'settings.rail.general': 'General',
  'settings.rail.models': 'Modelos locales',
  'settings.pageReader.title': 'Lector de páginas',
  'settings.pageReader.hint':
    'Mantén {key} y apunta a una palabra; haz clic para ver los caracteres. Selecciona texto chino para crear una tarjeta con la frase.',
  'settings.sites.remove': 'Quitar',
  'settings.sites.add': 'Añadir sitio',
  'settings.sites.badAddress': 'Eso no parece la dirección de un sitio. Prueba con zhihu.com.',
  'settings.sites.already': '{host} ya está activado.',
  'settings.sites.needsPermission':
    'Chrome necesita permiso para acceder a ese sitio antes de que el lector pueda funcionar allí.',
  'settings.sites.hint':
    'Chrome pregunta antes de añadir cada sitio, y desactivarlo devuelve ese acceso al instante. Bilibili ya está incluido.',
  'settings.subtitles.title': 'Subtítulos',
  'settings.subtitles.hint':
    'Atajos: Alt+P alterna el pinyin, Alt+S recorre los tamaños de letra — para pantalla completa.',
  'settings.session.title': 'Sesión',
  'settings.session.note':
    'Cómo se te pregunta, qué se incluye y cuánto dura una sesión se ajustan donde la empiezas: se leen mejor junto a las cifras que cambian.',
  'settings.session.open': 'Abrir Repaso',
  'settings.dicts.title': 'Diccionarios',
  'settings.dicts.manage': 'Gestionar diccionarios',
  'settings.dicts.hint':
    'Añade un idioma que estudies, o comprueba si hay actualización de uno instalado.',

  'overview.nothingToShow': 'Todavía no hay nada que mostrar.',
  'overview.emptyTitle': 'Todavía no has recogido nada.',
  'overview.emptyBody':
    'Mira un vídeo de Bilibili con subtítulos, o mantén la tecla del lector en una página que hayas activado, y las palabras que consultes acabarán aquí.',
  'overview.stat.words': 'palabras recogidas',
  'overview.stat.known': 'palabras conocidas',
  'overview.stat.sentences': 'frases',
  'overview.stat.grammar': 'estructuras',
  'overview.stat.pool': 'en espera',
  'overview.discovered': 'Descubiertas',
  'overview.discoveredOf': '{found} de las {total} palabras más frecuentes',
  'overview.hsk': 'HSK',
  'overview.hskLevel': 'HSK {level}',
  'overview.noWordList':
    'No hay ninguna lista de palabras cargada, así que las tarjetas nuevas se introducen en el orden en que las encontraste y no hay denominador con el que medir el progreso. Carga una desde {data}: allí se explica dónde conseguirla.',

  'mastery.known': 'Conocida — la marcaste tú',
  'mastery.mastered': 'Dominada — {level} de {max}',
  'mastery.learning': '{level} de {max} · todavía en aprendizaje',
  'mastery.next': {
    one: '{level} de {max} · vuelve en {count} día',
    other: '{level} de {max} · vuelve en {count} días',
  },

  'review.noPack': 'No hay paquete de idioma para «{lang}».',
  'review.streak': { one: '{count} día seguido', other: '{count} días seguidos' },
  'review.stat.due': 'toca repasar',
  'review.stat.newWords': 'palabras sin empezar',
  'review.stat.newLines': 'frases nuevas hoy',
  'review.stat.pooled': 'frases en espera',
  'review.change': 'Cambiar',
  'review.done': 'Hecho',
  'review.start': 'Empezar a estudiar',
  'review.cards': { one: '{count} tarjeta', other: '{count} tarjetas' },
  'review.breakdown': '{scheduled} programadas, {drilled} de práctica',
  'review.waiting': '{count} en espera',
  'review.teaching': {
    one: '{count} palabra nueva, se presenta primero',
    other: '{count} palabras nuevas, se presentan primero',
  },
  'review.shortfall.words':
    'eso es toda la palabra lista — activa también las frases para tener más',
  'review.shortfall.sentences':
    'eso es toda la frase lista — activa también las palabras para tener más',
  'review.shortfall.all': 'eso es todo lo que está listo',
  'review.emptyTitle': 'Todavía no hay nada que estudiar.',
  'review.emptyPooled': {
    one: '{count} frase espera su turno: entran unas pocas al día, de la más fácil a la más difícil.',
    other:
      '{count} frases esperan su turno: entran unas pocas al día, de la más fácil a la más difícil.',
  },
  'review.emptyBody': 'Ve a leer algo; todo lo que consultes aparecerá aquí.',

  'embed.title': 'Explicar',
  'embed.openInApp': 'Abrir en las tarjetas',
  'embed.close': 'Cerrar',
  'embed.noLine': 'No había ninguna frase que explicar.',
  'embed.failed':
    'No se ha podido iniciar esa conversación. El registro del modelo en Datos tiene los detalles.',
  'embed.reading': 'Leyendo la escena…',

  'wordlist.help.summary': 'Usar tu propio archivo',
  'wordlist.help.privacy':
    'Aquí no se sube nada a ninguna parte. El archivo se lee en tu navegador y se queda en él.',
  'wordlist.help.acceptsTitle': 'Qué acepta el cargador',
  'wordlist.help.accepts':
    'Una palabra por línea, o cualquier archivo separado por tabuladores o comas con una columna del idioma que estudias, o un array JSON. La fila de encabezado se detecta y se omite, y la columna de palabras se encuentra esté donde esté.',
  'wordlist.help.frequency':
    'Una lista de frecuencia se ordena por {order}, la más común primero. Cualquier número del archivo se ignora, porque el mismo número significa cosas opuestas en listas distintas: un rango sube a medida que las palabras se vuelven raras, y un recuento baja. Así que revisa la vista previa antes de importar: para el chino debería empezar por 的, 一, 是. Si empieza por 爱, 爱好, 八, el archivo está en orden alfabético y hay que ordenarlo antes por frecuencia.',
  'wordlist.help.frequencyOrder': 'el orden en que las palabras aparecen en el archivo',
  'wordlist.help.levels':
    'Una lista de niveles necesita una columna de niveles del 1 al 9 junto a las palabras. Se leen tal cual, sin renumerar.',

  'setup.howAsked': 'Cómo se te pregunta',
  'setup.whatIncluded': 'Qué se incluye',
  'setup.length': 'Duración de la sesión',
  'setup.lengthAria': 'Tarjetas por sesión',
  'setup.lengthNote':
    'Se cuentan tarjetas distintas. Una que falles vuelve antes de que acabe la sesión sin alargarla.',
  'setup.mode.mixed': 'Mixto',
  'setup.mode.mixedHint': 'Un enfoque distinto en cada sesión',
  'setup.mode.remember': 'Recordar',
  'setup.mode.rememberHint': 'Recuérdalo y luego di qué tal fue',
  'setup.mode.type': 'Escribir',
  'setup.mode.typeHint': 'Constrúyelo a partir del significado',
  'setup.mode.audio': 'Escuchar',
  'setup.mode.audioHint': 'Constrúyelo a partir del sonido',
  'setup.mode.noVoiceTitle': 'No hay ninguna voz de este idioma instalada en este ordenador',
  'setup.mode.noVoiceHint': 'No hay voz instalada',
  'setup.include.both': 'Todo',
  'setup.include.words': 'Solo palabras',
  'setup.include.sentences': 'Solo frases',
  'setup.include.grammar': 'Solo gramática',
  'setup.summary': '{mode} · {include} · {count} tarjetas',
  'setup.summary.both': 'palabras + frases + gramática',
  'setup.summary.words': 'solo palabras',
  'setup.summary.sentences': 'solo frases',
  'setup.summary.grammar': 'solo gramática',

  'bank.placeholder': 'Toca las palabras en orden',
  'bank.remove': 'Quitar {word}',

  'session.complete': 'Sesión completada',
  'session.summary.total': '{n} tarjetas',
  'session.summary.right': '{n} acertadas a la primera',
  'session.summary.best': '{n} mejor racha',
  'session.end': 'Terminar la sesión',
  'session.combo': '{count} seguidas',
  'session.score': '{right} / {total}',
  'session.playAgain': 'Repetir',
  'session.listen': 'Escuchar',
  'session.noDefinitionShort': '(sin definición)',
  'session.noDefinition': 'No se ha encontrado ninguna definición',
  'session.typeLine': 'Escribe la frase…',
  'session.typeChars': 'Escribe los caracteres…',
  'session.useBank': 'Volver a las palabras',
  'session.typeInstead': 'Escribirlo a mano',
  'session.correct': 'Correcto',
  'session.notQuite': 'Casi',
  'session.notQuiteWith': 'Casi — has puesto {attempt}',
  'session.structure': 'Estructura',
  'session.watchAgain': 'Volver a verlo desde {time}',
  'session.translationsHidden': '— las traducciones seguirán ocultas',
  'session.asrWarning': 'Transcrito del audio: esta frase puede estar mal oída.',
  'session.explain': 'Explicar esta frase',
  'session.check': 'Comprobar',
  'session.continue': 'Continuar',
  'session.cardsSettled': 'Tarjetas resueltas',
  'session.mastered': 'Dominada',
  'session.backSoon': 'Vuelve dentro de unos minutos',
  'session.backIn': { one: 'Vuelve en {count} día', other: 'Vuelve en {count} días' },
  'session.stillDueIn': {
    one: 'Sigue pendiente dentro de {count} día',
    other: 'Sigue pendiente dentro de {count} días',
  },
  'session.practice': 'Práctica · {when}',
  'task.introduce': 'Una palabra nueva',
  'task.pattern.tiles': 'Construye esta frase con la estructura',
  'task.audio.word': 'Escribe lo que oyes',
  'task.audio.line': 'Construye lo que oyes',
  'task.gloss': 'Construye la palabra',
  'task.translation': 'Construye esta frase en {language}',
  'task.cloze': '¿Qué palabra falta?',
  'task.meaning.word': '¿Qué significa esto?',
  'task.meaning.line': '¿Qué significa esta frase?',
  'task.choice.word': 'Elige el significado',
  'task.choice.line': 'Elige qué significa esta frase',
  'task.choice.pattern': 'Elige qué hace esta estructura',

  'videos.verdict.comfortable': 'cómodo',
  'videos.verdict.stretch': 'algo justo',
  'videos.verdict.hard': 'difícil',
  'videos.coverage':
    '{percent}% de lo que se dice — {verdict}. Conoces {known} de las {total} palabras distintas que hay aquí.',
  'videos.emptyTitle': 'Todavía no hay vídeos.',
  'videos.emptyBody': 'Mira un vídeo de Bilibili con pista de subtítulos y aparecerá aquí.',
  'videos.lines': { one: '{count} frase', other: '{count} frases' },
  'videos.unknown': 'Ese vídeo no está en tu historial.',
  'videos.back': '← Vídeos',
  'videos.openOnBilibili': 'Abrir en Bilibili',
  'videos.speak': 'Leer en voz alta',
  'videos.known': 'conocida',
  'videos.showMore': 'Ver más (quedan {count})',
  'videos.times': '{count}×',

  'log.title': 'Registro del modelo',
  'log.blurb':
    'Cada petición enviada al modelo local y todo lo que volvió o salió mal. Las más recientes primero, con un tope de 500. También se refleja en la consola del navegador.',
  'log.level.all': 'Todo',
  'log.level.warn': 'Avisos y errores',
  'log.level.error': 'Solo errores',
  'log.kind.all': 'Toda la actividad',
  'log.kind.chat': 'Chat',
  'log.kind.explain': 'Explicaciones',
  'log.kind.translate': 'Traducción',
  'log.kind.models': 'Lista de modelos',
  'log.kind.connect': 'Conexión',
  'log.refresh': 'Actualizar',
  'log.copy': 'Copiar',
  'log.clear': 'Borrar',
  'log.reading': 'Leyendo…',
  'log.noMatches': 'Nada coincide con esos filtros.',
  'log.empty':
    'Todavía no hay nada registrado. Cualquier cosa que se le pida al modelo aparecerá aquí.',
  'log.request': 'petición {id}',
  'log.duration': '{ms} ms',

  'chat.when.today': 'hoy',
  'chat.when.yesterday': 'ayer',
  'chat.when.daysAgo': { one: 'hace {count} día', other: 'hace {count} días' },
  'chat.new': 'Chat nuevo',
  'chat.deleteConfirm': '¿Eliminar esta conversación?',
  'chat.empty': 'Todavía nada. Empieza una aquí, o pulsa Explicar en una tarjeta mientras repasas.',
  'chat.fromCard': 'desde una tarjeta',
  'chat.pick': 'Elige una conversación, o empieza una nueva.',
  'chat.pickHint':
    'Las explicaciones abiertas desde una tarjeta mientras repasas también acaban aquí.',
  'chat.none': 'No hay ninguna conversación seleccionada.',
  'chat.stop': 'Parar',
  'chat.thinking': 'Pensando…',
  'chat.placeholder': 'Pregunta sobre esta frase, o sobre cualquier otra cosa…',
  'chat.send': 'Enviar',
  'chat.context': {
    one: 'Contexto enviado — {count} frase',
    other: 'Contexto enviado — {count} frases',
  },
  'chat.contextFrom': 'de «{title}»',
  'chat.openFullWidth': 'Abrir a pantalla completa',

  'dict.filter.all': 'Todas',
  'dict.filter.learning': 'En aprendizaje',
  'dict.filter.known': 'Conocidas',
  'dict.filter.sentences': 'Frases',
  'dict.noPack': 'No hay paquete de idioma para «{lang}».',
  'dict.thisLanguage': 'este idioma',
  'dict.search': 'Buscar entre las palabras que has recogido…',
  'dict.notCollected': 'Todavía sin recoger.',
  'dict.nothingHere': 'Todavía no hay nada aquí.',
  'dict.lookSomethingUp': 'Consulta una palabra y aparecerá.',
  'dict.dictionaryHasThese':
    'Ninguna de tus palabras coincide con eso, pero el diccionario tiene estas.',
  'dict.noMatch': 'Ninguna palabra recogida coincide con eso.',
  'dict.pool': 'en espera',
  'dict.speak': 'Leer en voz alta',
  'dict.timesSeen': 'Veces vista',
  'dict.times': '{count}×',
  'dict.markKnown': 'Ya me sé esta',
  'dict.unmarkKnown': 'Dejar de tratarla como conocida',
  'dict.isKnown': 'Conocida',
  'dict.iKnowThis': 'Me la sé',
  'dict.notInDeck': 'Todavía no está en tu mazo',
  'dict.addToDeck': 'Añadir al mazo',
  'dict.add': 'Añadir',
  'dict.addedNote':
    'Las palabras añadidas se pueden estudiar de inmediato: entran exactamente donde entraría una palabra sobre la que hubieras pasado el ratón.',
  'dict.showMore': 'Ver más (quedan {count})',

  'wizard.title': 'Configura tus diccionarios',
  'wizard.whatStudying': '¿Qué estudias?',
  'wizard.pickHint':
    'Elegir un idioma solo lo recuerda: no se descarga nada hasta el paso siguiente.',
  'wizard.required': 'Necesario',
  'wizard.installedOn': 'Instalado el {date}',
  'wizard.downloading': 'Descargando',
  'wizard.importing': 'Importando',
  'wizard.downloadingBusy': 'Descargando…',
  'wizard.importingBusy': 'Importando…',
  'wizard.redownload': 'Volver a descargar',
  'wizard.install': 'Instalar',
  'wizard.checking': 'Comprobando…',
  'wizard.checkForUpdate': 'Buscar actualización',
  'wizard.updateAvailable': 'Hay una versión más reciente: instálala arriba para conseguirla.',
  'wizard.noChange': 'Descargado de nuevo: sin cambios respecto a lo instalado.',
  'wizard.installFailed':
    'No se ha podido descargar el diccionario. Comprueba tu conexión e inténtalo de nuevo.',
  'wizard.listFailed':
    'No se ha podido descargar la lista de palabras. Comprueba tu conexión e inténtalo de nuevo.',
  'wizard.optional':
    'Opcional: un LLM local para el chat y la traducción, reconocimiento de voz para los vídeos sin subtítulos, yt-dlp para el audio de YouTube, el traductor integrado de Chrome, una voz china de síntesis y el permiso del lector por sitio. Todo eso se configura desde Ajustes una vez instalado el diccionario de arriba: nada de ello hace falta para empezar.',
  'wizard.done': 'Hecho',

  'wordlist.error.empty': 'Ese archivo está vacío.',
  'wordlist.error.binary':
    'Eso parece un zip o una hoja de cálculo. Descomprímelo primero, o ábrelo y guárdalo como CSV.',
  'wordlist.error.noChinese':
    'No se ha encontrado chino. Comprueba que sea el archivo correcto — y si viene de un conjunto de datos antiguo, puede que no esté guardado en UTF-8, lo que llegaría aquí como texto ilegible.',
  'wordlist.error.noLevels':
    'Se han encontrado las palabras, pero no una columna de nivel HSK (un número del 1 al 9).',

  'data.rail.backup': 'Copias de seguridad',
  'data.rail.wordLists': 'Listas de palabras',
  'data.rail.storage': 'Almacenamiento',
  'data.rail.diagnostics': 'Diagnóstico',

  'data.snapshots.title': 'Instantáneas del mazo',
  'data.snapshots.blurb':
    'Se toman automáticamente justo antes de que una actualización de la base de datos reescriba el mazo. Descarga una y pásala al botón Importar de abajo si una actualización perdió algo.',
  'data.snapshots.row': 'Antes del esquema {version}, tomada el {date}',
  'data.snapshots.download': 'Descargar',

  'data.lists.title': 'Listas de palabras',
  'data.lists.blurb':
    'Opcionales. No se incluye ninguna con la extensión, pero las de abajo se descargan cuando las pidas.',
  'data.lists.noDictionary':
    'Todavía no hay ningún diccionario instalado, así que no hay idioma al que asignar una lista.',
  'data.lists.frequency': 'Lista de frecuencia',
  'data.lists.levels': 'Niveles {standard}',
  'data.lists.frequencyBlurb':
    'Ordena qué palabras nuevas encuentras primero, y le da un denominador al progreso.',
  'data.lists.levelsBlurb':
    'Agrupa el diccionario por nivel {standard} y añade las barras de progreso del Resumen.',
  'data.lists.loaded': '{name} — {count} palabras, añadida el {date}',
  'data.lists.install': 'Instalar {name}',
  'data.lists.downloading': 'Descargando',
  'data.lists.nothingToDownload':
    'Todavía no hay nada que descargar para {language}: sube tu propio archivo abajo.',
  'data.lists.delete': 'Eliminar',
  'data.lists.downloadFailed':
    'No se ha podido descargar la lista. Comprueba tu conexión e inténtalo de nuevo.',
  'data.lists.checkFirst': 'Revisa esto antes de importar',
  'data.lists.previewSummary': '{file} — {shape} — {count} palabras',
  'data.lists.previewFrequency':
    'Esas deberían estar entre las palabras más comunes de {language}. Si no lo están, el archivo no está ordenado por frecuencia.',
  'data.lists.previewLevels': 'Los niveles se leen del archivo tal cual.',
  'data.lists.theLanguageYouStudy': 'el idioma que estudias',
  'data.lists.import': 'Importar',
  'data.lists.cancel': 'Cancelar',
  'data.shape.json': 'JSON',
  'data.shape.tab': 'separado por tabuladores',
  'data.shape.comma': 'separado por comas',
  'data.shape.lines': 'una palabra por línea',
  'data.shape.headerSkipped': 'encabezado omitido',
  'data.shape.wordColumn': 'palabras en la columna {n}',

  'data.cache.title': 'Traducciones del modelo',
  'data.cache.confirm': '¿Eliminar todas las traducciones que ha producido el modelo local?',
  'data.cache.loaded': {
    one: '{lines} frases en {videos} vídeo. Se guardan para que la segunda visualización sea instantánea en vez de costar otra vez la misma media hora.',
    other:
      '{lines} frases en {videos} vídeos. Se guardan para que la segunda visualización sea instantánea en vez de costar otra vez la misma media hora.',
  },
  'data.cache.empty':
    'Todavía no hay nada en caché. Las frases de subtítulos que traduce el modelo local se guardan aquí, así que volver a verlas no cuesta nada.',

  'data.transcripts.title': 'Transcripciones',
  'data.transcripts.confirm':
    '¿Eliminar todas las transcripciones? Los vídeos sin pista de subtítulos propia tendrán que transcribirse de nuevo antes de mostrar ninguna frase.',
  'data.transcripts.loaded': {
    one: '{lines} frases en {videos} vídeo. Se guardan para escuchar un episodio una sola vez, y no una vez por visionado.',
    other:
      '{lines} frases en {videos} vídeos. Se guardan para escuchar un episodio una sola vez, y no una vez por visionado.',
  },
  'data.transcripts.empty':
    'Todavía no se ha transcrito nada. Las frases que el modelo de voz oye en vídeos sin pista de subtítulos se guardan aquí, así que volver a ver uno no cuesta nada.',
  'data.clear': 'Borrar',

  'data.export.title': 'Exportar',
  'data.export.blurb':
    'Un único archivo JSON con todas las tarjetas, el registro completo de repasos, los recuentos de exposición y el historial de vídeos. Las muestras de tiempo de lectura y las listas de palabras quedan fuera: lo primero es calibración de esta máquina, lo segundo se carga por navegador.',
  'data.export.download': 'Descargar',
  'data.import.title': 'Importar',
  'data.import.blurb':
    'Se fusiona, no se reemplaza. Los registros de repaso de ambos lados se combinan y el calendario se recalcula a partir de ellos, así que lo que estudiaste en otro navegador sigue contando. Los recuentos se suman y los vídeos se fusionan por identificador.',
  'data.import.badJson': 'Ese archivo no es JSON válido.',
  'data.import.notABackup': 'Eso no parece una exportación de bb-subsgen.',
  'data.import.merged': 'Fusionado. {cards} tarjetas y {reviews} repasos en total.',
  'data.import.failed': 'La importación ha fallado: no se ha cambiado nada.',
  'data.conflicts.title': {
    one: '{count} palabra no coincide',
    other: '{count} palabras no coinciden',
  },
  'data.conflicts.blurb':
    'Están marcadas como conocidas en un lado y no en el otro. Todo lo demás se fusiona solo: únicamente una declaración no tiene pruebas que la resuelvan.',
  'data.conflicts.more': '… +{count}',
  'data.conflicts.keepMine': 'Quedarme con lo mío ({count} siguen conocidas)',
  'data.conflicts.useFile': 'Usar el archivo ({count} pasan a conocidas)',

  'data.clearAll.title': 'Borrarlo todo',
  'data.clearAll.blurb':
    'Elimina todas las tarjetas, repasos y recuentos. Las listas de palabras se conservan. Exporta primero: no hay vuelta atrás.',
  'data.clearAll.confirm':
    '¿Eliminar todas las tarjetas, repasos y recuentos? Esto no se puede deshacer.',
  'data.clearAll.done': 'Todo borrado.',

  'progress.translating': 'Traduciendo con {model}',
  'progress.lines': '{done} / {total} frases',
  'progress.transcribing': 'Transcribiendo con {model}',
  'progress.chunks': '{done} / {total} fragmentos',
  'progress.starting': 'empezando…',
  'progress.stopped': 'Transcripción detenida',
  'progress.missing': {
    one: 'falta {count} tramo',
    other: 'faltan {count} tramos',
  },
  'progress.nothingTranscribed': 'no se ha transcrito nada',

  'popup.status.loading': 'Cargando los subtítulos…',
  'popup.status.noTrack': 'Este vídeo no tiene pista de subtítulos.',
  'popup.status.active': 'Activo en este vídeo.',
  'popup.status.noVideo': 'Abre un vídeo de Bilibili o de YouTube para tener subtítulos.',
  'popup.status.noDictionary': 'No hay ningún diccionario instalado para este idioma.',
  'popup.coverage': 'Conoces el {percent} de lo que se dice aquí — {types}.',
  'popup.coveragePercent': '{percent} %',
  'popup.coverageTypes': '{known} de {total} palabras',
  'popup.verdict.comfortable': 'Cómodo.',
  'popup.verdict.stretch': 'Algo justo.',
  'popup.verdict.hard': 'Difícil.',
  'popup.retrying': 'Reintentando…',
  'popup.retry': 'Reintentar las partes que faltan',
  'popup.needsDictionary': 'Un idioma que estudias todavía no tiene diccionario instalado.',
  'popup.noLanguage': 'Todavía no has configurado ningún idioma para estudiar.',
  'popup.goToSetup': 'Ir a la configuración',
  'popup.openApp': 'Abrir las tarjetas',
  'popup.readerOn': 'Lector en {host}',
  'popup.readerUnavailable': 'El lector no puede funcionar en esta página.',

  'explain.chatTitle': 'Explicar 「{word}」',
  'explain.chatTitleLine': 'Explicar una frase',
  'explain.question': '¿Qué dice esta frase, y qué está pasando gramaticalmente?',
  'explain.questionAbout': '¿Por qué se usa 「{word}」 en esta frase, y qué dice la frase?',
  'chat.noModel':
    'Configura primero un servidor de modelos y un modelo de chat en la ventana emergente de la extensión.',
}
