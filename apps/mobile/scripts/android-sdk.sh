#!/usr/bin/env bash
# Installs the Android SDK pieces a release build needs into $ANDROID_HOME (default ~/android-sdk). Idempotent.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
TOOLS_ZIP=commandlinetools-linux-16111833_latest.zip
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  tmp=$(mktemp -d)
  curl -fsSL "https://dl.google.com/android/repository/$TOOLS_ZIP" -o "$tmp/tools.zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi
SDK="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDK" --licenses >/dev/null || true
"$SDK" --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" ${EXTRA_SDK_PACKAGES:-}
echo "Android SDK ready at $ANDROID_HOME"
