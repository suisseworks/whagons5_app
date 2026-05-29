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
import { api } from '../../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { useTenant } from '../hooks/useTenant';
import { APP_VERSION } from '../config/version';
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
import { useOfflineMutation } from '../hooks/useOfflineMutation';

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

function getServerNotificationId(data?: Record<string, unknown> | null): string | null {
  const value = data?.notification_id ?? data?.notificationId;
  return value == null || value === '' ? null : String(value);
}

function prependUniqueNotification(prev: AppNotification[], notification: AppNotification): AppNotification[] {
  return [notification, ...prev.filter((item) => item.id !== notification.id)].slice(0, 100);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a notification type string to an icon name and color */
export function getNotificationMeta(type?: string): { icon: string; color: string } {
  switch (type) {
    case 'task':
    case 'task_updated':
    case 'task_status_changed':
    case 'task_assigned':
    case 'task_created_unassigned':
    case 'task_unassigned':
    case 'reported_task_seen':
    case 'status_changed':
    case 'status_change':
    case 'assignment':
      return { icon: 'assignment-turned-in', color: '#2196F3' };
    case 'task_completed':
    case 'done':
      return { icon: 'done-all', color: '#009688' };
    case 'task_shared':
      return { icon: 'share', color: '#2196F3' };
    case 'sla':
      return { icon: 'warning', color: '#FF9800' };
    case 'approval':
    case 'approval_requested':
    case 'approval_approved':
    case 'approval_rejected':
    case 'approval_decision':
      return { icon: 'check-circle', color: '#4CAF50' };
    case 'message':
    case 'chat':
      return { icon: 'chat', color: '#9C27B0' };
    case 'board_message':
      return { icon: 'campaign', color: '#F97316' };
    case 'call':
      return { icon: 'call', color: '#2E7D32' };
    case 'comment':
      return { icon: 'comment', color: '#9C27B0' };
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
  const { tenantId } = useTenant();
  const registerTokenMutation = useOfflineMutation(api.pushNotificationHelpers.registerToken, 'pushNotificationHelpers.registerToken');

  const [hasPermission, setHasPermission] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [lastTapPayload, setLastTapPayload] = useState<NotificationTapPayload | null>(null);

  const cleanupRefs = useRef<(() => void)[]>([]);
  const tenantIdRef = useRef(tenantId);
  const fcmTokenRef = useRef<string | null>(null);
  const registerTokenMutationRef = useRef(registerTokenMutation);

  useEffect(() => {
    tenantIdRef.current = tenantId;
  }, [tenantId]);

  useEffect(() => {
    fcmTokenRef.current = fcmToken;
  }, [fcmToken]);

  useEffect(() => {
    registerTokenMutationRef.current = registerTokenMutation;
  }, [registerTokenMutation]);

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
  // Register FCM token with the backend via Convex
  // -----------------------------------------------------------------------
  const registerTokenWithBackend = useCallback(
    async (deviceToken: string) => {
      const currentTenantId = tenantIdRef.current;
      if (!currentTenantId) {
        console.log('[Notifications] No tenantId — skipping FCM registration');
        return;
      }
      try {
        const deviceId = `${Platform.OS}-${APP_VERSION}`;
        await registerTokenMutationRef.current({
          tenantId: currentTenantId,
          fcmToken: deviceToken,
          platform: Platform.OS,
          deviceId,
        });
        console.log('[Notifications] FCM token registered with Convex');
      } catch (err) {
        console.error('[Notifications] Failed to register FCM token:', err);
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Main setup effect: runs when user logs in
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!authToken || !subdomain) {
      // AuthContext unregisters the token before Firebase sign-out. Once this
      // effect sees logged-out state, Convex auth may already be unavailable.
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
        if (payload.type && !getServerNotificationId(payload as Record<string, unknown>)) {
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
          setNotifications(prev => prependUniqueNotification(prev, notif));
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
  }, [authToken, subdomain, tenantId, registerTokenWithBackend]);

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

  const updateMeMutation = useOfflineMutation(api.users.updateMe, 'users.updateMe');
  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(next)).catch(() => {});
      // Sync master toggles to Convex user.settings.notifications
      if (tenantId) {
        updateMeMutation({
          tenantId,
          settings: { mobile_notifications: next },
        }).catch(() => {});
      }
      return next;
    });
  }, [tenantId, updateMeMutation]);

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
        if (getServerNotificationId(data)) return;

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

        setNotifications(prev => prependUniqueNotification(prev, notif));
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
