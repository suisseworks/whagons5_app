import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { statusColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

interface ActiveTaskStripProps {
  tasks: TaskItem[];
  doneLabel?: string;
  onDone: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onPress: (task: TaskItem) => void;
}

// Single task pill (used inside the strip)
const TaskPill: React.FC<{
  task: TaskItem;
  isSingle: boolean;
  doneLabel?: string;
  onDone: () => void;
  onRemove: () => void;
  onPress: () => void;
  primaryColor: string;
  colors: ReturnType<typeof useTheme>['colors'];
  isDarkMode: boolean;
}> = ({ task, isSingle, doneLabel, onDone, onRemove, onPress, primaryColor, colors, isDarkMode }) => {
  const sColor = statusColor(task.status, task.statusColor);
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';

  if (isSingle) {
    // Full-width banner style for a single task
    return (
      <TouchableOpacity
        style={[
          styles.singleContainer,
          {
            backgroundColor: colors.surface,
            borderLeftColor: sColor,
            borderColor,
          },
        ]}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <MaterialIcons name="play-circle-fill" size={22} color={primaryColor} />
        <View style={styles.singleContent}>
          <Text style={[styles.singleLabel, { color: colors.textSecondary }]}>
            Working on
          </Text>
          <Text style={[styles.singleTitle, { color: colors.text }]} numberOfLines={1}>
            {task.title}
          </Text>
        </View>
        {doneLabel && (
          <TouchableOpacity onPress={onDone} style={styles.singleDoneButton}>
            <MaterialIcons name="check-circle" size={20} color={primaryColor} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRemove} style={styles.singleCloseButton}>
          <MaterialIcons name="close" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Compact pill for multi-task view
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        {
          backgroundColor: colors.surface,
          borderColor,
        },
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.pillDot, { backgroundColor: sColor }]} />
      <Text
        style={[styles.pillTitle, { color: colors.text }]}
        numberOfLines={1}
      >
        {task.title}
      </Text>
      {doneLabel && (
        <TouchableOpacity
          onPress={onDone}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={styles.pillAction}
        >
          <MaterialIcons name="check-circle" size={18} color={primaryColor} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={styles.pillAction}
      >
        <MaterialIcons name="close" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

export const ActiveTaskStrip: React.FC<ActiveTaskStripProps> = ({
  tasks,
  doneLabel,
  onDone,
  onRemove,
  onPress,
}) => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  if (tasks.length === 0) return null;

  const isSingle = tasks.length === 1;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      {isSingle ? (
        <TaskPill
          task={tasks[0]}
          isSingle
          doneLabel={doneLabel}
          onDone={() => onDone(tasks[0].id!)}
          onRemove={() => onRemove(tasks[0].id!)}
          onPress={() => onPress(tasks[0])}
          primaryColor={primaryColor}
          colors={colors}
          isDarkMode={isDarkMode}
        />
      ) : (
        <View style={styles.multiWrapper}>
          <View style={styles.multiHeader}>
            <MaterialIcons name="play-circle-fill" size={16} color={primaryColor} />
            <Text style={[styles.multiLabel, { color: colors.textSecondary }]}>
              Working on {tasks.length} tasks
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {tasks.map((task) => (
              <TaskPill
                key={task.id}
                task={task}
                isSingle={false}
                doneLabel={doneLabel}
                onDone={() => onDone(task.id!)}
                onRemove={() => onRemove(task.id!)}
                onPress={() => onPress(task)}
                primaryColor={primaryColor}
                colors={colors}
                isDarkMode={isDarkMode}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  // --- Single task (full-width banner) ---
  singleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 64, // leave room for the FAB that protrudes from the bottom bar
    paddingVertical: 8,
    ...shadows.subtle,
  },
  singleContent: {
    flex: 1,
    marginLeft: 8,
  },
  singleLabel: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    lineHeight: 14,
  },
  singleTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    lineHeight: 18,
  },
  singleDoneButton: {
    padding: 6,
  },
  singleCloseButton: {
    padding: 4,
  },
  // --- Multi-task ---
  multiWrapper: {},
  multiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  multiLabel: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 4,
  },
  scrollContent: {
    gap: 8,
    paddingRight: 56, // leave room for the FAB that protrudes from the bottom bar
  },
  // --- Compact pill ---
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 200,
    ...shadows.subtle,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  pillTitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    flexShrink: 1,
    marginRight: 4,
  },
  pillAction: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
});
