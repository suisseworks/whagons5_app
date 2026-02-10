import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { NotificationItem } from '../models/types';
import { formatTimestamp } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

const initialNotifications: NotificationItem[] = [
  {
    id: '1',
    title: 'Task assigned to you',
    message: 'Alex assigned "Check HVAC filters" to you',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    isRead: false,
    icon: 'assignment-turned-in',
    color: '#2196F3',
  },
  {
    id: '2',
    title: 'SLA breach warning',
    message: 'Task "Test emergency lights" is approaching SLA deadline',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isRead: false,
    icon: 'warning',
    color: '#FF9800',
  },
  {
    id: '3',
    title: 'Task approved',
    message: 'Your task "Service elevator A" has been approved',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    isRead: true,
    icon: 'check-circle',
    color: '#4CAF50',
  },
  {
    id: '4',
    title: 'New comment',
    message: 'Priya commented on "Inspect sprinklers"',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    isRead: true,
    icon: 'comment',
    color: '#9C27B0',
  },
  {
    id: '5',
    title: 'Task completed',
    message: 'Sam marked "Grease door hinges" as done',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isRead: true,
    icon: 'done-all',
    color: '#009688',
  },
];

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { setNotificationCount } = useTasks();
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);

  useEffect(() => {
    // Mark all as read after 500ms
    const timer = setTimeout(() => {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setNotificationCount(0);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleNotificationPress = (notification: NotificationItem) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notification.id ? { ...n, isRead: true } : n))
    );
    Alert.alert('Opening', notification.title);
  };

  const renderNotification = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' },
        !item.isRead && {
          backgroundColor: isDarkMode ? 'rgba(63, 143, 140, 0.18)' : '#EAF1F1',
          borderColor: isDarkMode ? 'rgba(63, 143, 140, 0.3)' : '#D7E7E4',
        },
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${item.color}1A` }]}>
        <MaterialIcons name={item.icon as any} size={24} color={item.color} />
      </View>

      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text
            style={[styles.notificationTitle, !item.isRead && styles.notificationTitleUnread]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: primaryColor }]} />}
        </View>
        <Text style={[styles.notificationMessage, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
          {formatTimestamp(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="notifications-none" size={64} color="#BDBDBD" />
      <Text style={styles.emptyTitle}>No notifications</Text>
      <Text style={styles.emptySubtitle}>You're all caught up!</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  notificationCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6E1D7',
    ...shadows.subtle,
  },
  notificationCardUnread: {
    backgroundColor: '#EAF1F1',
    borderColor: '#D7E7E4',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
    marginLeft: 16,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationTitle: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  notificationTitleUnread: {
    fontFamily: fontFamilies.bodyBold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  notificationMessage: {
    marginTop: 4,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    fontFamily: fontFamilies.bodyRegular,
  },
  notificationTime: {
    marginTop: 6,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    color: '#6C746F',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#8B8E84',
  },
});
