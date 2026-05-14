import type { TaskItem } from '../models/types';

// Parse FontAwesome class string from backend (e.g. "fas fa-broom") into
// a name and solid/brand flag for use with the FaIcon component (FA6 Pro).
export const parseWorkspaceIcon = (
  iconStr?: string | null,
): { name: string; solid: boolean; brand: boolean } => {
  if (!iconStr) return { name: 'building', solid: false, brand: false };

  // Extract prefix (fas/far/fab) and icon name (fa-xxx)
  const parts = iconStr.trim().split(/\s+/);
  let solid = true;
  let brand = false;
  let name = 'building';

  for (const part of parts) {
    if (part === 'far') { solid = false; brand = false; }
    else if (part === 'fas') { solid = true; brand = false; }
    else if (part === 'fab') { solid = false; brand = true; }
    else if (part.startsWith('fa-')) {
      name = part.replace('fa-', '');
    }
  }

  return { name, solid, brand };
};

// FontAwesome → MaterialCommunityIcons mapping for rendering FA icon names
// with MCI (which is more reliably bundled). Shared between TaskCard, workspace lists, etc.
export const FA_TO_MCI: Record<string, string> = {
  'bullhorn': 'bullhorn',
  'store': 'store',
  'users': 'account-group',
  'wrench': 'wrench',
  'shield-alt': 'shield-alert',
  'shield-halved': 'shield-half-full',
  'clipboard-check': 'clipboard-check',
  'truck': 'truck',
  'broom': 'broom',
  'tools': 'tools',
  'cogs': 'cog',
  'heart': 'heart',
  'calendar-check': 'calendar-check',
  'snowflake': 'snowflake',
  'chart-line': 'chart-line-variant',
  'bug': 'bug',
  'certificate': 'certificate',
  'thermometer-half': 'thermometer',
  'handshake': 'handshake',
  'exchange-alt': 'swap-horizontal',
  'dolly': 'dolly',
  'tag': 'tag',
  'search': 'magnify',
  'boxes': 'package-variant-closed',
  'money-bill': 'cash',
  'user-times': 'account-remove',
  'user-secret': 'account-eye',
  'video': 'video',
  'info-circle': 'information',
  'folder': 'folder',
  'tasks': 'format-list-checks',
  'file-alt': 'file-document',
  'clipboard-list': 'clipboard-list',
  'building': 'office-building',
  'bell': 'bell',
  'eye': 'eye',
  'play': 'play',
  'hand': 'hand-back-right',
  'flag-checkered': 'flag-checkered',
  'ban': 'cancel',
  'inbox': 'inbox',
  'people-group': 'account-group',
  'gear': 'cog',
  'gears': 'cog',
  'hammer': 'hammer',
  'paint-roller': 'format-paint',
  'utensils': 'silverware-fork-knife',
  'bed': 'bed',
  'key': 'key',
  'wifi': 'wifi',
  'fire': 'fire',
  'leaf': 'leaf',
  'tree': 'tree',
  'sun': 'white-balance-sunny',
  'moon': 'moon-waning-crescent',
  'star': 'star',
  'bolt': 'lightning-bolt',
  'lock': 'lock',
  'exclamation-triangle': 'alert',
  'graduation-cap': 'school',
  'gavel': 'gavel',
  'redo': 'redo',
  'vacuum': 'vacuum',
  'shower': 'shower',
  'swimming-pool': 'pool',
  'dumbbell': 'dumbbell',
  'spa': 'spa',
  'concierge-bell': 'bell-ring',
  'glass-martini': 'glass-cocktail',
  'coffee': 'coffee',
};

/** Resolve an icon name (FA class string or plain name) to a MaterialCommunityIcons name */
export function getMciIconName(iconStr?: string | null): string {
  if (!iconStr) return 'folder';
  // Handle full FA class strings like "fas fa-broom"
  const parts = iconStr.trim().split(/\s+/);
  let name = iconStr;
  for (const part of parts) {
    if (part.startsWith('fa-')) {
      name = part.replace('fa-', '');
      break;
    }
  }
  // If no fa- prefix was found, use the raw string (handles plain names like "broom")
  const clean = name.startsWith('fa-') ? name.slice(3) : name;
  return FA_TO_MCI[clean] ?? clean;
}

// Default workspace color fallback
export const DEFAULT_WORKSPACE_COLOR = '#3b82f6';

// Priority color helper — 4-level system with distinct, meaningful colors
export const priorityColor = (priority: string): string => {
  const normalized = priority
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  switch (normalized) {
    case 'critical':
    case 'critica':
    case 'urgent':
    case 'urgente':
      return '#E24B4A';
    case 'high':
    case 'alta':
      return '#EF9F27';
    case 'medium':
    case 'media':
    case 'normal':
      return '#4CAF50';
    case 'low':
    case 'baja':
    default:
      return '#64B5F6';
  }
};

// Status color helper – prefers the backend-provided color, falls back to a
// sensible default based on the status name.
export const statusColor = (status: string, backendColor?: string | null): string => {
  if (backendColor) return backendColor;
  // Fallback for statuses without a backend color
  return '#9E9E9E';
};

// Format timestamp for notifications
export const formatTimestamp = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 7) {
    return `${diffDays}d`;
  } else {
    return `${timestamp.getMonth() + 1}/${timestamp.getDate()}/${timestamp.getFullYear()}`;
  }
};

// Get initials from name
export const getInitials = (name: string): string => {
  if (!name || name.length === 0) return '?';
  return name[0].toUpperCase();
};

// Get daily index for quotes/images (changes once per day)
export const getDailyIndex = (listLength: number): number => {
  const now = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return daysSinceEpoch % listLength;
};

type NotificationNavigationInput = {
  type?: string;
  notification_kind?: string;
  title?: string;
  message?: string;
  data?: Record<string, any>;
  target_url?: string;
  taskId?: string;
  task_id?: string;
  taskPgId?: string | number;
  task_pg_id?: string | number;
  taskConvexId?: string;
  task_convex_id?: string;
  chatId?: string | number;
  chat_id?: string | number;
  boardPgId?: string | number;
  board_pg_id?: string | number;
  boardId?: string | number;
  board_id?: string | number;
};

export type NotificationNavigationTarget =
  | { screen: 'TaskDetail'; params: { task: TaskItem } }
  | { screen: 'SharedTaskDetail'; params: { task: TaskItem } }
  | { screen: 'Main'; params: { tab: number; conversationId?: string | number; workspace?: 'Shared' | 'Everything' } }
  | { screen: 'BoardDetail'; params: { boardId: string | number } };

const TASK_NOTIFICATION_TYPES = new Set([
  'task',
  'task_updated',
  'task_status_changed',
  'task_shared',
  'task_completed',
  'task_assigned',
  'task_created_unassigned',
  'task_unassigned',
  'reported_task_seen',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'status_changed',
  'status_change',
  'assignment',
  'sla',
  'approval',
  'done',
]);

const COMMUNICATION_NOTIFICATION_TYPES = new Set([
  'message',
  'chat',
  'comment',
  'task_comment',
  'mention',
  'call',
]);

function findTaskByNotificationId(tasks: TaskItem[], taskId: string | number): TaskItem | undefined {
  return tasks.find((candidate) => (
    candidate.convexId === taskId
    || candidate.taskConvexId === taskId
    || String(candidate.id) === String(taskId)
  ));
}

function findTaskByTitle(tasks: TaskItem[], rawTitle?: string | null): TaskItem | undefined {
  const title = rawTitle?.trim();
  if (!title) return undefined;
  return tasks.find((candidate) => candidate.title.trim() === title);
}

export function resolveNotificationNavigation(
  input: NotificationNavigationInput,
  tasks: TaskItem[],
): NotificationNavigationTarget | null {
  const data = input.data ?? {};
  const type = input.type || input.notification_kind || data.type || data.notification_kind;
  const title = input.title || data.title || '';
  const message = input.message || data.message || '';
  const targetUrl = input.target_url || data.target_url || '';
  const targetsSharedTask = typeof targetUrl === 'string' && /(?:^|\/)shared(?:-with-me)?(?:\?|$|\/)/.test(targetUrl);
  const targetsApproval = type === 'approval' || (typeof type === 'string' && type.startsWith('approval_'));

  const taskIds = [
    data.taskId,
    data.task_id,
    data.taskPgId,
    data.task_pg_id,
    data.taskConvexId,
    data.task_convex_id,
    input.taskId,
    input.task_id,
    input.taskPgId,
    input.task_pg_id,
    input.taskConvexId,
    input.task_convex_id,
  ].filter((value): value is string | number => value != null && value !== '');

  for (const taskId of taskIds) {
    const task = findTaskByNotificationId(tasks, taskId);
    if (task) {
      if (targetsSharedTask || targetsApproval || type === 'task_shared' || task.shareId || task.approvalStatus) {
        return { screen: 'SharedTaskDetail', params: { task } };
      }
      return { screen: 'TaskDetail', params: { task } };
    }
  }

  if (targetsSharedTask || targetsApproval || type === 'task_shared') {
    return { screen: 'Main', params: { tab: 0, workspace: 'Shared' } };
  }

  const looksLikeTaskNotification = TASK_NOTIFICATION_TYPES.has(type ?? '')
    || taskIds.length > 0
    || /\s-\sMoved to\b/i.test(title);

  if (looksLikeTaskNotification) {
    const titlePrefixMatch = title.match(/^(.+?)\s+-\s+.+$/i);
    const messageMatch = message.match(/(?:on:|created:)\s*(.+)$/i);
    const taskNameCandidates = [
      data?.i18n?.taskName,
      data.taskName,
      data.task_name,
      titlePrefixMatch?.[1],
      messageMatch?.[1],
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    for (const taskName of taskNameCandidates) {
      const task = findTaskByTitle(tasks, taskName);
      if (task) {
        if (targetsSharedTask || targetsApproval || type === 'task_shared' || task.shareId || task.approvalStatus) {
          return { screen: 'SharedTaskDetail', params: { task } };
        }
        return { screen: 'TaskDetail', params: { task } };
      }
    }
  }

  const boardId = data.boardPgId || data.board_pg_id || data.boardId || data.board_id || input.boardPgId || input.board_pg_id || input.boardId || input.board_id;
  if (boardId) {
    return { screen: 'BoardDetail', params: { boardId } };
  }

  const conversationId = data.chatId || data.chat_id || input.chatId || input.chat_id;
  if (COMMUNICATION_NOTIFICATION_TYPES.has(type ?? '') || conversationId) {
    return {
      screen: 'Main',
      params: conversationId ? { tab: 1, conversationId } : { tab: 1 },
    };
  }

  return null;
}

// Inspirational quotes
export const quotes = [
  { text: 'Every accomplishment starts with the decision to try.', author: 'John F. Kennedy' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Everything you\'ve ever wanted is on the other side of fear.', author: 'George Addair' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { text: 'Your limitation—it\'s only your imagination.', author: 'Unknown' },
  { text: 'Great things never come from comfort zones.', author: 'Unknown' },
];

/** Returns white or dark text color for good contrast on a hex background */
export function contrastTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1F2937' : '#FFFFFF';
}

// Costa Rica image URLs for drawer (matching backend/client images)
// ---------------------------------------------------------------------------
// Tag colors – deterministic pastel palette based on tag name (fallback)
// ---------------------------------------------------------------------------

export interface TagColor {
  bg: string;
  text: string;
  bgDark: string;
  textDark: string;
}

const TAG_PALETTE: TagColor[] = [
  { bg: '#DBEAFE', text: '#1E40AF', bgDark: 'rgba(59,130,246,0.18)',  textDark: '#93C5FD' },  // blue
  { bg: '#D1FAE5', text: '#065F46', bgDark: 'rgba(16,185,129,0.18)',  textDark: '#6EE7B7' },  // green
  { bg: '#FEF3C7', text: '#92400E', bgDark: 'rgba(245,158,11,0.18)',  textDark: '#FCD34D' },  // amber
  { bg: '#FCE7F3', text: '#9D174D', bgDark: 'rgba(236,72,153,0.18)',  textDark: '#F9A8D4' },  // pink
  { bg: '#EDE9FE', text: '#5B21B6', bgDark: 'rgba(139,92,246,0.18)',  textDark: '#C4B5FD' },  // violet
  { bg: '#E0E7FF', text: '#3730A3', bgDark: 'rgba(99,102,241,0.18)',  textDark: '#A5B4FC' },  // indigo
  { bg: '#CCFBF1', text: '#115E59', bgDark: 'rgba(20,184,166,0.18)',  textDark: '#5EEAD4' },  // teal
  { bg: '#FEE2E2', text: '#991B1B', bgDark: 'rgba(239,68,68,0.18)',   textDark: '#FCA5A5' },  // red
  { bg: '#FFEDD5', text: '#9A3412', bgDark: 'rgba(249,115,22,0.18)',  textDark: '#FDBA74' },  // orange
  { bg: '#F3E8FF', text: '#6B21A8', bgDark: 'rgba(168,85,247,0.18)',  textDark: '#D8B4FE' },  // purple
];

/** Get a deterministic color pair for a tag name */
export function tagColor(name: string): TagColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

// ---------------------------------------------------------------------------

export const inspirationalImages = [
  'https://images.pexels.com/photos/30670233/pexels-photo-30670233.jpeg?auto=compress&cs=tinysrgb&w=1200', // colorful keel-billed toucan
  'https://images.pexels.com/photos/12832297/pexels-photo-12832297.jpeg?auto=compress&cs=tinysrgb&w=1200', // palm-lined Costa Rica beach
  'https://images.pexels.com/photos/931007/pexels-photo-931007.jpeg?auto=compress&cs=tinysrgb&w=1200', // tropical waterfall in jungle
  'https://images.pexels.com/photos/894695/pexels-photo-894695.jpeg?auto=compress&cs=tinysrgb&w=1200', // coffee beans roasting
  'https://images.pexels.com/photos/12715260/pexels-photo-12715260.jpeg?auto=compress&cs=tinysrgb&w=1200', // vibrant scarlet macaw
  'https://images.pexels.com/photos/12832380/pexels-photo-12832380.jpeg?auto=compress&cs=tinysrgb&w=1200', // sloth in tropical tree
  'https://images.pexels.com/photos/762565/pexels-photo-762565.jpeg?auto=compress&cs=tinysrgb&w=1200', // golden sunset on beach
  'https://images.pexels.com/photos/35819421/pexels-photo-35819421.jpeg?auto=compress&cs=tinysrgb&w=1200', // Costa Rica coffee jars
  'https://images.pexels.com/photos/16322443/pexels-photo-16322443.jpeg?auto=compress&cs=tinysrgb&w=1200', // toucan vibrant portrait
];
