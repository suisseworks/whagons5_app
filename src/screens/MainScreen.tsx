import React, { useState, useRef, useMemo, useEffect } from 'react';
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
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList, TaskItem } from '../models/types';
import { TaskCard } from '../components/TaskCard';
import { ActiveTaskBanner } from '../components/ActiveTaskBanner';
import { AppDrawer } from '../components/AppDrawer';

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

  const [selectedNav, setSelectedNav] = useState(0);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  
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

  const renderContent = () => {
    if (selectedNav === 0) {
      return (
        <FlatList
          data={tasks}
          renderItem={renderTaskItem}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
        <Text style={styles.placeholderSubtitle}>{data.subtitle}</Text>
        <Text style={styles.comingSoon}>Coming soon</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* App Bar */}
      <View style={[styles.appBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setDrawerVisible(true)}
        >
          <MaterialIcons name="menu" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.workspaceSelector}
          onPress={() => setWorkspaceMenuVisible(true)}
        >
          <Text style={[styles.workspaceText, { color: colors.text }]}>
            {selectedWorkspace}
          </Text>
          <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.appBarActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => Alert.alert('Filters', 'Filters coming soon')}
          >
            <MaterialIcons name="filter-list" size={24} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setDrawerVisible(true)}
          >
            <MaterialIcons name="account-circle" size={24} color={colors.text} />
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
      <View style={styles.bottomBar}>
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
                  size={24}
                  color={selectedNav === index ? primaryColor : (item.color || colors.text)}
                />
                {index === 2 && (
                  <View style={styles.boardsBadge}>
                    <Text style={styles.boardsBadgeText}>5</Text>
                  </View>
                )}
              </View>
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
          <View style={styles.workspaceMenu}>
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
                    workspace === selectedWorkspace && { color: primaryColor, fontWeight: '600' },
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
    height: 72,
    paddingHorizontal: 8,
  },
  menuButton: {
    padding: 8,
  },
  workspaceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  workspaceText: {
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#F44336',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F6F2E8',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  bannerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
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
    borderRadius: 12,
  },
  swipeBackgroundRight: {
    left: 0,
    right: '50%',
    backgroundColor: '#E8F5E9',
  },
  swipeBackgroundLeft: {
    right: 0,
    left: '50%',
    justifyContent: 'flex-end',
    backgroundColor: '#E3F2FD',
  },
  swipeText: {
    marginHorizontal: 8,
    fontSize: 14,
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
    fontSize: 24,
    fontWeight: '600',
  },
  placeholderSubtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
  },
  comingSoon: {
    marginTop: 16,
    fontSize: 12,
    fontStyle: 'italic',
    color: '#9E9E9E',
  },
  bottomBar: {
    backgroundColor: '#FFFFFF',
    height: 68,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 20,
  },
  navItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navIconContainer: {
    position: 'relative',
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
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 36,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
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
    borderRadius: 8,
    paddingVertical: 8,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  workspaceMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  workspaceMenuText: {
    fontSize: 16,
    color: '#212121',
  },
});
