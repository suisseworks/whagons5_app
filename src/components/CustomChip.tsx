import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  /** If true, show a spinning loader icon (e.g. for working/active status) */
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

/** Continuously rotating spinner for "in-progress" / working status */
const SpinnerIcon: React.FC<{ color: string; size?: number }> = React.memo(({ color, size = 12 }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <MaterialCommunityIcons name="loading" size={size} color={color} />
    </Animated.View>
  );
});

export const CustomChip: React.FC<CustomChipProps> = ({
  label,
  color,
  textColor,
  compact = false,
  tinted = false,
  icon,
  animated = false,
}) => {
  const rgb = hexToRgb(color);
  const bgColor = tinted && rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`
    : color;
  const fgColor = tinted
    ? (textColor ?? darkenHex(color))
    : (textColor ?? '#FFFFFF');

  // When animated, show spinning icon (unless a custom icon is already provided)
  const displayIcon = icon ?? (animated ? <SpinnerIcon color={fgColor} size={12} /> : null);

  return (
    <View
      style={[
        tinted ? styles.chipTinted : styles.chip,
        { backgroundColor: bgColor },
        compact && (tinted ? styles.chipTintedCompact : styles.chipCompact),
      ]}
    >
      {displayIcon && <View style={styles.iconWrap}>{displayIcon}</View>}
      <Text
        style={[
          tinted ? styles.labelTinted : styles.label,
          { color: fgColor },
          compact && (tinted ? styles.labelTintedCompact : styles.labelCompact),
        ]}
      >
        {label}
      </Text>
    </View>
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
