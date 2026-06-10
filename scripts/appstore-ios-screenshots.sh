#!/usr/bin/env bash
set -euo pipefail

DEVICE_NAME="${IOS_SCREENSHOT_DEVICE:-}"
WIDTH="${IOS_SCREENSHOT_WIDTH:-1284}"
HEIGHT="${IOS_SCREENSHOT_HEIGHT:-2778}"
BUNDLE_ID="${APP_BUNDLE_ID:-}"
OUTPUT_ROOT="${IOS_SCREENSHOT_OUTPUT:-screenshots/appstore-ios-${WIDTH}x${HEIGHT}}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${OUTPUT_ROOT}/${TIMESTAMP}"
SCREEN_LIST="${SCREEN_LIST:-login,home,map,rooms,chat,spots,profile,settings}"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required. Install Xcode command line tools first."
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to normalize screenshot dimensions."
  exit 1
fi

if [ -z "$BUNDLE_ID" ]; then
  BUNDLE_ID="$(python3 -c 'import json; print(json.load(open("app.json"))["expo"]["ios"]["bundleIdentifier"])')"
fi

mkdir -p "$OUTPUT_DIR"

if [ -n "$DEVICE_NAME" ]; then
  udid="$(xcrun simctl list devices available | awk -F '[()]' -v name="$DEVICE_NAME" '$0 ~ name { print $2; exit }')"
else
  DEVICE_NAME="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone .*\(Booted\)/ { gsub(/^ +| +$/, "", $1); print $1; exit }')"
  udid="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone .*\(Booted\)/ { print $2; exit }')"

  if [ -z "$udid" ]; then
    DEVICE_NAME="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone .*Pro Max/ { gsub(/^ +| +$/, "", $1); print $1; exit }')"
    udid="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone .*Pro Max/ { print $2; exit }')"
  fi

  if [ -z "$udid" ]; then
    DEVICE_NAME="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone / { gsub(/^ +| +$/, "", $1); print $1; exit }')"
    udid="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone / { print $2; exit }')"
  fi
fi

if [ -z "$udid" ] || [ -z "$DEVICE_NAME" ]; then
  echo "Could not find an available iPhone simulator."
  echo "Set IOS_SCREENSHOT_DEVICE='Exact Simulator Name' and retry."
  xcrun simctl list devices available
  exit 1
fi

echo "Booting $DEVICE_NAME ($udid)..."
xcrun simctl boot "$udid" >/dev/null 2>&1 || true
open -a Simulator --args -CurrentDeviceUDID "$udid"
xcrun simctl bootstatus "$udid" -b >/dev/null

echo "Launching $BUNDLE_ID..."
if ! xcrun simctl launch "$udid" "$BUNDLE_ID" >/dev/null; then
  echo "Could not launch $BUNDLE_ID. Build/install the app first, e.g. make ios-run."
  exit 1
fi

count=0
capture() {
  local raw final label
  label="$1"
  count=$((count + 1))
  raw="$OUTPUT_DIR/$(printf '%02d' "$count")-${label}-raw.png"
  final="$OUTPUT_DIR/$(printf '%02d' "$count")-${label}.png"

  xcrun simctl io "$udid" screenshot "$raw" >/dev/null
  sips -z "$HEIGHT" "$WIDTH" "$raw" --out "$final" >/dev/null
  rm -f "$raw"
  echo "Saved $final"
}

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | sed 's/^-//; s/-$//'
}

echo ""
echo "Output: $OUTPUT_DIR"
echo "Each screenshot is normalized to ${WIDTH}x${HEIGHT}."
echo ""

sleep 2
capture "launch"

echo ""
echo "Login in the simulator now if needed. Press Enter after the post-login app shell is visible."
read -r _
capture "post-login"

IFS=',' read -ra screens <<< "$SCREEN_LIST"
for screen in "${screens[@]}"; do
  label="$(slugify "$screen")"
  [ -z "$label" ] && continue
  echo ""
  echo "Navigate to: $screen"
  echo "Press Enter to capture, type s + Enter to skip, or q + Enter to finish."
  read -r answer
  case "$answer" in
    q|Q) break ;;
    s|S) continue ;;
  esac
  capture "$label"
done

echo ""
echo "Optional extra screenshots: press Enter to capture current screen, or q + Enter to finish."
while true; do
  read -r answer
  case "$answer" in
    q|Q) break ;;
  esac
  echo "Label for this screenshot (blank = extra-$count):"
  read -r extra_label
  if [ -z "$extra_label" ]; then
    extra_label="extra-$count"
  fi
  capture "$(slugify "$extra_label")"
  echo "Press Enter for another, or q + Enter to finish."
done

echo "Done. Screenshots are in: $OUTPUT_DIR"
