import { describe, expect, test } from 'vitest'
import { servicesFrom, splitCommand } from './services.ts'

describe('splitCommand', () => {
  test('splits on whitespace', () => {
    expect(splitCommand('whisper-server --port 8080')).toEqual(['whisper-server', '--port', '8080'])
  })

  test('keeps a quoted path with spaces in one piece', () => {
    // The realistic reason quoting is supported at all: model files live in
    // directories with spaces in them more often than anyone would like.
    expect(splitCommand('whisper-server --model "/Users/me/My Models/ggml.bin"')).toEqual([
      'whisper-server',
      '--model',
      '/Users/me/My Models/ggml.bin',
    ])
  })

  test('collapses runs of whitespace and ignores a trailing one', () => {
    expect(splitCommand('  a   b  ')).toEqual(['a', 'b'])
  })

  test('is empty for an empty line', () => {
    expect(splitCommand('')).toEqual([])
    expect(splitCommand('   ')).toEqual([])
  })

  test('does not preserve quotes inside an argument, which is documented', () => {
    // A command whose own payload contains quotes — `node -e "..."` — cannot be
    // expressed here, and should be a script instead. Pinned so the limitation
    // is a decision rather than a surprise.
    expect(splitCommand('node -e "console.log(1)"')).toEqual(['node', '-e', 'console.log(1)'])
  })
})

describe('servicesFrom', () => {
  test('always starts the audio helper, even with nothing configured', () => {
    const services = servicesFrom({})
    expect(services).toHaveLength(1)
    expect(services[0].name).toBe('ytdlp')
  })

  test('honours a port override', () => {
    expect(servicesFrom({ BB_YTDLP_PORT: '9999' })[0].args).toContain('9999')
  })

  test('falls back to the default port for nonsense', () => {
    expect(servicesFrom({ BB_YTDLP_PORT: 'banana' })[0].args).toContain('8770')
  })

  test('adds the speech and model servers when they are named', () => {
    const services = servicesFrom({
      BB_ASR_COMMAND: 'whisper-server --port 8080',
      BB_LLM_COMMAND: 'lms server start',
    })
    expect(services.map((s) => s.name)).toEqual(['ytdlp', 'asr', 'llm'])
    expect(services[1]).toMatchObject({ command: 'whisper-server', args: ['--port', '8080'] })
  })

  test('skips a variable that is set but blank', () => {
    expect(servicesFrom({ BB_ASR_COMMAND: '   ' }).map((s) => s.name)).toEqual(['ytdlp'])
  })
})
