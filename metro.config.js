const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '..');

// Tell Metro to watch the root convex/ directory
config.watchFolders = [path.resolve(monorepoRoot, 'convex')];

// Make sure Metro can resolve modules from both node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
