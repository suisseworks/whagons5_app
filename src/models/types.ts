// Navigation item model
export interface NavItem {
  icon: string;
  label: string;
  color?: string;
}

// Task item model
export interface TaskItem {
  id?: string;
  title: string;
  spot: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In progress' | 'Scheduled' | 'Blocked' | 'Done';
  assignees: string[];
  createdAt: string;
  tags: string[];
  approval?: string | null;
  sla?: string | null;
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

// Navigation param types
export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Main: undefined;
  TaskDetail: { task: TaskItem };
  CreateTask: undefined;
  Notifications: undefined;
  Settings: undefined;
  Themes: undefined;
};

export type MainTabParamList = {
  Tasks: undefined;
  Colab: undefined;
  Boards: undefined;
  Cleaning: undefined;
};
