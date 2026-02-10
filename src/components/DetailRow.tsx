import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamilies, fontSizes } from '../config/designTokens';
import { useTheme } from '../context/ThemeContext';

interface DetailRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}

export const DetailRow: React.FC<DetailRowProps> = ({ icon, label, value }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <MaterialIcons name={icon} size={20} color={colors.textSecondary} />
      <View style={styles.textContainer}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textContainer: {
    marginLeft: 12,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  value: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginTop: 2,
  },
});
