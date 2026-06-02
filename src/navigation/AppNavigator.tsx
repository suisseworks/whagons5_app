import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Linking, Platform, StatusBar, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme, LinkingOptions, getStateFromPath as defaultGetStateFromPath, useNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useNetwork } from '../context/NetworkContext';
import { useLanguage } from '../context/LanguageContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import { useAuth } from '../context/AuthContext';
import { fontFamilies } from '../config/designTokens';

// Screens
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NoTenantsScreen } from '../screens/NoTenantsScreen';
import { MainScreen } from '../screens/MainScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TaskShareLinkScreen } from '../screens/TaskShareLinkScreen';
import { NfcTapScreen } from '../screens/NfcTapScreen';
import { NfcProgramTagScreen } from '../screens/NfcProgramTagScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { SharedTaskDetailScreen } from '../screens/SharedTaskDetailScreen';
import { CreateTaskScreen } from '../screens/CreateTaskScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { OfflineQueueScreen } from '../screens/OfflineQueueScreen';
import { ThemesScreen } from '../screens/ThemesScreen';
import { BoardDetailScreen } from '../screens/BoardDetailScreen';
import { TenantSelectScreen } from '../screens/TenantSelectScreen';
import { SpotsMapScreen } from '../screens/SpotsMapScreen';
import { GamificationScreen } from '../screens/GamificationScreen';
import { PointHistoryScreen } from '../screens/PointHistoryScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { VoiceTaskReviewScreen } from '../screens/VoiceTaskReviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppStatusBar = () => {
  const { isDarkMode, colors } = useTheme();
  return <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent={true} />;
};

export const AppNavigator: React.FC = () => {
  const { isDarkMode, colors } = useTheme();
  const { isOnline } = useNetwork();
  const { t } = useLanguage();
  const { isLoading: authLoading, token, hasNoTenants } = useAuth();
  const { pendingCount } = useMutationQueue();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [showBackOnlineBadge, setShowBackOnlineBadge] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootStackParamList | undefined>();
  const wasOfflineRef = useRef(false);
  const authResetPendingRef = useRef(false);
  const backOnlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareBaseUrl = process.env.EXPO_PUBLIC_TASK_SHARE_BASE_URL?.trim();
  const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();
  const nfcBaseDomain = (process.env.EXPO_PUBLIC_NFC_BASE_DOMAIN?.trim() || 'whagons.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
        backOnlineTimerRef.current = null;
      }
      setShowBackOnlineBadge(false);
      return;
    }

    if (!wasOfflineRef.current) return;

    wasOfflineRef.current = false;
    setShowBackOnlineBadge(true);
    if (backOnlineTimerRef.current) {
      clearTimeout(backOnlineTimerRef.current);
    }
    backOnlineTimerRef.current = setTimeout(() => {
      setShowBackOnlineBadge(false);
      backOnlineTimerRef.current = null;
    }, 1000);

    return () => {
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
      }
    };
  }, [isOnline]);

  const showConnectivityBadge = currentRouteName !== 'Login' && currentRouteName !== 'Splash' && (!isOnline || showBackOnlineBadge);
  const offlineLabel = pendingCount > 0
    ? t('main.syncPending', { base: t('main.syncOffline'), count: pendingCount })
    : t('main.syncOffline');
  const connectivityLabel = isOnline ? t('main.backOnline') : offlineLabel;

  useEffect(() => {
    if (authLoading || !navigationRef.isReady()) return;

    const currentRoute = navigationRef.getCurrentRoute()?.name;
    if (hasNoTenants && currentRoute !== 'NoTenants' && currentRoute !== 'Splash' && !authResetPendingRef.current) {
      authResetPendingRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (navigationRef.isReady()) {
              navigationRef.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'NoTenants' }] }),
              );
            }
            authResetPendingRef.current = false;
          });
        });
      });
      return;
    }

    if (!token && !hasNoTenants && currentRoute !== 'Login' && currentRoute !== 'Splash' && !authResetPendingRef.current) {
      authResetPendingRef.current = true;
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (navigationRef.isReady()) {
              navigationRef.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
              );
            }
            authResetPendingRef.current = false;
          });
        });
      });
    }
  }, [authLoading, hasNoTenants, navigationRef, token]);

  const navigationTheme: Theme = useMemo(
    () => ({
      ...(isDarkMode ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDarkMode ? DarkTheme.colors : DefaultTheme.colors),
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        primary: colors.primary,
      },
    }),
    [isDarkMode, colors],
  );

  const linking = useMemo<LinkingOptions<RootStackParamList>>(() => {
    const prefixes = ['whagons://'];
    const shareCandidates = [shareBaseUrl, convexSiteUrl].filter(
      (value): value is string => Boolean(value),
    );
    if (nfcBaseDomain) {
      prefixes.push(`https://${nfcBaseDomain}`, `https://app.${nfcBaseDomain}`, `https://*.${nfcBaseDomain}`);
    }

    for (const candidate of shareCandidates) {
      try {
        const withPlaceholder = candidate.includes('{tenant}')
          ? candidate.replaceAll('{tenant}', 'tenant')
          : candidate;
        prefixes.push(new URL(withPlaceholder).origin);
      } catch {}
    }

    const normalizeIncomingUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        const isNfcTap = parsed.pathname.startsWith('/nfc/tap/');
        const isNfcProgram = parsed.pathname.startsWith('/nfc/program/');
        if (!isNfcTap && !isNfcProgram) return url;

        const pathId = parsed.pathname.split('/').filter(Boolean).at(-1);
        if (!pathId) return url;

        const suffix = `.${nfcBaseDomain}`;
        const tenantId = parsed.hostname.endsWith(suffix)
          ? parsed.hostname.slice(0, -suffix.length)
          : null;
        const normalizedTenant = tenantId && tenantId !== 'app' && tenantId !== 'www' ? tenantId : null;
        const params = new URLSearchParams();
        if (normalizedTenant) params.set('tenantId', normalizedTenant);
        if (isNfcProgram) {
          const programUrl = parsed.searchParams.get('url');
          if (programUrl) params.set('url', programUrl);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return `whagons://nfc/${isNfcTap ? 'tap' : 'program'}/${encodeURIComponent(pathId)}${query}`;
      } catch {
        return url;
      }
    };

    return {
      prefixes,
      async getInitialURL() {
        const initialUrl = await Linking.getInitialURL();
        return initialUrl ? normalizeIncomingUrl(initialUrl) : null;
      },
      subscribe(listener) {
        const subscription = Linking.addEventListener('url', ({ url }) => {
          listener(normalizeIncomingUrl(url));
        });
        return () => subscription.remove();
      },
      getStateFromPath(path, options) {
        try {
          if (path.startsWith('share/task')) {
            const parsed = new URL(`https://placeholder/${path}`);
            const token = parsed.searchParams.get('token');
            if (token) {
              return defaultGetStateFromPath(`task-share/${encodeURIComponent(token)}`, options);
            }
          }
        } catch {}
        return defaultGetStateFromPath(path, options);
      },
      config: {
        screens: {
          TaskShareLink: {
            path: 'task-share/:token',
            alias: ['share/task'],
            parse: {
              token: (value: string) => decodeURIComponent(value),
            },
          },
          NfcTap: {
            path: 'nfc/tap/:uuid',
            parse: {
              uuid: (value: string) => decodeURIComponent(value),
              tenantId: (value: string) => decodeURIComponent(value),
            },
          },
          NfcProgramTag: {
            path: 'nfc/program/:tagId',
            parse: {
              tagId: (value: string) => decodeURIComponent(value),
              url: (value: string) => decodeURIComponent(value),
              tenantId: (value: string) => decodeURIComponent(value),
            },
          },
        },
      },
    };
  }, [convexSiteUrl, nfcBaseDomain, shareBaseUrl]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linking}
      onReady={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name)}
      onStateChange={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name)}
    >
      <AppStatusBar />
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="NoTenants" component={NoTenantsScreen} />
        <Stack.Screen name="TenantSelect" component={TenantSelectScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="TaskShareLink" component={TaskShareLinkScreen} />
        <Stack.Screen name="NfcTap" component={NfcTapScreen} />
        <Stack.Screen name="NfcProgramTag" component={NfcProgramTagScreen} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="SharedTaskDetail" component={SharedTaskDetailScreen} />
        <Stack.Screen name="CreateTask" component={CreateTaskScreen} />
        <Stack.Screen name="VoiceTaskReview" component={VoiceTaskReviewScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="OfflineQueue" component={OfflineQueueScreen} />
        <Stack.Screen name="Themes" component={ThemesScreen} />
        <Stack.Screen name="BoardDetail" component={BoardDetailScreen} />
        <Stack.Screen name="SpotsMap" component={SpotsMapScreen} />
        <Stack.Screen name="Gamification" component={GamificationScreen} />
        <Stack.Screen name="PointHistory" component={PointHistoryScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
      </Stack.Navigator>
      {showConnectivityBadge && (
        <View style={styles.offlineBannerContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (navigationRef.isReady()) {
                navigationRef.navigate('OfflineQueue');
              }
            }}
            style={[styles.offlineBanner, isOnline && styles.onlineBanner]}
          >
            <Text style={styles.offlineBannerText}>{connectivityLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  offlineBannerContainer: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  offlineBanner: {
    backgroundColor: '#B45309',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  onlineBanner: {
    backgroundColor: '#15803D',
  },
  offlineBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.3,
  },
});
