#!/usr/bin/env bash
# Runs inside android-emulator-runner once the emulator is up: checks that
# blocked hosts are unreachable, applies the persona's phone settings,
# installs the app and hands the emulator to Claude Code. The agent's output
# goes to results/ (encrypted later), never to the public log.
set -uo pipefail
adb wait-for-device
mkdir -p "results/$PERSONA"
# 1. Blocked hosts must not resolve to a real IP from inside the emulator
for h in $BLOCK_HOSTS; do
  ip=$(adb shell ping -c 1 -W 2 "$h" 2>&1 | head -1 | grep -oE '\(([0-9]{1,3}\.){3}[0-9]{1,3}\)' | tr -d '()')
  case "$ip" in ""|0.0.0.0|127.*) ;; *) echo "$h reachable from the emulator ($ip): aborting"; exit 1 ;; esac
done
# 2. Phone language (the emulator boots in en-US; google_apis images allow adb root)
if [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" != "$LOCALE" ]; then
  adb root >/dev/null 2>&1; sleep 3; adb wait-for-device
  adb shell "setprop persist.sys.locale $LOCALE; setprop ctl.restart zygote"; sleep 10; adb wait-for-device
  for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] && break; sleep 3; done
fi
# 3. App + persona settings. The package inside the APK wins over app_id
# (which may be the iOS bundle id)
AAPT2=$(ls "${ANDROID_HOME:-/usr/local/lib/android/sdk}"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)
PKG=$([ -n "$AAPT2" ] && "$AAPT2" dump packagename app.apk 2>/dev/null | tr -d '\r')
if [ -n "$PKG" ] && [ "$PKG" != "$APP_ID" ]; then echo "Package read from the APK (differs from app_id)"; APP_ID=$PKG; fi
export APP_ID
adb install -r -g app.apk || adb install -r app.apk
adb shell settings put system font_scale "${FONT_SCALE:-1.0}"
[ "${THEME:-light}" = dark ] && adb shell cmd uimode night yes
# High contrast text and color blindness filter. Animations are already off on every emulator (disable-animations in the workflow).
# Color blindness simulation is applied directly to screenshots in scripts/android/screen.py, since SurfaceFlinger's
# display daltonizer does not affect `adb exec-out screencap`.
A11Y=""
if [ "${INCREASE_CONTRAST:-false}" = true ]; then
  adb shell settings put secure high_text_contrast_enabled 1 && A11Y="$A11Y, high contrast text on"
fi
if [ -n "${COLOR_FILTER:-}" ]; then
  export COLOR_FILTER
  A11Y="$A11Y, color filter $COLOR_FILTER (your screenshots show the colors as a person with $COLOR_FILTER sees them: report what can only be told apart by color, not the changed colors themselves)"
fi
if [ -n "${NETWORK:-}" ]; then
  case "$NETWORK" in
    slow)  NET_SPEED="edge"; NET_DELAY="edge" ;;
    flaky) NET_SPEED="edge"; NET_DELAY="500:3000" ;;   # same speed as slow, replies come 0.5 to 3 s late: gsm speed (14.4 kbit/s) left the app as good as offline
    *)     NET_SPEED="";     NET_DELAY="" ;;
  esac
  if [ -n "$NET_SPEED" ]; then
    if adb emu network speed "$NET_SPEED" >/dev/null 2>&1 && adb emu network delay "$NET_DELAY" >/dev/null 2>&1; then
      A11Y="$A11Y, $NETWORK network (the phone is on a $NETWORK connection: report spinners that never stop, double submits or errors with no message, not normal loading time)"
      echo "Network $NETWORK, as the emulator reports it:"
      adb emu network status 2>/dev/null | grep -E 'speed|latency' || true
    else
      adb emu network speed full >/dev/null 2>&1 || true
      adb emu network delay none >/dev/null 2>&1 || true
      echo "Could not set $NETWORK network: persona runs without it"
    fi
  fi
fi
adb emu geo fix "${GEO#*,}" "${GEO%,*}" >/dev/null 2>&1   # longitude first
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
adb logcat -c; sleep 5
# Replays only (replay_traces): the traces kept in that folder for this persona are replayed on this
# phone, several times, with no agent and no model key (scripts/replay_set.py, docs/replay.md)
if [ -n "${REPLAY_TRACES:-}" ]; then
  # repair: "3" or "3, public" (scripts/repair.py): proposals of the agent, checked by ecr repair
  REPAIR_N=$(printf '%s' "${REPAIR:-}" | tr -cd '0-9' | cut -c1); case "${REPAIR:-}" in *public*) export PUBLIC_PROPOSALS=true ;; esac
  [ -n "$REPAIR_N" ] && [ "$REPAIR_N" != 0 ] && { source scripts/llm_env.sh || exit 1; }
  python3 scripts/replay_set.py "$REPLAY_TRACES" --persona "$PERSONA" --ecr .ecr --out "results/$PERSONA" \
    --times "${REPLAY_TIMES:-20}" --closed-group "${REPLAY_CLOSED_GROUP:-}" --apk app.apk --repair "${REPAIR_N:-0}" || true   # never fails the run
  echo "Replays finished, $(find "results/$PERSONA" -type f | wc -l) files"
  exit 0
fi
# 4. Optional screen recording, kept in results/ (encrypted like the rest)
REC=""
if [ "${RECORD_VIDEO:-false}" = true ]; then
  adb shell settings put system show_touches 1
  SZ=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1); W=${SZ%x*}; H=${SZ#*x}
  RW=$((W * 2 / 3 / 16 * 16)); RH=$((H * RW / W / 16 * 16))   # 2/3 size, multiples of 16 for the encoder
  rm -f /tmp/stop-rec
  # screenrecord stops at 180 s: chain files until the agent is done
  ( i=0; opt="--size ${RW}x${RH}"
    while [ ! -f /tmp/stop-rec ] && [ $i -lt 40 ]; do
      i=$((i + 1)); t0=$(date +%s)
      adb shell screenrecord $opt --bit-rate 4000000 --time-limit 180 "/data/local/tmp/rec_$(printf %02d $i).mp4"   # out of the shared storage: the app's gallery would show it
      [ $(($(date +%s) - t0)) -lt 3 ] && opt=""   # size refused: native size
    done ) &
  REC=$!
fi
# 5. The agent: only the listed tools, nothing else (another model API if llm_base_url is set).
# Its adb goes through scripts/android/shim/adb, which notes each tap and runs the real adb:
# scripts/ecr_trace.py turns these notes into a path that replays with no model.
# With map=robot or robot+agent, a robot with no model maps the screens first (scripts/android/crawl.py);
# with robot+agent, an agent is called only when the robot met a form it could not pass.
ECR_REAL_ADB="$(command -v adb)"
export ECR_REAL_ADB
ALLOWED="Bash(adb:*),Bash(python3 scripts/android/screen.py:*),Bash(python3 scripts/android/type.py:*),Bash(sleep:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Read,Write,Edit"
SETTINGS="Device: ${DEVICE}, font scale x${FONT_SCALE:-1.0}, theme ${THEME:-light}${A11Y}, language $LOCALE."
CODE=0
case "${MAP:-none}" in
  robot|robot+agent)
    PATH="$PWD/scripts/android/shim:$PATH" python3 scripts/android/crawl.py "results/$PERSONA" --app-id "$APP_ID" --persona "$PERSONA" || true
    BLOCKED=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1])).get("blocked", [])))' "results/$PERSONA/findings.json" 2>/dev/null || echo 0)
    if [ "$MAP" = robot+agent ] && [ "$BLOCKED" -gt 0 ]; then
      source scripts/llm_env.sh || exit 1
      AGENT_DIR="results/$PERSONA/agent"
      mkdir -p "$AGENT_DIR"
      ECR_ACTION_LOG="$PWD/$AGENT_DIR/actions.tsv"; export ECR_ACTION_LOG; : > "$ECR_ACTION_LOG"
      adb shell am force-stop "$APP_ID"; adb shell pm clear "$APP_ID" >/dev/null   # a clean start, as the trace's launchApp
      adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 6
      PATH="$PWD/scripts/android/shim:$PATH" claude -p "Read briefs/map.md and personas.json. A robot with no model already mapped this app: results/$PERSONA/report.md lists the screens it found and, under 'Forms the robot could not pass', the forms where it stopped. Do not map again what it found: go to each of those forms, find what they need to go further (test data only) and map the screens behind them. Your folder is $AGENT_DIR: take screenshots with python3 scripts/android/screen.py $AGENT_DIR NN, and write report.md and findings.json there. PERSONA=$PERSONA PLATFORM=android APP_ID=$APP_ID. $SETTINGS" \
        --model "${MODEL:-sonnet}" --max-turns 200 --output-format json --allowedTools "$ALLOWED" \
        > results/agent-output.json 2> results/agent-errors.txt
      CODE=$?
      python3 scripts/agent_status.py results/agent-output.json results/agent-errors.txt "$PERSONA" || true
      python3 scripts/ecr_trace.py "$AGENT_DIR" --persona "$PERSONA" --app-id "$APP_ID" --agent-output results/agent-output.json || true
    elif [ "$MAP" = robot+agent ]; then
      echo "map: the robot passed every form, no agent called"
    fi
    python3 scripts/map_stats.py "results/$PERSONA" --agent-output results/agent-output.json || true ;;
  *)
    source scripts/llm_env.sh || exit 1
    ECR_ACTION_LOG="$PWD/results/$PERSONA/actions.tsv"
    export ECR_ACTION_LOG
    : > "$ECR_ACTION_LOG"
    PATH="$PWD/scripts/android/shim:$PATH" claude -p "Read $BRIEF and personas.json, then do the mission until the final report. PERSONA=$PERSONA PLATFORM=android APP_ID=$APP_ID. $SETTINGS Report anything that does not fit this screen (cut text, off-screen buttons, broken layout)." \
      --model "${MODEL:-sonnet}" --max-turns 400 --output-format json --allowedTools "$ALLOWED" \
      > results/agent-output.json 2> results/agent-errors.txt
    CODE=$?
    python3 scripts/agent_status.py results/agent-output.json results/agent-errors.txt "$PERSONA" || true
    python3 scripts/ecr_trace.py "results/$PERSONA" --persona "$PERSONA" --app-id "$APP_ID" --agent-output results/agent-output.json || true   # never fails the run
    # When traces are kept for this persona and app (traces/<app>/<persona>/): did the agent reach their last screen?
    python3 scripts/goal_check.py "results/$PERSONA" --persona "$PERSONA" --app-id "$APP_ID" || true
    ;;
esac
if [ -n "$REC" ]; then
  touch /tmp/stop-rec; adb shell pkill -INT screenrecord; sleep 4; kill "$REC" 2>/dev/null
  mkdir -p "results/$PERSONA/video"
  for f in $(adb shell ls /data/local/tmp/ | tr -d '\r' | grep '^rec_'); do adb pull "/data/local/tmp/$f" "results/$PERSONA/video/" >/dev/null 2>&1; done
fi
# 6. Optional: the path just written is replayed on the same phone, with no model (docs/replay.md)
if [ "${REPLAY_PATH:-false}" = true ]; then
  for d in "results/$PERSONA" "results/$PERSONA"/map-* "results/$PERSONA/agent"; do
    [ -f "$d/trace.json" ] && { python3 scripts/ecr_replay.py "$d" --ecr .ecr --persona "$PERSONA" || true; }   # never fails the run
  done
fi
echo "Agent finished (exit $CODE), $(find "results/$PERSONA" -type f | wc -l) files"
