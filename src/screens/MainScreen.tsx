import React, { useState, useRef, useMemo, useCallback } from 'react';
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
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { RootStackParamList, TaskItem } from '../models/types';
import { TaskCard } from '../components/TaskCard';
import { ActiveTaskBanner } from '../components/ActiveTaskBanner';
import { AnimatedDrawer, AnimatedDrawerRef } from '../components/AnimatedDrawer';
import { TaskFilterSheet } from '../components/TaskFilterSheet';
import { ColabScreen } from './ColabScreen';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { parseWorkspaceIcon, DEFAULT_WORKSPACE_COLOR } from '../utils/helpers';

type MainScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

interface NavItem {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  color?: string;
}

const navItems: NavItem[] = [
  { icon: 'checklist', label: 'Tasks' },
  { icon: 'forum', label: 'Colab' },
  { icon: 'people-outline', label: 'Boards' },
  { icon: 'cleaning-services', label: 'Cleaning' },
];

// ---------------------------------------------------------------------------
// Stable FlatList helpers (module-level to avoid re-creation)
// ---------------------------------------------------------------------------
const keyExtractor = (item: TaskItem, index: number) => item.id || String(index);
const ItemSeparator = () => <View style={{ height: 12 }} />;

// ---------------------------------------------------------------------------
// SwipeableTaskItem – extracted outside MainScreen to avoid re-creation on
// every parent render.  Wrapped in React.memo so it only re-renders when its
// own props change.
// ---------------------------------------------------------------------------
interface SwipeableTaskItemProps {
  item: TaskItem;
  compactCards: boolean;
  isDarkMode: boolean;
  primaryColor: string;
  onPress: (task: TaskItem) => void;
  onSwipeLeft: (task: TaskItem) => void;
  onSwipeRight: (task: TaskItem) => void;
}

const SwipeableTaskItem = React.memo<SwipeableTaskItemProps>(
  ({ item, compactCards, isDarkMode, primaryColor, onPress, onSwipeLeft, onSwipeRight }) => {
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
          <TaskCard task={item} compact={compactCards} onPress={handlePress} />
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
    activeTask,
    compactCards,
    selectedWorkspace,
    workspaces,
    workspaceObjects,
    finalStatus,
    getAllowedStatuses,
    setActiveTask,
    changeTaskStatus,
    assignTaskToYou,
    setSelectedWorkspace,
    hasActiveFilters,
  } = useTasks();

  const { data, isSyncing, refresh, syncError } = useData();

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
  const [colabInChat, setColabInChat] = useState(false);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);
  


  const handleTaskPress = useCallback(
    (task: TaskItem) => {
      navigation.navigate('TaskDetail', { task });
    },
    [navigation],
  );

  const handleCreateTask = useCallback(() => {
    navigation.navigate('CreateTask');
  }, [navigation]);

  const handleSwipeLeft = useCallback(
    (task: TaskItem) => {
      if (!task.assignees.includes('You')) {
        assignTaskToYou(task.id || '');
        Alert.alert('Assigned', 'Task assigned to You');
      } else {
        Alert.alert('Already Assigned', 'Already assigned to You');
      }
    },
    [assignTaskToYou],
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
        compactCards={compactCards}
        isDarkMode={isDarkMode}
        primaryColor={primaryColor}
        onPress={handleTaskPress}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
      />
    ),
    [compactCards, isDarkMode, primaryColor, handleTaskPress, handleSwipeLeft, handleSwipeRight],
  );

  const renderListHeader = () => {
    const syncLabel = syncError ? 'Offline' : isSyncing ? 'Syncing' : 'Updated';
    const syncColor = syncError ? '#D08F36' : isSyncing ? primaryColor : colors.textSecondary;

    return (
      <View style={styles.listHeader}>
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
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
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
            <MaterialIcons name="campaign" size={56} color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'} />
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

  const renderContent = () => {
    if (selectedNav === 0) {
      return (
        <FlatList
          data={tasks}
          renderItem={renderTaskItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader}
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

    // Remaining tabs (Cleaning, etc.) show placeholder
    const placeholderData = [
      { nav: 3, icon: 'cleaning-services', title: 'Cleaning', subtitle: 'Cleaning management coming soon' },
    ];

    const phData = placeholderData.find(d => d.nav === selectedNav);
    if (!phData) return null;

    return (
      <View style={styles.placeholderContainer}>
        <MaterialIcons name={phData.icon as any} size={64} color="#BDBDBD" />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>{phData.title}</Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>{phData.subtitle}</Text>
        <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>Coming soon</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <LinearGradient
        colors={[colors.background, isDarkMode ? '#121615' : '#EFE8DD']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* App Bar */}
      <View style={[styles.appBar, { borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#E8E1D6' }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => drawerRef.current?.open()}
        >
          <MaterialIcons name="menu" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.workspaceSelector,
            {
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : '#E6E0D7',
              backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
          onPress={() => setWorkspaceMenuVisible(true)}
        >
          {(() => {
            const selWs = workspaceLookup.get(selectedWorkspace);
            const selColor = selWs?.color || DEFAULT_WORKSPACE_COLOR;
            const { name: selIconName, solid: selSolid } = parseWorkspaceIcon(selWs?.icon);
            const isEverything = selectedWorkspace === 'Everything';
            return (
              <View style={[styles.workspaceIconBadge, { backgroundColor: isEverything ? (isDarkMode ? '#374151' : '#6B7280') : selColor, marginRight: 6 }]}>
                {isEverything ? (
                  <MaterialIcons name="layers" size={12} color="#FFFFFF" />
                ) : (
                  <FontAwesome5 name={selIconName} size={11} color="#FFFFFF" solid={selSolid} />
                )}
              </View>
            );
          })()}
          <Text numberOfLines={1} style={[styles.workspaceText, { color: colors.text }]}>
            {selectedWorkspace}
          </Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFilterSheetVisible(true)}
          >
            <MaterialIcons
              name="filter-list"
              size={22}
              color={hasActiveFilters ? primaryColor : colors.textSecondary}
            />
            {hasActiveFilters && (
              <View style={[styles.filterDot, { backgroundColor: primaryColor }]} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <MaterialIcons name="account-circle" size={24} color={colors.textSecondary} />
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

      {/* Active Task Banner */}
      {activeTask && (
        <View style={styles.bannerContainer}>
          <ActiveTaskBanner
            task={activeTask}
            doneLabel={finalStatus?.name}
            onDone={() => setActiveTask(null, true)}
            onClear={() => setActiveTask(null)}
          />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Navigation — hidden when inside a colab chat */}
      {!(selectedNav === 1 && colabInChat) && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E0D7',
              marginBottom: insets.bottom > 0 ? insets.bottom : 12,
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
          <View style={[styles.workspaceMenu, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E0D7' }]}
          >
            {workspaces.map((workspace, index) => {
              const wsData = workspaceLookup.get(workspace);
              const wsColor = wsData?.color || DEFAULT_WORKSPACE_COLOR;
              const { name: iconName, solid } = parseWorkspaceIcon(wsData?.icon);
              const isEverything = workspace === 'Everything';
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
                    <View style={[styles.workspaceIconBadge, { backgroundColor: isEverything ? (isDarkMode ? '#374151' : '#6B7280') : wsColor }]}>
                      {isEverything ? (
                        <MaterialIcons name="layers" size={12} color="#FFFFFF" />
                      ) : (
                        <FontAwesome5 name={iconName} size={11} color="#FFFFFF" solid={solid} />
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
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7',
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
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F0EBE1',
                      },
                      isCurrentStatus && {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F7F4EF',
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  menuButton: {
    padding: 8,
  },
  workspaceSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  workspaceText: {
    flexShrink: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  appBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  filterDot: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  notificationBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    backgroundColor: '#E2573C',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F4F1EA',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },
  bannerContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: '#EDE9E1',
  },
  swipeBackgroundLeft: {
    right: 0,
    left: '50%',
    justifyContent: 'flex-end',
    backgroundColor: '#E2EDF0',
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
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 8,
    minWidth: 180,
    ...shadows.subtle,
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
  },
  statusPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end' as const,
  },
  statusPickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  statusPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1CBC0',
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
    borderBottomWidth: 1,
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
    borderRadius: radius.lg,
    borderWidth: 1,
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
