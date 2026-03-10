/**
 * TaskContext – Bridges the synced data from DataContext into the existing
 * TaskItem interface that all the UI components consume.
 *
 * If synced data is available (user is logged in + sync completed),
 * tasks are derived from DataContext. Otherwise the original static
 * data is used as a fallback so the UI never shows an empty screen
 * before the first sync.
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, ReactNode } from 'react';
import { TaskItem } from '../models/types';
import { useData, SyncedTask, SyncedWorkspace, SyncedTemplate, SyncedForm, SyncedFormVersion, SyncedTaskForm } from './DataContext';
import { apiClient } from '../services/apiClient';

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
  templateFormMap: Map<number, { formId: number; formName: string }>, // templateId → form info
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);

  // Resolve form via template_id → template → form_id
  const templateId = task.template_id as number | undefined;
  const formInfo = templateId ? templateFormMap.get(templateId) : undefined;

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
    formId: formInfo?.formId ?? null,
    formName: formInfo?.formName ?? null,
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

export interface TaskFilters {
  statuses: string[];          // status names to include (empty = all)
  priorities: string[];        // 'Low' | 'Medium' | 'High' (empty = all)
  assignees: string[];         // user names to include (empty = all)
}

export const emptyFilters: TaskFilters = {
  statuses: [],
  priorities: [],
  assignees: [],
};

/** Parsed form schema matching the web client's FormVersion.fields structure */
export interface FormSchema {
  title?: string;
  description?: string;
  fields: FormSchemaField[];
}

export interface FormSchemaField {
  id: number;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number'
       | 'time' | 'datetime' | 'signature' | 'image' | 'fixed-image'
       | 'barcode' | 'list' | 'single-checkbox';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  properties?: {
    imageUrl?: string | null;
    imageId?: string | null;
    allowDecimals?: boolean;
    listItemType?: string;
    [key: string]: unknown;
  };
}

interface TaskContextType {
  tasks: TaskItem[];
  /** Total number of tasks for the selected workspace (before pagination) */
  totalTaskCount: number;
  /** Load the next page of tasks (infinite scroll) */
  loadMoreTasks: () => void;
  /** Whether there are more tasks to load */
  hasMoreTasks: boolean;
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
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  hasActiveFilters: boolean;
  /** All unique assignee names across the current workspace's tasks */
  availableAssignees: string[];
  changeTaskStatus: (taskId: string, status: StatusOption) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
  /** Get the form schema for a task (returns null if no form) */
  getFormSchema: (task: TaskItem) => FormSchema | null;
  /** Get the existing task form submission for a task */
  getTaskFormSubmission: (taskId: string) => { id: number; formVersionId: number; data: Record<string, unknown> } | null;
  /** Get the active form version ID for a given form */
  getFormVersionId: (formId: number) => number | null;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useData();

  const [activeTask, setActiveTaskState] = useState<TaskItem | null>(null);
  const [compactCards, setCompactCards] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
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

  // Build template → form lookup: templateId → { formId, formName }
  const templateFormMap = useMemo(() => {
    const formMap = new Map<number, string>();
    for (const f of data.forms) formMap.set(f.id, f.name);

    const m = new Map<number, { formId: number; formName: string }>();
    for (const tpl of data.templates) {
      if (tpl.form_id) {
        const formName = formMap.get(tpl.form_id) ?? 'Form';
        m.set(tpl.id, { formId: tpl.form_id, formName });
      }
    }
    return m;
  }, [data.templates, data.forms]);

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

  // ---------------------------------------------------------------------------
  // Step 1: Pre-map ALL tasks once (expensive, only recomputes when data changes)
  // ---------------------------------------------------------------------------
  // Filter out soft-deleted tasks before mapping
  const activeTasks = useMemo(() => {
    return data.tasks.filter((t) => !t.deleted_at);
  }, [data.tasks]);

  const allMappedTasks = useMemo(() => {
    if (activeTasks.length === 0) return [];
    return activeTasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap),
    );
  }, [activeTasks, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap]);

  // Build a workspace-id lookup from the pre-mapped tasks (index-aligned with activeTasks)
  const taskWorkspaceIds = useMemo(() => {
    return activeTasks.map((t) => t.workspace_id);
  }, [data.tasks]);

  // ---------------------------------------------------------------------------
  // Step 2: Filter by workspace + user filters
  // ---------------------------------------------------------------------------
  const hasActiveFilters = filters.statuses.length > 0 || filters.priorities.length > 0 || filters.assignees.length > 0;

  const filteredTasks = useMemo(() => {
    if (allMappedTasks.length === 0) return staticTasks;

    let result: TaskItem[];
    if (selectedWorkspace === 'Everything') {
      result = allMappedTasks;
    } else {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        const wsId = ws.id;
        result = allMappedTasks.filter((_, i) => taskWorkspaceIds[i] === wsId);
      } else {
        result = allMappedTasks;
      }
    }

    // Apply user-selected filters
    if (hasActiveFilters) {
      const statusSet = filters.statuses.length > 0 ? new Set(filters.statuses) : null;
      const prioritySet = filters.priorities.length > 0 ? new Set(filters.priorities) : null;
      const assigneeSet = filters.assignees.length > 0 ? new Set(filters.assignees) : null;

      result = result.filter((t) => {
        if (statusSet && !statusSet.has(t.status)) return false;
        if (prioritySet && !prioritySet.has(t.priority)) return false;
        if (assigneeSet && !t.assignees.some((a) => assigneeSet.has(a))) return false;
        return true;
      });
    }

    // Apply local overrides
    if (localOverrides.size > 0) {
      result = result.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    return result;
  }, [allMappedTasks, taskWorkspaceIds, data.workspaces, selectedWorkspace, localOverrides, filters, hasActiveFilters]);

  // Unique assignee names from the workspace-filtered (pre-user-filter) tasks
  const availableAssignees = useMemo(() => {
    let wsFiltered: TaskItem[];
    if (selectedWorkspace === 'Everything') {
      wsFiltered = allMappedTasks;
    } else {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        const wsId = ws.id;
        wsFiltered = allMappedTasks.filter((_, i) => taskWorkspaceIds[i] === wsId);
      } else {
        wsFiltered = allMappedTasks;
      }
    }
    const names = new Set<string>();
    for (const t of wsFiltered) {
      for (const a of t.assignees) names.add(a);
    }
    return Array.from(names).sort();
  }, [allMappedTasks, taskWorkspaceIds, data.workspaces, selectedWorkspace]);

  // ---------------------------------------------------------------------------
  // Step 3: Paginate – only expose a slice, grow on loadMore (infinite scroll)
  // ---------------------------------------------------------------------------
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count (and filters) when workspace changes
  const prevWorkspaceRef = useRef(selectedWorkspace);
  useEffect(() => {
    if (prevWorkspaceRef.current !== selectedWorkspace) {
      setVisibleCount(PAGE_SIZE);
      setFilters(emptyFilters);
      prevWorkspaceRef.current = selectedWorkspace;
    }
  }, [selectedWorkspace]);

  // Reset pagination when filters change
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    if (prevFiltersRef.current !== filters) {
      setVisibleCount(PAGE_SIZE);
      prevFiltersRef.current = filters;
    }
  }, [filters]);

  const tasks = useMemo(() => {
    return filteredTasks.slice(0, visibleCount);
  }, [filteredTasks, visibleCount]);

  const totalTaskCount = filteredTasks.length;
  const hasMoreTasks = visibleCount < filteredTasks.length;

  const loadMoreTasks = useCallback(() => {
    if (hasMoreTasks) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredTasks.length));
    }
  }, [hasMoreTasks, filteredTasks.length]);

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

  const changeTaskStatus = useCallback((taskId: string, status: StatusOption) => {
    // Optimistic update
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: status.name, statusColor: status.color, statusId: status.id });
      return next;
    });

    // Persist to backend
    apiClient.patchTask(Number(taskId), { status_id: status.id }).catch((err) => {
      console.warn('[TaskContext] Failed to change status:', err);
      // Rollback optimistic update
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    });
  }, []);

  const markTaskDone = useCallback((taskId: string) => {
    if (!finalStatus) return;
    // Find the final status ID
    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;

    // Optimistic update
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: finalStatus.name, statusColor: finalStatus.color });
      return next;
    });
    if (activeTask?.id === taskId) setActiveTaskState(null);

    // Persist to backend
    if (finalStatusId) {
      apiClient.patchTask(Number(taskId), { status_id: finalStatusId }).catch((err) => {
        console.warn('[TaskContext] Failed to mark task done:', err);
      });
    }
  }, [finalStatus, data.statuses, activeTask]);

  const assignTaskToYou = (taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (task && !task.assignees.includes('You')) {
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(taskId, { assignees: [...task.assignees, 'You'] });
        return next;
      });
    }
  };

  // Form version map: formId → active form version (with parsed schema)
  const formVersionMap = useMemo(() => {
    const formToCurrentVersion = new Map<number, number>();
    for (const f of data.forms) {
      if (f.current_version_id) formToCurrentVersion.set(f.id, f.current_version_id);
    }

    const m = new Map<number, SyncedFormVersion>();
    for (const fv of data.formVersions) {
      // Check if this version is the current active one for its form
      const currentVersionId = formToCurrentVersion.get(fv.form_id);
      if (currentVersionId === fv.id) {
        m.set(fv.form_id, fv);
      }
    }
    return m;
  }, [data.forms, data.formVersions]);

  // Task form submissions map: taskId → TaskForm
  const taskFormMap = useMemo(() => {
    const m = new Map<number, SyncedTaskForm>();
    for (const tf of data.taskForms) {
      m.set(tf.task_id, tf);
    }
    return m;
  }, [data.taskForms]);

  const getFormSchema = useCallback((task: TaskItem): FormSchema | null => {
    if (!task.formId) return null;

    const fv = formVersionMap.get(task.formId);
    if (!fv || !fv.fields) return null;

    try {
      const parsed = typeof fv.fields === 'string' ? JSON.parse(fv.fields) : fv.fields;
      return {
        title: (parsed as Record<string, unknown>).title as string | undefined,
        description: (parsed as Record<string, unknown>).description as string | undefined,
        fields: ((parsed as Record<string, unknown>).fields as FormSchemaField[]) ?? [],
      };
    } catch {
      return null;
    }
  }, [formVersionMap]);

  const getFormVersionId = useCallback((formId: number): number | null => {
    const fv = formVersionMap.get(formId);
    return fv?.id ?? null;
  }, [formVersionMap]);

  const getTaskFormSubmission = useCallback((taskId: string): { id: number; formVersionId: number; data: Record<string, unknown> } | null => {
    const tf = taskFormMap.get(Number(taskId));
    if (!tf) return null;

    let parsedData: Record<string, unknown> = {};
    if (tf.data) {
      try {
        parsedData = typeof tf.data === 'string' ? JSON.parse(tf.data) : tf.data as Record<string, unknown>;
      } catch {
        parsedData = {};
      }
    }

    return {
      id: tf.id,
      formVersionId: tf.form_version_id,
      data: parsedData,
    };
  }, [taskFormMap]);

  const contextValue = useMemo<TaskContextType>(
    () => ({
      tasks,
      totalTaskCount,
      loadMoreTasks,
      hasMoreTasks,
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
      filters,
      setFilters,
      hasActiveFilters,
      availableAssignees,
      changeTaskStatus,
      markTaskDone,
      assignTaskToYou,
      getFormSchema,
      getTaskFormSubmission,
      getFormVersionId,
    }),
    [
      tasks,
      totalTaskCount,
      loadMoreTasks,
      hasMoreTasks,
      activeTask,
      compactCards,
      selectedWorkspace,
      workspaces,
      workspaceObjects,
      statuses,
      initialStatus,
      finalStatus,
      getAllowedStatuses,
      filters,
      hasActiveFilters,
      availableAssignees,
      getFormSchema,
      getTaskFormSubmission,
      getFormVersionId,
    ],
  );

  return (
    <TaskContext.Provider value={contextValue}>
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
