# Local models

Three features need a model server you run yourself:

| Feature | What it needs |
|---|---|
| Transcribing videos with no subtitle track | a speech server (whisper.cpp, speaches) |
| Better subtitle translation than Chrome's | a chat server (LM Studio, Ollama) |
| The Chat tutor — ask about a line | the same chat server |
| YouTube audio, for transcription | `npm run ytdlp` |

**All of them are off, and every URL empty, until you fill them in.** Nothing about the
extension changes for someone who never turns them on — the overlay, the page reader and
the flashcards all work with no server at all.

## There are no hosted providers

Every one of these talks to `localhost` and only to `localhost`. No cloud APIs, no keys,
not as a fallback and not behind a setting. The extension is offline after install, and
that is a product decision rather than an oversight.

(The single exception in the whole extension is the setup wizard's one-time dictionary
download, which goes to MDBG and the EDRDG.)

## Pointing it at your server

In **Settings**, give each an OpenAI-compatible base URL. The popup offers two chat
presets:

- LM Studio — `http://localhost:1234/v1`
- Ollama — `http://localhost:11434/v1`

Anything else on any port works too; the preset buttons are a convenience, not a list of
what's supported. The speech server is a separate program on a separate port — LM Studio
and Ollama serve chat completions and neither transcribes audio.

## Starting them together

```sh
npm run services
```

Only the audio helper is ours, so this starts the commands you name and takes them all
down together. Configure the rest with environment variables, in a shell profile or a
`.env` you source:

```sh
BB_ASR_COMMAND="whisper-server --model ggml-large-v3-turbo-q8_0.bin --port 8080"
BB_LLM_COMMAND="lms server start"          # optional
BB_YTDLP_PORT=8770                         # optional
```

Anything unset is skipped, so it's useful from the first run with nothing configured —
it still gets the audio helper up.

For a machine you use every day, a `launchd` agent is the better answer. `npm run
services` is the development-loop tool.

## Why YouTube needs a helper

YouTube serves media over SABR — a protobuf POST rather than a fetchable URL — so unlike
Bilibili there is no address the extension can request the audio from. `yt-dlp` knows
how, and a Chrome extension cannot run a binary, so a small local server bridges the two.
`npm run ytdlp` is it.

## One GPU

Passes yield to interactive work: chat announces itself, and a background translation
pass re-orders itself around the playhead. A full track is tens of minutes of generation,
which is why it's a separate setting from the tutor.
