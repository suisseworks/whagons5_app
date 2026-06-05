import React, { useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, ActivityIndicator, type GestureResponderEvent } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { createAudioPlayer } from 'expo-audio';
import { FaIcon } from './FaIcon';
import { TaskItem, CardDensity, TaskCommentVoiceMemo } from '../models/types';
import { CustomChip } from './CustomChip';
import { AssigneeAvatars } from './AssigneeAvatars';
import { statusColor, parseWorkspaceIcon, contrastTextColor, priorityColor } from '../utils/helpers';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../hooks/useTenant';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { fontFamilies, radius, shadows } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../../../convex/_generated/api';
import { getApprovalDecisionNoteSummary, parseApprovalDecisionNote } from '../utils/approvalNotes';

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

const TaskCardVoiceMemoPreview: React.FC<{
  voiceMemo: TaskCommentVoiceMemo;
  taskId?: string | null;
  accentColor: string;
  isDarkMode: boolean;
}> = React.memo(({ voiceMemo, taskId, accentColor, isDarkMode }) => {
  const { tenantId } = useTenant();
  const url = useQuery(
    api.files.getFileUrl,
    tenantId ? { tenantId, storageId: voiceMemo.storageId as any } : 'skip',
  );
  const markVoiceMemoListened = useOfflineMutation(api.taskResources.markVoiceMemoListened, 'taskResources.markVoiceMemoListened');
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackStartRequestedAtRef = useRef<number | null>(null);
  const playbackStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [hasListened, setHasListened] = React.useState(voiceMemo.listened === true);

  const clearPlaybackStartup = useCallback(() => {
    playbackStartRequestedAtRef.current = null;
    if (playbackStartTimerRef.current) {
      clearTimeout(playbackStartTimerRef.current);
      playbackStartTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setHasListened(voiceMemo.listened === true);
  }, [voiceMemo.listened, voiceMemo.storageId]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playbackStartTimerRef.current) clearTimeout(playbackStartTimerRef.current);
      playerRef.current?.pause();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.pause();
    playerRef.current = null;
    clearPlaybackStartup();
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [clearPlaybackStartup, url]);

  const togglePlayback = useCallback(async (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (!url) return;

    if (!playerRef.current) {
      playerRef.current = createAudioPlayer({ uri: url }, { updateInterval: 100 });
      playerRef.current.loop = false;
      intervalRef.current = setInterval(() => {
        const player = playerRef.current;
        if (!player) return;
        const requestedAt = playbackStartRequestedAtRef.current;
        const isStarting = requestedAt != null;
        const currentTime = player.currentTime || 0;

        if (player.playing || (isStarting && currentTime > 0.03)) {
          clearPlaybackStartup();
          setIsPlaying(true);
        } else if (isStarting && Date.now() - requestedAt < 1200) {
          setIsPlaying(true);
        } else {
          clearPlaybackStartup();
          setIsPlaying(false);
        }

        if (player.duration > 0 && currentTime >= player.duration - 0.05 && !isStarting) {
          player.pause();
          setIsPlaying(false);
        }
      }, 100);
    }

    const player = playerRef.current;
    if (player.playing || playbackStartRequestedAtRef.current != null) {
      player.pause();
      clearPlaybackStartup();
      setIsPlaying(false);
      return;
    }
    if (player.duration > 0 && player.currentTime >= player.duration - 0.05) {
      await player.seekTo(0);
    }
    playbackStartRequestedAtRef.current = Date.now();
    if (playbackStartTimerRef.current) clearTimeout(playbackStartTimerRef.current);
    playbackStartTimerRef.current = setTimeout(() => {
      clearPlaybackStartup();
    }, 1200);
    player.play();
    setIsPlaying(true);
    if (!hasListened && tenantId && taskId) {
      setHasListened(true);
      markVoiceMemoListened({ tenantId, taskId: taskId as any, storageId: voiceMemo.storageId as any }).catch(() => {
        setHasListened(false);
      });
    }
  }, [clearPlaybackStartup, hasListened, markVoiceMemoListened, taskId, tenantId, url, voiceMemo.storageId]);

  const activeBarOpacity = isPlaying ? 0.95 : hasListened ? 0.34 : 0.74;
  const previewBackgroundColor = hasListened
    ? (isDarkMode ? 'rgba(52, 211, 153, 0.06)' : 'rgba(22, 163, 74, 0.05)')
    : (isDarkMode ? 'rgba(52, 211, 153, 0.18)' : 'rgba(22, 163, 74, 0.14)');

  return (
    <Pressable
      onPress={togglePlayback}
      onPressIn={(event) => event.stopPropagation()}
      onPressOut={(event) => event.stopPropagation()}
      style={[
        styles.voiceMemoPreview,
        { backgroundColor: previewBackgroundColor },
      ]}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause voice memo' : 'Play voice memo'}
    >
      <View
        style={[styles.voiceMemoPlayButton, { backgroundColor: accentColor }]}
      >
        {url ? (
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={14} color="#FFFFFF" />
        ) : (
          <ActivityIndicator size="small" color="#FFFFFF" />
        )}
        {!hasListened && (
          <View
            style={[
              styles.voiceMemoUnreadDot,
              {
                backgroundColor: isDarkMode ? '#60A5FA' : '#2563EB',
                borderColor: isDarkMode ? '#111827' : '#FFFFFF',
              },
            ]}
          />
        )}
      </View>
      <View style={styles.voiceMemoBars}>
        {Array.from({ length: 32 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.voiceMemoBar,
              {
                height: 5 + ((index * 5) % 13),
                backgroundColor: accentColor,
                opacity: activeBarOpacity,
              },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
});

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
  if (s.includes('complete') || s.includes('completado') || s.includes('done') || s.includes('finalizado') || s.includes('terminado')) return 'done';
  return 'default';
}

function classifyStatusAction(action: string | null): StatusType | null {
  if (action === 'FINISHED' || action === 'DONE') return 'done';
  if (action === 'WORKING' || action === 'IN_PROGRESS') return 'working';
  if (action === 'PAUSED') return 'pending';
  return null;
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
  pressScaleValue?: Animated.Value;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({ task, density, onPress, pressScaleValue }) => {
  const effectiveDensity: CardDensity = density ?? 'normal';

  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { tenantId } = useTenant();
  const { tagInfoMap, isTaskWorking } = useTasks();
  const { user: authUser } = useAuth();
  const actionTaskKind = useQuery(
    api.tasks.getActionTaskKind,
    tenantId && task.convexId ? { tenantId, taskId: task.convexId as any } : 'skip',
  ) as string | null | undefined;
  const activeWorkspaceContext = task.activeWorkspaceContext ?? task.active_workspace_context ?? null;
  const activeWorkspaceContextKind = String(activeWorkspaceContext?.kind ?? '').toLowerCase();
  const effectiveActionTaskKind = activeWorkspaceContextKind === 'acknowledgment'
    ? 'ACKNOWLEDGMENT'
    : activeWorkspaceContextKind === 'approval'
      ? 'STATUS_TRACKING'
      : actionTaskKind;
  const isAckActionTask = effectiveActionTaskKind === 'ACKNOWLEDGMENT';
  const isApprovalActionTask = effectiveActionTaskKind === 'STATUS_TRACKING';
  const approvalActionState = useQuery(
    api.tasks.getShareApprovalActionState,
    tenantId && task.convexId && isApprovalActionTask
      ? { tenantId, taskId: task.convexId as any }
      : 'skip',
  ) as { decision?: 'pending' | 'approved' | 'rejected' | null } | null | undefined;
  const acknowledgmentActionState = useQuery(
    api.tasks.getActionTaskAcknowledgmentState,
    tenantId && task.convexId && isAckActionTask
      ? { tenantId, taskId: task.convexId as any }
      : 'skip',
  ) as { acknowledged?: boolean; allAcknowledged?: boolean } | null | undefined;
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const tertiaryText = isDarkMode ? 'rgba(255, 255, 255, 0.45)' : '#9CA3AF';
  const flagHex = task.flagColor ? (FLAG_HEX[task.flagColor] ?? task.flagColor) : null;
  const statusAction = task.statusAction?.trim().toUpperCase() ?? null;
  const statusType = classifyStatusAction(statusAction) ?? classifyStatus(task.status);
  const actionTask = isAckActionTask || isApprovalActionTask;
  const isAckActionResolved = isAckActionTask && acknowledgmentActionState?.acknowledged === true;
  const approvalActionDecision = isApprovalActionTask ? (task.approvalActionDecision
    ?? task.approval_action_decision
    ?? (approvalActionState?.decision !== 'pending' ? approvalActionState?.decision : null)
    ?? null) : null;
  const working = Boolean(task.id && isTaskWorking(task.id));
  const isCreator = authUser?.id != null && task.createdBy != null && String(authUser.id) === String(task.createdBy);
  const hasSeen = isCreator && task.firstViewedAt != null;
  const commentCount = task.commentCount ?? 0;
  const lastCommentText = task.lastCommentText?.trim() ?? '';
  const approvalCommentPreview = parseApprovalDecisionNote(lastCommentText);
  const lastCommentDisplayText = approvalCommentPreview
    ? getApprovalDecisionNoteSummary(lastCommentText, {
        approved: t('component.taskCard.approvalApproved'),
        rejected: t('component.taskCard.approvalRejected'),
        by: 'by',
      })
    : lastCommentText;
  const hasUnreadComment = task.lastCommentUnread === true;
  const commentAccent = isDarkMode ? '#34D399' : '#16A34A';
  const commentBadgeBg = isDarkMode ? 'rgba(52, 211, 153, 0.14)' : 'rgba(22, 163, 74, 0.12)';
  const approvalState = !isAckActionTask && task.approvalStatus === 'pending'
    ? {
        label: t('component.taskCard.approvalPending'),
        icon: 'clock-outline' as const,
        color: '#EA580C',
        backgroundColor: '#FFF7ED',
      }
    : approvalActionDecision === 'approved'
      ? {
          label: t('component.taskCard.approvalApproved'),
          icon: 'check-circle-outline' as const,
          color: '#16A34A',
          backgroundColor: '#F0FDF4',
        }
      : approvalActionDecision === 'rejected'
        ? {
            label: t('component.taskCard.approvalRejected'),
            icon: 'close-circle-outline' as const,
            color: '#DC2626',
            backgroundColor: '#FEF2F2',
          }
    : task.approvalStatus === 'approved'
      ? {
          label: t('component.taskCard.approvalApproved'),
          icon: 'check-circle-outline' as const,
          color: '#16A34A',
          backgroundColor: '#F0FDF4',
        }
      : task.approvalStatus === 'rejected'
        ? {
            label: t('component.taskCard.approvalRejected'),
            icon: 'close-circle-outline' as const,
            color: '#DC2626',
            backgroundColor: '#FEF2F2',
          }
        : null;

  const internalScaleAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = pressScaleValue ?? internalScaleAnim;
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

  const isDone = statusType === 'done';
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

      {/* Row 2: Status badge + Location + Approval pill */}
      <View style={styles.metaRow}>
        {isAckActionResolved ? (
          <View style={[styles.approvalPill, { backgroundColor: '#F0FDF4' }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={11} color="#16A34A" />
            <Text style={[styles.approvalPillText, { color: '#16A34A' }]}>{t('sharedTask.ackStatusAcknowledged')}</Text>
          </View>
        ) : isAckActionTask ? (
          <View style={[styles.actionPromptPill, styles.ackPromptPill]}>
            <MaterialIcons name="visibility" size={11} color="#047857" />
            <Text style={[styles.actionPromptText, { color: '#047857' }]}>{t('sharedTask.acknowledgeButton')}</Text>
          </View>
        ) : approvalState ? (
          <View style={[styles.approvalPill, { backgroundColor: approvalState.backgroundColor }]}> 
            <MaterialCommunityIcons name={approvalState.icon} size={11} color={approvalState.color} />
            <Text style={[styles.approvalPillText, { color: approvalState.color }]}>{approvalState.label}</Text>
          </View>
        ) : isApprovalActionTask && approvalActionState?.decision !== 'approved' && approvalActionState?.decision !== 'rejected' ? (
          <View style={styles.actionPromptGroup}>
            <View style={[styles.actionPromptPill, styles.approvePromptPill]}>
              <MaterialCommunityIcons name="check-circle-outline" size={11} color="#047857" />
              <Text style={[styles.actionPromptText, { color: '#047857' }]}>{t('sharedTask.approveButton')}</Text>
            </View>
            <View style={[styles.actionPromptPill, styles.rejectPromptPill]}>
              <MaterialCommunityIcons name="close-circle-outline" size={11} color="#DC2626" />
              <Text style={[styles.actionPromptText, { color: '#DC2626' }]}>{t('sharedTask.rejectButton')}</Text>
            </View>
          </View>
        ) : !actionTask ? (
          <CustomChip
            label={task.status}
            color={stColor}
            icon={
              working
                ? <SpinnerIcon color="#FFFFFF" size={12} />
                : <MaterialCommunityIcons name={(STATUS_ICONS[statusType as Exclude<StatusType, 'working'>] ?? STATUS_ICONS.default) as any} size={12} color="#FFFFFF" />
            }
          />
        ) : null}
        {(task.ackTotal ?? 0) > 0 && (
          <View style={[styles.ackBadge, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}> 
            <MaterialCommunityIcons name="eye-check" size={11} color={task.shareStatus === 'acknowledged' || task.ackDone === task.ackTotal ? '#16A34A' : tertiaryText} />
            <Text style={[styles.ackBadgeText, { color: task.shareStatus === 'acknowledged' || task.ackDone === task.ackTotal ? '#16A34A' : tertiaryText }]}> 
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

      {effectiveDensity === 'detailed' && (
        <View style={styles.commentPreviewRow}>
          <View style={[styles.commentBadge, { backgroundColor: hasUnreadComment ? (isDarkMode ? 'rgba(52, 211, 153, 0.22)' : 'rgba(22, 163, 74, 0.16)') : commentBadgeBg }]}> 
            <MaterialCommunityIcons name={hasUnreadComment ? 'comment-alert-outline' : 'comment-outline'} size={13} color={commentAccent} />
            <Text style={[styles.commentCountText, { color: commentAccent, fontFamily: hasUnreadComment ? fontFamilies.bodyBold : fontFamilies.bodySemibold }]}> 
              {commentCount}
            </Text>
            {hasUnreadComment && <View style={[styles.unreadDot, { backgroundColor: commentAccent }]} />}
          </View>
          {!!lastCommentDisplayText && (
            <Text
              style={[
                styles.lastCommentText,
                {
                  color: approvalCommentPreview
                    ? (approvalCommentPreview.decision === 'approved' ? commentAccent : '#DC2626')
                    : hasUnreadComment ? colors.text : tertiaryText,
                  fontFamily: hasUnreadComment ? fontFamilies.bodyBold : fontFamilies.bodySemibold,
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {lastCommentDisplayText}
            </Text>
          )}
          {!lastCommentText && task.lastCommentVoiceMemo && (
            <TaskCardVoiceMemoPreview
              voiceMemo={task.lastCommentVoiceMemo}
              taskId={task.convexId ?? task.taskConvexId ?? null}
              accentColor={commentAccent}
              isDarkMode={isDarkMode}
            />
          )}
        </View>
      )}

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
  commentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginLeft: 36,
    gap: 4,
  },
  commentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  commentCountText: {
    fontSize: 11.5,
    fontFamily: fontFamilies.bodySemibold,
    flexShrink: 0,
  },
  lastCommentText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontFamily: fontFamilies.bodySemibold,
  },
  voiceMemoPreview: {
    flex: 1,
    minWidth: 0,
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 8,
    gap: 7,
  },
  voiceMemoPlayButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceMemoUnreadDot: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  voiceMemoBars: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  voiceMemoBar: {
    width: 2,
    borderRadius: 1,
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
  actionPromptGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionPromptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  approvePromptPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  rejectPromptPill: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  ackPromptPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  actionPromptText: {
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
