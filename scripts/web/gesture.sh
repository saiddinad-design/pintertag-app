#!/usr/bin/env bash
# Gestures in the mobile browser, positions in CSS pixels (as read on screen.py images).
#   gesture.sh tap X Y | long-press X Y | swipe X1 Y1 X2 Y2 | scroll down|up
#   gesture.sh choose X Y "option" (a drop-down list) | back (closes a tab the site opened) | enter | reload | url URL
# Android phones (Chromium) get real touch events. On iPhones (WebKit) scroll and swipe move
# what a finger would move, with script, and a long press is a pointer held down.
set -euo pipefail
case "${1:-}" in
  tap|long-press|swipe|scroll|choose|back|enter|reload|url) ;;
  *) echo "unknown gesture: ${1:-}"; exit 2 ;;
esac
python3 "$(dirname "$0")/browser.py" "$@"
sleep 1
echo "done: $*"
