import React, { useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FaIcon } from './FaIcon';
import { TaskItem, CardDensity } from '../models/types';
import { CustomChip } from './CustomChip';
import { AssigneeAvatars } from './AssigneeAvatars';
import { statusColor, parseWorkspaceIcon, contrastTextColor, priorityColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { fontFamilies, radius, shadows } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Maps flag color names (from backend) to hex values */
const FLAG_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
};

const MAX_VISIBLE_TAGS = 3;

/** Parse markdown checklist from description and return counts + non-checklist text */
function parseChecklist(desc: string): { checked: number; total: number; plainText: string } | null {
  const lines = desc.split(/\n|(?=- \[)/);
  let checked = 0;
  let total = 0;
  const plain: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^-\s*\[x\]/i.test(line)) {
      total++;
      checked++;
    } else if (/^-\s*\[ ?\]/.test(line)) {
      total++;
    } else if (line) {
      plain.push(line);
    }
  }
  if (total === 0) return null;
  return { checked, total, plainText: plain.join(' ').trim() };
}



/** Continuously rotating spinner for "in-progress" status badges */
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

type StatusType = 'working' | 'pending' | 'done' | 'default';

function classifyStatus(name: string): StatusType {
  const s = name.toLowerCase();
  if (s.includes('progress') || s.includes('progreso')) return 'working';
  if (s.includes('revis') || s.includes('review') || s.includes('pending') || s.includes('pendiente') || s.includes('espera') || s.includes('hacer')) return 'pending';
  if (s.includes('complete') || s.includes('completado') || s.includes('done') || s.includes('finalizado') || s.includes('terminado') || s.includes('aprobado') || s.includes('approved')) return 'done';
  return 'default';
}

const STATUS_ICONS: Record<Exclude<StatusType, 'working'>, string> = {
  pending: 'clock-outline',
  done: 'check-bold',
  default: 'circle-outline',
};

interface TaskCardProps {
  task: TaskItem;
  /** @deprecated Use `density` instead */
  compact?: boolean;
  density?: CardDensity;
  onPress: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({ task, compact, density, onPress }) => {
  const effectiveDensity: CardDensity = density ?? (compact ? 'compact' : 'normal');

  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { tagInfoMap, isTaskWorking } = useTasks();
  const { user: authUser } = useAuth();
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const tertiaryText = isDarkMode ? 'rgba(255, 255, 255, 0.45)' : '#9CA3AF';
  const flagHex = task.flagColor ? (FLAG_HEX[task.flagColor] ?? task.flagColor) : null;
  const statusAction = task.statusAction?.trim().toUpperCase() ?? null;
  const statusType = statusAction === 'FINISHED' || statusAction === 'DONE'
    ? 'done'
    : classifyStatus(task.status);
  const working = Boolean(task.id && isTaskWorking(task.id));
  const isCreator = authUser?.id != null && task.createdBy != null && String(authUser.id) === String(task.createdBy);
  const hasSeen = isCreator && task.firstViewedAt != null;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (working) {
      pulseAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      );
      pulseRef.current = loop;
      loop.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(0);
    }
    return () => { pulseRef.current?.stop(); };
  }, [working]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
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

  const isDone = statusAction === 'FINISHED' || statusAction === 'DONE' || statusType === 'done';
  const stColor = statusColor(task.status, task.statusColor);

  const workingOverlayOpacity = working
    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.07] })
    : 0;

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor,
            borderLeftColor: statusColor(task.status, task.statusColor),
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
      {working && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: stColor,
              opacity: workingOverlayOpacity,
              borderTopLeftRadius: 2,
              borderBottomLeftRadius: 2,
              borderTopRightRadius: 12,
              borderBottomRightRadius: 12,
            },
          ]}
        />
      )}
      <View style={isDone ? { opacity: 0.55 } : undefined}>
      {/* Row 1: CatIcon + Title + #ID + Flag + Priority */}
      <View style={styles.titleRow}>
        {task.categoryColor && (() => {
          const catColor = task.categoryColor!;
          const categoryIcon = parseWorkspaceIcon(task.categoryIcon);
          return (
            <View style={[styles.typeIcon, { backgroundColor: hexToRgba(catColor, 0.15) }]}> 
              <FaIcon name={categoryIcon.name} size={12} color={catColor} solid={categoryIcon.solid} brand={categoryIcon.brand} />
            </View>
          );
        })()}
        <Text style={[styles.title, { color: colors.text, textDecorationLine: isDone ? 'line-through' : 'none' }]} numberOfLines={1}>
          {task.title}
        </Text>
        {task.requiresSignature && (
          <Text style={styles.signatureEmoji} accessibilityLabel={t('taskDetail.signatureRequired')}>
            ✍️
          </Text>
        )}
        {task.id && (
          <Text style={[styles.taskId, { color: tertiaryText }]}>#{task.id}</Text>
        )}
        {flagHex && (
          <MaterialCommunityIcons
            name="bookmark"
            size={14}
            color={flagHex}
            style={styles.flagIcon}
          />
        )}
        {task.priority && (
          <Text style={[styles.priorityLabel, { color: task.priorityColor || priorityColor(task.priority) }]}> 
            {task.priority}
          </Text>
        )}
      </View>

      {/* Description preview (only in detailed mode) */}
      {effectiveDensity === 'detailed' && !!task.description && (() => {
        const cl = parseChecklist(task.description!);
        if (cl) {
          return (
            <View style={styles.checklistRow}>
              <MaterialCommunityIcons
                name={cl.checked === cl.total ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                size={14}
                color={cl.checked === cl.total ? '#22C55E' : tertiaryText}
              />
              <Text style={[styles.checklistProgress, { color: cl.checked === cl.total ? '#22C55E' : tertiaryText }]}>
                {cl.checked}/{cl.total}
              </Text>
              {cl.plainText ? (
                <Text style={[styles.descriptionPreview, { color: tertiaryText, marginTop: 0, marginLeft: 4, flex: 1 }]} numberOfLines={1}>
                  {cl.plainText}
                </Text>
              ) : null}
            </View>
          );
        }
        return (
          <Text style={[styles.descriptionPreview, { color: tertiaryText }]} numberOfLines={2}>
            {task.description}
          </Text>
        );
      })()}

      {/* Row 2: Status badge + Location + Approval pill */}
      <View style={styles.metaRow}>
        <CustomChip
          label={task.status}
          color={stColor}
          icon={
            working
              ? <SpinnerIcon color="#FFFFFF" size={12} />
              : <MaterialCommunityIcons name={(STATUS_ICONS[statusType as Exclude<StatusType, 'working'>] ?? STATUS_ICONS.default) as any} size={12} color="#FFFFFF" />
          }
        />
        {task.approvalStatus === 'pending' && (
          <View style={[styles.approvalPill, { backgroundColor: '#FFF7ED' }]}>
            <MaterialCommunityIcons name="clock-outline" size={11} color="#EA580C" />
            <Text style={[styles.approvalPillText, { color: '#EA580C' }]}>{t('component.taskCard.approvalPending')}</Text>
          </View>
        )}
        {task.approvalStatus === 'approved' && (
          <View style={[styles.approvalPill, { backgroundColor: '#F0FDF4' }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={11} color="#16A34A" />
            <Text style={[styles.approvalPillText, { color: '#16A34A' }]}>{t('component.taskCard.approvalApproved')}</Text>
          </View>
        )}
        {task.approvalStatus === 'rejected' && (
          <View style={[styles.approvalPill, { backgroundColor: '#FEF2F2' }]}>
            <MaterialCommunityIcons name="close-circle-outline" size={11} color="#DC2626" />
            <Text style={[styles.approvalPillText, { color: '#DC2626' }]}>{t('component.taskCard.approvalRejected')}</Text>
          </View>
        )}
        {(task.ackTotal ?? 0) > 0 && (
          <View style={[styles.ackBadge, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
            <MaterialCommunityIcons name="eye-check" size={11} color={task.ackDone === task.ackTotal ? '#16A34A' : tertiaryText} />
            <Text style={[styles.ackBadgeText, { color: task.ackDone === task.ackTotal ? '#16A34A' : tertiaryText }]}>
              {task.ackDone}/{task.ackTotal}
            </Text>
          </View>
        )}
        {hasSeen && (
          <View style={[styles.seenBadge, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
            <MaterialIcons name="visibility" size={11} color="#3B82F6" />
          </View>
        )}
        {task.spot !== '' && (
          <View style={styles.spotChip}>
            <MaterialIcons name="place" size={13} color={tertiaryText} />
            <Text style={[styles.spotText, { color: tertiaryText }]} numberOfLines={1}>
              {task.spot}
            </Text>
          </View>
        )}
        {task.formName && (
          <View style={[styles.formIndicator, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
            <MaterialIcons name="description" size={13} color={tertiaryText} />
          </View>
        )}
        {task.approval && !task.approvalStatus && (
          <CustomChip label={task.approval} color="#BBDEFB" textColor="#0D47A1" compact />
        )}
        {!task.approval && !task.approvalStatus && task.sla && (
          <CustomChip
            label={task.sla}
            color={task.sla.toLowerCase().includes('breached') ? '#FFCDD2' : '#B2DFDB'}
            textColor={task.sla.toLowerCase().includes('breached') ? '#B71C1C' : '#004D40'}
            compact
          />
        )}
      </View>

      {/* Row 3: Timestamp + Avatars */}
      <View style={styles.bottomRow}>
        {!!task.createdAt && (
          <View style={styles.dateRow}>
            <MaterialIcons name="access-time" size={13} color={tertiaryText} />
            <Text style={[styles.dateText, { color: tertiaryText }]}>
              {task.createdAt}
            </Text>
          </View>
        )}
        <AssigneeAvatars assignees={task.assignees} maxDisplay={2} />
      </View>

      {/* Row 4: Tags */}
      {task.tags.length > 0 && (() => {
        const visible = task.tags.slice(0, MAX_VISIBLE_TAGS);
        const overflow = task.tags.length - MAX_VISIBLE_TAGS;
        return (
          <View style={styles.tagsRow}>
            {visible.map((tag) => {
              const info = tagInfoMap.get(tag);
              const bgColor = info?.color || '#6B7280';
              const txtColor = contrastTextColor(bgColor);
              const iconClass = info?.icon;
              const { name: iconName, solid, brand } = iconClass
                ? parseWorkspaceIcon(iconClass)
                : { name: 'tag', solid: true, brand: false };
              return (
                <View key={tag} style={[styles.tagChip, { backgroundColor: bgColor }]}>
                  <View style={styles.tagChipIcon}>
                    <FaIcon name={iconName} size={9} color={txtColor} solid={solid} brand={brand} />
                  </View>
                  <Text style={[styles.tagText, { color: txtColor }]}>{tag}</Text>
                </View>
              );
            })}
            {overflow > 0 && (
              <View style={[styles.tagChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }]}>
                <Text style={[styles.tagText, { color: tertiaryText }]}>+{overflow}</Text>
              </View>
            )}
          </View>
        );
      })()}
      </View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 0.5,
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows.subtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  priorityLabel: {
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
    flexShrink: 0,
  },
  flagIcon: {
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontFamily: fontFamilies.bodySemibold,
  },
  signatureEmoji: {
    fontSize: 13,
    flexShrink: 0,
  },
  taskId: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
    flexShrink: 0,
  },
  descriptionPreview: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 17,
    marginTop: 4,
    marginLeft: 36,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 36,
    gap: 4,
  },
  checklistProgress: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  spotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
  },
  spotText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    flexShrink: 1,
    maxWidth: 160,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  formIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagChipIcon: {
    marginRight: 3,
  },
  tagText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
  },
  approvalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  approvalPillText: {
    fontSize: 10.5,
    fontFamily: fontFamilies.bodySemibold,
  },
  ackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ackBadgeText: {
    fontSize: 10.5,
    fontFamily: fontFamilies.bodySemibold,
  },
  seenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: 4,
    flexShrink: 0,
  },
});
