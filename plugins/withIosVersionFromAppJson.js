const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withIosVersionFromAppJson(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.CFBundleShortVersionString = config.version;
    config.modResults.CFBundleVersion = config.ios?.buildNumber || '1';
    return config;
  });
};
