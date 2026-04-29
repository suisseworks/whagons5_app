import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { loadAsync } from 'expo-font';
import { ConvexClientProvider } from './src/providers/ConvexClientProvider';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { TaskProvider } from './src/context/TaskContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { GamificationProvider } from './src/context/GamificationContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { MutationQueueProvider } from './src/context/MutationQueueContext';
import { CallProvider } from './src/context/CallContext';
import { AppNavigator } from './src/navigation/AppNavigator';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#151817', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            App Crash
          </Text>
          <Text style={{ color: '#fff', fontSize: 14 }}>
            {this.state.error.message}
          </Text>
          <Text style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
            {this.state.error.stack?.slice(0, 500)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);
  const [fontsError, setFontsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await loadAsync({
        Montserrat_400Regular: require('./assets/fonts/Montserrat_400Regular.ttf'),
        Montserrat_500Medium: require('./assets/fonts/Montserrat_500Medium.ttf'),
        Montserrat_600SemiBold: require('./assets/fonts/Montserrat_600SemiBold.ttf'),
        Montserrat_700Bold: require('./assets/fonts/Montserrat_700Bold.ttf'),
        ...MaterialIcons.font,
        ...MaterialCommunityIcons.font,
        ...Ionicons.font,
      });

      if (!cancelled) {
        setFontsReady(true);
      }
    })().catch((error: unknown) => {
      console.error('[Fonts] Failed to load app fonts', error);
      if (!cancelled) {
        setFontsError('Failed to load app fonts.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#151817', alignItems: 'center', justifyContent: 'center' }}>
        {fontsError ? (
          <Text style={{ color: '#fff', fontSize: 14 }}>{fontsError}</Text>
        ) : (
          <ActivityIndicator color="#C77B43" />
        )}
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <ConvexClientProvider>
              <NetworkProvider>
                <AuthProvider>
                  <MutationQueueProvider>
                    <DataProvider>
                      <NotificationProvider>
                        <ThemeProvider>
                          <LanguageProvider>
                            <TaskProvider>
                              <GamificationProvider>
                                <CallProvider>
                                  <AppNavigator />
                                </CallProvider>
                              </GamificationProvider>
                            </TaskProvider>
                          </LanguageProvider>
                        </ThemeProvider>
                      </NotificationProvider>
                    </DataProvider>
                  </MutationQueueProvider>
                </AuthProvider>
              </NetworkProvider>
            </ConvexClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
