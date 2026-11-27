#!/usr/bin/env bash
# Starts the persona's mobile browser (scripts/web/browser.py) on the site, then hands it
# to Claude Code. The agent's output goes to results/ (encrypted later), never to the public log.
set -uo pipefail
: "${WEB_URL:?web_url missing}" "${PERSONA:?}"
export WEB_PORT="${WEB_PORT:-9333}"
mkdir -p "results/$PERSONA"
LOG="${RUNNER_TEMP:-/tmp}/browser-$PERSONA.log"
python3 scripts/web/browser.py serve > "$LOG" 2>&1 &
BROWSER=$!
# However the script ends: close the browser (writes the video, if any), free the port
stop_browser() {
  python3 scripts/web/browser.py stop >/dev/null 2>&1
  for _ in $(seq 1 30); do kill -0 "$BROWSER" 2>/dev/null || return 0; sleep 1; done
  kill "$BROWSER" 2>/dev/null
}
trap stop_browser EXIT
for _ in $(seq 1 90); do
  python3 scripts/web/browser.py ping >/dev/null 2>&1 && break
  kill -0 "$BROWSER" 2>/dev/null || break
  sleep 1
done
# Our own browser must answer: a busy port stops its start, and the key of another run is refused
if ! kill -0 "$BROWSER" 2>/dev/null || ! python3 scripts/web/browser.py ping >/dev/null 2>&1; then
  echo "The browser did not start (its log stays private: $LOG)"; exit 1
fi
A11Y=""
[ "${REDUCE_MOTION:-false}" = true ] && A11Y="$A11Y, reduce motion on"
[ "${INCREASE_CONTRAST:-false}" = true ] && A11Y="$A11Y, increased contrast on"
if [ -n "${COLOR_FILTER:-}" ]; then
  export COLOR_FILTER
  A11Y="$A11Y, color filter $COLOR_FILTER (your screenshots show the colors as a person with $COLOR_FILTER sees them: report what can only be told apart by color, not the changed colors themselves)"
fi
# The agent (another model API if llm_base_url is set). A website is untrusted input that can talk to the agent
# (page text, console errors), so its file tools stay in this checkout: read here, write only under results/.
# shellcheck disable=SC1091  # sourced from the repo root, like the phone scripts
source scripts/llm_env.sh || exit 1
claude -p "Read $BRIEF and personas.json, then do the mission until the final report. PERSONA=$PERSONA PLATFORM=web URL=$WEB_URL. Device: $DEVICE, theme ${THEME:-light}${A11Y}, language $LOCALE. The site is already open in the phone's browser: use the commands of the brief directly. Report anything that does not fit this screen (cut text, off-screen buttons, content under fixed bars, sideways scrolling, broken layout)." \
  --model "${MODEL:-sonnet}" --max-turns 400 --output-format json \
  --allowedTools "Bash(bash scripts/web/gesture.sh:*),Bash(python3 scripts/web/screen.py:*),Bash(python3 scripts/web/type.py:*),Bash(sleep:*),Bash(ls:*),Bash(mkdir:*),Read(./**),Edit(./results/**)" \
  > results/agent-output.json 2> results/agent-errors.txt
CODE=$?
python3 scripts/agent_status.py results/agent-output.json results/agent-errors.txt "$PERSONA" || true
stop_browser
trap - EXIT
echo "Agent finished (exit $CODE), $(find "results/$PERSONA" -type f | wc -l) files"
