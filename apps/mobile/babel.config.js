module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { root: ['.'], alias: { '@': './src', '@edusaas/shared': '../../packages/shared/src' } }],
      'react-native-worklets/plugin',
    ],
  };
};
