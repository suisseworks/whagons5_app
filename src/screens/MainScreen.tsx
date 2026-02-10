import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useData } from '../context/DataContext';
import { RootStackParamList, TaskItem } from '../models/types';
import { TaskCard } from '../components/TaskCard';
import { ActiveTaskBanner } from '../components/ActiveTaskBanner';
import { AppDrawer } from '../components/AppDrawer';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

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
  { icon: 'cleaning-services', label: 'Cleaning', color: '#2196F3' },
];

export const MainScreen: React.FC = () => {
  const navigation = useNavigation<MainScreenNavigationProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const {
    tasks,
    activeTask,
    compactCards,
    notificationCount,
    selectedWorkspace,
    workspaces,
    setActiveTask,
    markTaskDone,
    assignTaskToYou,
    setSelectedWorkspace,
  } = useTasks();

  const { isSyncing, refresh, syncError } = useData();

  const [selectedNav, setSelectedNav] = useState(0);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);
  
  const drawerTranslateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  useEffect(() => {
    if (drawerVisible) {
      Animated.timing(drawerTranslateX, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      drawerTranslateX.setValue(-SCREEN_WIDTH);
    }
  }, [drawerVisible]);

  const handleTaskPress = (task: TaskItem) => {
    navigation.navigate('TaskDetail', { task });
  };

  const handleCreateTask = () => {
    navigation.navigate('CreateTask');
  };

  const handleSwipeLeft = (task: TaskItem) => {
    // Assign to You
    if (!task.assignees.includes('You')) {
      assignTaskToYou(task.id || '');
      Alert.alert('Assigned', 'Task assigned to You');
    } else {
      Alert.alert('Already Assigned', 'Already assigned to You');
    }
  };

  const handleSwipeRight = (task: TaskItem) => {
    // Mark as done
    markTaskDone(task.id || '');
    Alert.alert('Done', 'Marked as done');
  };

  const SwipeableTaskItem = ({ item }: { item: TaskItem }) => {
    const translateX = useRef(new Animated.Value(0)).current;

    const panResponder = useMemo(() => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 100) {
          // Swipe right - mark done
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          handleSwipeRight(item);
        } else if (gestureState.dx < -100) {
          // Swipe left - assign
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          handleSwipeLeft(item);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }), [item, translateX]);

    return (
      <View style={styles.taskItemContainer}>
        {/* Swipe backgrounds */}
        <View style={[styles.swipeBackground, styles.swipeBackgroundRight]}>
          <MaterialIcons name="check" size={24} color="#4CAF50" />
          <Text style={styles.swipeText}>Mark done</Text>
        </View>
        <View style={[styles.swipeBackground, styles.swipeBackgroundLeft]}>
          <Text style={[styles.swipeText, { color: '#2196F3' }]}>Assign</Text>
          <MaterialIcons name="person-add" size={24} color="#2196F3" />
        </View>

        <Animated.View
          {...panResponder.panHandlers}
          style={{ transform: [{ translateX }] }}
        >
          <TaskCard
            task={item}
            compact={compactCards}
            onPress={() => handleTaskPress(item)}
          />
        </Animated.View>
      </View>
    );
  };

  const renderTaskItem = ({ item }: { item: TaskItem }) => (
    <SwipeableTaskItem item={item} />
  );

  const renderListHeader = () => {
    const syncLabel = syncError ? 'Offline' : isSyncing ? 'Syncing' : 'Updated';
    const syncColor = syncError ? '#D08F36' : isSyncing ? primaryColor : colors.textSecondary;

    return (
      <View style={styles.listHeader}>
        <View>
          <Text style={[styles.listTitle, { color: colors.text }]}>Today</Text>
          <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
            {tasks.length} tasks
          </Text>
        </View>
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

  const renderContent = () => {
    if (selectedNav === 0) {
      return (
        <FlatList
          data={tasks}
          renderItem={renderTaskItem}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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

    const placeholderData = [
      { nav: 1, icon: 'chat-bubble-outline', title: 'Workspace Chat', subtitle: `Chat with your ${selectedWorkspace} team` },
      { nav: 2, icon: 'people-outline', title: 'Boards', subtitle: 'Communication boards coming soon' },
      { nav: 3, icon: 'cleaning-services', title: 'Cleaning', subtitle: 'Cleaning management coming soon' },
    ];

    const data = placeholderData.find(d => d.nav === selectedNav);
    if (!data) return null;

    return (
      <View style={styles.placeholderContainer}>
        <MaterialIcons name={data.icon as any} size={64} color="#BDBDBD" />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>{data.title}</Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>{data.subtitle}</Text>
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
          onPress={() => setDrawerVisible(true)}
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
          <Text style={[styles.workspaceText, { color: colors.text }]}>
            {selectedWorkspace}
          </Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => Alert.alert('Filters', 'Filters coming soon')}
          >
            <MaterialIcons name="filter-list" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setDrawerVisible(true)}
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
            onDone={() => setActiveTask(null, true)}
            onClear={() => setActiveTask(null)}
          />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom Navigation */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E0D7',
          },
        ]}
      >
        <View style={styles.bottomBarContent}>
          {navItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.navItem}
              onPress={() => setSelectedNav(index)}
            >
              <View style={styles.navIconContainer}>
                <MaterialIcons
                  name={item.icon}
                  size={22}
                  color={selectedNav === index ? primaryColor : (item.color || colors.textSecondary)}
                />
                {index === 2 && (
                  <View style={styles.boardsBadge}>
                    <Text style={styles.boardsBadgeText}>5</Text>
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

      {/* Drawer Modal */}
      <Modal
        visible={drawerVisible}
        animationType="none"
        transparent={true}
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            style={styles.drawerBackdrop}
            onPress={() => setDrawerVisible(false)}
            activeOpacity={1}
          />
          <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: drawerTranslateX }] }]}>
            <AppDrawer onClose={() => setDrawerVisible(false)} />
          </Animated.View>
        </View>
      </Modal>

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
            {workspaces.map((workspace, index) => (
              <TouchableOpacity
                key={index}
                style={styles.workspaceMenuItem}
                onPress={() => {
                  setSelectedWorkspace(workspace);
                  setWorkspaceMenuVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.workspaceMenuText,
                    { color: colors.text },
                    workspace === selectedWorkspace && { color: primaryColor, fontFamily: fontFamilies.bodySemibold },
                  ]}
                >
                  {workspace}
                </Text>
              </TouchableOpacity>
            ))}
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
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  appBarActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
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
    backgroundColor: '#E1EFE6',
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
    color: '#4CAF50',
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
    marginBottom: 12,
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
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawerContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '80%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
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
    paddingVertical: 12,
  },
  workspaceMenuText: {
    fontSize: fontSizes.md,
    color: '#212121',
    fontFamily: fontFamilies.bodyMedium,
  },
});
