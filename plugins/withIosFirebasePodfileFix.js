const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withIosFirebasePodfileFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes('$RNFirebaseAsStaticFramework = true')) {
        contents = contents.replace(
          'prepare_react_native_project!\n',
          'prepare_react_native_project!\n\n$RNFirebaseAsStaticFramework = true\n'
        );
      }

      const buildSettings = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'

        if ['RNFBApp', 'RNFBAuth', 'RNFBMessaging'].include?(target.name)
          config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        end
      end
    end`;

      if (!contents.includes("CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES")) {
        contents = contents.replace(
          /    react_native_post_install\([\s\S]*?\n    \)\n/,
          (match) => `${match}${buildSettings}\n`
        );
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
