// Português. Draft, not reviewed by a native speaker — see the PR body.

import type { Messages } from './keys'

export const pt: Messages = {
  'app.title': 'Cartões',
  'app.subtitle': 'Tudo o que o bb-subsgen recolheu enquanto você lia.',
  'app.tab.overview': 'Visão geral',
  'app.tab.review': 'Revisão',
  'app.tab.chat': 'Conversa',
  'app.tab.dictionary': 'Dicionário',
  'app.tab.videos': 'Vídeos',
  'app.tab.data': 'Dados',
  'app.tab.settings': 'Definições',

  'filter.studying': 'A estudar',
  'filter.all': 'Todos os idiomas',
  'filter.notInstalled': '{language} \u2014 não instalado',

  'controls.notSet': 'Não definido',
  'controls.sections': 'Secções',

  'settings.enabled': 'Ativado',
  'settings.server': 'Servidor',
  'settings.connect': 'Ligar',
  'settings.connecting': 'A ligar…',
  'settings.connected': 'Ligado.',
  'settings.connectedModels': {
    one: 'Ligado — {count} modelo.',
    other: 'Ligado — {count} modelos.',
  },

  'settings.studying.title': 'Estudo',
  'settings.studying.quizMode': 'Modo teste (Alt+Q)',
  'settings.studying.wholeLines': 'Estudar frases inteiras',
  'settings.studying.newLines': 'Frases novas por dia',
  'settings.studying.hint':
    'O modo teste esconde as leituras e as traduções até você passar o rato por cima. Cada palavra que recolhe fica estudável de imediato.',
  'settings.studying.hintLinesOn':
    'As frases inteiras entram algumas por dia, das mais fáceis para as mais difíceis.',
  'settings.studying.hintLinesOff':
    'As frases continuam a ser recolhidas enquanto lê — ative isto quando as quiser estudar.',
  'settings.studying.voice': 'Voz dos cartões',
  'settings.studying.voiceAuto': 'Automática (a melhor disponível)',
  'settings.studying.voiceNetworked': '{name} — em rede',
  'settings.studying.noVoice':
    'Não há nenhuma voz do idioma que estudas instalada neste computador, por isso os cartões não podem ser lidos em voz alta.',
  'settings.studying.voiceSpeed': 'Velocidade da voz',
  'settings.studying.testVoice': 'Testar a voz',
  'settings.studying.testVoiceIn': 'Testar a voz em {language}',
  'settings.studying.voiceHint':
    'As vozes em rede soam melhor, mas são sintetizadas pela Google, por isso o texto do cartão sai do seu computador e elas emudecem sem ligação — nessa altura entra uma voz local.',

  'settings.language.title': 'Idioma',
  'settings.language.translateTo': 'Traduzir para',
  'settings.language.noOnDevice':
    'O Chrome não tem tradutor no dispositivo para este par, por isso as frases são traduzidas pelo seu modelo local. É mais lento, e nada é traduzido enquanto o modelo estiver desligado.',
  'settings.language.toneColors': 'Cores dos tons',
  'settings.language.traditional': 'Mostrar tradicionais nas definições',

  comingSoon: 'Em breve',
  'comingSoon.summary': 'Ainda em construção para {language}: {missing}.',
  'gap.patterns.row': 'Padrões gramaticais ({language})',
  'gap.patterns.title':
    'Ainda não há tabela de gramática para {language}, por isso os cartões ao passar o rato e a revisão explicam as palavras mas não as estruturas à volta.',
  'gap.patterns.noun': 'os padrões gramaticais',
  'gap.onDevice.row': 'Tradução no dispositivo ({language})',
  'gap.onDevice.title':
    'O tradutor integrado do Chrome só está ligado para chinês, por isso as linhas em {language} são traduzidas pelo teu modelo local.',
  'gap.onDevice.noun': 'a tradução no dispositivo',

  'settings.llm.title': 'Modelo local',
  'settings.llm.noModels': 'Ligado, mas o servidor não tem nenhum modelo carregado.',
  'settings.llm.needsPermission':
    'O Chrome precisa de permissão para aceder a esse endereço antes de o modelo poder ser usado.',
  'settings.llm.chatModel': 'Modelo de conversa',
  'settings.llm.translateSubtitles': 'Traduzir as legendas',
  'settings.llm.translationModel': 'Modelo de tradução',
  'settings.llm.verboseLog': 'Registo detalhado',
  'settings.llm.hint':
    'As explicações e a conversa usam o modelo de conversa, e só quando você as pede. A tradução das legendas corre em segundo plano no modelo de tradução e rende o tradutor do Chrome assim que ganhar avanço suficiente — escolha algo rápido. O registo de depuração está no separador Dados.',

  'settings.asr.title': 'Voz para texto',
  'settings.asr.needsPermission':
    'O Chrome precisa de permissão para aceder a esse endereço antes de ele poder ser usado.',
  'settings.asr.helperAnswered': 'O auxiliar respondeu {status}.',
  'settings.asr.unreachable': 'Não foi possível contactá-lo: {error}',
  'settings.asr.noModelList':
    'Alcançável. Este servidor não lista modelos — escreva o nome com que foi iniciado.',
  'settings.asr.enable': 'Transcrever vídeos sem legendas',
  'settings.asr.model': 'Modelo',
  'settings.asr.hint':
    'A maior parte do bangumi sai sem legendas, e isto transcreve o áudio para que esses episódios continuem legíveis. Corre uma vez por episódio e o resultado fica em cache, por isso rever não custa nada. Inicie um servidor com {script} no repositório da extensão — é um programa à parte do modelo de conversa acima.',
  'settings.asr.helper': 'Auxiliar de áudio do YouTube',
  'settings.asr.helperHint':
    'Só é preciso para o YouTube. Serve o áudio de um vídeo à extensão, porque o YouTube já não publica um endereço de onde o navegador o possa ir buscar. Execute-o com {ytdlp} no repositório da extensão, ou com {services} para o arrancar junto com o servidor de voz acima. Precisa de {ytdlpBin} e {ffmpeg} instalados.',

  'settings.reader.holdKey': 'Tecla a manter premida',
  'settings.reader.translateSentence': 'Traduzir a frase',

  'settings.subtitles.showPinyin': 'Mostrar pinyin',
  'settings.subtitles.fontSize': 'Tamanho da letra',
  'settings.subtitles.wordSpacing': 'Espaço entre palavras',
  'settings.subtitles.backdrop': 'Opacidade do fundo',
  'settings.subtitles.height': 'Altura',
  'settings.subtitles.lift': 'Levantar acima dos controlos do leitor',
  'settings.subtitles.translation': 'Tradução',
  'settings.subtitles.translationSize': 'Tamanho da tradução',
  'settings.subtitles.translationLayout': 'Disposição da tradução',
  'settings.subtitles.layoutInline': 'No mesmo cartão',
  'settings.subtitles.layoutCard': 'Num cartão à parte',

  'common.loading': 'A carregar…',

  'settings.rail.general': 'Geral',
  'settings.rail.models': 'Modelos locais',
  'settings.pageReader.title': 'Leitor de páginas',
  'settings.pageReader.hint':
    'Mantenha {key} e aponte para uma palavra; clique nela para ver os caracteres. Selecione texto chinês para criar um cartão de frase.',
  'settings.sites.remove': 'Remover',
  'settings.sites.add': 'Adicionar site',
  'settings.sites.badAddress': 'Isso não parece o endereço de um site. Experimente zhihu.com.',
  'settings.sites.already': '{host} já está ativado.',
  'settings.sites.needsPermission':
    'O Chrome precisa de permissão para aceder a esse site antes de o leitor poder funcionar lá.',
  'settings.sites.hint':
    'O Chrome pergunta antes de cada site ser adicionado, e desativá-lo devolve esse acesso de imediato. O Bilibili já está incluído.',
  'settings.subtitles.title': 'Legendas',
  'settings.subtitles.hint':
    'Atalhos: Alt+P alterna o pinyin, Alt+S percorre os tamanhos de letra — para ecrã inteiro.',
  'settings.session.title': 'Sessão',
  'settings.session.note':
    'Como é interrogado, o que entra e quanto tempo dura uma sessão definem-se onde você a começa — leem-se melhor ao lado dos números que alteram.',
  'settings.session.open': 'Abrir a revisão',
  'settings.dicts.title': 'Dicionários',
  'settings.dicts.manage': 'Gerir dicionários',
  'settings.dicts.hint':
    'Adicione um idioma que estude, ou verifique se há atualização de um já instalado.',

  'overview.nothingToShow': 'Ainda não há nada para mostrar.',
  'overview.emptyTitle': 'Ainda não recolheu nada.',
  'overview.emptyBody':
    'Veja um vídeo do Bilibili com legendas, ou mantenha a tecla do leitor numa página que tenha ativado, e as palavras que consultar vão aparecer aqui.',
  'overview.stat.words': 'palavras recolhidas',
  'overview.stat.known': 'palavras conhecidas',
  'overview.stat.sentences': 'frases',
  'overview.stat.grammar': 'estruturas',
  'overview.stat.pool': 'à espera',
  'overview.discovered': 'Descobertas',
  'overview.discoveredOf': '{found} das {total} palavras mais frequentes',
  'overview.hsk': 'HSK',
  'overview.hskLevel': 'HSK {level}',
  'overview.noWordList':
    'Não há nenhuma lista de palavras carregada, por isso os cartões novos entram pela ordem em que os encontrou e não há denominador com que medir o progresso. Carregue uma a partir de {data} — aí explica-se onde arranjar uma.',

  'mastery.known': 'Conhecida — marcou-a você mesmo',
  'mastery.mastered': 'Dominada — {level} de {max}',
  'mastery.learning': '{level} de {max} · ainda a aprender',
  'mastery.next': {
    one: '{level} de {max} · volta daqui a {count} dia',
    other: '{level} de {max} · volta daqui a {count} dias',
  },

  'review.noPack': 'Não há pacote de idioma para «{lang}».',
  'review.streak': { one: '{count} dia seguido', other: '{count} dias seguidos' },
  'review.stat.due': 'a rever',
  'review.stat.newWords': 'palavras por começar',
  'review.stat.newLines': 'frases novas hoje',
  'review.stat.pooled': 'frases à espera',
  'review.change': 'Alterar',
  'review.done': 'Concluído',
  'review.start': 'Começar a estudar',
  'review.cards': { one: '{count} cartão', other: '{count} cartões' },
  'review.breakdown': '{scheduled} agendados, {drilled} de prática',
  'review.waiting': '{count} à espera',
  'review.shortfall.words': 'são todas as palavras prontas — ative também as frases para ter mais',
  'review.shortfall.sentences':
    'são todas as frases prontas — ative também as palavras para ter mais',
  'review.shortfall.all': 'é tudo o que está pronto',
  'review.emptyTitle': 'Ainda não há nada para estudar.',
  'review.emptyPooled': {
    one: '{count} frase espera a sua vez — entram algumas por dia, das mais fáceis para as mais difíceis.',
    other:
      '{count} frases esperam a sua vez — entram algumas por dia, das mais fáceis para as mais difíceis.',
  },
  'review.emptyBody': 'Vá ler alguma coisa; tudo o que consultar aparece aqui.',

  'embed.title': 'Explicar',
  'embed.openInApp': 'Abrir nos cartões',
  'embed.close': 'Fechar',
  'embed.noLine': 'Não havia nenhuma frase para explicar.',
  'embed.failed':
    'Não foi possível iniciar essa conversa. O registo do modelo, em Dados, tem os pormenores.',
  'embed.reading': 'A ler a cena…',

  'wordlist.help.summary': 'Usar o seu próprio ficheiro',
  'wordlist.help.privacy':
    'Nada aqui é enviado para lado nenhum. O ficheiro é lido no seu navegador e fica lá.',
  'wordlist.help.acceptsTitle': 'O que o carregador aceita',
  'wordlist.help.accepts':
    'Uma palavra por linha, ou qualquer ficheiro separado por tabulações ou vírgulas com uma coluna no idioma que estuda, ou um array JSON. Uma linha de cabeçalho é detetada e ignorada, e a coluna das palavras é encontrada onde quer que esteja.',
  'wordlist.help.frequency':
    'Uma lista de frequência é ordenada por {order}, as mais comuns primeiro. Qualquer número no ficheiro é ignorado, porque o mesmo número significa o contrário em listas diferentes: uma posição sobe à medida que as palavras se tornam raras, uma contagem bruta desce. Por isso verifique a pré-visualização antes de importar: para chinês deve começar por 的, 一, 是. Se começar por 爱, 爱好, 八, o ficheiro está por ordem alfabética e tem de ser ordenado por frequência primeiro.',
  'wordlist.help.frequencyOrder': 'a ordem por que as palavras aparecem no ficheiro',
  'wordlist.help.levels':
    'Uma lista de níveis precisa de uma coluna de níveis de 1 a 9 ao lado das palavras. São lidos tal como estão, sem renumeração.',

  'setup.howAsked': 'Como é interrogado',
  'setup.whatIncluded': 'O que entra',
  'setup.length': 'Duração da sessão',
  'setup.lengthAria': 'Cartões por sessão',
  'setup.lengthNote':
    'Contam-se cartões distintos. Um que erre volta antes de a sessão acabar, sem a alongar.',
  'setup.mode.mixed': 'Misto',
  'setup.mode.mixedHint': 'Um ângulo diferente em cada sessão',
  'setup.mode.remember': 'Recordar',
  'setup.mode.rememberHint': 'Lembre-se e depois diga como correu',
  'setup.mode.type': 'Escrever',
  'setup.mode.typeHint': 'Construa a partir do significado',
  'setup.mode.audio': 'Ouvir',
  'setup.mode.audioHint': 'Construa a partir do som',
  'setup.mode.noVoiceTitle': 'Não há nenhuma voz deste idioma instalada neste computador',
  'setup.mode.noVoiceHint': 'Sem voz instalada',
  'setup.include.both': 'Tudo',
  'setup.include.words': 'Só palavras',
  'setup.include.sentences': 'Só frases',
  'setup.include.grammar': 'Só gramática',
  'setup.summary': '{mode} · {include} · {count} cartões',
  'setup.summary.both': 'palavras + frases + gramática',
  'setup.summary.words': 'só palavras',
  'setup.summary.sentences': 'só frases',
  'setup.summary.grammar': 'só gramática',

  'bank.placeholder': 'Toque nas palavras por ordem',
  'bank.remove': 'Remover {word}',

  'session.complete': 'Sessão concluída',
  'session.summary.total': '{n} cartões',
  'session.summary.right': '{n} certos à primeira',
  'session.summary.best': '{n} melhor sequência',
  'session.end': 'Terminar a sessão',
  'session.combo': '{count} seguidos',
  'session.score': '{right} / {total}',
  'session.playAgain': 'Repetir',
  'session.listen': 'Ouvir',
  'session.noDefinitionShort': '(sem definição)',
  'session.noDefinition': 'Nenhuma definição encontrada',
  'session.typeLine': 'Escreva a frase…',
  'session.typeChars': 'Escreva os caracteres…',
  'session.useBank': 'Voltar às palavras',
  'session.typeInstead': 'Escrever à mão',
  'session.correct': 'Certo',
  'session.notQuite': 'Quase',
  'session.notQuiteWith': 'Quase — você pôs {attempt}',
  'session.structure': 'Estrutura',
  'session.watchAgain': 'Ver outra vez a partir de {time}',
  'session.translationsHidden': '— as traduções ficam escondidas',
  'session.asrWarning': 'Transcrito do áudio — esta frase pode ter sido mal ouvida.',
  'session.explain': 'Explicar esta frase',
  'session.showAnswer': 'Ver a resposta',
  'session.check': 'Verificar',
  'session.didntKnow': 'Não sabia',
  'session.knewIt': 'Sabia',
  'session.continue': 'Continuar',
  'session.cardsSettled': 'Cartões resolvidos',
  'session.mastered': 'Dominada',
  'session.backSoon': 'Volta daqui a uns minutos',
  'session.backIn': {
    one: 'Volta daqui a {count} dia',
    other: 'Volta daqui a {count} dias',
  },
  'session.stillDueIn': {
    one: 'Continua pendente daqui a {count} dia',
    other: 'Continua pendente daqui a {count} dias',
  },
  'session.practice': 'Prática · {when}',
  'task.pattern.tiles': 'Construa esta frase com a estrutura',
  'task.pattern.reveal': 'O que faz esta estrutura?',
  'task.audio.word': 'Escreva o que ouve',
  'task.audio.line': 'Construa o que ouve',
  'task.gloss': 'Escreva os caracteres',
  'task.translation': 'Construa esta frase em chinês',
  'task.cloze': 'Que palavra falta?',
  'task.meaning.word': 'O que quer isto dizer?',
  'task.meaning.line': 'O que quer dizer esta frase?',

  'videos.verdict.comfortable': 'confortável',
  'videos.verdict.stretch': 'no limite',
  'videos.verdict.hard': 'difícil',
  'videos.coverage':
    '{percent}% do que é dito — {verdict}. Conhece {known} das {total} palavras distintas que há aqui.',
  'videos.emptyTitle': 'Ainda não há vídeos.',
  'videos.emptyBody': 'Veja um vídeo do Bilibili com faixa de legendas e ele aparece aqui.',
  'videos.lines': { one: '{count} frase', other: '{count} frases' },
  'videos.unknown': 'Esse vídeo não está no seu histórico.',
  'videos.back': '← Vídeos',
  'videos.openOnBilibili': 'Abrir no Bilibili',
  'videos.speak': 'Ler em voz alta',
  'videos.known': 'conhecida',
  'videos.showMore': 'Ver mais (faltam {count})',
  'videos.times': '{count}×',

  'log.title': 'Registo do modelo',
  'log.blurb':
    'Cada pedido enviado ao modelo local e tudo o que voltou ou correu mal. Os mais recentes primeiro, limitado aos últimos 500. Também espelhado na consola do navegador.',
  'log.level.all': 'Tudo',
  'log.level.warn': 'Avisos e erros',
  'log.level.error': 'Só erros',
  'log.kind.all': 'Toda a atividade',
  'log.kind.chat': 'Conversa',
  'log.kind.explain': 'Explicações',
  'log.kind.translate': 'Tradução',
  'log.kind.models': 'Lista de modelos',
  'log.kind.connect': 'Ligação',
  'log.refresh': 'Atualizar',
  'log.copy': 'Copiar',
  'log.clear': 'Limpar',
  'log.reading': 'A ler…',
  'log.noMatches': 'Nada corresponde a esses filtros.',
  'log.empty': 'Ainda não há nada registado. Tudo o que for pedido ao modelo aparece aqui.',
  'log.request': 'pedido {id}',
  'log.duration': '{ms} ms',

  'chat.when.today': 'hoje',
  'chat.when.yesterday': 'ontem',
  'chat.when.daysAgo': { one: 'há {count} dia', other: 'há {count} dias' },
  'chat.new': 'Nova conversa',
  'chat.deleteConfirm': 'Eliminar esta conversa?',
  'chat.empty':
    'Ainda nada. Comece uma aqui, ou carregue em Explicar num cartão durante a revisão.',
  'chat.fromCard': 'a partir de um cartão',
  'chat.pick': 'Escolha uma conversa, ou comece uma nova.',
  'chat.pickHint':
    'As explicações abertas a partir de um cartão durante a revisão também vão parar aqui.',
  'chat.none': 'Nenhuma conversa selecionada.',
  'chat.stop': 'Parar',
  'chat.thinking': 'A pensar…',
  'chat.placeholder': 'Pergunte sobre esta frase, ou sobre qualquer outra coisa…',
  'chat.send': 'Enviar',
  'chat.context': {
    one: 'Contexto enviado — {count} frase',
    other: 'Contexto enviado — {count} frases',
  },
  'chat.contextFrom': 'de «{title}»',
  'chat.openFullWidth': 'Abrir em largura total',

  'dict.filter.all': 'Todas',
  'dict.filter.learning': 'Ainda a aprender',
  'dict.filter.known': 'Conhecidas',
  'dict.filter.sentences': 'Frases',
  'dict.noPack': 'Não há pacote de idioma para «{lang}».',
  'dict.thisLanguage': 'este idioma',
  'dict.search': 'Procurar nas palavras que recolheu…',
  'dict.notCollected': 'Ainda não recolhida.',
  'dict.nothingHere': 'Ainda não há nada aqui.',
  'dict.lookSomethingUp': 'Consulte uma palavra e ela aparece.',
  'dict.dictionaryHasThese':
    'Nenhuma das suas palavras corresponde a isso, mas o dicionário tem estas.',
  'dict.noMatch': 'Nenhuma palavra recolhida corresponde a isso.',
  'dict.pool': 'à espera',
  'dict.speak': 'Ler em voz alta',
  'dict.timesSeen': 'Vezes que apareceu',
  'dict.times': '{count}×',
  'dict.markKnown': 'Já sei esta',
  'dict.unmarkKnown': 'Deixar de a tratar como conhecida',
  'dict.isKnown': 'Conhecida',
  'dict.iKnowThis': 'Sei esta',
  'dict.notInDeck': 'Ainda não está no seu baralho',
  'dict.addToDeck': 'Adicionar ao baralho',
  'dict.add': 'Adicionar',
  'dict.addedNote':
    'As palavras adicionadas ficam estudáveis de imediato — entram exatamente onde entraria uma palavra sobre a qual tivesse passado o rato.',
  'dict.showMore': 'Ver mais (faltam {count})',

  'wizard.title': 'Configure os seus dicionários',
  'wizard.whatStudying': 'O que está a estudar?',
  'wizard.pickHint':
    'Escolher um idioma apenas o memoriza — nada é transferido até ao passo seguinte.',
  'wizard.required': 'Necessário',
  'wizard.installedOn': 'Instalado a {date}',
  'wizard.downloading': 'A transferir',
  'wizard.importing': 'A importar',
  'wizard.downloadingBusy': 'A transferir…',
  'wizard.importingBusy': 'A importar…',
  'wizard.redownload': 'Transferir de novo',
  'wizard.install': 'Instalar',
  'wizard.checking': 'A verificar…',
  'wizard.checkForUpdate': 'Procurar atualização',
  'wizard.updateAvailable': 'Há uma versão mais recente — instale-a acima para a obter.',
  'wizard.noChange': 'Transferido de novo — sem alterações face ao que estava instalado.',
  'wizard.installFailed':
    'Não foi possível transferir o dicionário. Verifique a sua ligação e tente outra vez.',
  'wizard.optional':
    'Opcional: um LLM local para a conversa e a tradução, reconhecimento de voz para vídeos sem legendas, yt-dlp para o áudio do YouTube, o tradutor integrado do Chrome, uma voz chinesa de síntese e a permissão do leitor por site. Tudo isso se configura nas Definições depois de o dicionário acima estar instalado — nada disso é preciso para começar.',
  'wizard.done': 'Concluído',

  'wordlist.error.empty': 'Esse ficheiro está vazio.',
  'wordlist.error.binary':
    'Isso parece um zip ou uma folha de cálculo. Descompacte-o primeiro, ou abra-o e guarde-o como CSV.',
  'wordlist.error.noChinese':
    'Não foi encontrado chinês. Verifique se é o ficheiro certo — e se vier de um conjunto de dados antigo, pode não estar guardado em UTF-8, o que chegaria aqui como texto ilegível.',
  'wordlist.error.noLevels':
    'As palavras foram encontradas, mas não há coluna de nível HSK (um número de 1 a 9).',

  'data.rail.backup': 'Cópia de segurança',
  'data.rail.wordLists': 'Listas de palavras',
  'data.rail.storage': 'Armazenamento',
  'data.rail.diagnostics': 'Diagnóstico',

  'data.snapshots.title': 'Instantâneos do baralho',
  'data.snapshots.blurb':
    'São tirados automaticamente mesmo antes de uma atualização da base de dados reescrever o baralho. Transfira um e entregue-o ao botão Importar abaixo se uma atualização tiver perdido alguma coisa.',
  'data.snapshots.row': 'Antes do esquema {version}, tirado a {date}',
  'data.snapshots.download': 'Transferir',

  'data.lists.title': 'Listas de palavras',
  'data.lists.blurb':
    'Opcionais. Nenhuma vem com a extensão, mas as de baixo são transferidas a pedido.',
  'data.lists.noDictionary':
    'Ainda não há nenhum dicionário instalado, por isso não há idioma sob o qual arquivar uma lista.',
  'data.lists.frequency': 'Lista de frequência',
  'data.lists.levels': 'Níveis {standard}',
  'data.lists.frequencyBlurb':
    'Define a ordem por que encontra palavras novas, e dá um denominador ao progresso.',
  'data.lists.levelsBlurb':
    'Agrupa o dicionário por nível {standard} e acrescenta as barras de progresso da Visão geral.',
  'data.lists.loaded': '{name} — {count} palavras, adicionada a {date}',
  'data.lists.install': 'Instalar {name}',
  'data.lists.downloading': 'A transferir',
  'data.lists.nothingToDownload':
    'Ainda não há nada para transferir para {language} — carregue o seu próprio ficheiro abaixo.',
  'data.lists.delete': 'Eliminar',
  'data.lists.downloadFailed':
    'Não foi possível transferir a lista. Verifique a sua ligação e tente outra vez.',
  'data.lists.checkFirst': 'Verifique isto antes de importar',
  'data.lists.previewSummary': '{file} — {shape} — {count} palavras',
  'data.lists.previewFrequency':
    'Essas deviam estar entre as palavras mais comuns em {language}. Se não estiverem, o ficheiro não está ordenado por frequência.',
  'data.lists.previewLevels': 'Os níveis são lidos do ficheiro tal como estão.',
  'data.lists.theLanguageYouStudy': 'o idioma que estuda',
  'data.lists.import': 'Importar',
  'data.lists.cancel': 'Cancelar',
  'data.shape.json': 'JSON',
  'data.shape.tab': 'separado por tabulações',
  'data.shape.comma': 'separado por vírgulas',
  'data.shape.lines': 'uma palavra por linha',
  'data.shape.headerSkipped': 'cabeçalho ignorado',
  'data.shape.wordColumn': 'palavras na coluna {n}',

  'data.cache.title': 'Traduções do modelo',
  'data.cache.confirm': 'Eliminar todas as traduções que o modelo local produziu?',
  'data.cache.loaded': {
    one: '{lines} frases em {videos} vídeo. Guardadas para que uma segunda visualização seja instantânea em vez de custar de novo a mesma meia hora.',
    other:
      '{lines} frases em {videos} vídeos. Guardadas para que uma segunda visualização seja instantânea em vez de custar de novo a mesma meia hora.',
  },
  'data.cache.empty':
    'Ainda não há nada em cache. As linhas de legendas que o modelo local traduz ficam guardadas aqui, por isso rever não custa nada.',

  'data.transcripts.title': 'Transcrições',
  'data.transcripts.confirm':
    'Eliminar todas as transcrições? Os vídeos sem faixa de legendas própria terão de ser transcritos outra vez antes de mostrarem alguma linha.',
  'data.transcripts.loaded': {
    one: '{lines} frases em {videos} vídeo. Guardadas para que um episódio seja ouvido uma só vez, e não uma vez por visualização.',
    other:
      '{lines} frases em {videos} vídeos. Guardadas para que um episódio seja ouvido uma só vez, e não uma vez por visualização.',
  },
  'data.transcripts.empty':
    'Ainda não foi transcrito nada. As linhas que o modelo de voz ouve em vídeos sem faixa de legendas ficam guardadas aqui, por isso rever um não custa nada.',
  'data.clear': 'Limpar',

  'data.export.title': 'Exportar',
  'data.export.blurb':
    'Um único ficheiro JSON com todos os cartões, o registo completo de revisões, as contagens de exposição e o histórico de vídeos. As amostras de tempo de leitura e as listas de palavras ficam de fora: as primeiras são calibração desta máquina, as segundas carregam-se por navegador.',
  'data.export.download': 'Transferir',
  'data.import.title': 'Importar',
  'data.import.blurb':
    'É fundido, não substituído. Os registos de revisão dos dois lados são combinados e o calendário é recalculado a partir deles, por isso o que estudou noutro navegador continua a contar. As contagens somam-se e os vídeos fundem-se pelo identificador.',
  'data.import.badJson': 'Esse ficheiro não é JSON válido.',
  'data.import.notABackup': 'Isso não parece uma exportação do bb-subsgen.',
  'data.import.merged': 'Fundido. {cards} cartões e {reviews} revisões no total.',
  'data.import.failed': 'A importação falhou — não foi alterado nada.',
  'data.conflicts.title': {
    one: '{count} palavra não coincide',
    other: '{count} palavras não coincidem',
  },
  'data.conflicts.blurb':
    'Estão marcadas como conhecidas de um lado e não do outro. Todo o resto se funde sozinho — só uma declaração não tem provas que a resolvam.',
  'data.conflicts.more': '… +{count}',
  'data.conflicts.keepMine': 'Ficar com as minhas ({count} continuam conhecidas)',
  'data.conflicts.useFile': 'Usar o ficheiro ({count} passam a conhecidas)',

  'data.clearAll.title': 'Limpar tudo',
  'data.clearAll.blurb':
    'Elimina todos os cartões, revisões e contagens. As listas de palavras são mantidas. Exporte primeiro — não há como desfazer.',
  'data.clearAll.confirm':
    'Eliminar todos os cartões, revisões e contagens? Isto não pode ser desfeito.',
  'data.clearAll.done': 'Tudo limpo.',

  'progress.translating': 'A traduzir com {model}',
  'progress.lines': '{done} / {total} frases',
  'progress.transcribing': 'A transcrever com {model}',
  'progress.chunks': '{done} / {total} fragmentos',
  'progress.starting': 'a começar…',
  'progress.stopped': 'Transcrição interrompida',
  'progress.missing': {
    one: 'falta {count} troço',
    other: 'faltam {count} troços',
  },
  'progress.nothingTranscribed': 'não foi transcrito nada',

  'popup.status.loading': 'A carregar as legendas…',
  'popup.status.noTrack': 'Este vídeo não tem faixa de legendas.',
  'popup.status.active': 'Ativo neste vídeo.',
  'popup.status.noVideo': 'Abra um vídeo do Bilibili ou do YouTube para ter legendas.',
  'popup.status.noDictionary': 'Não há nenhum dicionário instalado para este idioma.',
  'popup.coverage': 'Conhece {percent} do que aqui se diz — {types}.',
  'popup.coveragePercent': '{percent}%',
  'popup.coverageTypes': '{known} de {total} palavras',
  'popup.verdict.comfortable': 'Confortável.',
  'popup.verdict.stretch': 'No limite.',
  'popup.verdict.hard': 'Difícil.',
  'popup.retrying': 'A tentar de novo…',
  'popup.retry': 'Tentar de novo as partes em falta',
  'popup.needsDictionary': 'Um idioma que estuda ainda não tem dicionário instalado.',
  'popup.noLanguage': 'Ainda não configurou nenhum idioma para estudar.',
  'popup.goToSetup': 'Ir para a configuração',
  'popup.openApp': 'Abrir os cartões',
  'popup.readerOn': 'Leitor em {host}',
  'popup.readerUnavailable': 'O leitor não pode funcionar nesta página.',

  'explain.chatTitle': 'Explicar 「{word}」',
  'explain.chatTitleLine': 'Explicar uma frase',
  'explain.question': 'O que diz esta frase, e o que se passa nela gramaticalmente?',
  'explain.questionAbout': 'Porque é que 「{word}」 é usado nesta frase, e o que diz a frase?',
  'chat.noModel':
    'Defina primeiro um servidor de modelos e um modelo de conversa na janela da extensão.',
}
