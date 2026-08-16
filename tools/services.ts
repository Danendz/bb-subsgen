// Starts the local services this extension talks to, in one terminal tab.
//
// Only one of them is ours. The speech server is whichever whisper build you
// run, and the model server is LM Studio or Ollama or something else again — so
// this cannot *own* them, only start the commands you name. That is the honest
// description: run these, label their output, and take them all down together.
//
//   npm run services
//
// Configure the ones that are not ours with environment variables, in a shell
// profile or a `.env` you source:
//
//   BB_ASR_COMMAND="whisper-server --model ggml-large-v3-turbo-q8_0.bin --port 8080"
//   BB_LLM_COMMAND="lms server start"          # optional
//   BB_YTDLP_PORT=8770                         # optional
//
// Anything unset is simply skipped, so this is useful from the first run with
// nothing configured at all — it still gets the audio helper up.
//
// For a machine you use every day, a `launchd` agent is the better answer: two
// plists in ~/Library/LaunchAgents start these at login, restart them on crash,
// and cost zero terminal tabs. This is the development-loop tool.

import { spawn, type ChildProcess } from 'node:child_process'
import { DEFAULT_PORT } from './ytdlp-server.ts'

interface Service {
  name: string
  command: string
  args: string[]
}

/** Splits a configured command line into a program and its arguments.
 *
 *  Deliberately simple — whitespace, with double quotes respected for paths that
 *  contain spaces. A model path with a space in it is the realistic case; a
 *  command needing shell pipelines is not, and should be a script instead. */
export function splitCommand(line: string): string[] {
  return (line.match(/"[^"]*"|\S+/g) ?? []).map((part) => part.replace(/^"|"$/g, ''))
}

export function servicesFrom(env: Record<string, string | undefined>): Service[] {
  const services: Service[] = [
    {
      name: 'ytdlp',
      command: process.execPath,
      args: [
        '--experimental-strip-types',
        new URL('./ytdlp-server.ts', import.meta.url).pathname,
        '--port',
        String(Number(env.BB_YTDLP_PORT) || DEFAULT_PORT),
      ],
    },
  ]

  for (const [name, line] of [
    ['asr', env.BB_ASR_COMMAND],
    ['llm', env.BB_LLM_COMMAND],
  ] as const) {
    if (!line?.trim()) continue
    const [command, ...args] = splitCommand(line)
    if (command) services.push({ name, command, args })
  }

  return services
}

function run(services: Service[]): void {
  const running: ChildProcess[] = []
  let stopping = false

  const label = (name: string, stream: NodeJS.ReadableStream) => {
    let carry = ''
    stream.on('data', (chunk: Buffer) => {
      const lines = (carry + chunk.toString()).split('\n')
      // The last piece may be half a line; hold it for the next chunk rather
      // than printing a prefix in the middle of a sentence.
      carry = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) console.log(`[${name}] ${line}`)
    })
  }

  for (const service of services) {
    console.log(`[services] starting ${service.name}: ${service.command} ${service.args.join(' ')}`)
    const child = spawn(service.command, service.args, { stdio: ['ignore', 'pipe', 'pipe'] })
    label(service.name, child.stdout)
    label(service.name, child.stderr)

    child.on('error', (e: Error) => console.error(`[${service.name}] could not start: ${e.message}`))
    child.on('exit', (code: number | null) => {
      console.log(`[${service.name}] exited (${code ?? 'signal'})`)
      // One service falling over should not silently leave the others half
      // running, which reads as "it works" until the missing one is needed.
      if (!stopping) stop()
    })
    running.push(child)
  }

  const stop = () => {
    if (stopping) return
    stopping = true
    console.log('[services] stopping')
    for (const child of running) child.kill('SIGTERM')
    // A child that ignores SIGTERM must not hold the terminal forever.
    setTimeout(() => {
      for (const child of running) if (child.exitCode === null) child.kill('SIGKILL')
      process.exit(0)
    }, 3000).unref()
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

export function main(): void {
  const services = servicesFrom(process.env)
  if (services.length === 1) {
    console.log('[services] only the audio helper is configured.')
    console.log('[services] set BB_ASR_COMMAND to start your speech server here too.')
  }
  run(services)
}

if (import.meta.url === new URL(`file://${process.argv[1] ?? ''}`).href) {
  main()
}
