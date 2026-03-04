/**
 * TaskContext – Bridges the synced data from DataContext into the existing
 * TaskItem interface that all the UI components consume.
 *
 * If synced data is available (user is logged in + sync completed),
 * tasks are derived from DataContext. Otherwise the original static
 * data is used as a fallback so the UI never shows an empty screen
 * before the first sync.
 */

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { TaskItem } from '../models/types';
import { useData, SyncedTask, SyncedWorkspace } from './DataContext';

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

function resolveStatus(
  statusId: number | null | undefined,
  statusMap: Map<number, { name: string; color?: string | null; final?: boolean; initial?: boolean }>,
  initialStatus: { name: string; color: string | null } | null,
): { name: string; color: string | null } {
  if (!statusId) return initialStatus ?? { name: '', color: null };
  const s = statusMap.get(statusId);
  if (!s) return initialStatus ?? { name: '', color: null };
  return { name: s.name, color: s.color ?? null };
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
  statusMap: Map<number, { name: string; color?: string | null; final?: boolean; initial?: boolean }>,
  assigneeMap: Map<number, string[]>, // taskId → list of user names
  tagMap: Map<number, string[]>,      // taskId → list of tag names
  initialStatus: { name: string; color: string | null } | null,
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);
  return {
    id: String(task.id),
    title: task.name || 'Untitled',
    spot: task.spot_id ? (spotMap.get(task.spot_id) ?? '') : '',
    priority: mapPriority(task.priority_id, priorityMap),
    status: status.name,
    statusColor: status.color,
    statusId: task.status_id ?? null,
    categoryId: task.category_id ?? null,
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
    status: '',
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

export interface StatusOption {
  id: number;
  name: string;
  color: string | null;
  initial?: boolean;
  final?: boolean;
}

interface TaskContextType {
  tasks: TaskItem[];
  activeTask: TaskItem | null;
  compactCards: boolean;
  selectedWorkspace: string;
  workspaces: string[];
  workspaceObjects: SyncedWorkspace[];
  statuses: StatusOption[];
  initialStatus: { name: string; color: string | null } | null;
  finalStatus: { name: string; color: string | null } | null;
  getAllowedStatuses: (task: TaskItem) => StatusOption[];
  addTask: (task: TaskItem) => void;
  updateTask: (index: number, task: TaskItem) => void;
  setActiveTask: (task: TaskItem | null, markDone?: boolean) => void;
  toggleCompactCards: () => void;
  setSelectedWorkspace: (workspace: string) => void;
  changeTaskStatus: (taskId: string, status: StatusOption) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useData();

  const [activeTask, setActiveTaskState] = useState<TaskItem | null>(null);
  const [compactCards, setCompactCards] = useState(false);
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
    const m = new Map<number, { name: string; color?: string | null; final?: boolean; initial?: boolean }>();
    for (const s of data.statuses) m.set(s.id, { name: s.name, color: s.color, final: s.final, initial: s.initial });
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

  // Build workspace list (names for backward compat) + full objects
  const workspaces = useMemo(() => {
    const names = data.workspaces.map((w) => w.name);
    return ['Everything', ...names];
  }, [data.workspaces]);

  const workspaceObjects = useMemo(() => {
    return data.workspaces;
  }, [data.workspaces]);

  // Expose all statuses as a flat list for the status picker
  const statuses: StatusOption[] = useMemo(() => {
    return data.statuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? null,
      initial: s.initial,
      final: s.final,
    }));
  }, [data.statuses]);

  // Resolve the initial (default) and final (done) statuses from backend data
  const initialStatus = useMemo(() => {
    for (const s of data.statuses) {
      if (s.initial) return { name: s.name, color: s.color ?? null };
    }
    return null;
  }, [data.statuses]);

  const finalStatus = useMemo(() => {
    for (const s of data.statuses) {
      if (s.final) return { name: s.name, color: s.color ?? null };
    }
    return null;
  }, [data.statuses]);

  // Category → transition group mapping
  const categoryTransitionGroupMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of data.categories) {
      if (c.status_transition_group_id) m.set(c.id, c.status_transition_group_id);
    }
    return m;
  }, [data.categories]);

  // Transition lookup: (groupId, fromStatusId) → Set<toStatusId>
  const transitionMap = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const t of data.statusTransitions) {
      const key = `${t.status_transition_group_id}:${t.from_status}`;
      let set = m.get(key);
      if (!set) {
        set = new Set();
        m.set(key, set);
      }
      set.add(t.to_status);
    }
    return m;
  }, [data.statusTransitions]);

  // Given a task, return the list of statuses it can transition to
  const getAllowedStatuses = useCallback((task: TaskItem): StatusOption[] => {
    const categoryId = task.categoryId;
    const statusId = task.statusId;

    // If no category or no current status, can't look up transitions
    if (!categoryId || !statusId) return statuses;

    const groupId = categoryTransitionGroupMap.get(categoryId);
    if (!groupId) return statuses; // no transition group → show all

    const key = `${groupId}:${statusId}`;
    const allowedIds = transitionMap.get(key);
    if (!allowedIds || allowedIds.size === 0) return statuses; // no transitions defined → show all

    // Include the current status + all allowed target statuses
    return statuses.filter((s) => s.id === statusId || allowedIds.has(s.id));
  }, [statuses, categoryTransitionGroupMap, transitionMap]);

  // Map synced tasks → TaskItem[]
  const tasks = useMemo(() => {
    if (data.tasks.length === 0) return staticTasks;

    let mapped = data.tasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus),
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
  }, [data.tasks, data.workspaces, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, selectedWorkspace, localOverrides]);

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
    if (markDone && activeTask?.id && finalStatus) {
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(activeTask.id!, { status: finalStatus.name, statusColor: finalStatus.color });
        return next;
      });
    }
    setActiveTaskState(task);
  };

  const toggleCompactCards = () => setCompactCards((p) => !p);

  const changeTaskStatus = (taskId: string, status: StatusOption) => {
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: status.name, statusColor: status.color });
      return next;
    });
  };

  const markTaskDone = (taskId: string) => {
    if (!finalStatus) return;
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: finalStatus.name, statusColor: finalStatus.color });
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
        selectedWorkspace,
        workspaces,
        workspaceObjects,
        statuses,
        initialStatus,
        finalStatus,
        getAllowedStatuses,
        addTask,
        updateTask,
        setActiveTask,
        toggleCompactCards,
        setSelectedWorkspace,
        changeTaskStatus,
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
