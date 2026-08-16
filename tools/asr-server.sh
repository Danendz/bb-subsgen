#!/usr/bin/env bash
#
# Starts the speech-to-text server the extension talks to, building it and
# fetching the model on the first run.
#
# Most of bangumi ships without a subtitle track — surveyed across a season of
# 航拍中国, none of the real episodes had one — so the lines have to come from
# the audio. This is what turns them into text.
#
# Everything lives under a cache directory rather than in this repository: the
# model alone is several hundred megabytes and has no business in git.
#
#   ./tools/asr-server.sh            # build if needed, then serve on :8080
#   PORT=9000 ./tools/asr-server.sh  # somewhere else
#   MODEL=large-v3 ./tools/asr-server.sh
#
set -euo pipefail

PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"

# Quantized by default. It is a third the size of the full weights for a
# difference you will not hear on speech, and the saving is resident memory —
# which is the only cost this server has while it sits idle waiting to be asked.
MODEL="${MODEL:-large-v3-turbo-q8_0}"

# Subtitle-shaped output. Whisper's natural segments are paragraphs, sometimes
# twenty seconds long, which is unreadable over a video and useless as a cue.
# Splitting on a word boundary stops a line being cut mid-word.
MAX_LEN="${MAX_LEN:-24}"

CACHE="${BB_SUBSGEN_CACHE:-$HOME/.cache/bb-subsgen}"
REPO="$CACHE/whisper.cpp"
SERVER="$REPO/build/bin/whisper-server"
MODEL_FILE="$REPO/models/ggml-$MODEL.bin"

say() { printf '\033[36m==>\033[0m %s\n' "$*"; }

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
LABEL="com.bb-subsgen.asr"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Runs it at login and restarts it if it dies, so the server stops being
# something to remember. Idle cost is resident memory and essentially no power:
# nothing is computed until a transcription is asked for.
install_service() {
  mkdir -p "$HOME/Library/LaunchAgents" "$CACHE/logs"
  cat >"$PLIST" <<PLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOST</key><string>$HOST</string>
    <key>MODEL</key><string>$MODEL</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$CACHE/logs/asr.log</string>
  <key>StandardErrorPath</key><string>$CACHE/logs/asr.err</string>
</dict>
</plist>
PLIST_END

  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  say "Installed as a login item. Logs: $CACHE/logs/asr.err"
  say "Remove it with: $0 --uninstall-service"
}

uninstall_service() {
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  say "Removed the login item."
}

case "${1:-}" in
  --install-service)
    # Built first, so a failure is reported here rather than into a log file
    # nobody knows to look at.
    "$SCRIPT" --build-only && install_service
    exit 0
    ;;
  --uninstall-service)
    uninstall_service
    exit 0
    ;;
esac

# Checked before anything is fetched or announced, so a missing tool is a line
# telling you what to install rather than a compiler error a few minutes into a
# build you were told had started.
need() {
  command -v "$1" >/dev/null && return 0
  printf '\033[31m==>\033[0m %s is not installed.\n' "$1" >&2
  if command -v brew >/dev/null; then
    printf '    Install it with: brew install %s\n' "${2:-$1}" >&2
  else
    printf '    Install it, or install Homebrew first: https://brew.sh\n' >&2
  fi
  exit 1
}

if [ ! -x "$SERVER" ]; then
  need git
  need cmake
fi

if [ ! -d "$REPO" ]; then
  say "Fetching whisper.cpp into $REPO"
  mkdir -p "$CACHE"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$REPO"
fi

if [ ! -x "$SERVER" ]; then
  say "Building whisper.cpp (once; a few minutes)"
  # Metal on Apple Silicon. The flag is harmless elsewhere — cmake ignores what
  # the platform cannot provide.
  cmake -S "$REPO" -B "$REPO/build" -DGGML_METAL=ON -DCMAKE_BUILD_TYPE=Release
  cmake --build "$REPO/build" -j --config Release
fi

if [ ! -f "$MODEL_FILE" ]; then
  say "Downloading the $MODEL model (once)"
  (cd "$REPO" && bash ./models/download-ggml-model.sh "$MODEL")
fi

# Everything above is the one-time setup; this is where `--install-service`
# stops, having proved the build works before handing it to launchd.
if [ "${1:-}" = "--build-only" ]; then
  say "Ready."
  exit 0
fi

say "Serving $MODEL on http://$HOST:$PORT"
say "Put that address in the extension's 'Speech to text' settings."

# `-l zh` rather than auto-detect: it is always Mandarin, and a chunk that opens
# on music is otherwise a whole five minutes transcribed as the wrong language.
exec "$SERVER" \
  --model "$MODEL_FILE" \
  --host "$HOST" \
  --port "$PORT" \
  --language zh \
  --max-len "$MAX_LEN" \
  --split-on-word \
  "$@"
