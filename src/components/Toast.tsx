import React, { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

type ToastType = 'success' | 'error' | 'warning';

interface ToastMessage {
  type: ToastType;
  title: string;
  body?: string;
}

export interface ToastRef {
  show: (msg: ToastMessage) => void;
}

const DURATION_VISIBLE = 2800;
const ANIM_IN = 350;
const ANIM_OUT = 300;

const iconMap: Record<ToastType, { name: keyof typeof MaterialIcons.glyphMap; bg: string; fg: string }> = {
  success: { name: 'check-circle', bg: '#E8F5E9', fg: '#2E7D32' },
  error:   { name: 'error',        bg: '#FFEBEE', fg: '#C62828' },
  warning: { name: 'warning',      bg: '#FFF8E1', fg: '#F57F17' },
};

const darkIconMap: Record<ToastType, { bg: string; fg: string }> = {
  success: { bg: '#1B3A1B', fg: '#66BB6A' },
  error:   { bg: '#3E1A1A', fg: '#EF5350' },
  warning: { bg: '#3E3310', fg: '#FFD54F' },
};

export const Toast = forwardRef<ToastRef>((_, ref) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useTheme();

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const [message, setMessage] = React.useState<ToastMessage | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  const hide = useCallback(() => {
    translateY.value = withTiming(-120, { duration: ANIM_OUT, easing: Easing.in(Easing.cubic) });
    opacity.value = withTiming(0, { duration: ANIM_OUT });
  }, []);

  const show = useCallback((msg: ToastMessage) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    translateY.value = -120;
    opacity.value = 0;

    requestAnimationFrame(() => {
      translateY.value = withTiming(0, { duration: ANIM_IN, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: ANIM_IN });
    });

    timeoutRef.current = setTimeout(hide, DURATION_VISIBLE);
  }, [hide]);

  useImperativeHandle(ref, () => ({ show }), [show]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  const variant = iconMap[message.type];
  const darkVariant = darkIconMap[message.type];
  const pillBg = isDarkMode ? darkVariant.bg : variant.bg;
  const pillFg = isDarkMode ? darkVariant.fg : variant.fg;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: insets.top + spacing.xs },
        animStyle,
      ]}
    >
      <View style={[styles.pill, { backgroundColor: isDarkMode ? colors.surface : '#FFFFFF' }]}>
        <View style={[styles.iconCircle, { backgroundColor: pillBg }]}>
          <MaterialIcons name={variant.name} size={18} color={pillFg} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {message.title}
          </Text>
          {!!message.body && (
            <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
              {message.body}
            </Text>
          )}
        </View>
        <View style={[styles.accent, { backgroundColor: pillFg }]} />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
    maxWidth: 400,
    width: '100%',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: fontSizes.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
});
