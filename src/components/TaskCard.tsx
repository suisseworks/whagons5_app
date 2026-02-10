import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { CustomChip } from './CustomChip';
import { AssigneeAvatars } from './AssigneeAvatars';
import { priorityColor, statusColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

interface TaskCardProps {
  task: TaskItem;
  compact?: boolean;
  onPress: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, compact = false, onPress }) => {
  const { colors, isDarkMode } = useTheme();
  const cardPadding = compact ? 10 : 14;
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';
  const mutedText = isDarkMode ? 'rgba(244, 241, 234, 0.7)' : '#6C746F';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderLeftColor: statusColor(task.status),
          borderColor,
          padding: cardPadding,
          paddingLeft: 12,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {task.title}
        </Text>
        <MaterialIcons name="more-vert" size={22} color={mutedText} />
      </View>

      <View style={[styles.row, { marginTop: compact ? 6 : 8 }]}>
        <CustomChip label={task.priority} color={priorityColor(task.priority)} />
        <View style={{ width: 8 }} />
        <CustomChip label={task.spot} color="#E0E0E0" textColor="#212121" />
        <View style={{ width: 8 }} />
        <AssigneeAvatars assignees={task.assignees} />
      </View>

      {!compact && task.tags.length > 0 && (
        <View style={[styles.row, styles.tagsRow]}>
          {task.tags.slice(0, 4).map((tag, index) => (
            <View key={index} style={{ marginRight: 6 }}>
              <CustomChip label={tag} color="#F5F5F5" textColor="#212121" />
            </View>
          ))}
        </View>
      )}

      {!compact && (
        <View style={[styles.row, styles.footer]}>
          <View style={styles.timeRow}>
            <MaterialIcons name="schedule" size={14} color={mutedText} />
            <Text style={[styles.timeText, { color: mutedText }]}>Created {task.createdAt}</Text>
          </View>
          <View style={styles.spacer} />
          {task.approval && (
            <CustomChip label={task.approval} color="#BBDEFB" textColor="#0D47A1" />
          )}
          {!task.approval && task.sla && (
            <CustomChip
              label={task.sla}
              color={task.sla.toLowerCase().includes('breached') ? '#FFCDD2' : '#B2DFDB'}
              textColor={task.sla.toLowerCase().includes('breached') ? '#B71C1C' : '#004D40'}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    ...shadows.subtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagsRow: {
    marginTop: 10,
  },
  footer: {
    marginTop: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    marginLeft: 6,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  spacer: {
    flex: 1,
  },
});
