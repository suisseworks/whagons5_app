import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotifications, AppNotification, getNotificationMeta } from '../context/NotificationContext';
import { useTasks } from '../context/TaskContext';
import { useTenant } from '../hooks/useTenant';
import { formatTimestamp, resolveNotificationNavigation } from '../utils/helpers';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { useOfflineMutation } from '../hooks/useOfflineMutation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateGroup(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'This Week';
  return 'Earlier';
}

const DATE_GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { tenantId } = useTenant();
  const { unfilteredTasks } = useTasks();
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
  const markAllReadMutation = useOfflineMutation(api.settings.markAllRead, 'settings.markAllRead');
  const markReadMutation = useOfflineMutation(api.settings.markRead, 'settings.markRead');
  const clearAllMutation = useOfflineMutation(api.settings.clearAllNotifications, 'settings.clearAllNotifications');

  // Merge: Convex notifications take priority, local ones as fallback
  const notifications: AppNotification[] = useMemo(() => {
    const fromConvex: AppNotification[] = (convexNotifications ?? []).map((n: any) => {
      const meta = getNotificationMeta(n.type);
      return {
        id: n._id,
        title: n.title ?? '',
        message: n.message ?? '',
        timestamp: new Date(n._creationTime),
        isRead: !!n.readAt,
        icon: meta.icon,
        color: meta.color,
        type: n.type,
        data: n.data,
      };
    });
    if (fromConvex.length > 0) return fromConvex;
    return localNotifications;
  }, [convexNotifications, localNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications]
  );

  // Group notifications by date
  const sections = useMemo(() => {
    const groups: Record<string, AppNotification[]> = {};

    // Sort newest first, then group by date
    const sorted = [...notifications].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    for (const n of sorted) {
      const group = getDateGroup(n.timestamp);
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    }

    return DATE_GROUP_ORDER
      .filter(key => groups[key]?.length > 0)
      .map(key => ({ title: key, data: groups[key] }));
  }, [notifications]);

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

    const target = resolveNotificationNavigation(notification as any, unfilteredTasks);
    if (target?.screen === 'TaskDetail') {
      navigation.navigate('TaskDetail', target.params);
      return;
    }
    if (target?.screen === 'SharedTaskDetail') {
      navigation.navigate('SharedTaskDetail', target.params);
      return;
    }
    if (target?.screen === 'BoardDetail') {
      navigation.navigate('BoardDetail', target.params);
      return;
    }
    if (target?.screen === 'Main') {
      navigation.navigate('Main', target.params);
      return;
    }

    if (notification.type === 'message' || notification.type === 'chat' || notification.type === 'comment' || notification.type === 'task_comment' || notification.type === 'mention' || notification.type === 'call') {
      navigation.navigate('Main', { tab: 1 });
    } else {
      Alert.alert(notification.title, notification.message);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      t('notifications.clearAllTitle'),
      t('notifications.clearAllMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('notifications.clearButton'),
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

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  const sectionTitleMap: Record<string, string> = {
    'Today': t('notifications.sectionToday'),
    'Yesterday': t('notifications.sectionYesterday'),
    'This Week': t('notifications.sectionThisWeek'),
    'Earlier': t('notifications.sectionEarlier'),
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeaderContainer}>
      <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
        {sectionTitleMap[section.title] ?? section.title}
      </Text>
    </View>
  );

  const renderNotification = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        {
          backgroundColor: colors.surface,
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7',
        },
        !item.isRead && {
          backgroundColor: isDarkMode ? 'rgba(63, 143, 140, 0.10)' : '#F5F9F9',
          borderLeftColor: item.color,
          borderLeftWidth: 3,
        },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${item.color}15` }]}>
        <MaterialIcons name={item.icon as any} size={22} color={item.color} />
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
          <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>
        <Text
          style={[styles.notificationMessage, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>

      {!item.isRead && (
        <View style={[styles.unreadDot, { backgroundColor: primaryColor }]} />
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View
        style={[
          styles.emptyIconCircle,
          { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F5F5F5' },
        ]}
      >
        <MaterialIcons
          name={hasPermission ? 'notifications-none' : 'notifications-off'}
          size={48}
          color={isDarkMode ? 'rgba(255,255,255,0.2)' : '#BDBDBD'}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {hasPermission ? t('notifications.emptyTitleAllCaughtUp') : t('notifications.emptyTitleDisabled')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {hasPermission
          ? t('notifications.emptySubtitleEnabled')
          : t('notifications.emptySubtitleDisabled')}
      </Text>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('notifications.title')}</Text>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllAsRead}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="done-all" size={22} color={primaryColor} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={handleClearAll}
              style={{ marginLeft: 16 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="delete-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notification list */}
      <SectionList
        sections={sections}
        renderItem={renderNotification}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          sections.length === 0 && { flex: 1 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={renderEmpty}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    ...shadows.subtle,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
    marginLeft: spacing.sm + 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  notificationTitleUnread: {
    fontFamily: fontFamilies.bodyBold,
  },
  notificationMessage: {
    marginTop: 3,
    fontSize: fontSizes.xs + 1,
    lineHeight: 18,
    fontFamily: fontFamilies.bodyRegular,
  },
  notificationTime: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    alignSelf: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
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
