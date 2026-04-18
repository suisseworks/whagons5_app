import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Animated,
  PanResponder,
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  TextInput,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import { RootStackParamList, TaskItem, CardDensity } from '../models/types';
import { TaskCard } from '../components/TaskCard';
import { FaIcon } from '../components/FaIcon';
import { ActiveTaskStrip } from '../components/ActiveTaskStrip';
import { AnimatedDrawer, AnimatedDrawerRef } from '../components/AnimatedDrawer';
import { VoiceTaskCaptureOverlay } from '../components/VoiceTaskCaptureOverlay';
import { InitialSyncScreen } from './InitialSyncScreen';
import { TaskFilterSheet } from '../components/TaskFilterSheet';
import { ColabScreen } from './ColabScreen';
import { SchedulingScreen } from './SchedulingScreen';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { parseWorkspaceIcon, DEFAULT_WORKSPACE_COLOR, resolveNotificationNavigation } from '../utils/helpers';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useVoiceTaskCapture } from '../hooks/useVoiceTaskCapture';

// ---------------------------------------------------------------------------
// Surface color tokens (3-level hierarchy)
// ---------------------------------------------------------------------------
const SURFACE = {
  light: { primary: '#FFFFFF', secondary: '#F3F3F3', tertiary: '#EEEEEF' },
  dark:  { primary: '#1A1A1A', secondary: '#2A2A2A', tertiary: '#2E2E2E' },
};

// ---------------------------------------------------------------------------
type MainScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

interface NavItem {
  key: 'tasks' | 'colab' | 'boards' | 'scheduling' | 'cleaning';
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  color?: string;
}

// Nav items are now built inside the component to access t()
const BASE_NAV_KEYS: Array<{ key: NavItem['key']; icon: keyof typeof MaterialIcons.glyphMap; labelKey: string }> = [
  { key: 'tasks', icon: 'checklist', labelKey: 'main.navTasks' },
  { key: 'colab', icon: 'forum', labelKey: 'main.navColab' },
  { key: 'boards', icon: 'people-outline', labelKey: 'main.navBoards' },
];

const SCHEDULING_NAV_KEY = {
  key: 'scheduling' as const,
  icon: 'calendar-month' as keyof typeof MaterialIcons.glyphMap,
  labelKey: 'main.navScheduling',
};

const CLEANING_NAV_KEY = {
  key: 'cleaning' as const,
  icon: 'cleaning-services' as keyof typeof MaterialIcons.glyphMap,
  labelKey: 'main.navCleaning',
};

// ---------------------------------------------------------------------------
// Stable FlatList helpers (module-level to avoid re-creation)
// ---------------------------------------------------------------------------
const keyExtractor = (item: TaskItem, index: number) => item.id || String(index);
const ItemSeparator = () => <View style={{ height: 8 }} />;

// ---------------------------------------------------------------------------
// SwipeableTaskItem – extracted outside MainScreen to avoid re-creation on
// every parent render.  Wrapped in React.memo so it only re-renders when its
// own props change.
// ---------------------------------------------------------------------------
interface SwipeableTaskItemProps {
  item: TaskItem;
  cardDensity: CardDensity;
  isDarkMode: boolean;
  primaryColor: string;
  swipeStatusLabel: string;
  swipeAssignLabel: string;
  onPress: (task: TaskItem) => void;
  onSwipeLeft: (task: TaskItem) => void;
  onSwipeRight: (task: TaskItem) => void;
}

const SwipeableTaskItem = React.memo<SwipeableTaskItemProps>(
  ({ item, cardDensity, isDarkMode, primaryColor, swipeStatusLabel, swipeAssignLabel, onPress, onSwipeLeft, onSwipeRight }) => {
    const translateX = useRef(new Animated.Value(0)).current;

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, gestureState) => {
            return Math.abs(gestureState.dx) > 20;
          },
          onPanResponderMove: (_, gestureState) => {
            translateX.setValue(gestureState.dx);
          },
          onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dx > 100) {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
              onSwipeRight(item);
            } else if (gestureState.dx < -100) {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
              onSwipeLeft(item);
            } else {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }
          },
        }),
      [item, translateX, onSwipeLeft, onSwipeRight],
    );

    const handlePress = useCallback(() => onPress(item), [item, onPress]);

    return (
      <View style={styles.taskItemContainer}>
        {/* Swipe backgrounds */}
        <View
          style={[
            styles.swipeBackground,
            styles.swipeBackgroundRight,
            isDarkMode && { backgroundColor: 'rgba(156, 163, 175, 0.15)' },
          ]}
        >
          <MaterialIcons name="swap-horiz" size={24} color={primaryColor} />
          <Text style={[styles.swipeText, { color: primaryColor }]}>{swipeStatusLabel}</Text>
        </View>
        <View
          style={[
            styles.swipeBackground,
            styles.swipeBackgroundLeft,
            isDarkMode && { backgroundColor: 'rgba(33, 150, 243, 0.15)' },
          ]}
        >
          <Text style={[styles.swipeText, { color: '#2196F3' }]}>{swipeAssignLabel}</Text>
          <MaterialIcons name="person-add" size={24} color="#2196F3" />
        </View>

        <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
          <TaskCard task={item} density={cardDensity} onPress={handlePress} />
        </Animated.View>
      </View>
    );
  },
);

export const MainScreen: React.FC = () => {
  const navigation = useNavigation<MainScreenNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { tenantId } = useTenant();
  const { isAuthenticated } = useConvexAuth();
  const {
    tasks,
    unfilteredTasks,
    totalTaskCount,
    loadMoreTasks,
    hasMoreTasks,
    workingTasks,
    cardDensity,
    selectedWorkspace,
    workspaces,
    workspaceObjects,
    sharedCount,
    finalStatus,
    getAllowedStatuses,
    completeWorkingTask,
    removeWorkingTask,
    changeTaskStatus,
    assignTaskToUser,
    setSelectedWorkspace,
    hasActiveFilters,
    filters,
    setFilters,
    availableStatuses,
  } = useTasks();

  const { data, isSyncing, hasEverSynced, refresh, syncError, isInitialSync } = useData();
  const { pendingCount, isReplaying } = useMutationQueue();
  const convexNotifications = useQuery(
    api.settings.listNotifications,
    isAuthenticated && tenantId ? { tenantId } : 'skip',
  );
  const schedulingPlugin = useQuery(
    api.settings.getPlugin,
    isAuthenticated && tenantId ? { tenantId, slug: 'scheduling' } : 'skip',
  );
  const markBoardNotificationsRead = useMutation(api.boards.markBoardNotificationsRead);

  const isCleaningEnabled = useMemo(() => {
    const plugin = data.plugins.find((p: any) => p.slug === 'cleaning');
    return plugin?.is_enabled === true;
  }, [data.plugins]);

  const isSchedulingEnabled = useMemo(() => {
    const plugin = data.plugins.find((p: any) => p.slug === 'scheduling');
    if (plugin) {
      return plugin.is_enabled === true;
    }
    return (schedulingPlugin as any)?.isEnabled === true || (schedulingPlugin as any)?.is_enabled === true;
  }, [data.plugins, schedulingPlugin]);

  const navItems = useMemo(() => {
    const base: NavItem[] = BASE_NAV_KEYS.map((k) => ({
      key: k.key,
      icon: k.icon,
      label: t(k.labelKey),
    }));
    if (isSchedulingEnabled) {
      base.push({
        key: SCHEDULING_NAV_KEY.key,
        icon: SCHEDULING_NAV_KEY.icon,
        label: t(SCHEDULING_NAV_KEY.labelKey),
      });
    }
    if (isCleaningEnabled) {
      base.push({
        key: CLEANING_NAV_KEY.key,
        icon: CLEANING_NAV_KEY.icon,
        label: t(CLEANING_NAV_KEY.labelKey),
      });
    }
    return base;
  }, [isCleaningEnabled, isSchedulingEnabled, t]);

  // -- Sync pill: show while syncing / offline, briefly after sync, then hide --
  const wasSyncingRef = useRef(false);
  const syncPillOpacity = useRef(new Animated.Value(0)).current;
  const [showSyncPill, setShowSyncPill] = useState(false);
  const syncHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (syncError || pendingCount > 0 || isReplaying) {
      // Offline / pending mutations / replaying – always visible
      if (syncHideTimer.current) clearTimeout(syncHideTimer.current);
      setShowSyncPill(true);
      syncPillOpacity.setValue(1);
    } else if (isSyncing) {
      // Syncing started – show immediately
      if (syncHideTimer.current) clearTimeout(syncHideTimer.current);
      wasSyncingRef.current = true;
      setShowSyncPill(true);
      syncPillOpacity.setValue(1);
    } else if (wasSyncingRef.current) {
      // Sync just finished – keep visible for 2s then fade out
      wasSyncingRef.current = false;
      syncHideTimer.current = setTimeout(() => {
        Animated.timing(syncPillOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setShowSyncPill(false));
      }, 2000);
    }
    return () => {
      if (syncHideTimer.current) clearTimeout(syncHideTimer.current);
    };
  }, [isSyncing, syncError, syncPillOpacity, pendingCount, isReplaying]);

  // Build workspace lookup by name for icon/color access
  const workspaceLookup = useMemo(() => {
    const map = new Map<string, { icon?: string | null; color?: string | null }>();
    for (const ws of workspaceObjects) {
      map.set(ws.name, { icon: ws.icon, color: ws.color });
    }
    return map;
  }, [workspaceObjects]);
  const { unreadCount: notificationCount, lastTapPayload, clearTapPayload } = useNotifications();
  const { user: authUser } = useAuth();
  const boardUnreadCount = useMemo(() => {
    return (convexNotifications ?? []).filter((notification: any) => {
      const data = notification?.data;
      if (notification?.readAt) return false;
      if (!data || typeof data !== 'object') return false;
      if (notification?.type === 'board_message') return true;
      return data.notification_kind === 'board_message' && Boolean(data.board_id);
    }).length;
  }, [convexNotifications]);
  const { phase: voiceCapturePhase, voiceLevel, durationMs, startCapture, stopCapture } = useVoiceTaskCapture();
  const fabHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceLongPressActiveRef = useRef(false);
  const suppressNextFabTapRef = useRef(false);

  // Compute total unread chat message count for the Colab tab badge
  const chatUnreadCount = useMemo(() => {
    const currentUserId = authUser?.id ?? 0;
    if (!currentUserId) return 0;
    const myConvIds = new Set(
      data.conversationParticipants
        .filter((p: any) => Number(p.user_id) === Number(currentUserId))
        .map((p: any) => Number(p.conversation_id)),
    );
    let total = 0;
    for (const conv of data.conversations) {
      if (!myConvIds.has(Number(conv.id))) continue;
      const myParticipant = data.conversationParticipants.find(
        (p: any) =>
          Number(p.conversation_id) === Number(conv.id) &&
          Number(p.user_id) === Number(currentUserId),
      );
      const otherMsgs = data.directMessages.filter(
        (m: any) =>
          Number(m.conversation_id) === Number(conv.id) &&
          Number(m.user_id) !== Number(currentUserId),
      );
      if (!myParticipant || !(myParticipant as any).last_read_at) {
        total += otherMsgs.length;
      } else {
        const lastRead = new Date(
          (myParticipant as any).last_read_at.includes('Z') || (myParticipant as any).last_read_at.includes('+')
            ? (myParticipant as any).last_read_at
            : (myParticipant as any).last_read_at + 'Z',
        ).getTime();
        total += otherMsgs.filter((m: any) => {
          const ts = m.created_at;
          const normalized = ts && (ts.includes('Z') || ts.includes('+')) ? ts : (ts || '') + 'Z';
          return new Date(normalized).getTime() > lastRead;
        }).length;
      }
    }
    return total;
  }, [authUser, data.conversations, data.conversationParticipants, data.directMessages]);

  const [selectedNav, setSelectedNav] = useState(0);
  const drawerRef = useRef<AnimatedDrawerRef>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [statusPickerTask, setStatusPickerTask] = useState<TaskItem | null>(null);
  const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);
  const [assigneePickerTask, setAssigneePickerTask] = useState<TaskItem | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [colabInChat, setColabInChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialConversationId, setInitialConversationId] = useState<string | number | undefined>(undefined);
  // Status chip selection is now driven by filters.statuses from context
  // so it stays in sync with the filter sheet
  const [tasksTab, setTasksTab] = useState<'everything' | 'workspaces' | 'workspace'>('everything');
  const handleDrawerWorkspaceSelect = useCallback((workspaceName: string) => {
    setSelectedNav(0);
    setSelectedWorkspace(workspaceName);
    setTasksTab(workspaceName === 'Everything' ? 'everything' : 'workspace');
  }, [setSelectedWorkspace]);
  const selectedNavKey = navItems[selectedNav]?.key ?? 'tasks';

  // Handle navigation params from notification taps (e.g., switch to Colab tab + open conversation)
  useEffect(() => {
    const params = route.params;
    if (params?.tab != null) {
      setSelectedNav(params.tab);
    }
    if (params?.conversationId != null) {
      setInitialConversationId(params.conversationId);
    }
    // Clear params after consuming them so they don't replay on re-render
    if (params?.tab != null || params?.conversationId != null) {
      navigation.setParams({ tab: undefined, conversationId: undefined } as any);
    }
  }, [route.params]);

  useEffect(() => {
    if (!lastTapPayload) return;

    const target = resolveNotificationNavigation(lastTapPayload as any, unfilteredTasks);
    if (target?.screen === 'TaskDetail') {
      navigation.navigate('TaskDetail', target.params);
      clearTapPayload();
      return;
    }
    if (target?.screen === 'BoardDetail') {
      navigation.navigate('BoardDetail', target.params);
      clearTapPayload();
      return;
    }
    if (target?.screen === 'Main') {
      setSelectedNav(1);
      setInitialConversationId(target.params.conversationId);
      clearTapPayload();
    }
  }, [clearTapPayload, lastTapPayload, navigation, unfilteredTasks]);

  // Handle back navigation when inside a workspace or workspaces list.
  // useFocusEffect ensures the handler is only active when MainScreen is the
  // focused screen — so it won't swallow back presses meant for TaskDetail etc.
  useFocusEffect(
    useCallback(() => {
      if (tasksTab === 'everything') return;

      const handler = () => {
        if (tasksTab === 'workspace') {
          setTasksTab('workspaces');
          setSelectedWorkspace('Everything');
        } else if (tasksTab === 'workspaces') {
          setTasksTab('everything');
          setSelectedWorkspace('Everything');
        }
        return true; // prevent default back behaviour
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => sub.remove();
    }, [tasksTab, setSelectedWorkspace]),
  );

  useEffect(() => {
    if (selectedNav >= navItems.length) {
      setSelectedNav(0);
    }
  }, [navItems.length, selectedNav]);

  useEffect(() => {
    if (selectedNavKey !== 'boards' || !tenantId || boardUnreadCount === 0) return;
    markBoardNotificationsRead({ tenantId }).catch(() => {});
  }, [selectedNavKey, tenantId, boardUnreadCount, markBoardNotificationsRead]);

  const surfaces = isDarkMode ? SURFACE.dark : SURFACE.light;

  const selectedWorkspaceConvexId = useMemo(() => {
    if (selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared') {
      return undefined;
    }
    const workspace = workspaceObjects.find((item) => item.name === selectedWorkspace);
    return workspace ? String((workspace as any)._id ?? '') || undefined : undefined;
  }, [selectedWorkspace, workspaceObjects]);

  const handleCreateTask = useCallback(() => {
    if (suppressNextFabTapRef.current) {
      suppressNextFabTapRef.current = false;
      return;
    }
    navigation.navigate('CreateTask');
  }, [navigation]);

  const handleVoiceCapturePressIn = useCallback(() => {
    if (fabHoldTimerRef.current) {
      clearTimeout(fabHoldTimerRef.current);
    }
    fabHoldTimerRef.current = setTimeout(() => {
      voiceLongPressActiveRef.current = true;
      suppressNextFabTapRef.current = true;
      void startCapture(selectedWorkspaceConvexId);
    }, 180);
  }, [selectedWorkspaceConvexId, startCapture]);

  const handleVoiceCapturePressOut = useCallback(() => {
    if (fabHoldTimerRef.current) {
      clearTimeout(fabHoldTimerRef.current);
      fabHoldTimerRef.current = null;
    }
    if (!voiceLongPressActiveRef.current) return;
    voiceLongPressActiveRef.current = false;
    void stopCapture('manual');
  }, [stopCapture]);

  useEffect(() => {
    return () => {
      if (fabHoldTimerRef.current) {
        clearTimeout(fabHoldTimerRef.current);
      }
    };
  }, []);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const statusChips = useMemo(() => {
    // Use unfilteredTasks (workspace-filtered, before status/priority/etc filters)
    // so counts are always correct regardless of active filters
    const source = unfilteredTasks;
    const counts = new Map<string, { count: number; color: string }>();
    for (const t of source) {
      const key = t.status.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, color: t.statusColor || '#9CA3AF' });
      }
    }
    const chips: { label: string; statusKey: string; color: string; count: number }[] = [
      { label: t('common.all'), statusKey: '', color: isDarkMode ? '#E0E0E0' : '#1A1A1A', count: source.length },
    ];
    const seen = new Set<string>();
    for (const s of availableStatuses) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      chips.push({
        label: s.name,
        statusKey: key,
        color: s.color || '#9CA3AF',
        count: entry?.count ?? 0,
      });
    }
    return chips;
  }, [unfilteredTasks, availableStatuses, isDarkMode, t]);

  // Client-side search filter (status filtering is already handled by context filters)
  const displayedTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    // Support searching by task ID (e.g. "123" or "#123")
    const idTerm = q.startsWith('#') ? q.slice(1) : q;
    const isIdSearch = /^\d+$/.test(idTerm);
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.spot.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.assignees.some((a) => a.name.toLowerCase().includes(q)) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        (isIdSearch && t.id != null && String(t.id) === idTerm),
    );
  }, [tasks, searchQuery]);


  const handleTaskPress = useCallback(
    (task: TaskItem) => {
      if (selectedWorkspace === 'Shared' && (task.approvalStatus || task.shareId)) {
        navigation.navigate('SharedTaskDetail', { task });
      } else {
        navigation.navigate('TaskDetail', { task });
      }
    },
    [navigation, selectedWorkspace],
  );

  // Build workspace-scoped user set: IDs of users assigned to tasks in the selected workspace
  const workspaceUserIds = useMemo(() => {
    if (selectedWorkspace === 'Everything') return null; // show all users
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    if (!ws) return null;
    const wsIdStr = String(ws.id);
    const wsTaskIds = new Set(
      data.tasks.filter((t) => String((t as any).workspace_id) === wsIdStr).map((t) => t.id),
    );
    // Collect user IDs assigned to those tasks
    const userIds = new Set<string | number>();
    for (const tu of data.taskUsers) {
      if (wsTaskIds.has(tu.task_id)) userIds.add(tu.user_id);
    }
    // Always include the current user so they can self-assign
    const currentUserId = authUser?.id;
    if (currentUserId) userIds.add(currentUserId);
    return userIds;
  }, [selectedWorkspace, data.workspaces, data.tasks, data.taskUsers, authUser]);

  // Build sorted user list: workspace-filtered, current user first, then alphabetical
  const sortedUsers = useMemo(() => {
    const currentUserId = authUser?.id ?? 0;
    let users = data.users;
    if (workspaceUserIds) {
      users = users.filter((u) => workspaceUserIds.has(u.id));
    }
    // Apply search filter
    if (assigneeSearch.trim()) {
      const q = assigneeSearch.trim().toLowerCase();
      users = users.filter((u) => u.name.toLowerCase().includes(q));
    }
    return [...users].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [data.users, authUser, workspaceUserIds, assigneeSearch]);

  // Filter working tasks to the current workspace
  const workspaceFilteredWorkingTasks = useMemo(() => {
    if (selectedWorkspace === 'Everything') return workingTasks;
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    if (!ws) return workingTasks;
    const wsIdStr = String(ws.id);
    const taskWsMap = new Map<number, string>();
    for (const t of data.tasks) {
      taskWsMap.set(t.id as number, String((t as any).workspace_id));
    }
    return workingTasks.filter((wt) => {
      const wtId = Number(wt.id);
      return taskWsMap.get(wtId) === wsIdStr;
    });
  }, [workingTasks, selectedWorkspace, data.workspaces, data.tasks]);

  const handleSwipeLeft = useCallback(
    (task: TaskItem) => {
      setAssigneePickerTask(task);
      setAssigneePickerVisible(true);
    },
    [],
  );

  const handleAssigneeSelect = useCallback(
    (user: { id: string | number; name: string }) => {
      if (assigneePickerTask?.id) {
        if (assigneePickerTask.assignees.some((a) => a.name === user.name)) {
          Alert.alert(t('main.alreadyAssignedTitle'), t('main.alreadyAssignedMessage', { name: user.name }));
        } else {
          assignTaskToUser(assigneePickerTask.id, Number(user.id), user.name);
        }
      }
      setAssigneePickerVisible(false);
      setAssigneePickerTask(null);
      setAssigneeSearch('');
    },
    [assigneePickerTask, assignTaskToUser, t],
  );

  const handleSwipeRight = useCallback(
    (task: TaskItem) => {
      setStatusPickerTask(task);
      setStatusPickerVisible(true);
    },
    [],
  );

  const handleStatusSelect = useCallback(
    (status: { id: number; name: string; color: string | null }) => {
      if (statusPickerTask?.id) {
        changeTaskStatus(statusPickerTask.id, status);
      }
      setStatusPickerVisible(false);
      setStatusPickerTask(null);
    },
    [statusPickerTask, changeTaskStatus],
  );

  const swipeStatusLabel = t('main.swipeStatus');
  const swipeAssignLabel = t('main.swipeAssign');
  const renderTaskItem = useCallback(
    ({ item }: { item: TaskItem }) => (
      <SwipeableTaskItem
        item={item}
        cardDensity={cardDensity}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
        swipeStatusLabel={swipeStatusLabel}
        swipeAssignLabel={swipeAssignLabel}
        onPress={handleTaskPress}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
      />
    ),
    [cardDensity, isDarkMode, primaryColor, swipeStatusLabel, swipeAssignLabel, handleTaskPress, handleSwipeLeft, handleSwipeRight],
  );

  const handleChipPress = useCallback((statusKey: string) => {
    if (!statusKey) {
      // "All" chip pressed — clear status filter
      setFilters({ ...filters, statuses: [] });
      return;
    }
    // Find the original-case status name from availableStatuses
    const statusName = availableStatuses.find(
      (s) => s.name.toLowerCase() === statusKey,
    )?.name ?? statusKey;
    // Toggle: if already the only selected status, clear; otherwise select it
    const isAlreadySelected =
      filters.statuses.length === 1 && filters.statuses[0].toLowerCase() === statusKey;
    setFilters({
      ...filters,
      statuses: isAlreadySelected ? [] : [statusName],
    });
  }, [filters, setFilters, availableStatuses]);

  const renderListHeader = () => {
    const showChips = unfilteredTasks.length > 0 && statusChips.length > 1;
    if (!showSyncPill && !showChips) return null;

    const baseSyncLabel = syncError
      ? t('main.syncOffline')
      : isReplaying
        ? t('main.syncSyncingChanges')
        : isSyncing ? t('main.syncSyncing') : t('main.syncUpdated');
    const syncLabel = pendingCount > 0 && !isReplaying
      ? `${baseSyncLabel} · ${pendingCount} pending`
      : baseSyncLabel;
    const syncColor = syncError
      ? '#EF9F27'
      : (isReplaying || pendingCount > 0)
        ? '#F59E0B'
        : isSyncing ? primaryColor : colors.textSecondary;

    return (
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        {/* Status filter chips */}
        {showChips && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipStrip}
            contentContainerStyle={styles.chipStripContent}
          >
            {statusChips.map((chip) => {
              const isActive = chip.statusKey === ''
                ? filters.statuses.length === 0
                : filters.statuses.some((s) => s.toLowerCase() === chip.statusKey);
              return (
                <TouchableOpacity
                  key={chip.statusKey || '_all'}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive
                        ? (isDarkMode ? surfaces.primary : '#FFFFFF')
                        : (isDarkMode ? surfaces.secondary : '#F5F5F7'),
                      borderColor: isActive
                        ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')
                        : 'transparent',
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleChipPress(chip.statusKey)}
                >
                  <View style={[styles.chipDot, { backgroundColor: chip.color }]} />
                  <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>{chip.label}</Text>
                  <Text style={[styles.chipCount, { color: chip.count === 0 ? (isDarkMode ? 'rgba(255,255,255,0.3)' : '#BDBDBD') : colors.text }]}>
                    {chip.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Sync Pill */}
        {showSyncPill && (
          <Animated.View style={[styles.listHeader, { opacity: syncPillOpacity }]}>
            <View
              style={[
                styles.syncPill,
                {
                  borderColor: `${syncColor}40`,
                  backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                },
              ]}
            >
              <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
              <Text style={[styles.syncText, { color: syncColor }]}>{syncLabel}</Text>
            </View>
          </Animated.View>
        )}
      </View>
    );
  };

  const handleColabChatViewChange = useCallback((isInChat: boolean) => {
    setColabInChat(isInChat);
  }, []);

  // Filter boards: exclude soft-deleted
  const boards = useMemo(() => {
    return data.boards.filter(b => !b.deleted_at);
  }, [data.boards]);

  const renderBoardsList = () => {
    return (
      <FlatList
        data={boards}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.colabListContent}
        ListHeaderComponent={
          <View style={styles.colabListHeader}>
            <Text style={[styles.listTitle, { color: colors.text }]}>{t('main.boardsTitle')}</Text>
            <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
              {boards.length === 1 ? t('main.boardCount', { count: boards.length }) : t('main.boardCountPlural', { count: boards.length })}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          const messageCount = data.boardMessages.filter(m => m.board_id === item.id && !m.deleted_at).length;
          const memberCount = data.boardMembers.filter(m => m.board_id === item.id).length;

          return (
            <TouchableOpacity
              style={[
                styles.colabSpaceItem,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('BoardDetail', { boardId: item.id })}
            >
              <View
                style={[
                  styles.colabSpaceIcon,
                  { backgroundColor: item.visibility === 'public' ? `${primaryColor}18` : `#8B5CF618` },
                ]}
              >
                <MaterialIcons
                  name={item.visibility === 'public' ? 'campaign' : 'lock'}
                  size={22}
                  color={item.visibility === 'public' ? primaryColor : '#8B5CF6'}
                />
              </View>
              <View style={styles.colabSpaceInfo}>
                <Text style={[styles.colabSpaceName, { color: colors.text }]}>{item.name}</Text>
                {item.description ? (
                  <Text
                    style={[styles.colabSpaceDesc, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.description}
                  </Text>
                ) : (
                  <Text style={[styles.colabSpaceDesc, { color: colors.textSecondary }]}>
                    {memberCount === 1 ? t('main.memberCount', { count: memberCount }) : t('main.memberCountPlural', { count: memberCount })} · {messageCount === 1 ? t('main.postCount', { count: messageCount }) : t('main.postCountPlural', { count: messageCount })}
                  </Text>
                )}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.placeholderContainer}>
            <MaterialIcons name="campaign" size={56} color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'} />
            <Text style={[styles.placeholderTitle, { color: colors.text, marginTop: 16 }]}>
              {t('main.noBoardsYet')}
            </Text>
            <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
              {t('main.boardsWillAppear')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
      />
    );
  };

  const renderTasksEmpty = () => {
    // First sync in progress – no data has arrived yet
    if (!hasEverSynced || (isSyncing && tasks.length === 0)) {
      return (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : `${primaryColor}18` },
            ]}
          >
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('main.syncingYourTasks')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('main.syncFirstLaunch')}
          </Text>
        </View>
      );
    }

    // Search yielded no results
    if (searchQuery.trim().length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0F0F2' },
            ]}
          >
            <MaterialIcons name="search-off" size={40} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('main.noResults')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('main.noTasksMatchSearch', { query: searchQuery.trim() })}
          </Text>
        </View>
      );
    }

    // Filters hiding all tasks
    if (hasActiveFilters && unfilteredTasks.length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0F0F2' },
            ]}
          >
            <MaterialIcons name="filter-list-off" size={40} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('main.noMatchingTasks')}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('main.tryDifferentStatus')}
          </Text>
          <TouchableOpacity
            style={[
              styles.clearFiltersButton,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F0F0F2',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              },
            ]}
            activeOpacity={0.7}
            onPress={() => setFilters({ ...filters, statuses: [] })}
          >
            <MaterialIcons name="filter-list-off" size={16} color={colors.textSecondary} />
            <Text style={[styles.clearFiltersText, { color: colors.text }]}>{t('main.clearFilters')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Sync complete, genuinely no tasks
    return (
      <View style={styles.emptyContainer}>
        <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0F0F2' },
            ]}
          >
            <MaterialIcons name="task-alt" size={40} color={isDarkMode ? 'rgba(255,255,255,0.18)' : '#D1D5DB'} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('main.noTasksYet')}</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {t('main.tasksWillAppear')}
        </Text>
      </View>
    );
  };

  // Task counts per workspace for the workspace list
  const taskCountsByWorkspace = useMemo(() => {
    const counts = new Map<string | number, number>();
    for (const t of data.tasks) {
      const wsId = (t as any).workspace_id;
      if (wsId != null) {
        counts.set(wsId, (counts.get(wsId) || 0) + 1);
      }
    }
    return counts;
  }, [data.tasks]);

  const renderWorkspacesList = () => {
    const wsItems = workspaceObjects;
    return (
      <FlatList
        data={wsItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.wsListContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          /* Shared with me — permanent item at top */
          <TouchableOpacity
            style={[
              styles.workspaceListItem,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                marginBottom: wsItems.length > 0 ? 8 : 0,
              },
            ]}
            activeOpacity={0.7}
            onPress={() => {
              setSelectedWorkspace('Shared');
              setTasksTab('workspace');
            }}
          >
            <View style={[styles.workspaceListIcon, { backgroundColor: '#8B5CF6' }]}>
              <MaterialIcons name="inbox" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.workspaceListName, { color: colors.text }]} numberOfLines={1}>
                {t('main.sharedWithMe')}
              </Text>
              {sharedCount > 0 && (
                <Text style={[styles.workspaceListType, { color: colors.textSecondary }]}>
                  {sharedCount === 1 ? t('main.taskCount', { count: sharedCount }) : t('main.taskCountPlural', { count: sharedCount })}
                </Text>
              )}
            </View>
            {sharedCount > 0 && (
              <View style={[styles.sharedCountBadge, { backgroundColor: '#8B5CF6' }]}>
                <Text style={styles.sharedCountBadgeText}>{sharedCount > 99 ? '99+' : sharedCount}</Text>
              </View>
            )}
            <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={[styles.placeholderContainer, { paddingTop: 40 }]}>
            <MaterialIcons name="workspaces" size={56} color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'} />
            <Text style={[styles.placeholderTitle, { color: colors.text, marginTop: 16 }]}>{t('main.noWorkspaces')}</Text>
            <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>{t('main.noWorkspacesYet')}</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
        renderItem={({ item: ws }) => {
          const wsColor = ws.color || primaryColor;
          const workspaceIcon = parseWorkspaceIcon(ws.icon);
          const wsTaskCount = taskCountsByWorkspace.get(ws.id) || 0;
          const wsDescription = (ws as any).description;
          const wsType = (ws as any).type;
          return (
            <TouchableOpacity
              style={[
                styles.workspaceListItem,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                setSelectedWorkspace(ws.name);
                setTasksTab('workspace');
              }}
            >
              <View style={[styles.workspaceListIcon, { backgroundColor: wsColor }]}> 
                <FaIcon name={workspaceIcon.name} size={16} color="#FFFFFF" solid={workspaceIcon.solid} brand={workspaceIcon.brand} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.workspaceListName, { color: colors.text }]} numberOfLines={1}>
                  {ws.name}
                </Text>
                <Text style={[styles.workspaceListType, { color: colors.textSecondary }]} numberOfLines={1}>
                  {wsTaskCount} {wsTaskCount === 1 ? 'task' : 'tasks'}
                  {wsDescription ? ` · ${wsDescription}` : ''}
                </Text>
              </View>
              <View style={styles.wsTaskCountContainer}>
                <Text style={[styles.wsTaskCountText, { color: colors.textSecondary }]}>
                  {wsTaskCount}
                </Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderContent = () => {
    if (selectedNavKey === 'tasks') {
      // Workspaces list tab
      if (tasksTab === 'workspaces') {
        return renderWorkspacesList();
      }
      // Everything tab or specific workspace — shows task list
      return (
        <View style={{ flex: 1 }}>
          {/* Status chips + sync pill pinned above the list */}
          {renderListHeader()}
          <FlatList
            data={displayedTasks}
            renderItem={renderTaskItem}
            keyExtractor={keyExtractor}
            extraData={cardDensity}
            contentContainerStyle={[
              styles.listContent,
              displayedTasks.length === 0 && styles.listContentEmpty,
            ]}
            ListEmptyComponent={renderTasksEmpty}
            ItemSeparatorComponent={ItemSeparator}
            windowSize={7}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={true}
            onEndReached={loadMoreTasks}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isSyncing}
                onRefresh={onRefresh}
                tintColor={primaryColor}
                colors={[primaryColor]}
              />
            }
          />
        </View>
      );
    }

    if (selectedNavKey === 'colab') {
      return (
        <ColabScreen
          onChatViewChange={handleColabChatViewChange}
          initialConversationId={initialConversationId}
          onConversationConsumed={() => setInitialConversationId(undefined)}
        />
      );
    }

    if (selectedNavKey === 'boards') {
      return renderBoardsList();
    }

    if (selectedNavKey === 'scheduling' && isSchedulingEnabled) {
      return <SchedulingScreen />;
    }

    // Cleaning tab placeholder
    if (selectedNavKey === 'cleaning' && isCleaningEnabled) {
      return (
        <View style={styles.placeholderContainer}>
          <MaterialIcons name="cleaning-services" size={64} color="#BDBDBD" />
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>{t('main.cleaningTitle')}</Text>
          <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>{t('main.cleaningComingSoon')}</Text>
          <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>{t('main.comingSoon')}</Text>
        </View>
      );
    }

    return null;
  };

  // Show full-screen sync screen only on true first-ever sync (no cached data either)
  if (isInitialSync && isSyncing && data.tasks.length === 0 && !hasEverSynced) {
    return <InitialSyncScreen />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* App Bar — 3 zones: menu / search / actions */}
      <View style={[styles.appBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => drawerRef.current?.open()}
        >
          <MaterialIcons name="menu" size={22} color={colors.text} />
        </TouchableOpacity>

        {/* Search bar in the center (replaces workspace dropdown) */}
        {selectedNavKey === 'tasks' ? (
          <View style={styles.appBarSearchContainer}>
            <View
              style={[
                styles.appBarSearchBar,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                },
              ]}
            >
              <MaterialIcons
                name="search"
                size={16}
                color="#999999"
                style={{ marginRight: 6 }}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('main.searchTasks')}
                placeholderTextColor="#999999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={16} color="#999999" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.appBarSearchContainer} />
        )}

        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Stats' as any)}
          >
            <MaterialIcons name="bar-chart" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFilterSheetVisible(true)}
          >
            <MaterialIcons
              name="tune"
              size={20}
              color={hasActiveFilters ? primaryColor : colors.textSecondary}
            />
            {hasActiveFilters && (
              <View style={[styles.filterCountBadge, { backgroundColor: primaryColor }]}>
                <Text style={styles.filterCountBadgeText}>
                  {filters.categoryIds.length + filters.statuses.length + filters.priorities.length + filters.assignees.length + filters.flagColors.length + filters.tags.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Notifications')}
          >
            <MaterialIcons name="notifications-none" size={22} color={colors.text} />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Everything / Workspaces tabs — Tasks tab only, hidden when inside a specific workspace */}
      {selectedNavKey === 'tasks' && tasksTab !== 'workspace' && (
        <View
          style={[
            styles.tasksTabBar,
            {
              borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tasksTabItem,
              tasksTab === 'everything' && { borderBottomColor: primaryColor, borderBottomWidth: 2 },
            ]}
            onPress={() => {
              setTasksTab('everything');
              setSelectedWorkspace('Everything');
            }}
          >
            <MaterialIcons
              name="layers"
              size={18}
              color={tasksTab === 'everything' ? primaryColor : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tasksTabLabel,
                {
                  color: tasksTab === 'everything' ? primaryColor : colors.textSecondary,
                  fontFamily: tasksTab === 'everything' ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
                },
              ]}
            >
              {t('main.tabEverything')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tasksTabItem,
              tasksTab === 'workspaces' && { borderBottomColor: primaryColor, borderBottomWidth: 2 },
            ]}
            onPress={() => setTasksTab('workspaces')}
          >
            <MaterialIcons
              name="workspaces"
              size={18}
              color={tasksTab === 'workspaces' ? primaryColor : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tasksTabLabel,
                {
                  color: tasksTab === 'workspaces' ? primaryColor : colors.textSecondary,
                  fontFamily: tasksTab === 'workspaces' ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
                },
              ]}
            >
              {t('main.tabWorkspaces')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Workspace title bar — shown when viewing a specific workspace */}
      {selectedNavKey === 'tasks' && tasksTab === 'workspace' && (() => {
        const currentWs = workspaceObjects.find((w) => w.name === selectedWorkspace);
        const wsColor = currentWs?.color || primaryColor;
        const wsIcon = parseWorkspaceIcon(currentWs?.icon);
        return (
          <View
            style={[
              styles.workspaceTitleBar,
              {
                borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <TouchableOpacity
              style={styles.workspaceBackButton}
              onPress={() => {
                setTasksTab('workspaces');
                setSelectedWorkspace('Everything');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.workspaceTitleIcon, { backgroundColor: wsColor }]}> 
              <FaIcon name={wsIcon.name} size={12} color="#FFFFFF" solid={wsIcon.solid} brand={wsIcon.brand} />
            </View>
            <Text
              style={[styles.workspaceTitleText, { color: colors.text }]}
              numberOfLines={1}
            >
              {selectedWorkspace}
            </Text>
          </View>
        );
      })()}

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {voiceCapturePhase !== 'idle' ? (
        <VoiceTaskCaptureOverlay
          phase={voiceCapturePhase}
          voiceLevel={voiceLevel}
          durationMs={durationMs}
          colors={colors}
          primaryColor={primaryColor}
          isDarkMode={isDarkMode}
        />
      ) : null}

      {/* Active Task Strip — above bottom nav, workspace-filtered */}
      {!(selectedNavKey === 'colab' && colabInChat) && workspaceFilteredWorkingTasks.length > 0 && (
        <ActiveTaskStrip
          tasks={workspaceFilteredWorkingTasks}
          doneLabel={finalStatus?.name}
          onDone={(taskId) => completeWorkingTask(taskId)}
          onRemove={(taskId) => removeWorkingTask(taskId)}
          onPress={(task) => navigation.navigate('TaskDetail', { task })}
          getAllowedStatuses={getAllowedStatuses}
          onStatusChange={(taskId, status) => changeTaskStatus(taskId, status)}
        />
      )}

      {/* Bottom Navigation — hidden when inside a colab chat */}
      {!(selectedNavKey === 'colab' && colabInChat) && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.bottomBarContent}>
            {navItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.navItem}
                onPress={() => {
                  setSelectedNav(index);
                  if (item.key !== 'colab') setColabInChat(false);
                }}
              >
                <View style={styles.navIconContainer}>
                  <MaterialIcons
                    name={item.icon}
                    size={26}
                    color={selectedNav === index ? primaryColor : (item.color || colors.textSecondary)}
                  />
                  {item.key === 'colab' && chatUnreadCount > 0 && (
                    <View style={[styles.boardsBadge, { backgroundColor: primaryColor }]}>
                      <Text style={styles.boardsBadgeText}>
                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                      </Text>
                    </View>
                  )}
                  {item.key === 'boards' && boardUnreadCount > 0 && (
                    <View style={[styles.boardsBadge, { borderColor: colors.surface }]}>
                      <Text style={styles.boardsBadgeText}>{boardUnreadCount > 99 ? '99+' : boardUnreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    { color: selectedNav === index ? primaryColor : colors.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}

          </View>

          {/* FAB */}
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: primaryColor }]}
            onPress={handleCreateTask}
            onPressIn={handleVoiceCapturePressIn}
            onPressOut={handleVoiceCapturePressOut}
          >
            <MaterialIcons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Drawer */}
      <AnimatedDrawer ref={drawerRef} onWorkspaceSelect={handleDrawerWorkspaceSelect} />

      {/* Filter Sheet */}
      <TaskFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
      />

      {/* Workspace Menu Modal removed — replaced by tabs */}

      {/* Status Picker Modal */}
      <Modal
        visible={statusPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setStatusPickerVisible(false);
          setStatusPickerTask(null);
        }}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => {
            setStatusPickerVisible(false);
            setStatusPickerTask(null);
          }}
        >
          <View
            style={[
              styles.statusPickerSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.statusPickerTitle, { color: colors.text }]}>
              {t('common.changeStatus')}
            </Text>
            {statusPickerTask && (
              <Text
                style={[styles.statusPickerSubtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {statusPickerTask.title}
              </Text>
            )}
            <View style={styles.statusPickerList}>
              {(statusPickerTask ? getAllowedStatuses(statusPickerTask) : []).map((s) => {
                const isCurrentStatus = statusPickerTask?.status === s.name;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                    styles.statusPickerItem,
                    {
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                    },
                    isCurrentStatus && {
                      backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                      },
                    ]}
                    onPress={() => handleStatusSelect(s)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.statusPickerDot,
                        { backgroundColor: s.color || '#9E9E9E' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPickerItemText,
                        { color: colors.text },
                        isCurrentStatus && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {s.name}
                    </Text>
                    {isCurrentStatus && (
                      <MaterialIcons name="check" size={20} color={primaryColor} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Assignee Picker Modal */}
      <Modal
        visible={assigneePickerVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        onRequestClose={() => {
          setAssigneePickerVisible(false);
          setAssigneePickerTask(null);
          setAssigneeSearch('');
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.bottom}
        >
          <TouchableOpacity
            style={styles.statusPickerOverlay}
            activeOpacity={1}
            onPress={() => {
              setAssigneePickerVisible(false);
              setAssigneePickerTask(null);
              setAssigneeSearch('');
            }}
          >
            <View
              style={[
                styles.statusPickerSheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  paddingBottom: Math.max(20, insets.bottom + 12),
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.statusPickerHandle} />
              <Text style={[styles.statusPickerTitle, { color: colors.text }]}> 
                {t('common.assignTo')}
              </Text>
              {assigneePickerTask && (
                <Text
                  style={[styles.statusPickerSubtitle, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {assigneePickerTask.title}
                </Text>
              )}
              <View
                style={[
                  styles.assigneeSearchContainer,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <MaterialIcons
                  name="search"
                  size={20}
                  color={colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[styles.assigneeSearchInput, { color: colors.text }]}
                  placeholder={t('common.searchUsers')}
                  placeholderTextColor={colors.textSecondary}
                  value={assigneeSearch}
                  onChangeText={setAssigneeSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {assigneeSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setAssigneeSearch('')}>
                    <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.assigneeScrollList} bounces={false} keyboardShouldPersistTaps="handled">
                <View style={styles.statusPickerList}>
                  {sortedUsers.map((u) => {
                    const isAssigned = assigneePickerTask?.assignees.some((a) => a.name === u.name) ?? false;
                    const isCurrentUser = u.id === (authUser?.id ?? 0);
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.statusPickerItem,
                          {
                            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                          },
                          isAssigned && {
                            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                          },
                        ]}
                        onPress={() => handleAssigneeSelect({ id: u.id, name: u.name })}
                        activeOpacity={0.7}
                      >
                        <View style={styles.assigneeAvatar}>
                          <Text style={styles.assigneeAvatarText}>
                            {u.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.statusPickerItemText,
                            { color: colors.text },
                            isAssigned && { fontFamily: fontFamilies.bodySemibold },
                          ]}
                        >
                          {u.name}{isCurrentUser ? t('main.userYouSuffix') : ''}
                        </Text>
                        {isAssigned && (
                          <MaterialIcons name="check" size={20} color="#2196F3" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarSearchContainer: {
    flex: 1,
    marginHorizontal: 4,
  },
  appBarSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  appBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadge: {
    position: 'absolute',
    right: 1,
    top: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'Montserrat_700Bold',
  },
  notificationBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    backgroundColor: '#E24B4A',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: fontFamilies.bodyBold,
  },
  content: {
    flex: 1,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    paddingVertical: 0,
  },
  // Tasks tab bar (Everything / Workspaces)
  tasksTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
  },
  tasksTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tasksTabLabel: {
    fontSize: fontSizes.sm,
  },
  // Workspace title bar (when inside a specific workspace)
  workspaceTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  workspaceBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginRight: 8,
  },
  workspaceTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  workspaceTitleText: {
    flex: 1,
    fontSize: 16,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Workspace list items
  wsListContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  workspaceListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  workspaceListIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceListName: {
    fontSize: 15,
    fontFamily: fontFamilies.bodySemibold,
  },
  workspaceListType: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  wsTaskCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  wsTaskCountText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyMedium,
  },
  sharedCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 4,
  },
  sharedCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '600' as const,
  },
  // Status filter chips
  chipStrip: {
    flexGrow: 0,
    marginBottom: 4,
  },
  chipStripContent: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 0.5,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  chipCount: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Task list
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center' as const,
  },
  // Empty / syncing states
  emptyContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  clearFiltersButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  clearFiltersText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  listTitle: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  listSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  syncText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  taskItemContainer: {
    position: 'relative',
  },
  swipeBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  swipeBackgroundRight: {
    left: 0,
    right: '50%',
    backgroundColor: '#F0F0F2',
  },
  swipeBackgroundLeft: {
    right: 0,
    left: '50%',
    justifyContent: 'flex-end',
    backgroundColor: '#EBF5FF',
  },
  swipeText: {
    marginHorizontal: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderTitle: {
    marginTop: 16,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  placeholderSubtitle: {
    marginTop: 8,
    fontSize: fontSizes.md,
    color: '#757575',
    textAlign: 'center',
    fontFamily: fontFamilies.bodyRegular,
  },
  comingSoon: {
    marginTop: 16,
    fontSize: fontSizes.xs,
    fontStyle: 'italic',
    color: '#9E9E9E',
    fontFamily: fontFamilies.bodyMedium,
  },
  bottomBar: {
    borderTopWidth: 0.5,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 72,
    justifyContent: 'space-around',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  navIconContainer: {
    position: 'relative',
  },
  navLabel: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: fontFamilies.bodyMedium,
  },
  fab: {
    position: 'absolute',
    right: 14,
    top: -10,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  boardsBadge: {
    position: 'absolute',
    right: -8,
    top: -4,
    backgroundColor: '#F44336',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  boardsBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingLeft: 60,
  },
  workspaceMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 8,
    minWidth: 200,
    ...shadows.lifted,
  },
  workspaceMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  workspaceMenuItemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  workspaceIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  workspaceMenuText: {
    fontSize: fontSizes.md,
    color: '#212121',
    fontFamily: fontFamilies.bodyMedium,
    flex: 1,
  },
  sharedBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 5,
  },
  sharedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },
  modalKeyboardAvoidingView: {
    flex: 1,
  },
  statusPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end' as const,
  },
  statusPickerSheet: {
    maxHeight: '78%',
    flexShrink: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  statusPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center' as const,
    marginBottom: 16,
  },
  statusPickerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 4,
  },
  statusPickerSubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    marginBottom: 16,
  },
  statusPickerList: {
    gap: 2,
  },
  statusPickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 0.5,
  },
  statusPickerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusPickerItemText: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  assigneeSearchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  assigneeSearchInput: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    paddingVertical: 2,
  },
  assigneeScrollList: {
    maxHeight: Dimensions.get('window').height * 0.45,
  },
  assigneeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  assigneeAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Board list styles
  colabListContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  colabListHeader: {
    marginBottom: spacing.sm,
  },
  colabSpaceItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 12,
    borderWidth: 0.5,
  },
  colabSpaceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  colabSpaceInfo: {
    flex: 1,
    marginRight: 8,
  },
  colabSpaceName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  colabSpaceDesc: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 2,
  },
});
