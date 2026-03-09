/**
 * notificationService.ts – Firebase Cloud Messaging (FCM) service.
 *
 * Handles:
 *   - Permission requests (Android 13+ POST_NOTIFICATIONS)
 *   - FCM device token retrieval + refresh
 *   - Foreground message display via Notifee
 *   - Background message handler registration
 *   - Notification tap handling (navigation)
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { getMessaging, getToken, onMessage, onTokenRefresh } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AndroidStyle,
  EventType,
} from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import { getChannelIdForTone, getAllToneChannelConfigs } from '../utils/notificationTones';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL_ID_DEFAULT = 'whagons_default';
const CHANNEL_ID_MESSAGES = 'whagons_messages';
const CHANNEL_ID_TASKS = 'whagons_tasks';

// ---------------------------------------------------------------------------
// Channel setup (Android)
// ---------------------------------------------------------------------------

/**
 * Create Android notification channels. Safe to call multiple times
 * (Notifee is idempotent on channel creation).
 */
export async function createNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Core channels
  const coreChannels = [
    notifee.createChannel({
      id: CHANNEL_ID_DEFAULT,
      name: 'General',
      description: 'General notifications',
      importance: AndroidImportance.DEFAULT,
    }),
    notifee.createChannel({
      id: CHANNEL_ID_MESSAGES,
      name: 'Messages',
      description: 'Chat and collaboration messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    }),
    notifee.createChannel({
      id: CHANNEL_ID_TASKS,
      name: 'Tasks',
      description: 'Task assignments, updates, and SLA alerts',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    }),
  ];

  // Per-tone channels (one for each predefined notification tone)
  const toneChannels = getAllToneChannelConfigs().map(cfg =>
    notifee.createChannel({
      id: cfg.id,
      name: cfg.name,
      description: `Category notification tone: ${cfg.name}`,
      importance: cfg.silent ? AndroidImportance.LOW : AndroidImportance.HIGH,
      sound: cfg.silent ? undefined : cfg.sound,
      vibration: !cfg.silent,
    }),
  );

  await Promise.all([...coreChannels, ...toneChannels]);
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/**
 * Request notification permission from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Android 13+ needs runtime permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[Notifications] Android POST_NOTIFICATIONS denied');
        return false;
      }
    }

    // FCM also has its own authorization (mainly relevant for iOS)
    const messaging = getMessaging(getApp());
    const authStatus = await messaging.requestPermission();

    // authStatus is 1 (AUTHORIZED) or 2 (PROVISIONAL) on success
    const granted = authStatus === 1 || authStatus === 2;
    console.log('[Notifications] FCM permission:', granted ? 'granted' : 'denied');
    return granted;
  } catch (err) {
    console.error('[Notifications] Permission request failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Get the current FCM device token.
 * Returns null if permission was not granted or token retrieval fails.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging);
    console.log('[Notifications] FCM token (first 20):', token?.substring(0, 20) + '...');
    return token;
  } catch (err) {
    console.error('[Notifications] Failed to get FCM token:', err);
    return null;
  }
}

/**
 * Listen for FCM token refreshes. Returns an unsubscribe function.
 */
export function onFCMTokenRefresh(callback: (token: string) => void): () => void {
  const messaging = getMessaging(getApp());
  return onTokenRefresh(messaging, callback);
}

// ---------------------------------------------------------------------------
// Foreground message handler
// ---------------------------------------------------------------------------

/**
 * Subscribe to foreground FCM messages and display them as local notifications
 * via Notifee. Returns an unsubscribe function.
 */
export function setupForegroundMessageHandler(): () => void {
  const messaging = getMessaging(getApp());

  return onMessage(messaging, async (remoteMessage) => {
    console.log('[Notifications] Foreground message:', JSON.stringify(remoteMessage.data));

    const { notification, data } = remoteMessage;

    // Determine which channel to use.
    // Priority: category notification_tone → message-type channel → default
    const notificationTone = data?.notification_tone as string | undefined;
    let channelId: string;

    if (notificationTone) {
      // Use tone-specific channel when the category has a tone configured
      channelId = getChannelIdForTone(notificationTone);
    } else {
      // Fall back to type-based channel selection
      channelId = CHANNEL_ID_DEFAULT;
      const type = data?.type as string | undefined;
      if (type === 'message' || type === 'chat') {
        channelId = CHANNEL_ID_MESSAGES;
      } else if (type === 'task' || type === 'sla' || type === 'assignment') {
        channelId = CHANNEL_ID_TASKS;
      }
    }

    // Display with Notifee
    await notifee.displayNotification({
      title: notification?.title || data?.title as string || 'Whagons',
      body: notification?.body || data?.body as string || '',
      data: data as Record<string, string> | undefined,
      android: {
        channelId,
        smallIcon: 'ic_notification', // falls back to app icon if not found
        pressAction: {
          id: 'default',
        },
        importance: AndroidImportance.HIGH,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Background message handler (must be called from index.ts)
// ---------------------------------------------------------------------------

/**
 * Register the background/quit-state message handler.
 * This MUST be called at the top level of your entry file (index.ts),
 * outside of any component, before registerRootComponent.
 */
export function registerBackgroundMessageHandler(): void {
  const messaging = getMessaging(getApp());
  messaging.setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[Notifications] Background message:', JSON.stringify(remoteMessage.data));

    // Background messages on Android are automatically displayed by FCM
    // if they contain a `notification` payload. For data-only messages,
    // we display them via Notifee:
    if (!remoteMessage.notification) {
      const { data } = remoteMessage;

      // Determine channel: category tone → type-based → default
      const notificationTone = data?.notification_tone as string | undefined;
      let channelId: string;

      if (notificationTone) {
        channelId = getChannelIdForTone(notificationTone);
      } else {
        channelId = CHANNEL_ID_DEFAULT;
        const type = data?.type as string | undefined;
        if (type === 'message' || type === 'chat') {
          channelId = CHANNEL_ID_MESSAGES;
        } else if (type === 'task' || type === 'sla' || type === 'assignment') {
          channelId = CHANNEL_ID_TASKS;
        }
      }

      await notifee.displayNotification({
        title: data?.title as string || 'Whagons',
        body: data?.body as string || '',
        data: data as Record<string, string> | undefined,
        android: {
          channelId,
          smallIcon: 'ic_notification',
          pressAction: {
            id: 'default',
          },
        },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Notification tap handlers
// ---------------------------------------------------------------------------

export interface NotificationTapPayload {
  type?: string;
  taskId?: string;
  chatId?: string;
  spaceId?: string;
  userId?: string;
  [key: string]: string | undefined;
}

/**
 * Subscribe to notification tap events (foreground + background).
 * Returns an unsubscribe function.
 */
export function onNotificationTap(
  callback: (payload: NotificationTapPayload) => void,
): () => void {
  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as NotificationTapPayload | undefined;
      callback(data ?? {});
    }
  });
}

/**
 * Register a background event handler for Notifee.
 * Must be called at the entry point level (index.ts).
 */
export function registerBackgroundNotifeeHandler(): void {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS) {
      // The app will be opened; navigation is handled in the foreground handler
      console.log('[Notifications] Background tap:', JSON.stringify(detail.notification?.data));
    }
  });
}

// ---------------------------------------------------------------------------
// Get initial notification (app opened from killed state via notification)
// ---------------------------------------------------------------------------

/**
 * Check if the app was opened by tapping a notification while the app
 * was in a killed state. Returns the notification data payload or null.
 */
export async function getInitialNotification(): Promise<NotificationTapPayload | null> {
  try {
    const messaging = getMessaging(getApp());
    const remoteMessage = await messaging.getInitialNotification();
    if (remoteMessage?.data) {
      return remoteMessage.data as NotificationTapPayload;
    }

    // Also check Notifee's initial notification
    const notifeeInitial = await notifee.getInitialNotification();
    if (notifeeInitial?.notification?.data) {
      return notifeeInitial.notification.data as NotificationTapPayload;
    }

    return null;
  } catch {
    return null;
  }
}
