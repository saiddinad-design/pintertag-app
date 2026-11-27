#!/bin/bash
# Boot simulators in different setups, install Pintertag, walk the first screens, save screenshots + UI trees.
set -u
APP=$(find "$RUNNER_TEMP/dd" -path '*iphonesimulator/App.app' -maxdepth 6 | head -1); echo "APP=$APP"
BID=com.pintertag.app
OUT=$RUNNER_TEMP/shots; mkdir -p "$OUT"
RT=$(xcrun simctl list runtimes -j | python3 -c "import json,sys;r=[x for x in json.load(sys.stdin)['runtimes'] if x['platform']=='iOS' and x['isAvailable']];print(r[-1]['identifier'])")
echo "runtime $RT"
dt(){ xcrun simctl list runtimes -j | python3 -c "import json,sys,re;p,rt=sys.argv[1],sys.argv[2];r=[x for x in json.load(sys.stdin)['runtimes'] if x['identifier']==rt][0];d=[x for x in r['supportedDeviceTypes'] if re.search(p,x['name'])];print(d[-1]['identifier'] if d else '')" "$1" "$RT"; }
# photos for the library
mkdir -p $RUNNER_TEMP/pics; i=0; for f in assets/inspo/brand-*.webp assets/inspo/personal-*.webp; do [ -f "$f" ] || continue; i=$((i+1)); sips -s format jpeg "$f" --out $RUNNER_TEMP/pics/p$i.jpg >/dev/null 2>&1; [ $i -ge 9 ] && break; done; ls $RUNNER_TEMP/pics | head
shot(){ xcrun simctl io "$1" screenshot "$OUT/$2.png" >/dev/null 2>&1; axe describe-ui --udid "$1" > "$OUT/$2.ui.json" 2>/dev/null || true; echo "shot $2"; }
tapl(){ axe tap --label "$2" --udid "$1" >/dev/null 2>&1 && echo "tap '$2' ok" || echo "tap '$2' FAILED"; sleep 2; }
run(){ name=$1; pat=$2; size=$3; look=$4
  T=$(dt "$pat"); [ -z "$T" ] && { echo "no device for $pat"; return; }
  U=$(xcrun simctl create "pt-$name" "$T" "$RT"); xcrun simctl boot "$U"; xcrun simctl bootstatus "$U" -b >/dev/null
  xcrun simctl ui "$U" appearance "$look"; xcrun simctl ui "$U" content_size "$size"
  xcrun simctl addmedia "$U" $RUNNER_TEMP/pics/*.jpg
  xcrun simctl install "$U" "$APP"; xcrun simctl launch "$U" $BID; sleep 7
  shot "$U" "$name-01-launch"
  for l in "Start with your photos" "Skip" "Continue" "Next"; do :; done
  tapl "$U" "Start with your photos"; sleep 3; shot "$U" "$name-02-after-start"
  xcrun simctl terminate "$U" $BID; xcrun simctl launch "$U" $BID; sleep 5; shot "$U" "$name-03-relaunch"
  xcrun simctl shutdown "$U"; }
run se      'iPhone SE'        accessibility-extra-extra-extra-large light
run promax  'iPhone.*Pro Max'  large                                 dark
run ipad    '^iPad \\(A|^iPad Air' large                                light
ls -la "$OUT"
