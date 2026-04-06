const staticConfig = require('./app.json');

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const androidConfig = staticConfig.expo.android || {};

module.exports = {
  ...staticConfig,
  expo: {
    ...staticConfig.expo,
    android: {
      ...androidConfig,
      ...(googleMapsApiKey
        ? {
            config: {
              ...(androidConfig.config || {}),
              googleMaps: {
                apiKey: googleMapsApiKey,
              },
            },
          }
        : {}),
    },
  },
};
