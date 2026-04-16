import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  UIManager,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { StatusOption } from '../context/TaskContext';
import { priorityColor, statusColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ActiveTaskStripProps {
  tasks: TaskItem[];
  doneLabel?: string;
  onDone: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onPress: (task: TaskItem) => void;
  getAllowedStatuses?: (task: TaskItem) => StatusOption[];
  onStatusChange?: (taskId: string, status: StatusOption) => void;
}

function getPriorityTextColor(task: TaskItem, fallbackColor: string): string {
  if (task.priorityColor) return task.priorityColor;
  return task.priority ? priorityColor(task.priority) : fallbackColor;
}

function formatTaskId(task: TaskItem): string | null {
  return task.id ? `#${task.id}` : null;
}

// Row for a single task in the expanded multi-task list
const TaskRow: React.FC<{
  task: TaskItem;
  doneLabel?: string;
  onDone: () => void;
  onRemove: () => void;
  onPress: () => void;
  onCheckPress: () => void;
  primaryColor: string;
  colors: ReturnType<typeof useTheme>['colors'];
  isDarkMode: boolean;
}> = ({ task, doneLabel, onDone, onRemove, onPress, onCheckPress, primaryColor, colors, isDarkMode }) => {
  const sColor = statusColor(task.status, task.statusColor);
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const taskIdLabel = formatTaskId(task);

  return (
    <TouchableOpacity
      style={[
        styles.taskRow,
        {
          backgroundColor: colors.surface,
          borderLeftColor: sColor,
          borderColor,
        },
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.taskRowInfo}>
        <View style={styles.taskRowHeader}>
          <Text style={[styles.taskRowTitle, { color: colors.text }]} numberOfLines={1}>
            {task.title}
          </Text>
          {taskIdLabel ? (
            <Text style={[styles.taskIdText, { color: colors.textSecondary }]} numberOfLines={1}>
              {taskIdLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.taskRowMeta}>
          {task.spot ? (
            <View style={styles.taskRowMetaItem}>
              <MaterialIcons name="location-on" size={12} color={colors.textSecondary} />
              <Text style={[styles.taskRowMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                {task.spot}
              </Text>
            </View>
          ) : null}
          <View style={styles.taskRowMetaItem}>
            <View style={[styles.taskRowStatusDot, { backgroundColor: sColor }]} />
            <Text style={[styles.taskRowMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {task.status}
            </Text>
          </View>
          {task.priority ? (
            <Text style={[
              styles.taskRowMetaText,
              { color: getPriorityTextColor(task, colors.textSecondary) },
            ]}>
              {task.priority}
            </Text>
          ) : null}
        </View>
      </View>
      {doneLabel && (
        <TouchableOpacity
          onPress={onCheckPress}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={styles.taskRowAction}
        >
          <MaterialIcons name="check-circle" size={22} color={primaryColor} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

export const ActiveTaskStrip: React.FC<ActiveTaskStripProps> = ({
  tasks,
  doneLabel,
  onDone,
  onRemove,
  onPress,
  getAllowedStatuses,
  onStatusChange,
}) => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const [statusPickerTask, setStatusPickerTask] = useState<TaskItem | null>(null);
  const [finalStatuses, setFinalStatuses] = useState<StatusOption[]>([]);

  const handleCheckPress = (task: TaskItem) => {
    if (!getAllowedStatuses || !onStatusChange) {
      // Fallback to old behavior
      onDone(task.id!);
      return;
    }
    const allowed = getAllowedStatuses(task);
    const finals = allowed.filter((s) => s.final);
    if (finals.length === 1) {
      // Only one final status — complete directly
      onStatusChange(task.id!, finals[0]);
    } else if (finals.length > 0) {
      setFinalStatuses(finals);
      setStatusPickerTask(task);
    } else {
      // No final statuses found, fallback
      onDone(task.id!);
    }
  };

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  // Auto-collapse when tasks drop to 1 or 0
  useEffect(() => {
    if (tasks.length <= 1 && expanded) {
      setExpanded(false);
      Animated.timing(chevronAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [tasks.length]);

  if (tasks.length === 0) return null;

  const isSingle = tasks.length === 1;

  const singleBorderColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)';
  const singleBgColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#f0f4ff';

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const singleTaskIdLabel = formatTaskId(tasks[0]);

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
        // Single task: full-width banner
        <TouchableOpacity
          style={[
            styles.singleContainer,
            {
              backgroundColor: singleBgColor,
              borderLeftColor: statusColor(tasks[0].status, tasks[0].statusColor),
              borderColor: singleBorderColor,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => onPress(tasks[0])}
        >
          <MaterialIcons name="play-circle-fill" size={22} color={primaryColor} />
          <View style={styles.singleContent}>
            <Text style={[styles.singleLabel, { color: colors.textSecondary }]}>
              {t('component.activeTaskStrip.workingOnLabel')}
            </Text>
            <View style={styles.taskRowHeader}>
              <Text style={[styles.singleTitle, { color: colors.text }]} numberOfLines={1}>
                {tasks[0].title}
              </Text>
              {singleTaskIdLabel ? (
                <Text style={[styles.taskIdText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {singleTaskIdLabel}
                </Text>
              ) : null}
            </View>
            <View style={styles.singleMeta}>
              {tasks[0].spot ? (
                <View style={styles.taskRowMetaItem}>
                  <MaterialIcons name="location-on" size={12} color={colors.textSecondary} />
                  <Text style={[styles.taskRowMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {tasks[0].spot}
                  </Text>
                </View>
              ) : null}
              <View style={styles.taskRowMetaItem}>
                <View style={[styles.taskRowStatusDot, { backgroundColor: statusColor(tasks[0].status, tasks[0].statusColor) }]} />
                <Text style={[styles.taskRowMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {tasks[0].status}
                </Text>
              </View>
              {tasks[0].priority ? (
                <Text style={[
                  styles.taskRowMetaText,
                  { color: getPriorityTextColor(tasks[0], colors.textSecondary) },
                ]}>
                  {tasks[0].priority}
                </Text>
              ) : null}
            </View>
          </View>
          {doneLabel && (
            <TouchableOpacity onPress={() => handleCheckPress(tasks[0])} style={styles.singleDoneButton}>
              <MaterialIcons name="check-circle" size={22} color={primaryColor} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        // Multi-task: collapsible summary bar + vertical list
        <View>
          {/* Summary bar */}
          <TouchableOpacity
            style={[
              styles.summaryBar,
              {
                backgroundColor: singleBgColor,
                borderColor: singleBorderColor,
              },
            ]}
            activeOpacity={0.7}
            onPress={toggleExpanded}
          >
            <MaterialIcons name="play-circle-fill" size={22} color={primaryColor} />
            <View style={styles.summaryContent}>
              <Text style={[styles.singleLabel, { color: colors.textSecondary }]}>
                {t('component.activeTaskStrip.workingOnLabel')}
              </Text>
              <Text style={[styles.singleTitle, { color: colors.text }]}>
                {t('component.activeTaskStrip.multiTaskCount', { count: tasks.length })}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
              <MaterialIcons name="expand-less" size={24} color={colors.textSecondary} />
            </Animated.View>
          </TouchableOpacity>

          {/* Expanded task list */}
          {expanded && (
            <ScrollView
              style={styles.expandedList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  doneLabel={doneLabel}
                  onDone={() => onDone(task.id!)}
                  onRemove={() => onRemove(task.id!)}
                  onPress={() => onPress(task)}
                  onCheckPress={() => handleCheckPress(task)}
                  primaryColor={primaryColor}
                  colors={colors}
                  isDarkMode={isDarkMode}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}
      {/* Status Picker Modal */}
      <Modal
        visible={!!statusPickerTask}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerTask(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusPickerTask(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('component.activeTaskStrip.statusPickerTitle')}
            </Text>
            {finalStatuses.map((status) => (
              <TouchableOpacity
                key={String(status.id)}
                style={[styles.modalStatusRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                onPress={() => {
                  if (statusPickerTask?.id && onStatusChange) {
                    onStatusChange(statusPickerTask.id, status);
                  }
                  setStatusPickerTask(null);
                }}
              >
                <View style={[styles.modalStatusDot, { backgroundColor: status.color || '#999' }]} />
                <Text style={[styles.modalStatusText, { color: colors.text }]}>
                  {status.name}
                </Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setStatusPickerTask(null)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                {t('component.activeTaskStrip.cancelButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  // --- Single task (full-width banner) ---
  singleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderLeftWidth: 3,
    borderTopWidth: 0.5,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 10,
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
  singleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 10,
  },
  singleDoneButton: {
    padding: 6,
  },
  singleCloseButton: {
    padding: 4,
  },
  // --- Multi-task summary bar ---
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderTopWidth: 0.5,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 10,
  },
  summaryContent: {
    flex: 1,
    marginLeft: 8,
  },
  // --- Expanded task list ---
  expandedList: {
    marginTop: 0,
    maxHeight: 220,
  },
  // --- Task row in expanded list ---
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderLeftWidth: 3,
    borderTopWidth: 0.5,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    marginBottom: 0,
  },
  taskRowInfo: {
    flex: 1,
  },
  taskRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskRowTitle: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    lineHeight: 18,
  },
  taskIdText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
  },
  taskRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 10,
  },
  taskRowMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  taskRowMetaText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  taskRowStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskRowAction: {
    padding: 6,
  },
  // --- Status picker modal ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  modalStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  modalStatusText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
});
