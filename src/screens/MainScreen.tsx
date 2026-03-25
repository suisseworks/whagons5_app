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
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { FaIcon } from '../components/FaIcon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { RootStackParamList, TaskItem, CardDensity } from '../models/types';
import { TaskCard } from '../components/TaskCard';
import { ActiveTaskStrip } from '../components/ActiveTaskStrip';
import { AnimatedDrawer, AnimatedDrawerRef } from '../components/AnimatedDrawer';
import { InitialSyncScreen } from './InitialSyncScreen';
import { TaskFilterSheet } from '../components/TaskFilterSheet';
import { ColabScreen } from './ColabScreen';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { parseWorkspaceIcon, DEFAULT_WORKSPACE_COLOR } from '../utils/helpers';

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
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  color?: string;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { icon: 'checklist', label: 'Tasks' },
  { icon: 'forum', label: 'Colab' },
  { icon: 'people-outline', label: 'Boards' },
];

const CLEANING_NAV_ITEM: NavItem = { icon: 'cleaning-services', label: 'Cleaning' };

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
  onPress: (task: TaskItem) => void;
  onSwipeLeft: (task: TaskItem) => void;
  onSwipeRight: (task: TaskItem) => void;
}

const SwipeableTaskItem = React.memo<SwipeableTaskItemProps>(
  ({ item, cardDensity, isDarkMode, primaryColor, onPress, onSwipeLeft, onSwipeRight }) => {
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
          <Text style={[styles.swipeText, { color: primaryColor }]}>Status</Text>
        </View>
        <View
          style={[
            styles.swipeBackground,
            styles.swipeBackgroundLeft,
            isDarkMode && { backgroundColor: 'rgba(33, 150, 243, 0.15)' },
          ]}
        >
          <Text style={[styles.swipeText, { color: '#2196F3' }]}>Assign</Text>
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
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const {
    tasks,
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
    availableStatuses,
  } = useTasks();

  const { data, isSyncing, hasEverSynced, refresh, syncError, isInitialSync } = useData();

  const isCleaningEnabled = useMemo(() => {
    const plugin = data.plugins.find((p: any) => p.slug === 'cleaning');
    return plugin?.is_enabled === true;
  }, [data.plugins]);

  const navItems = useMemo(() => {
    return isCleaningEnabled ? [...BASE_NAV_ITEMS, CLEANING_NAV_ITEM] : BASE_NAV_ITEMS;
  }, [isCleaningEnabled]);

  // -- Sync pill: show while syncing / offline, briefly after sync, then hide --
  const wasSyncingRef = useRef(false);
  const syncPillOpacity = useRef(new Animated.Value(0)).current;
  const [showSyncPill, setShowSyncPill] = useState(false);
  const syncHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (syncError) {
      // Offline – always visible
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
  }, [isSyncing, syncError, syncPillOpacity]);

  // Build workspace lookup by name for icon/color access
  const workspaceLookup = useMemo(() => {
    const map = new Map<string, { icon?: string | null; color?: string | null }>();
    for (const ws of workspaceObjects) {
      map.set(ws.name, { icon: ws.icon, color: ws.color });
    }
    return map;
  }, [workspaceObjects]);
  const { unreadCount: notificationCount } = useNotifications();
  const { user: authUser } = useAuth();

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
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [statusPickerTask, setStatusPickerTask] = useState<TaskItem | null>(null);
  const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);
  const [assigneePickerTask, setAssigneePickerTask] = useState<TaskItem | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [colabInChat, setColabInChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatusChip, setActiveStatusChip] = useState<string | null>(null);

  useEffect(() => {
    if (selectedNav >= navItems.length) {
      setSelectedNav(0);
    }
  }, [navItems.length, selectedNav]);

  const surfaces = isDarkMode ? SURFACE.dark : SURFACE.light;

  const handleCreateTask = useCallback(() => {
    navigation.navigate('CreateTask');
  }, [navigation]);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const statusChips = useMemo(() => {
    const counts = new Map<string, { count: number; color: string }>();
    for (const t of tasks) {
      const key = t.status.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, color: t.statusColor || '#9CA3AF' });
      }
    }
    const chips: { label: string; statusKey: string; color: string; count: number }[] = [
      { label: 'All', statusKey: '', color: isDarkMode ? '#E0E0E0' : '#1A1A1A', count: tasks.length },
    ];
    for (const s of availableStatuses) {
      const key = s.name.toLowerCase();
      const entry = counts.get(key);
      chips.push({
        label: s.name,
        statusKey: key,
        color: s.color || '#9CA3AF',
        count: entry?.count ?? 0,
      });
    }
    return chips;
  }, [tasks, availableStatuses, isDarkMode]);

  // Client-side search + status chip filter
  const displayedTasks = useMemo(() => {
    let filtered = tasks;
    if (activeStatusChip) {
      filtered = filtered.filter((t) => t.status.toLowerCase() === activeStatusChip);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.spot.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.assignees.some((a) => a.name.toLowerCase().includes(q)) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [tasks, searchQuery, activeStatusChip]);


  const handleTaskPress = useCallback(
    (task: TaskItem) => {
      navigation.navigate('TaskDetail', { task });
    },
    [navigation],
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
    const userIds = new Set<number>();
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
    (user: { id: number; name: string }) => {
      if (assigneePickerTask?.id) {
        if (assigneePickerTask.assignees.some((a) => a.name === user.name)) {
          Alert.alert('Already Assigned', `${user.name} is already assigned to this task`);
        } else {
          assignTaskToUser(assigneePickerTask.id, user.id, user.name);
        }
      }
      setAssigneePickerVisible(false);
      setAssigneePickerTask(null);
      setAssigneeSearch('');
    },
    [assigneePickerTask, assignTaskToUser],
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

  const renderTaskItem = useCallback(
    ({ item }: { item: TaskItem }) => (
      <SwipeableTaskItem
        item={item}
        cardDensity={cardDensity}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
        onPress={handleTaskPress}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
      />
    ),
    [cardDensity, isDarkMode, primaryColor, handleTaskPress, handleSwipeLeft, handleSwipeRight],
  );

  const handleChipPress = useCallback((statusKey: string) => {
    setActiveStatusChip((prev) => (prev === statusKey ? null : statusKey || null));
  }, []);

  const renderListHeader = () => {
    const showChips = tasks.length > 0 && statusChips.length > 1;
    if (!showSyncPill && !showChips) return null;

    const syncLabel = syncError ? 'Offline' : isSyncing ? 'Syncing' : 'Updated';
    const syncColor = syncError ? '#EF9F27' : isSyncing ? primaryColor : colors.textSecondary;

    return (
      <View>
        {/* Status filter chips */}
        {showChips && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipStrip}
            contentContainerStyle={styles.chipStripContent}
          >
            {statusChips.map((chip) => {
              const isActive = activeStatusChip === chip.statusKey || (!activeStatusChip && chip.statusKey === '');
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
            <Text style={[styles.listTitle, { color: colors.text }]}>Boards</Text>
            <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
              {boards.length} {boards.length === 1 ? 'board' : 'boards'}
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
                    {memberCount} {memberCount === 1 ? 'member' : 'members'} · {messageCount} {messageCount === 1 ? 'post' : 'posts'}
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
              No boards yet
            </Text>
            <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
              Boards will appear here once they are created
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
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Syncing your tasks</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            This may take a moment on first launch
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
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No results</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            No tasks match "{searchQuery.trim()}"
          </Text>
        </View>
      );
    }

    // Status chip filter hiding all tasks
    if (activeStatusChip && tasks.length > 0) {
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
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No matching tasks</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Try selecting a different status or tap "All"
          </Text>
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
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No tasks yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Tasks will appear here once they are created
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    if (selectedNav === 0) {
      return (
        <FlatList
          data={displayedTasks}
          renderItem={renderTaskItem}
          keyExtractor={keyExtractor}
          extraData={cardDensity}
          contentContainerStyle={[
            styles.listContent,
            displayedTasks.length === 0 && styles.listContentEmpty,
          ]}
          ListHeaderComponent={renderListHeader}
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
      );
    }

    if (selectedNav === 1) {
      return <ColabScreen onChatViewChange={handleColabChatViewChange} />;
    }

    if (selectedNav === 2) {
      return renderBoardsList();
    }

    // Cleaning tab placeholder
    if (navItems[selectedNav]?.label === 'Cleaning') {
      return (
        <View style={styles.placeholderContainer}>
          <MaterialIcons name="cleaning-services" size={64} color="#BDBDBD" />
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>Cleaning</Text>
          <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>Cleaning management coming soon</Text>
          <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>Coming soon</Text>
        </View>
      );
    }

    return null;
  };

  // Show full-screen sync screen on initial sync with no data
  if (isInitialSync && isSyncing && data.tasks.length === 0) {
    return <InitialSyncScreen />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* App Bar — 3 zones: menu / workspace / actions */}
      <View style={[styles.appBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => drawerRef.current?.open()}
        >
          <MaterialIcons name="menu" size={22} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.workspaceSelector}
          onPress={() => setWorkspaceMenuVisible(true)}
        >
          <Text numberOfLines={1} style={[styles.workspaceText, { color: colors.text }]}>
            {selectedWorkspace}
          </Text>
          <MaterialIcons name="expand-more" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

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
                  {filters.statuses.length + filters.priorities.length + filters.assignees.length + filters.flagColors.length + filters.tags.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <MaterialIcons name="account-circle" size={22} color={colors.textSecondary} />
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

      {/* Search bar – Tasks tab only */}
      {selectedNav === 0 && (
        <View style={styles.searchBarContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
              },
            ]}
          >
            <MaterialIcons
              name="search"
              size={16}
              color="#999999"
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search tasks..."
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
      )}

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Active Task Strip — above bottom nav, workspace-filtered */}
      {!(selectedNav === 1 && colabInChat) && workspaceFilteredWorkingTasks.length > 0 && (
        <ActiveTaskStrip
          tasks={workspaceFilteredWorkingTasks}
          doneLabel={finalStatus?.name}
          onDone={(taskId) => completeWorkingTask(taskId)}
          onRemove={(taskId) => removeWorkingTask(taskId)}
          onPress={(task) => navigation.navigate('TaskDetail', { task })}
        />
      )}

      {/* Bottom Navigation — hidden when inside a colab chat */}
      {!(selectedNav === 1 && colabInChat) && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E0D7',
              marginBottom: Math.max(insets.bottom, 12),
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
                  if (index !== 1) setColabInChat(false);
                }}
              >
                <View style={styles.navIconContainer}>
                  <MaterialIcons
                    name={item.icon}
                    size={22}
                    color={selectedNav === index ? primaryColor : (item.color || colors.textSecondary)}
                  />
                  {index === 1 && chatUnreadCount > 0 && (
                    <View style={[styles.boardsBadge, { backgroundColor: primaryColor }]}>
                      <Text style={styles.boardsBadgeText}>
                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                      </Text>
                    </View>
                  )}
                  {index === 2 && boards.length > 0 && (
                    <View style={[styles.boardsBadge, { borderColor: colors.surface }]}>
                      <Text style={styles.boardsBadgeText}>{boards.length > 9 ? '9+' : boards.length}</Text>
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
          >
            <MaterialIcons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>

        </View>
      )}

      {/* Drawer */}
      <AnimatedDrawer ref={drawerRef} />

      {/* Filter Sheet */}
      <TaskFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
      />

      {/* Workspace Menu Modal */}
      <Modal
        visible={workspaceMenuVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setWorkspaceMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuModalOverlay}
          activeOpacity={1}
          onPress={() => setWorkspaceMenuVisible(false)}
        >
          <View style={[styles.workspaceMenu, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' }]}
          >
            {workspaces.map((workspace, index) => {
              const wsData = workspaceLookup.get(workspace);
              const wsColor = wsData?.color || DEFAULT_WORKSPACE_COLOR;
              const { name: iconName, solid, brand: wsBrand } = parseWorkspaceIcon(wsData?.icon);
              const isEverything = workspace === 'Everything';
              const isShared = workspace === 'Shared';
              const isSelected = workspace === selectedWorkspace;

              return (
                <TouchableOpacity
                  key={index}
                  style={styles.workspaceMenuItem}
                  onPress={() => {
                    setSelectedWorkspace(workspace);
                    setWorkspaceMenuVisible(false);
                  }}
                >
                  <View style={styles.workspaceMenuItemRow}>
                    <View style={[styles.workspaceIconBadge, { backgroundColor: isEverything ? (isDarkMode ? '#374151' : '#6B7280') : isShared ? '#8B5CF6' : wsColor }]}>
                      {isEverything ? (
                        <MaterialIcons name="layers" size={12} color="#FFFFFF" />
                      ) : isShared ? (
                        <MaterialIcons name="inbox" size={12} color="#FFFFFF" />
                      ) : (
                        <FaIcon name={iconName} size={11} color="#FFFFFF" solid={solid} brand={wsBrand} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.workspaceMenuText,
                        { color: colors.text },
                        isSelected && { color: primaryColor, fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {workspace}
                    </Text>
                    {isShared && sharedCount > 0 && (
                      <View style={[styles.sharedBadge, { backgroundColor: '#8B5CF6' }]}>
                        <Text style={styles.sharedBadgeText}>{sharedCount > 99 ? '99+' : sharedCount}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

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
              Change Status
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
        onRequestClose={() => {
          setAssigneePickerVisible(false);
          setAssigneePickerTask(null);
          setAssigneeSearch('');
        }}
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
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.statusPickerTitle, { color: colors.text }]}>
              Assign To
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
                placeholder="Search users..."
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
                        {u.name}{isCurrentUser ? ' (You)' : ''}
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
  workspaceSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  workspaceText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
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
    height: 72,
    borderRadius: radius.lg,
    marginHorizontal: 12,
    borderWidth: 1,
    ...shadows.lifted,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingLeft: 16,
    paddingRight: 88,
    justifyContent: 'space-between',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  navIconContainer: {
    position: 'relative',
  },
  navLabel: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 46,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lifted,
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
  statusPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end' as const,
  },
  statusPickerSheet: {
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
