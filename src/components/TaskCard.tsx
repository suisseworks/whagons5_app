import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FaIcon } from './FaIcon';
import { TaskItem, CardDensity } from '../models/types';
import { CustomChip } from './CustomChip';
import { AssigneeAvatars } from './AssigneeAvatars';
import { priorityColor, statusColor, parseWorkspaceIcon, contrastTextColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

/** Maps flag color names (from backend) to hex values */
const FLAG_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
};



interface TaskCardProps {
  task: TaskItem;
  /** @deprecated Use `density` instead */
  compact?: boolean;
  density?: CardDensity;
  onPress: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({ task, compact, density, onPress }) => {
  // Support legacy `compact` prop as fallback
  const effectiveDensity: CardDensity = density ?? (compact ? 'compact' : 'normal');

  const { colors, isDarkMode } = useTheme();
  const { tagInfoMap } = useTasks();
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';
  const mutedText = isDarkMode ? 'rgba(244, 241, 234, 0.7)' : '#999';
  const spotBg = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#f5f5f5';
  const spotTextColor = isDarkMode ? 'rgba(244, 241, 234, 0.7)' : '#666';
  const flagHex = task.flagColor ? (FLAG_HEX[task.flagColor] ?? task.flagColor) : null;

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderLeftColor: statusColor(task.status, task.statusColor),
            borderColor,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
      {/* Line 1: Priority circle + personal flag + Title + ID */}
      <View style={styles.titleRow}>
        <MaterialCommunityIcons
          name="circle"
          size={14}
          color={priorityColor(task.priority)}
          style={styles.flagIcon}
        />
        {flagHex && (
          <MaterialCommunityIcons
            name="bookmark"
            size={14}
            color={flagHex}
            style={styles.flagIcon}
          />
        )}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {task.title}
        </Text>
        {task.id && (
          <Text style={[styles.taskId, { color: mutedText }]}>#{task.id}</Text>
        )}
      </View>

      {/* Description preview (only in detailed mode) */}
      {effectiveDensity === 'detailed' && !!task.description && (
        <Text style={[styles.descriptionPreview, { color: mutedText }]} numberOfLines={2}>
          {task.description}
        </Text>
      )}

      {/* Line 2: Priority + location + form icon + assignee avatars */}
      <View style={styles.infoRow}>
        <CustomChip label={task.status} color={statusColor(task.status, task.statusColor)} compact />
        {task.spot !== '' && (
          <View style={[styles.spotChip, { backgroundColor: spotBg }]}>
            <Text style={[styles.spotText, { color: spotTextColor }]} numberOfLines={1}>
              {task.spot}
            </Text>
          </View>
        )}
        {task.formName && (
          <View style={styles.formIndicator}>
            <MaterialIcons name="description" size={11} color="#6B7280" />
          </View>
        )}
        <View style={styles.avatarPush}>
          <AssigneeAvatars assignees={task.assignees} maxDisplay={3} />
        </View>
      </View>

      {/* Line 3: Timestamp (hidden in compact mode) */}
      {effectiveDensity !== 'compact' && (
        <View style={styles.timestampRow}>
          <MaterialIcons name="schedule" size={11} color={mutedText} />
          <Text style={[styles.timestampText, { color: mutedText }]}>
            {task.createdAt}
          </Text>
          {task.approval && (
            <>
              <View style={{ width: 8 }} />
              <CustomChip label={task.approval} color="#BBDEFB" textColor="#0D47A1" compact />
            </>
          )}
          {!task.approval && task.sla && (
            <>
              <View style={{ width: 8 }} />
              <CustomChip
                label={task.sla}
                color={task.sla.toLowerCase().includes('breached') ? '#FFCDD2' : '#B2DFDB'}
                textColor={task.sla.toLowerCase().includes('breached') ? '#B71C1C' : '#004D40'}
                compact
              />
            </>
          )}
        </View>
      )}

      {/* Line 4: Tags (only in detailed mode, only when tags exist) */}
      {effectiveDensity === 'detailed' && task.tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsRow}
          contentContainerStyle={styles.tagsContent}
        >
          {task.tags.map((tag) => {
            const info = tagInfoMap.get(tag);
            const bgColor = info?.color || '#6B7280';
            const textColor = contrastTextColor(bgColor);
            const iconClass = info?.icon;
            const { name: iconName, solid, brand } = iconClass
              ? parseWorkspaceIcon(iconClass)
              : { name: 'tag', solid: true, brand: false };
            return (
              <View key={tag} style={[styles.tagChip, { backgroundColor: bgColor }]}>
                <View style={styles.tagChipIcon}>
                  <FaIcon name={iconName} size={9} color={textColor} solid={solid} brand={brand} />
                </View>
                <Text style={[styles.tagText, { color: textColor }]}>{tag}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    padding: 10,
    paddingLeft: 12,
    ...shadows.subtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flagIcon: {
    flexShrink: 0,
    marginRight: 2,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
  },
  taskId: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyRegular,
    marginLeft: 6,
    flexShrink: 0,
  },
  descriptionPreview: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 17,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  spotChip: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  spotText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
  },
  formIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarPush: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  timestampText: {
    marginLeft: 4,
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  tagsRow: {
    marginTop: 6,
    flexGrow: 0,
  },
  tagsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagChipIcon: {
    marginRight: 3,
  },
  tagText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
  },
});
