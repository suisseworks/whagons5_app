export interface NotificationTapPayload {
  type?: string;
  tenantId?: string;
  taskId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

export async function createNotificationChannels(): Promise<void> {}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function getFCMToken(): Promise<string | null> {
  return null;
}

export function onFCMTokenRefresh(): () => void {
  return () => {};
}

export function setupForegroundMessageHandler(): () => void {
  return () => {};
}

export function registerBackgroundMessageHandler(): void {}

export function registerBackgroundNotifeeHandler(): void {}

export async function getInitialNotification() {
  return null;
}

export function onNotificationTap(): () => void {
  return () => {};
}
