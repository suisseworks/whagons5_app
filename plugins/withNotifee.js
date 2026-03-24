const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withNotifee(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('notifee')) {
      config.modResults.contents = contents.replace(
        "maven { url 'https://www.jitpack.io' }",
        `maven { url "\$rootDir/../node_modules/@notifee/react-native/android/libs" }\n    maven { url 'https://www.jitpack.io' }`
      );
    }
    return config;
  });
};
