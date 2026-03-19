import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fontFamilies, fontSizes } from '../config/designTokens';
import { useData } from '../context/DataContext';

export const InitialSyncScreen: React.FC = () => {
  const { syncProgress } = useData();

  const percent = syncProgress?.percent ?? 0;
  const processed = syncProgress?.processed ?? 0;
  const total = syncProgress?.total ?? 0;
  const step = syncProgress?.step ?? '';

  // Pre-record steps take ~5% of the bar (they're fast, <1s usually).
  // The remaining 95% is driven by actual record count.
  const STEP_PERCENT: Record<string, number> = {
    'Initializing': 1,
    'Connecting to server': 2,
    'Checking local data': 3,
    'Downloading data': 4,
    'Preparing sync': 5,
    'Syncing records': 5,
    'Finalizing': 99,
  };

  // Once records start flowing, map 0-100% from server into 5-100% on the bar.
  const effectivePercent = total > 0
    ? 5 + Math.round((percent / 100) * 95)
    : STEP_PERCENT[step] ?? 1;

  // Animated values
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  // Entrance animation
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animate progress bar — always determinate now
  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: effectivePercent,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [effectivePercent]);

  const progressBarWidthInterp = barWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const statusText = `${effectivePercent}%`;

  const detailText =
    total > 0
      ? `${processed.toLocaleString()} of ${total.toLocaleString()} records`
      : step || 'Preparing your workspace';

  return (
    <LinearGradient
      colors={['#121614', '#1A201D', '#1E2926']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      {/* Ambient glows */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoFade,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/whagons-check.png')}
            style={styles.logoImage}
          />
        </Animated.View>

        <Animated.Text style={[styles.title, { opacity: logoFade }]}>
          Whagons
        </Animated.Text>

        {/* Sync status */}
        <Animated.View style={[styles.syncSection, { opacity: contentFade }]}>
          <Text style={styles.syncLabel}>Setting up your data</Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressBarWidthInterp },
              ]}
            />
          </View>

          {/* Status row */}
          <View style={styles.statusRow}>
            <Text style={styles.detailText}>{detailText}</Text>
            <Text style={styles.percentText}>{statusText}</Text>
          </View>
        </Animated.View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(199, 123, 67, 0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(47, 111, 109, 0.1)',
  },
  content: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 48,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoImage: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamilies.displaySemibold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 48,
  },
  syncSection: {
    width: '100%',
    alignItems: 'center',
  },
  syncLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#4CA69C',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 12,
  },
  detailText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  percentText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
