// A very small HTTP server that hands the extension a video's audio.
//
// It exists because of a wall, not a preference. YouTube serves media over SABR:
// the player POSTs a protobuf describing its playback state and the server
// streams back multiplexed chunks. Verified on a live watch page — of 28 audio
// formats, *none* carried a `url`, none carried a `signatureCipher`, and the one
// format that did have a URL answered 403 to every variation tried. There is no
// address for the extension to fetch. `yt-dlp` knows how to talk SABR and is
// maintained by people who do that full time; a Chrome extension cannot execute
// a binary; so this stands between them.
//
// Why the extension can reach it at all: the offscreen document runs on the
// extension origin, which is allowed to reach localhost. A content script is
// not — see the header of `src/llm/client.ts`. That is the same split that makes
// Bilibili's CDN reachable only from the page, in the opposite direction.
//
// Run it directly:
//   node --experimental-strip-types tools/ytdlp-server.ts [--port 8770]
// or under the supervisor alongside your speech server:
//   npm run services
//
// Needs `yt-dlp` and `ffmpeg` on PATH. Keep yt-dlp current — that upkeep is the
// thing this whole design is buying.

import { createServer as createHttpServer } from 'node:http'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const DEFAULT_PORT = 8770

/**
 * The cheapest audio that is still speech.
 *
 * `bestaudio` alone picks itag 251 at ~100kbps — 18MB on a 25-minute episode.
 * Capping the bitrate picks itag 249 at ~48kbps, which is 8.8MB of the same
 * speech: everything downstream is resampled to 16kHz mono before a model ever
 * hears it, so the extra bandwidth is discarded after being paid for. The same
 * reasoning `pickAudioStream` applies to Bilibili's DASH renditions, on a
 * different API. The `/bestaudio` fallback covers a video that offers nothing
 * under the cap.
 */
const FORMAT = 'bestaudio[abr<=64]/bestaudio'

/** 16kHz mono, which is simply what speech recognition takes. */
const ASR_SAMPLE_RATE = 16000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

function isVideoId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)
}

/**
 * Streams one video's audio as 16kHz mono WAV.
 *
 * Two things here are less obvious than they look.
 *
 * **The status is withheld until ffmpeg produces a byte.** Once a `200` has gone
 * out it cannot be taken back, so a yt-dlp that fails ten seconds in — a private
 * video, a geo-block, a version too old for what YouTube is serving this week —
 * would arrive at the extension as a truncated WAV and be reported as a decode
 * error. Waiting for the first chunk means those become a clean `502` whose body
 * is yt-dlp's own explanation, which is what the overlay ends up showing.
 *
 * **Both children are killed when the client goes away.** `cancelTranscription`
 * fires on *every* video change, so without this a session of clicking around
 * leaves a yt-dlp and an ffmpeg per video, all still downloading.
 */
/**
 * How many times a failed extraction is tried before giving up.
 *
 * Measured, not guessed: pulling the same video several times in a few minutes
 * gets `HTTP Error 403: Forbidden` from YouTube perhaps one attempt in four, and
 * the very next attempt succeeds — the block is on the issued media request
 * rather than on the video, and a fresh extraction mints fresh tokens. yt-dlp's
 * own `--retries` does not cover it, because it retries the *download*, and what
 * has to be redone is the extraction that produced the URL.
 *
 * Rare in real use, where the transcript cache means a video is fetched once
 * ever. Retried here anyway because the alternative is surfacing a notice, for a
 * failure that fixes itself, in the middle of an operation taking minutes.
 */
const MAX_ATTEMPTS = 3

function streamAudio(videoId: string, req: any, res: any): void {
  let cancelled = false
  // Registered once for the request, not once per attempt, or a retry would
  // leave the previous attempt's listener attached.
  req.on('close', () => {
    if (!res.writableFinished) cancelled = true
  })
  attempt(videoId, req, res, 1, () => cancelled)
}

function attempt(
  videoId: string,
  req: any,
  res: any,
  round: number,
  cancelled: () => boolean,
): void {
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const ytdlp = spawn('yt-dlp', [
    '-f', FORMAT,
    '-o', '-',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    url,
  ])
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-ac', '1',
    '-ar', String(ASR_SAMPLE_RATE),
    '-f', 'wav',
    'pipe:1',
  ])

  let finished = false
  const errors: string[] = []
  const note = (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text) errors.push(text)
  }
  ytdlp.stderr.on('data', note)
  ffmpeg.stderr.on('data', note)

  const kill = () => {
    if (finished) return
    finished = true
    ytdlp.kill('SIGKILL')
    ffmpeg.kill('SIGKILL')
  }

  // yt-dlp writing into an ffmpeg that has already gone is an ordinary way for
  // this to end, not a crash worth reporting.
  ytdlp.stdout.on('error', () => {})
  ffmpeg.stdin.on('error', () => {})
  ytdlp.on('error', (e: Error) => errors.push(`yt-dlp: ${e.message}`))
  ffmpeg.on('error', (e: Error) => errors.push(`ffmpeg: ${e.message}`))

  ytdlp.stdout.pipe(ffmpeg.stdin)

  let started = false
  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    if (!started) {
      started = true
      res.writeHead(200, { ...CORS, 'Content-Type': 'audio/wav' })
    }
    // Backpressure by hand rather than `.pipe`, because the first chunk has
    // already been taken off the stream to decide the status code.
    if (!res.write(chunk)) ffmpeg.stdout.pause()
  })
  res.on('drain', () => ffmpeg.stdout.resume())

  ffmpeg.on('close', () => {
    if (finished) return
    finished = true
    if (started) {
      res.end()
      return
    }

    const detail = errors.join('\n').slice(0, 500) || 'yt-dlp produced no audio.'

    // Nothing was sent, so the status is still ours to choose — which is the
    // whole reason it was withheld. A retry is only worth it while the client is
    // still listening and the failure is one that has been seen to clear.
    if (!cancelled() && round < MAX_ATTEMPTS && /403|Forbidden|timed out/i.test(detail)) {
      console.warn(`[ytdlp-server] ${videoId} attempt ${round} failed, retrying: ${detail.split('\n')[0]}`)
      attempt(videoId, req, res, round + 1, cancelled)
      return
    }

    console.error(`[ytdlp-server] ${videoId} failed: ${detail}`)
    res.writeHead(502, { ...CORS, 'Content-Type': 'text/plain' })
    res.end(detail)
  })

  // The extension aborting is the normal case, not an error: it happens on every
  // video change. The flag is set by the one listener in `streamAudio`; this is
  // what acts on it for whichever attempt is currently in flight.
  req.on('close', () => {
    if (!res.writableFinished) kill()
  })
}

export function createServer() {
  return createHttpServer((req: any, res: any) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // Only ever a simple GET, and deliberately so: no custom request headers
    // means no CORS preflight to answer.
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname !== '/audio') {
      res.writeHead(404, CORS)
      res.end()
      return
    }

    const videoId = url.searchParams.get('v')
    if (!isVideoId(videoId)) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain' })
      res.end('Expected ?v= an eleven-character YouTube id.')
      return
    }

    console.log(`[ytdlp-server] ${videoId} → 16kHz mono wav`)
    streamAudio(videoId, req, res)
  })
}

function portFromArgs(argv: string[]): number {
  const at = argv.indexOf('--port')
  const given = at >= 0 ? Number(argv[at + 1]) : Number(process.env.PORT)
  return Number.isFinite(given) && given > 0 ? given : DEFAULT_PORT
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const port = portFromArgs(argv)
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`[ytdlp-server] listening on http://127.0.0.1:${port}`)
    console.log(`[ytdlp-server] set this as the audio helper URL in the extension's settings`)
  })
}

// Runs when invoked directly, stays quiet when imported by the supervisor — one
// copy of the code behind both entry points.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
