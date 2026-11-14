// Extends app.json. A build pointed at a plain-http server (a local test server or emulator run) must allow
// cleartext traffic; every real build uses https and keeps Android's default of blocking it.
module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL ?? '';
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
