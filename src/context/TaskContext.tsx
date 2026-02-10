/**
 * TaskContext – Bridges the synced data from DataContext into the existing
 * TaskItem interface that all the UI components consume.
 *
 * If synced data is available (user is logged in + sync completed),
 * tasks are derived from DataContext. Otherwise the original static
 * data is used as a fallback so the UI never shows an empty screen
 * before the first sync.
 */

import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { TaskItem } from '../models/types';
import { useData, SyncedTask } from './DataContext';

// ---------------------------------------------------------------------------
// Helpers – map synced backend data → UI TaskItem
// ---------------------------------------------------------------------------

function mapPriority(
  priorityId: number | null | undefined,
  priorityMap: Map<number, { name: string; color?: string | null }>,
): TaskItem['priority'] {
  if (!priorityId) return 'Medium';
  const p = priorityMap.get(priorityId);
  if (!p) return 'Medium';
  const name = p.name.toLowerCase();
  if (name.includes('high') || name.includes('alta')) return 'High';
  if (name.includes('low') || name.includes('baja')) return 'Low';
  return 'Medium';
}

function mapStatus(
  statusId: number | null | undefined,
  statusMap: Map<number, { name: string; final?: boolean; initial?: boolean }>,
): TaskItem['status'] {
  if (!statusId) return 'Open';
  const s = statusMap.get(statusId);
  if (!s) return 'Open';
  const name = s.name.toLowerCase();
  if (s.final || name.includes('done') || name.includes('complet') || name.includes('cerr')) return 'Done';
  if (name.includes('progress') || name.includes('curso')) return 'In progress';
  if (name.includes('block') || name.includes('bloq')) return 'Blocked';
  if (name.includes('schedul') || name.includes('program')) return 'Scheduled';
  return 'Open';
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function mapTaskToItem(
  task: SyncedTask,
  spotMap: Map<number, string>,
  priorityMap: Map<number, { name: string; color?: string | null }>,
  statusMap: Map<number, { name: string; final?: boolean; initial?: boolean }>,
  assigneeMap: Map<number, string[]>, // taskId → list of user names
  tagMap: Map<number, string[]>,      // taskId → list of tag names
): TaskItem {
  return {
    id: String(task.id),
    title: task.name || 'Untitled',
    spot: task.spot_id ? (spotMap.get(task.spot_id) ?? '') : '',
    priority: mapPriority(task.priority_id, priorityMap),
    status: mapStatus(task.status_id, statusMap),
    assignees: assigneeMap.get(task.id) ?? [],
    createdAt: formatDate(task.created_at),
    tags: tagMap.get(task.id) ?? [],
    approval: null,
    sla: null,
  };
}

// ---------------------------------------------------------------------------
// Static fallback data (shown before first sync)
// ---------------------------------------------------------------------------

const staticTasks: TaskItem[] = [
  {
    id: '0',
    title: 'Syncing data...',
    spot: '',
    priority: 'Medium',
    status: 'Open',
    assignees: [],
    createdAt: '',
    tags: [],
    approval: null,
    sla: null,
  },
];

// ---------------------------------------------------------------------------
// Context interface (unchanged from the original)
// ---------------------------------------------------------------------------

interface TaskContextType {
  tasks: TaskItem[];
  activeTask: TaskItem | null;
  compactCards: boolean;
  notificationCount: number;
  selectedWorkspace: string;
  workspaces: string[];
  addTask: (task: TaskItem) => void;
  updateTask: (index: number, task: TaskItem) => void;
  setActiveTask: (task: TaskItem | null, markDone?: boolean) => void;
  toggleCompactCards: () => void;
  setNotificationCount: (count: number) => void;
  setSelectedWorkspace: (workspace: string) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useData();

  const [activeTask, setActiveTaskState] = useState<TaskItem | null>(null);
  const [compactCards, setCompactCards] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');
  // Local overrides for optimistic mutations (keyed by task id)
  const [localOverrides, setLocalOverrides] = useState<Map<string, Partial<TaskItem>>>(new Map());

  // Build lookup maps from synced reference data
  const spotMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of data.spots) m.set(s.id, s.name);
    return m;
  }, [data.spots]);

  const priorityMap = useMemo(() => {
    const m = new Map<number, { name: string; color?: string | null }>();
    for (const p of data.priorities) m.set(p.id, { name: p.name, color: p.color });
    return m;
  }, [data.priorities]);

  const statusMap = useMemo(() => {
    const m = new Map<number, { name: string; final?: boolean; initial?: boolean }>();
    for (const s of data.statuses) m.set(s.id, { name: s.name, final: s.final, initial: s.initial });
    return m;
  }, [data.statuses]);

  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of data.users) m.set(u.id, u.name);
    return m;
  }, [data.users]);

  const tagNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of data.tags) m.set(t.id, t.name);
    return m;
  }, [data.tags]);

  const assigneeMap = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const tu of data.taskUsers) {
      const list = m.get(tu.task_id) ?? [];
      const name = userMap.get(tu.user_id);
      if (name) list.push(name);
      m.set(tu.task_id, list);
    }
    return m;
  }, [data.taskUsers, userMap]);

  const tagMap = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const tt of data.taskTags) {
      const list = m.get(tt.task_id) ?? [];
      const name = tagNameMap.get(tt.tag_id);
      if (name) list.push(name);
      m.set(tt.task_id, list);
    }
    return m;
  }, [data.taskTags, tagNameMap]);

  // Build workspace list
  const workspaces = useMemo(() => {
    const names = data.workspaces.map((w) => w.name);
    return ['Everything', ...names];
  }, [data.workspaces]);

  // Map synced tasks → TaskItem[]
  const tasks = useMemo(() => {
    if (data.tasks.length === 0) return staticTasks;

    let mapped = data.tasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap),
    );

    // Apply local overrides
    if (localOverrides.size > 0) {
      mapped = mapped.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    // Filter by workspace
    if (selectedWorkspace !== 'Everything') {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        const wsTaskIds = new Set(
          data.tasks
            .filter((t) => t.workspace_id === ws.id)
            .map((t) => String(t.id)),
        );
        mapped = mapped.filter((t) => wsTaskIds.has(t.id ?? ''));
      }
    }

    return mapped;
  }, [data.tasks, data.workspaces, spotMap, priorityMap, statusMap, assigneeMap, tagMap, selectedWorkspace, localOverrides]);

  // ---- Mutations (optimistic, client-side only for now) --------------------

  const addTask = (_task: TaskItem) => {
    // In the future, POST to API and re-sync
  };

  const updateTask = (index: number, task: TaskItem) => {
    if (task.id) {
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(task.id!, task);
        return next;
      });
    }
  };

  const setActiveTask = (task: TaskItem | null, markDone = false) => {
    if (markDone && activeTask?.id) {
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(activeTask.id!, { status: 'Done' });
        return next;
      });
    }
    setActiveTaskState(task);
  };

  const toggleCompactCards = () => setCompactCards((p) => !p);

  const markTaskDone = (taskId: string) => {
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: 'Done' });
      return next;
    });
    if (activeTask?.id === taskId) setActiveTaskState(null);
  };

  const assignTaskToYou = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && !task.assignees.includes('You')) {
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(taskId, { assignees: [...task.assignees, 'You'] });
        return next;
      });
    }
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        activeTask,
        compactCards,
        notificationCount,
        selectedWorkspace,
        workspaces,
        addTask,
        updateTask,
        setActiveTask,
        toggleCompactCards,
        setNotificationCount,
        setSelectedWorkspace,
        markTaskDone,
        assignTaskToYou,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = (): TaskContextType => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
