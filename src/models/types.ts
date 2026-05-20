// Navigation item model
export interface NavItem {
  icon: string;
  label: string;
  color?: string;
}

// Task item model
export interface Assignee {
  name: string;
  picture?: string | null;
}

export interface TaskCommentVoiceMemo {
  storageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  listened?: boolean;
}

export interface TaskItem {
  id?: string;
  /** Convex document _id (needed for Convex queries like notes, logs, etc.) */
  convexId?: string;
  title: string;
  description?: string | null;
  spot: string;
  spotId?: number | string | null;
  priority: string;
  priorityColor?: string | null;
  status: string;
  statusColor?: string | null;
  statusId?: string | number | null;
  statusIcon?: string | null;
  statusAction?: string | null;
  priorityId?: string | number | null;
  categoryId?: string | number | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  /** Resolved workspace pgId (used for workspace filtering) */
  workspaceId?: string | number | null;
  assignees: Assignee[];
  createdAt: string;
  tags: string[];
  approval?: string | null;
  sla?: string | null;
  /** Form ID linked via task's template (null if no form) */
  formId?: string | number | null;
  /** Template ID used to create this task (null for ad-hoc tasks) */
  templateId?: string | number | null;
  /** Name of the form linked to this task */
  formName?: string | null;
  /** Per-user flag color (null = not flagged) */
  flagColor?: string | null;
  /** pgId of the user who created the task */
  createdBy?: number | string | null;
  /** Epoch ms when the first non-creator user viewed the task (null = unseen) */
  firstViewedAt?: number | null;
  /** Derived approval status for shared tasks */
  approvalStatus?: 'pending' | 'approved' | 'rejected' | null;
  /** Share document _id (for acknowledge mutation) */
  shareId?: string | null;
  /** Share acknowledgment status */
  shareStatus?: 'pending' | 'acknowledged' | null;
  /** Total shares with ack tracking for this task */
  ackTotal?: number;
  /** Number of acknowledged shares for this task */
  ackDone?: number;
  /** Share permission type */
  sharePermission?: string | null;
  /** Approval config _id (Convex) for this task */
  approvalId?: string | number | null;
  /** Task Convex _id for the shared task */
  taskConvexId?: string | null;
  /** GPS coordinates captured at creation */
  latitude?: number | null;
  longitude?: number | null;
  /** Task requires a signature before completion */
  requiresSignature?: boolean;
  /** Number of comments/notes on this task */
  commentCount?: number;
  /** Text from the latest comment/note, if present */
  lastCommentText?: string | null;
  /** Voice memo from the latest comment/note, if present */
  lastCommentVoiceMemo?: TaskCommentVoiceMemo | null;
  /** Whether the latest comment/note is newer than the current user's last task detail view */
  lastCommentUnread?: boolean;
}

// Notification item model
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  icon: string;
  color: string;
}

// Comment model for task details
export interface Comment {
  author: string;
  time: string;
  text: string;
}

// Checklist item model
export interface ChecklistItem {
  title: string;
  completed: boolean;
}

// Card density display mode
export type CardDensity = 'normal' | 'detailed';

// Theme names
export type ThemeName = 'default' | 'ocean' | 'sunset' | 'forest';

// Theme configuration
export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
}

// Quote model for drawer
export interface Quote {
  text: string;
  author: string;
}

// API Task model
export interface TaskModel {
  id: number;
  name: string;
  description?: string;
}

// Gamification types
export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  total_points: number;
  weekly_points: number;
  monthly_points: number;
  user: {
    id: number;
    name: string;
    email: string;
    url_picture?: string | null;
  };
}

export interface PointsSummary {
  total_points: number;
  weekly_points: number;
  monthly_points: number;
  rank: number;
  total_users: number;
}

export interface PointTransaction {
  id: number;
  user_id: number;
  team_id: number;
  point_action_id: number;
  points: number;
  description: string;
  reference_type: string | null;
  reference_id: number | null;
  created_at: string;
  action?: {
    slug: string;
    name: string;
    icon: string;
  };
  user?: {
    id: number;
    name: string;
    url_picture?: string | null;
  };
}

export interface GamificationBadge {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  criteria_type: string;
  criteria_value: number;
  is_secret: boolean;
  earned: boolean;
  earned_at: string | null;
  progress?: {
    current: number;
    target: number;
    percentage: number;
  };
}

export interface GamificationLevel {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  level_number: number;
  min_points: number;
  max_points: number | null;
  perks: string[];
  is_current: boolean;
  is_unlocked: boolean;
  progress: number;
}

export interface LevelProgress {
  current_level: GamificationLevel | null;
  total_points: number;
  progress_percentage: number;
  points_to_next_level: number | null;
  next_level: GamificationLevel | null;
}

export interface LevelDistribution {
  level: GamificationLevel;
  user_count: number;
}

// ---------------------------------------------------------------------------
// KPI Card types
// ---------------------------------------------------------------------------

/** Metric-type KPI card types supported on mobile (v1) */
export type KpiCardMetricType =
  | 'task_count'
  | 'task_percentage'
  | 'custom_query'
  | 'count_completed_today'
  | 'count_overdue'
  | 'count_created_today'
  | 'time_avg'
  | 'trend'
  | 'trend_7d'
  | 'trend_30d';

/** All possible KPI card types (including chart types not rendered on mobile) */
export type KpiCardType =
  | KpiCardMetricType
  | 'gauge'
  | 'line_chart'
  | 'bar_chart'
  | 'donut_chart'
  | 'stacked_bar'
  | 'burndown'
  | 'burnup'
  | 'velocity'
  | 'table'
  | 'heatmap'
  | 'external';

/** Computed result for a KPI card */
export interface KpiComputedCard {
  id: number | string;
  label: string;
  value: string;
  iconName: string;
  iconColor: string;
  helperText?: string;
  trendData?: number[];
}

export interface MapLocationPayload {
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string | null;
  helperText?: string | null;
  warningText?: string | null;
}

// Navigation param types
export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  NoTenants: undefined;
  TenantSelect: { tenants: string[]; firebaseIdToken: string };
  Main: { tab?: number; conversationId?: string | number; workspace?: 'Shared' | 'Everything' } | undefined;
  Profile: undefined;
  TaskShareLink: { token: string };
  TaskDetail: { task: TaskItem };
  SharedTaskDetail: { task: TaskItem };
  CreateTask: undefined;
  VoiceTaskReview: { draftId: string };
  Notifications: undefined;
  Settings: undefined;
  OfflineQueue: undefined;
  Themes: undefined;
  BoardDetail: { boardId: string | number };
  SpotsMap: { location: MapLocationPayload };
  Gamification: undefined;
  PointHistory: undefined;
  Stats: undefined;
};

export type MainTabParamList = {
  Tasks: undefined;
  Workspaces: undefined;
  Boards: undefined;
  Cleaning: undefined;
};
