import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

interface Props {
  phase: 'starting' | 'recording' | 'processing';
  voiceLevel: number;
  durationMs: number;
  colors: {
    surface: string;
    text: string;
    textSecondary: string;
  };
  primaryColor: string;
  isDarkMode: boolean;
  onPress?: () => void;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const VoiceTaskCaptureOverlay: React.FC<Props> = ({
  phase,
  voiceLevel,
  durationMs,
  colors,
  primaryColor,
  isDarkMode,
  onPress,
}) => {
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [processingDots, setProcessingDots] = useState('');
  const isProcessing = phase === 'processing';

  useEffect(() => {
    if (!isProcessing) {
      pulse.stopAnimation();
      spin.stopAnimation();
      pulse.setValue(1);
      spin.setValue(0);
      setProcessingDots('');
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseLoop.start();
    spinLoop.start();

    const interval = setInterval(() => {
      setProcessingDots((current) => (current.length >= 3 ? '' : `${current}.`));
    }, 350);

    return () => {
      pulseLoop.stop();
      spinLoop.stop();
      clearInterval(interval);
      pulse.setValue(1);
      spin.setValue(0);
    };
  }, [isProcessing, pulse, spin]);

  const label =
    phase === 'processing'
      ? `Creating draft${processingDots}`
      : phase === 'starting'
        ? 'Starting microphone...'
        : 'Speak your task';

  const processingSpin = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.container,
        {
          backgroundColor: isDarkMode ? '#0C100F' : '#FFFFFF',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          {
            backgroundColor: `${primaryColor}18`,
            transform: isProcessing ? [{ scale: pulse }] : undefined,
          },
        ]}
      >
        <Animated.View style={isProcessing ? { transform: [{ rotate: processingSpin }] } : undefined}>
          <MaterialIcons
            name={phase === 'processing' ? 'hourglass-top' : 'keyboard-voice'}
            size={24}
            color={primaryColor}
          />
        </Animated.View>
      </Animated.View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}> 
          {phase === 'recording' ? `${formatDuration(durationMs)} · Tap to send` : 'Hold the plus button and keep speaking'}
        </Text>
      </View>
      <View style={styles.meterWrap}>
        <View
          style={[
            styles.meterTrack,
            { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
          ]}
        >
          <View
            style={[
              styles.meterFill,
              {
                width: `${Math.max(8, Math.round(voiceLevel * 100))}%`,
                backgroundColor: primaryColor,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 112,
    zIndex: 1000,
    elevation: 1000,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.md,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
  },
  meterWrap: {
    width: 70,
  },
  meterTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 8,
  },
});
