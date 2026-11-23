// Extends app.json. A build pointed at a plain-http server (a local test server or emulator run) must allow
// cleartext traffic; every real build uses https and keeps Android's default of blocking it.
const fs = require('node:fs');

module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL ?? '';
  // Phone push needs the owner's Expo project id (from `eas init`) and Firebase's google-services.json for Android.
  // Neither is a secret to the app, but both belong to the owner's accounts, so they come from the environment.
  const projectId = process.env.EAS_PROJECT_ID;
  if (projectId) config = { ...config, extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } };
  const firebase = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  if (fs.existsSync(firebase)) config = { ...config, android: { ...config.android, googleServicesFile: firebase } };
  // Store builds pass VERSION_CODE (it must rise with every Play upload).
  if (process.env.VERSION_CODE)
    config = { ...config, android: { ...config.android, versionCode: Number(process.env.VERSION_CODE) } };
  if (!api.startsWith('http://')) return config;
  return {
    ...config,
    plugins: config.plugins.map((p) =>
      Array.isArray(p) && p[0] === 'expo-build-properties'
        ? [p[0], { ...p[1], android: { ...p[1].android, usesCleartextTraffic: true } }]
        : p,
    ),
  };
};
