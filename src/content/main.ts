import { mount } from './mount'
import {
  renderCue,
  clearCue,
  setTranslation,
  setGeometry,
  setNotice,
  setProgress,
  translationWithheld,
  type CueView,
} from './overlay'
import { watchPlayback } from './sync'
import { attachHover } from './hover'
import { withUserActivation } from './activation'
import { runTranslationPass } from './translations'
import { watchControls, forwardHoverToPlayer, type PlayerGeometry } from './controls'
import { siteFor } from '../media/sites'
import { watchVideoChange, type Site, type Video } from '../media/site'
import { approve, isApproved, isRefused, refuseForNow } from '../media/approvals'
import { isWaiting, progressView, type ProgressState, type Span } from './progress'
import { fetchAudioBytes } from '../bilibili/audio'
import { isAudioNeeded, OFFSCREEN_TARGET, type AudioSupply } from '../offscreen/protocol'
import { sliceAudio } from '../offscreen/audio-transfer'
import { looksLikeTranscript, type Cue } from '../media/cue'
import { segment, type Token } from '../lang/segment'
import { findPatterns } from '../lang/grammar/match'
import { dropLegacyPageDefsDb } from '../lang/dict'
import { loadLexicon } from '../shared/dict-client'
import { lookupDefs } from '../shared/dict-client'
import {
  captureSentence,
  createExposureBuffer,
  recordSignal,
  watchKnownSet,
} from '../shared/flashcards-client'
import { hanWords, isCapturableText, shouldCaptureLine, unknownIn } from '../flashcards/capture'
import type { Context } from '../flashcards/types'
import {
  createTranslator,
  isTranslatorSupported,
  translatorAvailability,
  type TranslatorLike,
} from '../lang/translate'
import {
  loadSettings,
  onSettingsChanged,
  TRANSLATION_LANGS,
  type TranslationLang,
} from '../shared/settings'
import {
  isAsrCuesMessage,
  isGetStatusMessage,
  isLlmTranslationsMessage,
  type AsrCuesMessage,
  type AsrMessage,
  type LlmMessage,
  type LlmTranslationsMessage,
  type Status,
} from '../shared/messages'
import { alignCues } from '../llm/timing'
import { openExplainDrawer } from './explain-drawer'
import { bufferedAhead, BUFFER_CUES, forCard, latch, preferred, type Shown } from './tier'
import { planTranscription } from './transcribe-plan'

console.log('[bb-subsgen] content script loaded', location.href)

/** The notice button that offers to transcribe a video we cannot place. */
const ASK_ACTION = 'Transcribe'

/**
 * How long a video has to have actually been watched before a `likely` verdict
 * is acted on, in seconds of playback.
 *
 * The point is to filter out videos you clicked into and straight back out of,
 * which on YouTube is most of them. It costs nothing perceptible: the first
 * chunk takes minutes to come back either way.
 */
const LIKELY_DWELL_S = 25

/** Cues plus the video they belong to — the videoId is what every capture is filed under. */
interface LoadedVideo {
  /**
   * Empty when the video has no subtitle track at all.
   *
   * Not an error and not null: most of bangumi is exactly this, and the audio is
   * still there to be transcribed. Deciding what to do about it belongs to the
   * caller, which is the only thing that knows whether a speech server is
   * configured.
   */
  cues: Cue[]
  /** The site's own answer, kept so the audio can be asked for later. */
  video: Video
}

async function loadCuesForCurrentVideo(site: Site): Promise<LoadedVideo | null> {
  const fromUrl = site.parseVideoId(location.href)
  if (!fromUrl) return null

  const video = await site.resolve(fromUrl)
  if (!video) return null

  // Always asked for first, and always preferred: a published track is the text
  // the publisher meant, where a transcript is a machine's best guess at it.
  return { cues: await video.fetchCues(), video }
}

function labelFor(lang: TranslationLang): string {
  return TRANSLATION_LANGS.find((l) => l.code === lang)?.label ?? lang
}

/**
 * One translator per language, for the life of the page.
 *
 * Memoised because the pass is restarted every time a transcript grows — it
 * translates a snapshot, so new lines need a new run — and creating a translator
 * is the expensive half: it waits on a user gesture and, the first time, on a
 * language pack download. The promise rather than the translator is stored, so
 * two restarts arriving together share one creation instead of racing.
 *
 * Deliberately not cleared between videos. A translator is per language; the
 * video it was first wanted for has nothing to do with it.
 */
const translators = new Map<TranslationLang, Promise<TranslatorLike>>()

function translatorFor(
  lang: TranslationLang,
  onDownload: (fraction: number) => void,
): Promise<TranslatorLike> {
  const existing = translators.get(lang)
  if (existing) return existing

  // Needs a user gesture on the page; resolves on the first click or keypress.
  // No abort signal: waiting for a gesture belongs to the page, not to whichever
  // pass happened to ask first, and cancelling it on every restart would mean a
  // transcript that keeps growing keeps throwing away the wait.
  const created = withUserActivation(() => createTranslator(lang, onDownload))
  translators.set(lang, created)
  // A failure must not be remembered as the answer — the usual cause is a page
  // that has not been clicked yet, and the next attempt may well succeed.
  created.catch(() => translators.delete(lang))
  return created
}

interface TranslateTrackDeps {
  lang: TranslationLang
  texts: string[]
  currentIndex: () => number
  /** Fires only when a language pack actually has to be fetched. */
  onDownload: (fraction: number) => void
  /** The translator exists; from here on the pass is the thing to report. */
  onReady: () => void
  onResult: (index: number, translated: string) => void
  signal: AbortSignal
}

/**
 * Acquires a translator and runs the whole track through it in the background.
 *
 * Silently does nothing where the API doesn't exist (non-Chrome, Chrome < 138,
 * mobile) — an absent translated line is the correct fallback, never a broken one.
 */
async function translateTrack({
  lang,
  texts,
  currentIndex,
  onDownload,
  onReady,
  onResult,
  signal,
}: TranslateTrackDeps): Promise<void> {
  if (!isTranslatorSupported()) {
    console.log(
      '[bb-subsgen] Translator API not exposed here — skipping translation.',
      'Needs desktop Chrome 138+.',
    )
    return
  }
  if (!translators.has(lang)) {
    console.log(`[bb-subsgen] zh→${lang} availability:`, await translatorAvailability(lang))
  }

  let translator: TranslatorLike
  try {
    translator = await translatorFor(lang, onDownload)
  } catch (e) {
    if (!signal.aborted) console.warn('[bb-subsgen] could not create translator', e)
    return
  }
  if (signal.aborted) return
  onReady()

  console.log('[bb-subsgen] translating', texts.length, 'cues to', lang)
  await runTranslationPass({ texts, translator, currentIndex, onResult, signal })
}

async function main() {
  // Definitions now come from the service worker, so nothing here opens a
  // database — clear the one older versions left under bilibili.com's origin.
  dropLegacyPageDefsDb()

  // Decided once, from the host. The content script is only injected on sites
  // that have an adapter, so this is a guard against a manifest and a registry
  // that have drifted apart rather than something expected to happen.
  const site = siteFor(location.href)
  if (!site) {
    console.warn('[bb-subsgen] no adapter for', location.hostname, '— doing nothing')
    return
  }

  /**
   * The dictionary, asked for the first time a video actually needs it.
   *
   * Deferred rather than loaded up front because this content script now runs on
   * every page of a site, not only on the video pages: YouTube navigates from its
   * homepage into `/watch` without a document load, and Chrome does not re-inject
   * a content script for that — so the script has to already be there. Asking the
   * worker for 4.5MB of lexicon on a page that turns out to be a search results
   * list would be the price of that, and it is avoidable.
   *
   * Memoised on the promise so two videos in quick succession share one request.
   * Null means no dictionary is installed for `zh`.
   */
  let lexicon: Promise<Awaited<ReturnType<typeof loadLexicon>>> | null = null
  const getLexicon = () => (lexicon ??= loadLexicon('zh'))

  const initialSettings = await loadSettings()
  let settings = initialSettings
  let stopMount: (() => void) | null = null
  /**
   * Subscriptions that belong to the video rather than to the overlay.
   *
   * Held out here because a remount tears the overlay down and builds a new one,
   * and a chunk or a batch landing in that gap must not be lost.
   */
  let stopAsr: (() => void) | null = null
  let stopLlmResults: (() => void) | null = null
  let rerenderCurrentCue: (() => void) | null = null
  let startTranslation: (() => void) | null = null
  let startLlmTranslation: (() => void) | null = null
  let translationAbort: AbortController | null = null
  /**
   * Per target language, each inner map keyed by the cue's **start**.
   *
   * Not by its index in the array, which is where these all began. A transcript
   * arrives in pieces and playhead-first, so a chunk landing early in the track
   * shifts every index after it — and an index-keyed translation would then be
   * painted under a different line than the one it was written for. Start is the
   * identity `llm-cache` and `Context` already use, for the same reason.
   *
   * Keeping a map per language means switching back to one already translated
   * renders instantly instead of re-running the pass.
   */
  const translations = new Map<TranslationLang, Map<number, string>>()
  /**
   * The local model's translations, alongside Chrome's rather than instead.
   *
   * Same keying, filled by the worker as each batch lands. Which of the two a
   * line actually shows is `tier.ts`'s decision, not this map's.
   */
  const llmTranslations = new Map<TranslationLang, Map<number, string>>()
  /** Languages whose model output is now buffered far enough ahead to prefer. */
  const latched = new Set<TranslationLang>()
  let status: Status = 'loading'
  // Mirrored from the worker; drives what the overlay stops annotating and
  // which lines are still worth capturing.
  let known = new Set<string>()
  watchKnownSet((next) => {
    known = next
  })

  // Review's jump-back link carries this, so arriving at a line you are being
  // quizzed on doesn't hand you the answer. Scoped to the page load rather than
  // to the stored setting: it is this visit that is a test, not every visit.
  const quizForThisVisit = new URLSearchParams(location.search).get('bbq') === '1'
  const quizMode = () => settings.quizMode || quizForThisVisit

  const laneFor = <V>(
    lanes: Map<TranslationLang, Map<number, V>>,
    lang: TranslationLang,
  ): Map<number, V> => {
    let cache = lanes.get(lang)
    if (!cache) {
      cache = new Map()
      lanes.set(lang, cache)
    }
    return cache
  }

  const cacheFor = (lang: TranslationLang) => laneFor(translations, lang)
  const llmCacheFor = (lang: TranslationLang) => laneFor(llmTranslations, lang)

  /**
   * Fire-and-forget to the worker.
   *
   * Nothing here expects a reply — a pass takes tens of minutes, so there is
   * nothing a response could say — and a dropped message is never worth
   * surfacing on a video.
   */
  const tellWorker = (msg: LlmMessage | AsrMessage): void => {
    void chrome.runtime.sendMessage(msg).catch(() => {})
  }

  /**
   * Held open for as long as a pass is running, and for nothing else.
   *
   * Its only job is to be dropped: navigating off Bilibili destroys this
   * content script without giving it the chance to send a cancel, and the
   * worker cannot see that URL to notice for itself. The port going with the
   * page is what stops the model translating a video nobody has open.
   */
  let passPort: chrome.runtime.Port | null = null

  const holdPassPort = () => {
    if (passPort) return
    try {
      passPort = chrome.runtime.connect({ name: 'bb-subsgen:pass' })
      // The worker being gone is not worth surfacing on a video; the pass it
      // would have been watching cannot be running either.
      passPort.onDisconnect.addListener(() => {
        passPort = null
      })
    } catch {
      passPort = null
    }
  }

  const releasePassPort = () => {
    passPort?.disconnect()
    passPort = null
  }

  /**
   * The same idea for transcription, on a port of its own.
   *
   * Separate because the two runs end at different moments: switching
   * translation off releases the pass port, and a transcript in progress has no
   * reason to be cancelled by that. Sharing one port would make either
   * release end both runs.
   *
   * This one also has to hold the worker open, not merely notice the page
   * leaving. A transcription is minutes during which the worker does nothing at
   * all — the audio is fetched and decoded in the offscreen document — and a
   * worker shut down as idle loses the run's state along with it.
   */
  let asrPort: chrome.runtime.Port | null = null

  const holdAsrPort = () => {
    if (asrPort) return
    try {
      asrPort = chrome.runtime.connect({ name: 'bb-subsgen:asr' })
      asrPort.onDisconnect.addListener(() => {
        asrPort = null
      })
    } catch {
      asrPort = null
    }
  }

  const releaseAsrPort = () => {
    asrPort?.disconnect()
    asrPort = null
  }

  /**
   * Ends the on-device pass only.
   *
   * Its own function because the on-device pass is restarted every time a
   * transcript grows — it works from a snapshot of the cue list, so new lines
   * need a new run — and the model pass, which is minutes of generation, must
   * not be torn down every time a chunk lands.
   */
  const stopNmt = () => {
    translationAbort?.abort()
    translationAbort = null
  }

  const stopLlm = () => {
    releasePassPort()
    tellWorker({ type: 'bb-subsgen:llm-cancel' })
  }

  const stopTranslation = () => {
    stopNmt()
    stopLlm()
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isGetStatusMessage(msg)) return
    sendResponse({ status })
  })

  /**
   * Downloads audio on the offscreen document's behalf, because only a page may.
   *
   * The bytes go straight back to that document rather than through the worker —
   * see `AudioSupply`. Registered for the life of the content script rather than
   * per video: the request names the video it is for, and a run outliving the
   * overlay that started it is exactly the case this has to keep answering.
   */
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (!isAudioNeeded(msg)) return

    const reply = (fields: Partial<AudioSupply>) =>
      chrome.runtime
        .sendMessage({
          type: 'bb-subsgen:offscreen-audio',
          target: OFFSCREEN_TARGET,
          videoId: msg.videoId,
          ...fields,
        } satisfies AudioSupply)
        .catch(() => {})

    void fetchAudioBytes(msg.url).then(async (result) => {
      if ('error' in result) return reply({ error: result.error })
      // Awaited one at a time rather than fired together: the point of slicing
      // is that only one encoded slice is alive at once, which a burst of
      // parallel sends would undo.
      for (const slice of sliceAudio(result.bytes)) await reply(slice)
    })
  })

  /** Subscribes to batches from the worker, and returns the unsubscribe. */
  const onLlmTranslations = (handle: (msg: LlmTranslationsMessage) => void): (() => void) => {
    const listener = (msg: unknown) => {
      if (isLlmTranslationsMessage(msg)) handle(msg)
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }

  /** Subscribes to the transcript as it is produced, and returns the unsubscribe. */
  const onAsrCues = (handle: (msg: AsrCuesMessage) => void): (() => void) => {
    const listener = (msg: unknown) => {
      if (isAsrCuesMessage(msg)) handle(msg)
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }

  const loadCurrentVideo = async () => {
    stopMount?.()
    stopMount = null
    rerenderCurrentCue = null
    startTranslation = null
    startLlmTranslation = null
    stopTranslation()
    // Deliberately not part of `stopTranslation`, which also runs when the target
    // language changes. A transcript is the Chinese itself, so it survives that;
    // it is only a change of video that makes it worthless.
    tellWorker({ type: 'bb-subsgen:asr-cancel' })
    releaseAsrPort()
    stopAsr?.()
    stopAsr = null
    stopLlmResults?.()
    stopLlmResults = null
    translations.clear()
    llmTranslations.clear()
    latched.clear()
    status = 'loading'
    if (!settings.enabled) return

    const loaded = await loadCuesForCurrentVideo(site)
    if (!loaded) {
      status = 'no-track'
      console.log('[bb-subsgen] could not resolve this video')
      return
    }
    // `resolved` rather than `video`: the mount callback below binds that name to
    // the `<video>` element, and two different things under one name inside the
    // same function is how the wrong one gets used.
    const resolved = loaded.video
    const { videoId, duration } = resolved
    // Only now, once there is a video that will actually use it.
    const words = await getLexicon()
    if (!words) {
      status = 'no-dictionary'
      console.log('[bb-subsgen] no dictionary installed for zh')
      return
    }
    const videoInfo = { title: resolved.title, description: resolved.description }

    /**
     * Mutated in place as chunks land, never reassigned.
     *
     * The mount below closes over this array, and so does `watchPlayback`, which
     * re-reads it on every frame. Refilling it is therefore all it takes to put
     * new lines on screen — no remount, and no second code path for cues that
     * arrived late.
     */
    const cues = loaded.cues

    /**
     * When to spend on a transcript, if at all.
     *
     * `certain` starts at once, as Bilibili always has. The other three exist
     * because on YouTube a start costs a download and minutes of GPU, and the
     * evidence that a video is Chinese is not always strong enough to spend that
     * on unasked. A channel you have already said yes to counts as certain
     * however this particular video reads — that is what saying yes meant.
     */
    const { confidence, approvalKey } = resolved.transcribe
    const { start, transcribing, running, verdict } = planTranscription({
      confidence,
      approved: Boolean(approvalKey) && (await isApproved(approvalKey)),
      refused: isRefused(videoId),
      // A track too sparse to be this video's dialogue counts as no track at
      // all, but only where there is something better to put in its place.
      // Discarding a publisher's own text for nothing would be strictly worse
      // than showing an odd line.
      usable: looksLikeTranscript(cues, duration),
      canTranscribe:
        settings.asrEnabled && Boolean(settings.asrBaseUrl) && Boolean(settings.asrModel),
    })

    console.log(
      `[bb-subsgen] ${cues.length} cues over ${Math.round(duration)}s,`,
      `${confidence} — ${verdict}`,
    )

    // Emptied rather than ignored: everything downstream reads this array, and
    // leaving the advert in it would put the advert on screen.
    if (transcribing) cues.length = 0

    if (!cues.length && !transcribing) {
      status = 'no-track'
      console.log('[bb-subsgen] no subtitle track for this video')
      return
    }
    status = 'active'

    // ── Video scope ────────────────────────────────────────────────────────
    //
    // `mount` re-runs its callback whenever Bilibili replaces the `<video>`
    // element, which on bangumi it does during DASH and DRM setup. Everything
    // inside it is therefore per-overlay and may happen several times. A
    // transcription and a translation pass are per-video and must happen once,
    // so they live out here and the mount only publishes the hooks that paint
    // them. Getting this wrong is what previously left both passes dead for the
    // rest of a video whenever the player swapped its element.

    /**
     * What the notice is currently saying, and whether it has been closed.
     *
     * Two things end up here: a run that stopped, with a Retry; and a video we
     * cannot tell is Chinese, with an offer to transcribe it anyway. They share
     * the widget because they are the same shape of interruption — a sentence
     * about transcription and one thing you might do about it.
     *
     * Dismissal is per video rather than per overlay: a remount must not bring
     * back a box you have already closed, and a later run that fails is a new
     * thing to say.
     */
    let notice: { text: string; action: string; onAction: () => void } | null = null
    let dismissed = false
    /**
     * The last coverage a run reported, kept for the next one to start from.
     *
     * A retry re-fetches and re-decodes before it can say anything, and without
     * this the bar would blanket a video that already has forty-five minutes of
     * subtitles for the half-minute that takes. What the failed run last sent is
     * exactly right: it is the complement of the stretches still missing.
     */
    let covered: Span[] = []

    /**
     * Chunk progress while a transcription is running; null when none is.
     *
     * Seeded from `running` and not from `transcribing`, which is also true of
     * a video still being asked about. Those have spent nothing and have no run
     * to report — and because no run would ever complete to clear this, a pill
     * raised there stayed over the video for good, including after the question
     * was answered no. The paths that do start a run raise it themselves.
     */
    let transcribeState: { done: number; total: number; covered: Span[] } | null = running
      ? { done: 0, total: 0, covered: [] }
      : null
    /** The translation phases. Transcription is held separately, above. */
    let progress: ProgressState = { phase: 'idle' }

    /** A stopped run, with the one thing you can do about it. */
    const retryNotice = (text: string) => ({
      text,
      action: 'Retry',
      onAction: () => {
        notice = null
        transcribeState = { done: 0, total: 0, covered }
        repaint()
        void requestTranscript()
      },
    })

    /**
     * Locates the audio and asks the worker to transcribe it.
     *
     * The audio is resolved here rather than in the offscreen document because
     * this is the half that knows what site it is on — see `AudioSource`. It is
     * also resolved afresh on every call, including a retry: a playurl URL
     * carries a deadline, and replaying a stored one is how a retry after a long
     * failure asks for audio that has since expired.
     *
     * Retry comes back through here rather than through `asr-retry` for that
     * reason. It costs nothing — `startTranscription` picks up the stretches a
     * failed run left behind whether it was asked to resume or not.
     */
    const requestTranscript = async (): Promise<void> => {
      const audio = await resolved.audioSource()
      if (!audio) {
        // Said here rather than by the worker, because nothing was started: the
        // run this would have reported never got as far as existing.
        notice = retryNotice('No audio stream for this video.')
        dismissed = false
        transcribeState = null
        repaint()
        return
      }

      console.log(
        `[bb-subsgen] asking for a transcript of ${videoId}`,
        `from ${settings.asrBaseUrl} as ${settings.asrModel}`,
      )
      holdAsrPort()
      tellWorker({
        type: 'bb-subsgen:asr-transcribe',
        videoId,
        audio,
        model: settings.asrModel,
        baseUrl: settings.asrBaseUrl,
        // So the part being watched is transcribed first, which matters when
        // arriving partway through an episode.
        playhead: document.querySelector('video')?.currentTime ?? 0,
      })
    }

    // Published by the mount, and reassigned by every remount.
    let repaintProgress: (() => void) | null = null
    /**
     * Repaints, callable from anywhere.
     *
     * A wrapper rather than the variable itself because the variable is only
     * ever assigned *inside* the mount callback. TypeScript cannot see that
     * happen, so out in straight-line code it still believes the initial `null`
     * and rejects `repaintProgress?.()` as uncallable. Reading it inside a
     * closure asks the question at call time, which is when the answer is known.
     */
    const repaint = () => repaintProgress?.()
    let paintTranslation: ((start: number) => void) | null = null
    let refreshCues: (() => void) | null = null
    let currentIndex: () => number = () => -1

    // Blank cues are never translated, so they'd otherwise make the pass look
    // permanently unfinished. Counted on demand rather than once, because a
    // transcript keeps arriving and keeps changing the answer.
    const translatable = () => cues.filter((cue) => cue.text.trim()).length

    /**
     * The translation a line shows, recomputed rather than remembered.
     *
     * Nothing is pinned here. A line used to keep whatever it first displayed,
     * so that a batch landing mid-read could not rewrite it — but the pin
     * outlived the line, and every line watched before the gate opened stayed on
     * the on-device translation for the rest of the session, seek back to it or
     * not. Recomputing means a line shows the best translation that exists at the
     * moment it is painted, including the moment the gate opens under it.
     *
     * It cannot flicker: the two caches only ever grow and `latch` never closes,
     * so a line moves nothing → on-device → model and never back.
     */
    const translationFor = (index: number): Shown => {
      const start = index < 0 ? undefined : cues[index]?.start
      if (start === undefined) return { text: '', source: null }
      const lang = settings.translationLang

      return preferred({
        nmt: cacheFor(lang).get(start),
        llm: llmCacheFor(lang).get(start),
        latched: latched.has(lang),
      })
    }

    /**
     * Opens the gate once the model is far enough ahead to stay ahead, and says
     * whether this was the call that opened it.
     *
     * The caller needs that answer: opening the gate changes which tier wins for
     * the line already on screen, whose model translation may have arrived
     * batches ago and been passed over.
     */
    const updateLatch = (lang: TranslationLang): boolean => {
      if (latched.has(lang)) return false
      const llm = llmCacheFor(lang)
      const from = Math.max(currentIndex(), 0)
      const buffered = bufferedAhead(
        from,
        cues.length,
        (index) => llm.has(cues[index].start),
        (index) => Boolean(cues[index].text.trim()),
      )
      const opened = latch(false, buffered)
      if (opened) latched.add(lang)

      // Diagnostic, on the page console rather than the model log, which the
      // worker owns. This is the one place that can answer "the model has
      // translated the line I am watching, so why am I still reading the
      // on-device version" — the gap between `have` and the threshold is the
      // whole answer, and it is invisible from anywhere else.
      console.debug(
        `[bb-subsgen] llm buffer: ${buffered}/${BUFFER_CUES} contiguous cues ahead of ${from}` +
          `, ${llm.size} translated in total, gate ${opened ? 'OPEN' : 'closed'}`,
      )
      return opened
    }

    stopMount = mount(site.chrome, ({ shadowRoot, video, container }) => {
      let lastIndex = -1
      // Kept beside lastIndex so the cue's words are segmented once per cue,
      // rather than again for every capture that needs them.
      let currentTokens: Token[] = []
      // Per line, reset on every cue change: how long its cards stayed open,
      // and whether it has already been kept.
      let engagedMs = 0
      let captured = false

      const buffer = createExposureBuffer({ videoId, title: document.title, url: location.href })

      /**
       * Where a word or line was met, frozen for the card.
       *
       * The translation is whatever has landed by now: the pass runs ahead of
       * playback so it is usually there, but a line captured in the first
       * seconds of a video may snapshot an empty one. Nothing goes back for
       * those later — the capture path never blocks on a translator.
       *
       * Deliberately `forCard` and not `translationFor`: the card takes the best
       * translation that exists, not the one that was on screen. See tier.ts.
       */
      const contextFor = (index: number): Context => {
        const { start, text } = cues[index]
        return {
          text,
          translation: forCard({
            nmt: cacheFor(settings.translationLang).get(start),
            llm: llmCacheFor(settings.translationLang).get(start),
          }),
          videoId,
          start,
          url: location.href,
          title: document.title,
          // Every cue on a transcribed video came from the transcript:
          // `transcribing` is only ever true when the track was empty, so there
          // is no mixture.
          source: transcribing ? 'asr' : 'cc',
          at: Date.now(),
        }
      }

      const stopHover = attachHover({
        shadowRoot,
        video,
        lookup: lookupDefs,
        isTraditional: () => settings.useTraditional,
        showToneColors: () => settings.showToneColors,
        currentTokens: () => currentTokens,
        currentContext: () => (lastIndex >= 0 ? contextFor(lastIndex) : null),
        known: () => known,

        // Only offered once a model server is actually configured — the popup's
        // settings are live, so turning it on takes effect on the next card.
        canExplain: () => settings.llmEnabled && Boolean(settings.llmBaseUrl),
        openExplain: (headword) => {
          const context = lastIndex >= 0 ? contextFor(lastIndex) : null
          if (!context) return Promise.resolve()
          return openExplainDrawer(shadowRoot, {
            line: context.text,
            word: headword,
            videoId,
            start: context.start,
            title: document.title,
          })
        },

        // Going looking for a translation that was withheld because you knew
        // every word is an unambiguous "I couldn't read that" — no threshold to
        // tune, so it acts at once.
        onLookup: () => {
          if (translationWithheld(cueView())) captureCurrentLine()
        },

        // Otherwise the evidence is weaker and cumulative: dwelling long enough
        // on one line suggests something was off. The threshold is a guess, so
        // every sample is logged raw and it can be moved to wherever the real
        // "I'm stuck" pauses turn out to sit.
        onLookupEnd: (ms) => {
          if (lastIndex < 0) return
          engagedMs += ms
          const withheld = translationWithheld(cueView())
          const overThreshold = engagedMs >= settings.struggleThresholdMs
          if (overThreshold) captureCurrentLine()
          recordSignal({
            at: Date.now(),
            videoId,
            start: cues[lastIndex].start,
            ms,
            hidden: withheld,
            captured,
          })
        },
      })

      /**
       * Which of the two runs the pill is reporting.
       *
       * Transcription takes precedence while one is live, because until it
       * reaches the stretch you are watching there is no line there to translate.
       */
      const renderProgress = () => {
        const cache = cacheFor(settings.translationLang)
        const state: ProgressState = transcribeState
          ? { phase: 'transcribe', ...transcribeState }
          : progress
        setProgress(
          shadowRoot,
          progressView(state, {
            // `?.` because this runs on a frame callback while the cue list is
            // being replaced under it; a stale index must not throw here, of all
            // places, and the next frame corrects it.
            waiting: isWaiting(lastIndex, (index) => cache.has(cues[index]?.start ?? -1)),
            playhead: video.currentTime,
          }),
        )
      }
      const renderNotice = () =>
        setNotice(
          shadowRoot,
          notice && !dismissed
            ? {
                text: notice.text,
                action: notice.action,
                onAction: notice.onAction,
                onDismiss: () => {
                  dismissed = true
                  // Closing the "is this Chinese?" box is an answer, not just a
                  // tidy-up: it means no, for this video, for this session.
                  if (notice?.action === ASK_ACTION) refuseForNow(videoId)
                  renderNotice()
                },
              }
            : null,
        )

      // So a run already under way can paint into whichever overlay is current.
      repaintProgress = () => {
        renderProgress()
        renderNotice()
      }
      currentIndex = () => lastIndex
      paintTranslation = (start) => {
        if (lastIndex < 0 || cues[lastIndex]?.start !== start) return
        const { text, source } = translationFor(lastIndex)
        setTranslation(shadowRoot, text, source)
      }

      const cueView = (): CueView => {
        const { text, source } = translationFor(lastIndex)
        return {
          tokens: currentTokens,
          translation: text,
          translationSource: source,
          known,
          quiz: quizMode(),
        }
      }

      const render = () => {
        if (lastIndex === -1) {
          currentTokens = []
          clearCue(shadowRoot)
          return
        }
        currentTokens = segment(cues[lastIndex].text, words)
        renderCue(shadowRoot, cueView(), settings)
      }

      /**
       * The structures this line is built out of, as pattern ids.
       *
       * Derived from the tokens already segmented for rendering, so finding them
       * costs nothing beyond the match itself.
       */
      const patternsInLine = () => findPatterns(currentTokens).map((match) => match.pattern.id)

      /**
       * Counts a line as seen, and keeps it if it still has something to teach.
       *
       * One rule for every level: a line qualifies when it contains a word you
       * don't yet know. As a beginner that is nearly every line, which is the
       * point — you cannot pause every four seconds to curate. What stops this
       * flooding the deck is that captures land in the intake pool and are
       * rationed out, not that capture is stingy.
       *
       * The words that made the line qualify go with it. Keeping the line and
       * dropping its vocabulary is what left the pool full of sentences waiting
       * on words nothing was teaching — they pool too, and the same rationing
       * covers both.
       */
      const onCueShown = () => {
        engagedMs = 0
        captured = false
        if (lastIndex < 0) return

        const seen = hanWords(currentTokens)
        buffer.line(seen)

        const { text } = cues[lastIndex]
        if (!isCapturableText(text) || !shouldCaptureLine(seen, known)) return
        captureSentence(
          text,
          contextFor(lastIndex),
          undefined,
          unknownIn(seen, known),
          patternsInLine(),
        )
        captured = true
      }

      /**
       * Keeps the line on screen, once for whatever reason.
       *
       * Lines that already qualified on vocabulary were taken by `onCueShown`;
       * this is the other path in, for a line whose words you all know but
       * whose grammar you evidently didn't. Those are the most valuable
       * sentences in the pool, and nothing else in the design would find them.
       *
       * Passes no words, and needs none: reaching here means every word in the
       * line is already known, so there is nothing left to collect. The patterns
       * are exactly what it does collect — this is the path that finds the lines
       * whose difficulty was never vocabulary.
       */
      const captureCurrentLine = () => {
        if (captured || lastIndex < 0) return
        const { text } = cues[lastIndex]
        if (!isCapturableText(text)) return
        captureSentence(text, contextFor(lastIndex), undefined, [], patternsInLine())
        captured = true
      }

      // Re-applied on every settings change, since watchControls only emits
      // when the player changes — toggling the setting off has to take effect
      // without waiting for the bar to move. The floor is not gated on the
      // setting: rendering the card below the video is a bug, not a preference.
      let geometry: PlayerGeometry = { floor: 0, lift: 0 }
      const applyGeometry = () =>
        setGeometry(shadowRoot, {
          floor: geometry.floor,
          lift: settings.liftAboveControls ? geometry.lift : 0,
        })
      const stopControls = watchControls(container, video, shadowRoot.host, site.chrome, (next) => {
        geometry = next
        applyGeometry()
      })
      // Hovering a character shouldn't make the player's own timeline vanish.
      const stopForward = forwardHoverToPlayer(container, shadowRoot.host, site.chrome)

      rerenderCurrentCue = () => {
        // Only the translation phases are the translation's to clear.
        // Transcription is producing the Chinese itself, and goes on being worth
        // reporting whether or not a translation is wanted underneath it.
        if (!settings.showTranslation) progress = { phase: 'idle' }
        render()
        applyGeometry()
        renderProgress()
        renderNotice()
      }

      // Fires only when the active cue actually changes, which is why capture
      // hangs off it rather than off render() — render also runs on every
      // settings change, and would count the same line again each time.
      const watch = watchPlayback(video, cues, (index) => {
        lastIndex = index
        render()
        renderProgress()
        onCueShown()
        // Seeking re-orders what the pass has left to do; it reads this rather
        // than being told to restart.
        if (index >= 0) tellWorker({ type: 'bb-subsgen:llm-playhead', index })
      })

      // Re-read the cue list on demand, for when it changed rather than the
      // time did. Chunks land while the video is paused as often as not, and no
      // frame callback fires then.
      refreshCues = () => {
        watch.refresh()
        renderProgress()
      }

      /**
       * A jump, which two separate things need to hear about.
       *
       * The pill, because whether it shows depends on where you are and not only
       * on what has been done; and the transcription, because the chunk you have
       * jumped to is now the one worth doing next.
       */
      const onSeeked = () => {
        watch.refresh()
        renderProgress()
        if (transcribeState) {
          tellWorker({ type: 'bb-subsgen:asr-playhead', seconds: video.currentTime })
        }
      }
      video.addEventListener('seeked', onSeeked)

      // Painted here rather than left to the first frame callback. On a
      // transcribed video there are no cues yet, so the only thing that would
      // ever have triggered this is playback itself — and a paused video, which
      // is exactly where someone waiting for subtitles leaves it, shows nothing
      // at all while several minutes of work go on unannounced.
      renderProgress()
      renderNotice()

      return () => {
        // First, so the last few lines of the session are posted before the
        // listeners that would have flushed them are gone.
        buffer.stop()
        stopHover()
        watch.stop()
        stopControls()
        stopForward()
        video.removeEventListener('seeked', onSeeked)
      }
    })

    startTranslation = () => {
      if (!settings.showTranslation) return
      // Restarted rather than guarded against restarting. The pass works from a
      // snapshot of the cue list, so a transcript that has grown needs a new
      // one; lines already translated are blanked below, so nothing is redone
      // and the translator itself is memoised across the restart.
      stopNmt()

      // Captured, not re-read: a result arriving after the user switches
      // language belongs to the language the pass was started for.
      const lang = settings.translationLang
      const cache = cacheFor(lang)
      // Captured alongside the texts, for the same reason. `onResult` reports a
      // position in the array it was handed, and by the time it does, the live
      // array may have had a chunk spliced into it.
      const starts = cues.map((cue) => cue.start)
      const controller = new AbortController()
      translationAbort = controller

      progress = { phase: 'pass', done: cache.size, total: translatable() }
      repaintProgress?.()

      void translateTrack({
        lang,
        // Blanking already-translated cues makes the pass skip them, so toggling
        // the setting off and back on — or a chunk landing — doesn't redo
        // finished work.
        texts: cues.map((cue) => (cache.has(cue.start) ? '' : cue.text)),
        currentIndex: () => currentIndex(),
        onDownload: (fraction) => {
          progress = { phase: 'download', label: labelFor(lang), fraction }
          repaintProgress?.()
        },
        onReady: () => {
          progress = { phase: 'pass', done: cache.size, total: translatable() }
          repaintProgress?.()
        },
        onResult: (index, translated) => {
          cache.set(starts[index], translated)
          if (lang !== settings.translationLang) return // superseded mid-flight
          // Through the tier rather than straight to the overlay: this line may
          // already be showing the model's translation, and `preferred` is what
          // stops the on-device one arriving late from displacing it.
          paintTranslation?.(starts[index])
          progress = { phase: 'pass', done: cache.size, total: translatable() }
          repaintProgress?.()
        },
        signal: controller.signal,
      })
    }

    /**
     * Hands the track to the worker, which owns the model and the cache.
     *
     * Segmented here because this is where the lexicon already is — the worker
     * would otherwise have to parse a 4.5MB dictionary of its own, every time
     * Chrome decided it had been idle long enough to discard.
     */
    startLlmTranslation = () => {
      if (!settings.showTranslation) return
      if (!settings.llmEnabled || !settings.llmTranslationEnabled) return
      if (!settings.llmBaseUrl || !settings.llmTranslationModel) return
      // Nothing to translate yet — which on a transcribed video is every call
      // until the transcript is finished.
      if (!cues.length) return

      console.log(
        `[bb-subsgen] asking the model to translate ${translatable()} lines`,
        `to ${settings.translationLang} as ${settings.llmTranslationModel}`,
      )
      holdPassPort()
      tellWorker({
        type: 'bb-subsgen:llm-translate-track',
        videoId,
        lang: settings.translationLang,
        model: settings.llmTranslationModel,
        baseUrl: settings.llmBaseUrl,
        video: { title: videoInfo.title, description: videoInfo.description },
        cues: cues.map((cue) => ({
          start: cue.start,
          text: cue.text,
          words: cue.text.trim() ? hanWords(segment(cue.text, words)) : [],
        })),
      })
    }

    // Out here rather than inside the mount, so a remount cannot drop a batch
    // that lands between the old overlay going and the new one arriving.
    stopLlmResults = onLlmTranslations((msg) => {
      if (msg.videoId !== videoId) return // a previous video's pass, still landing
      const cache = llmCacheFor(msg.lang)
      for (const line of msg.lines) cache.set(line.start, line.text)

      // Logged before the language check below, so a pass still finishing for a
      // language you have just switched away from is visibly still running
      // rather than appearing to have stalled.
      const total = translatable()
      console.log(
        `[bb-subsgen] model translated ${cache.size}/${total} lines to ${msg.lang}` +
          ` (+${msg.lines.length} this batch)`,
      )

      if (msg.lang !== settings.translationLang) return
      const opened = updateLatch(msg.lang)
      // Only ever the line on screen — everything else this batch touched is
      // still ahead of the playhead and will be painted when it is reached.
      //
      // Repainted on the gate opening as well as on this batch carrying the
      // line, and the first of those is easy to miss: the line on screen may
      // have been translated batches ago and passed over every time because the
      // gate was shut. Nothing else would repaint it until the next cue change.
      const at = currentIndex()
      const start = at >= 0 ? cues[at]?.start : undefined
      if (start !== undefined && (opened || msg.lines.some((line) => line.start === start))) {
        paintTranslation?.(start)
      }
    })

    if (!transcribing) {
      startTranslation()
      startLlmTranslation()
      return
    }

    /**
     * Puts each chunk on screen as it lands.
     *
     * The whole list every time rather than the newest piece: chunks are
     * transcribed playhead-first and so finish out of order, and re-sorting a
     * complete list at this end is both cheaper and harder to get wrong than
     * splicing fragments into the right places. Cue identity is the start time
     * everywhere in here precisely so that a chunk arriving early in the track
     * can renumber the array without disturbing what has already been shown.
     *
     * Subscribed out here rather than inside the mount so a remount cannot drop
     * a chunk that lands between the old overlay going and the new one arriving.
     */
    stopAsr = onAsrCues((msg) => {
      if (msg.videoId !== videoId) return // a previous video's run, still landing

      // Held on screen here rather than at either end of the wire: this is the
      // one point every ASR cue list passes through — a chunk landing mid-run,
      // the final list, and a cache hit, which `asr-pass` answers with the same
      // message. How long a line stays is presentational, so what is stored
      // keeps the timings the model gave and changing this costs a reload
      // rather than transcribing the episode again.
      cues.length = 0
      cues.push(...alignCues(msg.cues))

      if (msg.complete) {
        // Whether it worked or not, the worker no longer needs holding open.
        releaseAsrPort()
        transcribeState = null
        if (msg.error) {
          console.warn('[bb-subsgen] transcription:', msg.error)
          // A new failure is worth showing even if the last one was dismissed.
          notice = retryNotice(msg.error)
          dismissed = false
        }
        console.log('[bb-subsgen] transcribed', cues.length, 'lines for', videoId)
      } else {
        covered = msg.covered ?? covered
        transcribeState = { done: msg.done, total: msg.total, covered }
        console.log(`[bb-subsgen] transcribed chunk ${msg.done}/${msg.total}`)
      }

      refreshCues?.()

      // Restarted on every chunk. It is a local model rather than the one behind
      // the speech server, so it costs nothing the transcription is waiting on,
      // and it is what makes a line readable the moment it appears.
      startTranslation?.()
      // The model pass waits for the whole track. There is one GPU behind all of
      // this and the speech server is on it until the last chunk lands; a pass
      // racing it would finish later than the two run in order. It also gets
      // batch seams that are actually adjacent, which a growing track does not.
      if (msg.complete) startLlmTranslation?.()
      repaintProgress?.()
    })

    // Asked for exactly once per video, and this is the only place that can
    // promise it. Bilibili replaces the `<video>` element during DASH and DRM
    // setup on bangumi, which remounts the overlay; asking from in there sent a
    // second request that cancelled the first — tearing down the offscreen
    // document mid-transcription, which the speech server sees as the client
    // hanging up, and starting the whole download and decode again from nothing.
    //
    // The work itself happens in the worker and the offscreen document, and logs
    // there rather than here: chrome://extensions → "service worker" is where a
    // failed fetch or a refused server shows up in full.
    if (start === 'now') {
      await requestTranscript()
      return
    }

    if (start === 'ask') {
      // Nothing is spent until this is answered, and the progress pill stays
      // away — there is no run to report on, only a question.
      notice = {
        text: `This doesn’t look like a Chinese video. Transcribe it anyway?`,
        action: ASK_ACTION,
        onAction: () => {
          notice = null
          // Filed against the channel, not the video: saying yes here really
          // means "this publisher is Chinese", which holds for the next one too.
          void approve(approvalKey)
          transcribeState = { done: 0, total: 0, covered: [] }
          repaint()
          void requestTranscript()
        },
      }
      repaint()
      return
    }

    // `on-playback`: probably Chinese, so it is worth the GPU — but only once
    // this turns out to be a video you are actually watching rather than one you
    // opened and left. Watched time rather than wall-clock, so a paused tab in
    // the background never trips it.
    const player = document.querySelector('video')
    if (!player) return

    const armed = () => {
      if (player.currentTime < LIKELY_DWELL_S) return
      player.removeEventListener('timeupdate', armed)
      console.log(`[bb-subsgen] watched past ${LIKELY_DWELL_S}s — transcribing after all`)
      transcribeState = { done: 0, total: 0, covered: [] }
      repaint()
      void requestTranscript()
    }
    player.addEventListener('timeupdate', armed)
    // Dropped along with the rest of this video's subscriptions; `loadCurrentVideo`
    // clears `stopAsr` on every change, and this rides with it so a video you
    // left cannot start transcribing behind you.
    const stopCues = stopAsr
    stopAsr = () => {
      player.removeEventListener('timeupdate', armed)
      stopCues?.()
    }
  }

  watchVideoChange(site.parseVideoId, loadCurrentVideo)
  onSettingsChanged((next) => {
    const enabledChanged = next.enabled !== settings.enabled
    const translationToggled = next.showTranslation !== settings.showTranslation
    const langChanged = next.translationLang !== settings.translationLang
    const llmToggled =
      next.llmEnabled !== settings.llmEnabled ||
      next.llmTranslationEnabled !== settings.llmTranslationEnabled ||
      next.llmTranslationModel !== settings.llmTranslationModel ||
      // Pointing at a different server is as much a change of translator as
      // picking a different model, and leaving it out meant correcting a typo'd
      // URL took a page reload to have any effect.
      next.llmBaseUrl !== settings.llmBaseUrl
    settings = next
    if (enabledChanged) {
      loadCurrentVideo()
      return
    }
    if (langChanged) {
      // The caches survive, so switching back to a finished language is instant.
      stopTranslation()
      startTranslation?.()
      startLlmTranslation?.()
    } else if (translationToggled) {
      if (next.showTranslation) {
        startTranslation?.()
        startLlmTranslation?.()
      } else stopTranslation()
    } else if (llmToggled) {
      // Turned on mid-video: the worker already has everything it needs to
      // start, and everything cached from a previous viewing comes back at once.
      if (next.llmEnabled && next.llmTranslationEnabled) startLlmTranslation?.()
      else {
        releasePassPort()
        tellWorker({ type: 'bb-subsgen:llm-cancel' })
      }
    }
    rerenderCurrentCue?.()
  })

  await loadCurrentVideo()
}

main()
