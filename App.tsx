import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts as useMontserratFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
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
  const [montserratLoaded] = useMontserratFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  console.log('[App] render, fonts loaded:', montserratLoaded);

  if (!montserratLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#151817', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C77B43" />
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
              <MutationQueueProvider>
              <AuthProvider>
                <DataProvider>
                  <NotificationProvider>
                    <ThemeProvider>
                    <LanguageProvider>
                      <TaskProvider>
                        <GamificationProvider>
                          <AppNavigator />
                        </GamificationProvider>
                      </TaskProvider>
                    </LanguageProvider>
                    </ThemeProvider>
                  </NotificationProvider>
                </DataProvider>
              </AuthProvider>
              </MutationQueueProvider>
              </NetworkProvider>
            </ConvexClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
