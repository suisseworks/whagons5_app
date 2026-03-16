import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';

interface CustomChipProps {
  label: string;
  color: string;
  textColor?: string;
  compact?: boolean;
}

export const CustomChip: React.FC<CustomChipProps> = ({
  label,
  color,
  textColor = '#FFFFFF',
  compact = false,
}) => {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: color },
        compact && styles.chipCompact,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: textColor },
          compact && styles.labelCompact,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  chipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  labelCompact: {
    fontSize: 11,
  },
});
