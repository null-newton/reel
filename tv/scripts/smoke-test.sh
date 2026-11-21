#!/usr/bin/env bash
# Emulator smoke test for the Android TV app (run by CI inside android-emulator-runner).
#   bash tv/scripts/smoke-test.sh <debug-x86_64.apk> <out-dir>
# Checks: the app starts Node, serves the UI, starts core with a key, and core can proxy a stream.
set -euo pipefail
APK="$1"
OUT="${2:-smoke}"
mkdir -p "$OUT"
PKG=app.reel.tv

wait_for() { # url, tries
  for _ in $(seq 1 "$2"); do
    if curl -sf -m 3 "$1" > /dev/null; then return 0; fi
    sleep 2
  done
  echo "timed out waiting for $1"; return 1
}

finish() {
  adb exec-out screencap -p > "$OUT/last-screen.png" || true
  adb logcat -d -s ReelNode:V ReelTV:V AndroidRuntime:E chromium:V > "$OUT/logcat.txt" || true
}
trap finish EXIT

adb install -r "$APK"
adb forward tcp:47320 tcp:47320
adb forward tcp:47321 tcp:47321

echo "== first start: setup page"
adb shell am start -W -n "$PKG/.MainActivity"
wait_for "http://127.0.0.1:47320/__reel/health" 120
curl -s "http://127.0.0.1:47320/__reel/health"; echo
curl -s "http://127.0.0.1:47320/" | grep -q "TMDB API key"
sleep 6
adb exec-out screencap -p > "$OUT/1-setup.png"

echo "== with a placeholder key: core starts"
printf '{"tmdbApiKey":"smoke-test-placeholder"}' > /tmp/reel-config.json
adb push /tmp/reel-config.json /data/local/tmp/reel-config.json
adb shell run-as "$PKG" mkdir -p files/data
adb shell run-as "$PKG" cp /data/local/tmp/reel-config.json files/data/config.json
adb shell am force-stop "$PKG"
adb shell am start -W -n "$PKG/.MainActivity"
wait_for "http://127.0.0.1:47321/" 120
curl -s "http://127.0.0.1:47320/__reel/health"; echo
curl -s "http://127.0.0.1:47321/" | head -c 200; echo

echo "== core proxies a public HLS stream on the device"
DATA=$(python3 -c 'import json,urllib.parse;print(urllib.parse.quote(json.dumps({"url":"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"})))')
curl -sf -m 30 "http://127.0.0.1:47321/v1/proxy?data=$DATA" | head -3 | tee "$OUT/proxy.txt" | grep -q "#EXTM3U"

sleep 8
adb exec-out screencap -p > "$OUT/2-library.png"
echo "smoke test passed"
