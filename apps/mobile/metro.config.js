// Metro for a package inside the EDUsaas repo: it may import `packages/shared` but must never crawl the web app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, 'packages')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  '@edusaas/shared': path.join(repoRoot, 'packages/shared/src'),
};
module.exports = config;
