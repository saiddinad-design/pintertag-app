#!/usr/bin/env bash
# Runs once the emulator is up (.github/workflows/map-check.yml): installs the demo
# app, lets the robot of scripts/android/crawl.py map it, then replays its paths.
# No model, no secret.
# Usage: bash scripts/android/map_check.sh <path of the .apk> <checkout of explore-compile-replay>
set -uo pipefail
adb wait-for-device
adb install -r -g "$1" || exit 1
adb logcat -c
mkdir -p results/map
ECR_REAL_ADB="$(command -v adb)"
export ECR_REAL_ADB
PATH="$PWD/scripts/android/shim:$PATH" python3 scripts/android/map_check.py results/map --ecr "$2"
