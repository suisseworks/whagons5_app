import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { fontFamilies, radius } from '../config/designTokens';

interface CustomChipProps {
  label: string;
  color: string;
  textColor?: string;
  compact?: boolean;
  /** Use a light tinted background with semantic text color instead of solid fill */
  tinted?: boolean;
  /** Optional icon element rendered to the left of the label */
  icon?: React.ReactNode;
  /** If true, apply a subtle pulse animation (e.g. for working/active status) */
  animated?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function darkenHex(hex: string, factor: number = 0.35): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r * (1 - factor));
  const g = Math.round(rgb.g * (1 - factor));
  const b = Math.round(rgb.b * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export const CustomChip: React.FC<CustomChipProps> = ({
  label,
  color,
  textColor,
  compact = false,
  tinted = false,
  icon,
  animated = false,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.55, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulseAnim]);

  const rgb = hexToRgb(color);
  const bgColor = tinted && rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`
    : color;
  const fgColor = tinted
    ? (textColor ?? darkenHex(color))
    : (textColor ?? '#FFFFFF');

  const Container = animated ? Animated.View : View;
  const animStyle = animated ? { opacity: pulseAnim } : undefined;

  return (
    <Container
      style={[
        tinted ? styles.chipTinted : styles.chip,
        { backgroundColor: bgColor },
        compact && (tinted ? styles.chipTintedCompact : styles.chipCompact),
        animStyle,
      ]}
    >
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text
        style={[
          tinted ? styles.labelTinted : styles.label,
          { color: fgColor },
          compact && (tinted ? styles.labelTintedCompact : styles.labelCompact),
        ]}
      >
        {label}
      </Text>
    </Container>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
  },
  iconWrap: {
    marginRight: 5,
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  labelCompact: {
    fontSize: 13,
  },
  chipTinted: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  chipTintedCompact: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  labelTinted: {
    fontSize: 10.5,
    fontFamily: fontFamilies.bodySemibold,
  },
  labelTintedCompact: {
    fontSize: 10.5,
  },
});
