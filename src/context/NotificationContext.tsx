/**
 * NotificationContext – Manages push notification lifecycle for the entire app.
 *
 * Responsibilities:
 *   - Request notification permission after login
 *   - Retrieve and register FCM token with the backend
 *   - Listen for token refreshes and update the backend
 *   - Set up foreground message display
 *   - Handle notification taps (navigation)
 *   - Maintain a list of received notifications for the NotificationsScreen
 *   - Persist notification preferences
 *   - Clean up on logout
 */

import { Platform } from 'react-native';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { buildBaseUrl, getTenantHeaders } from '../config/api';
import {
  requestNotificationPermission,
  getFCMToken,
  onFCMTokenRefresh,
  setupForegroundMessageHandler,
  createNotificationChannels,
  onNotificationTap,
  getInitialNotification,
  NotificationTapPayload,
} from '../firebase/notificationService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  icon: string;
  color: string;
  type?: string;
  data?: Record<string, string>;
}

export interface NotificationPreferences {
  enabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  pushEnabled: true,
  emailEnabled: false,
  soundEnabled: true,
  vibrationEnabled: true,
};

interface NotificationContextType {
  /** Whether notification permission has been granted */
  hasPermission: boolean;
  /** The current FCM device token (null if not registered) */
  fcmToken: string | null;
  /** List of received notifications */
  notifications: AppNotification[];
  /** Count of unread notifications */
  unreadCount: number;
  /** Notification preferences */
  preferences: NotificationPreferences;
  /** Mark a notification as read */
  markAsRead: (notificationId: string) => void;
  /** Mark all notifications as read */
  markAllAsRead: () => void;
  /** Clear all notifications */
  clearAll: () => void;
  /** Update notification preferences */
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  /** The last notification tap payload (for navigation) */
  lastTapPayload: NotificationTapPayload | null;
  /** Clear the last tap payload after handling */
  clearTapPayload: () => void;
}

const STORAGE_KEY_PREFS = 'wh_notification_prefs';
const STORAGE_KEY_NOTIFICATIONS = 'wh_notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a notification type string to an icon name and color */
function getNotificationMeta(type?: string): { icon: string; color: string } {
  switch (type) {
    case 'task':
    case 'assignment':
      return { icon: 'assignment-turned-in', color: '#2196F3' };
    case 'sla':
      return { icon: 'warning', color: '#FF9800' };
    case 'approval':
      return { icon: 'check-circle', color: '#4CAF50' };
    case 'message':
    case 'chat':
      return { icon: 'chat', color: '#9C27B0' };
    case 'comment':
      return { icon: 'comment', color: '#9C27B0' };
    case 'done':
      return { icon: 'done-all', color: '#009688' };
    default:
      return { icon: 'notifications', color: '#607D8B' };
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token: authToken, subdomain } = useAuth();

  const [hasPermission, setHasPermission] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [lastTapPayload, setLastTapPayload] = useState<NotificationTapPayload | null>(null);

  const cleanupRefs = useRef<(() => void)[]>([]);

  // -----------------------------------------------------------------------
  // Restore persisted preferences + notifications
  // -----------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [prefsJson, notifsJson] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_PREFS),
          AsyncStorage.getItem(STORAGE_KEY_NOTIFICATIONS),
        ]);
        if (prefsJson) {
          setPreferences({ ...DEFAULT_PREFS, ...JSON.parse(prefsJson) });
        }
        if (notifsJson) {
          const parsed: AppNotification[] = JSON.parse(notifsJson);
          // Rehydrate Date objects
          setNotifications(
            parsed.map(n => ({ ...n, timestamp: new Date(n.timestamp) })),
          );
        }
      } catch {
        // Silent
      }
    })();
  }, []);

  // -----------------------------------------------------------------------
  // Register FCM token with the backend
  // -----------------------------------------------------------------------
  const registerTokenWithBackend = useCallback(
    async (deviceToken: string) => {
      if (!authToken) return;

      try {
        // FCM token routes are landlord-level (no tenant prefix needed)
        // but we still build via subdomain in case the API host uses it
        const baseUrl = buildBaseUrl(subdomain ?? undefined);
        const resp = await fetch(`${baseUrl}/fcm-tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${authToken}`,
            ...getTenantHeaders(subdomain ?? undefined),
          },
          body: JSON.stringify({
            fcm_token: deviceToken,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            app_version: '1.0.0',
          }),
        });

        if (resp.ok) {
          console.log('[Notifications] Token registered with backend');
        } else {
          console.warn('[Notifications] Token registration failed:', resp.status);
        }
      } catch (err) {
        console.warn('[Notifications] Token registration error:', err);
      }
    },
    [authToken, subdomain],
  );

  // -----------------------------------------------------------------------
  // Main setup effect: runs when user logs in
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!authToken || !subdomain) {
      // Logged out – clean up
      cleanupRefs.current.forEach(fn => fn());
      cleanupRefs.current = [];
      setFcmToken(null);
      setHasPermission(false);
      return;
    }

    let cancelled = false;

    const setup = async () => {
      // 1. Create notification channels
      await createNotificationChannels();

      // 2. Request permission
      const granted = await requestNotificationPermission();
      if (cancelled) return;
      setHasPermission(granted);

      if (!granted) {
        console.log('[Notifications] Permission not granted, skipping FCM setup');
        return;
      }

      // 3. Get FCM token
      const token = await getFCMToken();
      if (cancelled) return;
      setFcmToken(token);

      // 4. Register token with backend
      if (token) {
        await registerTokenWithBackend(token);
      }

      // 5. Listen for token refreshes
      const unsubTokenRefresh = onFCMTokenRefresh(async (newToken) => {
        console.log('[Notifications] Token refreshed');
        setFcmToken(newToken);
        await registerTokenWithBackend(newToken);
      });
      cleanupRefs.current.push(unsubTokenRefresh);

      // 6. Set up foreground message handler
      const unsubForeground = setupForegroundMessageHandler();
      cleanupRefs.current.push(unsubForeground);

      // 7. Listen for notification taps
      const unsubTap = onNotificationTap((payload) => {
        console.log('[Notifications] Tap:', JSON.stringify(payload));
        setLastTapPayload(payload);

        // Also add to notifications list
        if (payload.type) {
          const meta = getNotificationMeta(payload.type);
          const notif: AppNotification = {
            id: String(Date.now()),
            title: (payload as any).title || 'Notification',
            message: (payload as any).body || '',
            timestamp: new Date(),
            isRead: false,
            icon: meta.icon,
            color: meta.color,
            type: payload.type,
            data: payload as Record<string, string>,
          };
          setNotifications(prev => [notif, ...prev]);
        }
      });
      cleanupRefs.current.push(unsubTap);

      // 8. Check if app was opened from a killed-state notification
      const initialPayload = await getInitialNotification();
      if (initialPayload && !cancelled) {
        setLastTapPayload(initialPayload);
      }
    };

    setup();

    return () => {
      cancelled = true;
      cleanupRefs.current.forEach(fn => fn());
      cleanupRefs.current = [];
    };
  }, [authToken, subdomain, registerTokenWithBackend]);

  // -----------------------------------------------------------------------
  // Persist notifications when they change
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (notifications.length > 0) {
      // Keep only the most recent 100
      const trimmed = notifications.slice(0, 100);
      AsyncStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(trimmed)).catch(() => {});
    }
  }, [notifications]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    AsyncStorage.removeItem(STORAGE_KEY_NOTIFICATIONS).catch(() => {});
  }, []);

  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearTapPayload = useCallback(() => {
    setLastTapPayload(null);
  }, []);

  // -----------------------------------------------------------------------
  // Listen for incoming foreground messages and add to notification list
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!authToken || !hasPermission) return;

    // We set up a second onMessage listener purely to capture messages
    // into the in-app notification list. The first listener (in
    // setupForegroundMessageHandler) handles displaying them via Notifee.
    let unsubscribe: (() => void) | undefined;

    try {
      const { getMessaging } = require('@react-native-firebase/messaging');
      const { getApp } = require('@react-native-firebase/app');
      const { onMessage } = require('@react-native-firebase/messaging');
      const messaging = getMessaging(getApp());

      unsubscribe = onMessage(messaging, (remoteMessage: any) => {
        const { notification, data } = remoteMessage;
        const type = data?.type as string | undefined;
        const meta = getNotificationMeta(type);

        const notif: AppNotification = {
          id: remoteMessage.messageId || String(Date.now()),
          title: notification?.title || data?.title || 'Notification',
          message: notification?.body || data?.body || '',
          timestamp: new Date(),
          isRead: false,
          icon: meta.icon,
          color: meta.color,
          type,
          data: data as Record<string, string>,
        };

        setNotifications(prev => [notif, ...prev.slice(0, 99)]);
      });
    } catch {
      // FCM not available (e.g., dev without Google Play Services)
    }

    return () => unsubscribe?.();
  }, [authToken, hasPermission]);

  return (
    <NotificationContext.Provider
      value={{
        hasPermission,
        fcmToken,
        notifications,
        unreadCount,
        preferences,
        markAsRead,
        markAllAsRead,
        clearAll,
        updatePreferences,
        lastTapPayload,
        clearTapPayload,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
