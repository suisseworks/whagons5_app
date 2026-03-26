import React from 'react';
import { View, ActivityIndicator } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts as useMontserratFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { ConvexClientProvider } from './src/providers/ConvexClientProvider';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { TaskProvider } from './src/context/TaskContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { GamificationProvider } from './src/context/GamificationContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { MutationQueueProvider } from './src/context/MutationQueueContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const [montserratLoaded] = useMontserratFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  if (!montserratLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#151817', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C77B43" />
      </View>
    );
  }

  return (
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
                    <TaskProvider>
                      <GamificationProvider>
                        <AppNavigator />
                      </GamificationProvider>
                    </TaskProvider>
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
  );
}
