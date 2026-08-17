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
#   FAST=1 ./tools/asr-server.sh     # quicker, and the line timings are wrong
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

# Quick, or correctly timed. There is no setting that is both.
#
# A Whisper segment timestamp is not a measurement of anything: segments inside a
# decode window tile contiguously — `t0 = t1` at src/whisper.cpp:7698 — so a
# line's start is simply where the previous line ended, and a ten-second silence
# is spent showing the next line early rather than showing nothing.
#
# `--dtw` is the way out. It aligns each token to the audio through the decoder's
# cross-attention, at 20ms resolution, and the server hands that back per word.
# It costs two things, both of them speed:
#
#   - whisper.cpp turns DTW off when flash attention is on (src/whisper.cpp:3718),
#     so flash attention has to go.
#   - token times are not mapped back through the VAD table the way segment times
#     are (src/whisper.cpp:8086), so voice-activity detection has to go with it —
#     and with it the ~40% of the audio it was skipping.
#
# `FAST=1` takes that trade the other way: VAD and flash attention, no alignment,
# and lines that arrive before the voice does.
FAST="${FAST:-0}"
VAD_MODEL="${VAD_MODEL:-silero-v5.1.2}"

CACHE="${BB_SUBSGEN_CACHE:-$HOME/.cache/bb-subsgen}"
REPO="$CACHE/whisper.cpp"
SERVER="$REPO/build/bin/whisper-server"
MODEL_FILE="$REPO/models/ggml-$MODEL.bin"
VAD_FILE="$REPO/models/ggml-$VAD_MODEL.bin"

# whisper.cpp needs to be told which model's alignment heads to read, and spells
# the answer differently from the model file: `large-v3-turbo-q8_0` is
# `large.v3.turbo`. An unrecognised name is not a warning but `exit 3`, so a
# model this cannot place is served without alignment rather than not at all.
dtw_preset() {
  # Quantisation is a property of the weights, not of the architecture, and the
  # alignment heads are the same either way.
  local plain="${1%%-q[0-9]*}"
  case "$plain" in
    tiny | tiny.en | base | base.en | small | small.en | medium | medium.en) echo "$plain" ;;
    large-v1) echo large.v1 ;;
    large-v2) echo large.v2 ;;
    large-v3) echo large.v3 ;;
    large-v3-turbo) echo large.v3.turbo ;;
    *) echo "" ;;
  esac
}

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
    <key>FAST</key><string>$FAST</string>
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

# Only the fast path uses it, and above the `--build-only` exit below so that
# `--install-service` fetches it while a failure still lands in a terminal rather
# than in a log file nobody knows to look at. A few megabytes, against several
# hundred for the speech model.
if [ "$FAST" != "0" ] && [ ! -f "$VAD_FILE" ] && [ -f "$REPO/models/download-vad-model.sh" ]; then
  say "Downloading the $VAD_MODEL voice-activity model (once)"
  (cd "$REPO" && bash ./models/download-vad-model.sh "$VAD_MODEL")
fi

# Everything above is the one-time setup; this is where `--install-service`
# stops, having proved the build works before handing it to launchd.
if [ "${1:-}" = "--build-only" ]; then
  say "Ready."
  exit 0
fi

# Asked rather than assumed. The clone above is shallow and never updated, so a
# checkout predating either flag is the ordinary case rather than a hypothetical
# — and an unknown flag does not degrade, it stops the server from starting.
# Read into a variable rather than piped into grep: `grep -q` leaves on the first
# match, and under `pipefail` a server killed by the closing pipe would look like
# a server that does not support the flag.
HELP="$("$SERVER" --help 2>&1 || true)"
MODE_ARGS=()

if [ "$FAST" != "0" ]; then
  case "$HELP" in
    *--vad-model*)
      if [ -f "$VAD_FILE" ]; then
        MODE_ARGS=(--vad --vad-model "$VAD_FILE")
        say "Fast: skipping silence, and line timings will run ahead of the voice."
      fi
      ;;
    *) say "This whisper.cpp build has no voice-activity detection; serving without it." ;;
  esac
else
  DTW_PRESET="$(dtw_preset "$MODEL")"
  case "$HELP" in
    *--dtw*)
      if [ -n "$DTW_PRESET" ]; then
        # Flash attention off in the same breath, because whisper.cpp answers
        # `--dtw` with a warning and silence otherwise.
        MODE_ARGS=(--dtw "$DTW_PRESET" --no-flash-attn)
        say "Timing each line by aligning it to the audio ($DTW_PRESET). Slower, and right."
      else
        say "No alignment heads known for $MODEL, so lines will be timed by Whisper's own"
        say "segments — which start where the previous line ended, not where the voice does."
      fi
      ;;
    *)
      say "This whisper.cpp build cannot align tokens to audio; line timings will be rough."
      say "Delete $REPO and run this again to rebuild from a current checkout."
      ;;
  esac
fi

say "Serving $MODEL on http://$HOST:$PORT"
say "Put that address in the extension's 'Speech to text' settings."

# `-l zh` rather than auto-detect: it is always Mandarin, and a chunk that opens
# on music is otherwise a whole five minutes transcribed as the wrong language.
#
# The `[@]+` around the mode arguments is not decoration: launchd runs this with
# /bin/bash, which is 3.2 on macOS, where expanding an empty array under `set -u`
# is an error rather than nothing.
exec "$SERVER" \
  --model "$MODEL_FILE" \
  --host "$HOST" \
  --port "$PORT" \
  --language zh \
  --max-len "$MAX_LEN" \
  --split-on-word \
  ${MODE_ARGS[@]+"${MODE_ARGS[@]}"} \
  "$@"
