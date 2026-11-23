#!/usr/bin/env bash
# Builds the Google Play upload: a signed Android App Bundle (.aab) for the production server.
#
#   EDUSAAS_KEYSTORE=/path/upload.keystore EDUSAAS_KEYSTORE_PASSWORD=… EDUSAAS_KEY_ALIAS=upload \
#   VERSION_CODE=2 bash scripts/build-store.sh
#
# - Signs with YOUR upload key (required; this script never invents one). Google Play re-signs for devices with the
#   app signing key it keeps, so a lost upload key can be reset through Play Console support, but keep a backup.
# - VERSION_CODE must go up by one for every upload (Play rejects a repeat). Defaults to app.json's versionCode.
# - Never sets EXPO_PUBLIC_DEMO_PASSWORD, so the developer quick-sign-in is not in the store build.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EDUSAAS_KEYSTORE:?Set EDUSAAS_KEYSTORE to your upload keystore}"
: "${EDUSAAS_KEYSTORE_PASSWORD:?Set EDUSAAS_KEYSTORE_PASSWORD}"
: "${EDUSAAS_KEY_ALIAS:?Set EDUSAAS_KEY_ALIAS}"
export EDUSAAS_KEY_PASSWORD="${EDUSAAS_KEY_PASSWORD:-$EDUSAAS_KEYSTORE_PASSWORD}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://edusaas-tau.vercel.app}"
unset EXPO_PUBLIC_DEMO_PASSWORD
case "$EXPO_PUBLIC_API_URL" in https://*) ;; *) echo "Store builds must use an https server"; exit 1 ;; esac
[ -x "$ANDROID_HOME/build-tools/36.0.0/apksigner" ] || bash scripts/android-sdk.sh

version=$(node -p "require('./app.json').expo.version")
code="${VERSION_CODE:-$(node -p "require('./app.json').expo.android.versionCode")}"
echo "Building EDUsaas $version (versionCode $code) for $EXPO_PUBLIC_API_URL"
VERSION_CODE="$code" npx expo prebuild --platform android --clean --no-install
cd android
./gradlew --no-daemon bundleRelease \
  -Pandroid.injected.signing.store.file="$EDUSAAS_KEYSTORE" \
  -Pandroid.injected.signing.store.password="$EDUSAAS_KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$EDUSAAS_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$EDUSAAS_KEY_PASSWORD"
cd ..
mkdir -p dist
out="dist/edusaas-$version-$code.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$out"
# The bundle must not carry the demo password or a plain-http server.
if unzip -p "$out" 'base/assets/index.android.bundle' | grep -q 'Demo-pass'; then echo "Demo password found in bundle"; exit 1; fi
jarsigner -verify "$out" >/dev/null && echo "Signed OK"
ls -lh "$out"
