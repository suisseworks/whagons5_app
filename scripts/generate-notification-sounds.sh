#!/usr/bin/env bash
#
# Generate notification tone audio files for Android and iOS.
# Requires: sox (Sound eXchange) — install via: brew install sox / apt install sox
#
# Output:
#   android/app/src/main/res/raw/tone_<name>.wav
#   ios/WhagonsApp/Sounds/tone_<name>.caf   (placeholder — iOS uses .caf or .aiff)
#
# After running, rebuild the native app.

set -euo pipefail

ANDROID_RAW="$(dirname "$0")/../android/app/src/main/res/raw"
mkdir -p "$ANDROID_RAW"

echo "Generating notification tones..."

# chime — two ascending notes (C5 → E5)
sox -n "$ANDROID_RAW/tone_chime.wav" synth 0.15 sine 523 fade 0 0.15 0.05 : synth 0.2 sine 659 fade 0 0.2 0.08 delay 0.15
echo "  chime ✓"

# bell — single bell strike with long decay
sox -n "$ANDROID_RAW/tone_bell.wav" synth 0.6 sine 880 fade 0 0.6 0.4
echo "  bell ✓"

# ping — short high-pitched blip
sox -n "$ANDROID_RAW/tone_ping.wav" synth 0.08 sine 1800 fade 0 0.08 0.03
echo "  ping ✓"

# alert — urgent two-tone (alternating)
sox -n "$ANDROID_RAW/tone_alert.wav" synth 0.12 sine 880 : synth 0.12 sine 1100 delay 0.14
echo "  alert ✓"

# soft — gentle low hum
sox -n "$ANDROID_RAW/tone_soft.wav" synth 0.4 sine 330 fade 0 0.4 0.3
echo "  soft ✓"

# triple — three quick ascending beeps
sox -n "$ANDROID_RAW/tone_triple.wav" \
  synth 0.06 sine 800 fade 0 0.06 0.02 : \
  synth 0.06 sine 1000 fade 0 0.06 0.02 delay 0.1 : \
  synth 0.06 sine 1200 fade 0 0.06 0.02 delay 0.2
echo "  triple ✓"

echo ""
echo "Done! Files in: $ANDROID_RAW"
echo "Rebuild the app with: cd app && npx expo run:android"
