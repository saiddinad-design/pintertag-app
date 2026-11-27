#!/usr/bin/env bash
# Runs once the emulator is up (.github/workflows/replay-check.yml): installs the
# demo app, lets a scripted tester follow a fixed path with the agent's tools, then
# checks that the trace written from it replays. No model, no secret.
# Usage: bash scripts/android/replay_check.sh <path of the .apk> <checkout of explore-compile-replay>
set -uo pipefail
adb wait-for-device
adb install -r -g "$1" || exit 1
adb shell monkey -p com.example.tinytodo -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
adb logcat -c; sleep 8
mkdir -p results/anna
ECR_REAL_ADB="$(command -v adb)"
ECR_ACTION_LOG="$PWD/results/anna/actions.tsv"
export ECR_REAL_ADB ECR_ACTION_LOG
: > "$ECR_ACTION_LOG"
PATH="$PWD/scripts/android/shim:$PATH" python3 scripts/android/replay_check.py results/anna --ecr "$2"
