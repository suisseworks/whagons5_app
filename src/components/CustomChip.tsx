import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';

interface CustomChipProps {
  label: string;
  color: string;
  textColor?: string;
}

export const CustomChip: React.FC<CustomChipProps> = ({
  label,
  color,
  textColor = '#FFFFFF',
}) => {
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
});
