import { registerRootComponent } from 'expo';
import {
  registerBackgroundMessageHandler,
  registerBackgroundNotifeeHandler,
} from './src/firebase/notificationService';

import App from './App';

// Register background message handlers BEFORE registerRootComponent.
// These must be at the top level so they execute even when the app
// is in a killed state and the OS wakes it for a push message.
registerBackgroundMessageHandler();
registerBackgroundNotifeeHandler();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
