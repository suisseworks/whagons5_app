import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { statusColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

interface ActiveTaskBannerProps {
  task: TaskItem;
  onDone: () => void;
  onClear: () => void;
}

export const ActiveTaskBanner: React.FC<ActiveTaskBannerProps> = ({
  task,
  onDone,
  onClear,
}) => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderLeftColor: statusColor(task.status),
          borderColor,
        },
      ]}
    >
      <MaterialIcons name="play-circle-fill" size={24} color={primaryColor} />
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Working on</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {task.title}
        </Text>
      </View>
      <TouchableOpacity onPress={onDone} style={styles.button}>
        <Text style={[styles.buttonText, { color: primaryColor }]}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClear} style={styles.closeButton}>
        <MaterialIcons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows.subtle,
  },
  content: {
    flex: 1,
    marginLeft: 10,
  },
  label: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  title: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  closeButton: {
    padding: 4,
  },
});
