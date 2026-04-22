import React, { useMemo } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme, LinkingOptions, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';

// Screens
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MainScreen } from '../screens/MainScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TaskShareLinkScreen } from '../screens/TaskShareLinkScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { SharedTaskDetailScreen } from '../screens/SharedTaskDetailScreen';
import { CreateTaskScreen } from '../screens/CreateTaskScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
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
  const shareBaseUrl = process.env.EXPO_PUBLIC_TASK_SHARE_BASE_URL?.trim();
  const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();

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

    for (const candidate of shareCandidates) {
      try {
        const withPlaceholder = candidate.includes('{tenant}')
          ? candidate.replaceAll('{tenant}', 'tenant')
          : candidate;
        prefixes.push(new URL(withPlaceholder).origin);
      } catch {}
    }

    return {
      prefixes,
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
        },
      },
    };
  }, [convexSiteUrl, shareBaseUrl]);

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      <AppStatusBar />
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="TenantSelect" component={TenantSelectScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="TaskShareLink" component={TaskShareLinkScreen} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
        <Stack.Screen name="SharedTaskDetail" component={SharedTaskDetailScreen} />
        <Stack.Screen name="CreateTask" component={CreateTaskScreen} />
        <Stack.Screen name="VoiceTaskReview" component={VoiceTaskReviewScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Themes" component={ThemesScreen} />
        <Stack.Screen name="BoardDetail" component={BoardDetailScreen} />
        <Stack.Screen name="SpotsMap" component={SpotsMapScreen} />
        <Stack.Screen name="Gamification" component={GamificationScreen} />
        <Stack.Screen name="PointHistory" component={PointHistoryScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
