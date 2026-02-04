import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { CustomChip } from './CustomChip';
import { AssigneeAvatars } from './AssigneeAvatars';
import { priorityColor, statusColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';

interface TaskCardProps {
  task: TaskItem;
  compact?: boolean;
  onPress: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, compact = false, onPress }) => {
  const { colors, isDarkMode } = useTheme();
  const cardPadding = compact ? 10 : 14;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: isDarkMode ? colors.surface : '#FFFFFF',
          borderLeftColor: statusColor(task.status),
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
        <MaterialIcons name="more-vert" size={24} color="#757575" />
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
            <MaterialIcons name="schedule" size={16} color="#757575" />
            <Text style={styles.timeText}>Created {task.createdAt}</Text>
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
    borderRadius: 12,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagsRow: {
    marginTop: 8,
  },
  footer: {
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#616161',
  },
  spacer: {
    flex: 1,
  },
});
