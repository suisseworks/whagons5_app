import React, { useEffect, useMemo } from 'react';
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
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import { useTenant } from '../hooks/useTenant';
import { formatTimestamp } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { tenantId } = useTenant();
  const { isAuthenticated } = useConvexAuth();
  const {
    notifications: localNotifications,
    unreadCount: localUnreadCount,
    markAsRead: localMarkAsRead,
    markAllAsRead: localMarkAllAsRead,
    clearAll,
    hasPermission,
  } = useNotifications();

  // Convex in-app notifications
  const convexNotifications = useQuery(
    api.settings.listNotifications,
    isAuthenticated && tenantId ? { tenantId } : 'skip'
  );
  const markAllReadMutation = useMutation(api.settings.markAllRead);
  const markReadMutation = useMutation(api.settings.markRead);
  const clearAllMutation = useMutation(api.settings.clearAllNotifications);

  // Merge: Convex notifications take priority, local ones as fallback
  const notifications: AppNotification[] = useMemo(() => {
    const fromConvex: AppNotification[] = (convexNotifications ?? []).map((n: any) => ({
      id: n._id,
      title: n.title ?? '',
      message: n.message ?? '',
      timestamp: new Date(n._creationTime),
      isRead: !!n.readAt,
      icon: 'notifications',
      color: '#607D8B',
      type: n.type,
      data: n.data,
    }));
    if (fromConvex.length > 0) return fromConvex;
    return localNotifications;
  }, [convexNotifications, localNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications]
  );

  const markAsRead = (id: string) => {
    localMarkAsRead(id);
    if (tenantId && convexNotifications?.length) {
      markReadMutation({ tenantId, id: id as any }).catch(() => {});
    }
  };

  const markAllAsRead = () => {
    localMarkAllAsRead();
    if (tenantId && convexNotifications?.length) {
      markAllReadMutation({ tenantId }).catch(() => {});
    }
  };

  // Mark all as read after a brief delay when viewing the screen
  useEffect(() => {
    if (unreadCount > 0) {
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNotificationPress = (notification: AppNotification) => {
    markAsRead(notification.id);

    // Navigate based on notification type
    const type = notification.type || notification.data?.type;
    if (type === 'task' || type === 'assignment' || type === 'sla' || type === 'approval') {
      // Could navigate to task detail if taskId is in data
      Alert.alert(notification.title, notification.message);
    } else if (type === 'message' || type === 'chat') {
      // Could navigate to the relevant chat
      Alert.alert(notification.title, notification.message);
    } else {
      Alert.alert(notification.title, notification.message);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All',
      'Remove all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearAll();
            if (tenantId) {
              clearAllMutation({ tenantId }).catch(() => {});
            }
          },
        },
      ],
    );
  };

  const renderNotification = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        {
          backgroundColor: colors.surface,
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7',
        },
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
            style={[
              styles.notificationTitle,
              { color: colors.text },
              !item.isRead && styles.notificationTitleUnread,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.isRead && (
            <View style={[styles.unreadDot, { backgroundColor: primaryColor }]} />
          )}
        </View>
        <Text
          style={[styles.notificationMessage, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
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
      <MaterialIcons
        name={hasPermission ? 'notifications-none' : 'notifications-off'}
        size={64}
        color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#BDBDBD'}
      />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {hasPermission ? 'No notifications' : 'Notifications disabled'}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {hasPermission
          ? "You're all caught up!"
          : 'Enable notifications in Settings to receive alerts'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll}>
            <MaterialIcons name="delete-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <TouchableOpacity
          style={[styles.unreadBanner, { backgroundColor: `${primaryColor}15` }]}
          onPress={markAllAsRead}
        >
          <Text style={[styles.unreadBannerText, { color: primaryColor }]}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <Text style={[styles.unreadBannerAction, { color: primaryColor }]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && { flex: 1 },
        ]}
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
  unreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unreadBannerText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  unreadBannerAction: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    textDecorationLine: 'underline',
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
    ...shadows.subtle,
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
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
