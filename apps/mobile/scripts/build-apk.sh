#!/usr/bin/env bash
# Builds a signed release APK for direct download.
#
#   EXPO_PUBLIC_API_URL=https://your-school-host bash scripts/build-apk.sh
#
# Signing: set EDUSAAS_KEYSTORE, EDUSAAS_KEYSTORE_PASSWORD, EDUSAAS_KEY_ALIAS (and optionally EDUSAAS_KEY_PASSWORD).
# Without them a local keystore is created once under ~/.edusaas and reused, so updates install over each other.
# Keep that file safe: Android refuses an update signed with a different key.
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://edusaas-tau.vercel.app}"
[ -x "$ANDROID_HOME/build-tools/36.0.0/apksigner" ] || bash scripts/android-sdk.sh

if [ -z "${EDUSAAS_KEYSTORE:-}" ]; then
  export EDUSAAS_KEYSTORE="$HOME/.edusaas/release.keystore"
  export EDUSAAS_KEY_ALIAS=edusaas
  pwfile="$HOME/.edusaas/keystore-password"
  if [ ! -f "$EDUSAAS_KEYSTORE" ]; then
    mkdir -p "$HOME/.edusaas" && chmod 700 "$HOME/.edusaas"
    head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$pwfile" && chmod 600 "$pwfile"
    keytool -genkeypair -noprompt -keystore "$EDUSAAS_KEYSTORE" -alias "$EDUSAAS_KEY_ALIAS" -keyalg RSA -keysize 3072 \
      -validity 10000 -storepass "$(cat "$pwfile")" -dname "CN=EDUsaas, O=EDUsaas, C=PK" >/dev/null
    echo "Created a release keystore at $EDUSAAS_KEYSTORE (back it up)."
  fi
  export EDUSAAS_KEYSTORE_PASSWORD="$(cat "$pwfile")"
fi
export EDUSAAS_KEY_PASSWORD="${EDUSAAS_KEY_PASSWORD:-$EDUSAAS_KEYSTORE_PASSWORD}"

npx expo prebuild --platform android --clean --no-install
cd android
./gradlew --no-daemon assembleRelease \
  -Pandroid.injected.signing.store.file="$EDUSAAS_KEYSTORE" \
  -Pandroid.injected.signing.store.password="$EDUSAAS_KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$EDUSAAS_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$EDUSAAS_KEY_PASSWORD" \
  -PreactNativeArchitectures="${ABIS:-arm64-v8a,armeabi-v7a}"
cd ..
version=$(node -p "require('./app.json').expo.version")
mkdir -p dist
out="dist/edusaas-$version.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$out"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$out" | head -3
ls -lh "$out"
