/**
 * Resolve the visible title/body for an incoming push message.
 *
 * The backend always duplicates the notification text into
 * `data.notification_title` / `data.notification_body` (see
 * convex/_helpers/pushPayload.ts) because some delivery paths hand the app a
 * message without a usable `notification` block. Display code must check
 * those keys before falling back — otherwise the OS/app shows a contentless
 * notification that reads as just "Whagons" (the app name).
 */
import { sanitizeNotificationMessage } from './notificationText';

const DEFAULT_TITLE = 'New notification';

const TYPE_FALLBACK_TITLES: Record<string, string> = {
  approval_requested: 'Approval requested',
  approval_approved: 'Approval updated',
  approval_rejected: 'Approval updated',
  acknowledgment_requested: 'Acknowledgment requested',
  acknowledgment_received: 'Acknowledgment received',
  board_comment: 'New board comment',
  board_message: 'New board post',
  broadcast: 'Broadcast',
  call: 'Incoming call',
  mention: 'You were mentioned',
  message: 'New message',
  task_assigned: 'Task assigned',
  task_comment: 'New task comment',
  task_completed: 'Task completed',
  task_shared: 'Task shared',
  task_unassigned: 'Task unassigned',
  task_updated: 'Task updated',
  workflow_notification: 'Workflow notification',
};

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export interface PushDisplayText {
  title: string;
  body: string;
}

/**
 * Returns the text to display for a push message, or null when the message
 * carries no human-readable content at all — in which case nothing should be
 * displayed (an empty notification is pure noise).
 */
export function resolvePushDisplayText(remoteMessage: {
  notification?: { title?: string | null; body?: string | null } | null;
  data?: Record<string, unknown> | null;
}): PushDisplayText | null {
  const notification = remoteMessage?.notification;
  const data = remoteMessage?.data ?? {};

  const title = firstNonEmpty(notification?.title, data.notification_title, data.title);
  const body = firstNonEmpty(notification?.body, data.notification_body, data.body);

  if (!title && !body) return null;

  const type = typeof data.type === 'string' ? data.type : '';
  return {
    title: title ?? TYPE_FALLBACK_TITLES[type] ?? DEFAULT_TITLE,
    body: sanitizeNotificationMessage(body ?? ''),
  };
}
