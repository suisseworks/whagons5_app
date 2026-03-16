/**
 * TaskContext – Bridges the synced data from DataContext into the existing
 * TaskItem interface that all the UI components consume.
 *
 * If synced data is available (user is logged in + Convex connected),
 * tasks are derived from DataContext. Otherwise the original static
 * data is used as a fallback so the UI never shows an empty screen.
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, ReactNode } from 'react';
import { TaskItem } from '../models/types';
import { useData, SyncedTask, SyncedWorkspace, SyncedTemplate, SyncedForm, SyncedFormVersion, SyncedTaskForm } from './DataContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';

// ---------------------------------------------------------------------------
// Helpers – map synced backend data → UI TaskItem
// ---------------------------------------------------------------------------

// Use `any` for map keys since IDs can be string (Convex) or number (legacy)
type AnyId = any;

function mapPriority(
  priorityId: AnyId,
  priorityMap: Map<AnyId, { name: string; color?: string | null }>,
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
  statusId: AnyId,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean }>,
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
  spotMap: Map<AnyId, string>,
  priorityMap: Map<AnyId, { name: string; color?: string | null }>,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean }>,
  assigneeMap: Map<AnyId, string[]>,
  tagMap: Map<AnyId, string[]>,
  initialStatus: { name: string; color: string | null } | null,
  templateFormMap: Map<AnyId, { formId: AnyId; formName: string }>,
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);

  // Resolve form via template_id → template → form_id
  const templateId = task.template_id;
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
    title: 'Loading...',
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
  id: AnyId;
  name: string;
  color: string | null;
  initial?: boolean;
  final?: boolean;
}

export interface TaskFilters {
  statuses: string[];
  priorities: string[];
  assignees: string[];
}

export const emptyFilters: TaskFilters = {
  statuses: [],
  priorities: [],
  assignees: [],
};

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
  totalTaskCount: number;
  loadMoreTasks: () => void;
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
  availableAssignees: string[];
  changeTaskStatus: (taskId: string, status: StatusOption) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
  getFormSchema: (task: TaskItem) => FormSchema | null;
  getTaskFormSubmission: (taskId: string) => { id: AnyId; formVersionId: AnyId; data: Record<string, unknown> } | null;
  getFormVersionId: (formId: AnyId) => AnyId | null;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useData();
  const { tenantId } = useTenant();

  // Convex mutations
  const patchTaskMutation = useMutation(api.tasks.update);

  const [activeTask, setActiveTaskState] = useState<TaskItem | null>(null);
  const [compactCards, setCompactCards] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const [localOverrides, setLocalOverrides] = useState<Map<string, Partial<TaskItem>>>(new Map());

  // Build lookup maps from synced reference data
  const spotMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const s of data.spots) m.set(s.id, s.name);
    return m;
  }, [data.spots]);

  const priorityMap = useMemo(() => {
    const m = new Map<AnyId, { name: string; color?: string | null }>();
    for (const p of data.priorities) m.set(p.id, { name: p.name, color: p.color });
    return m;
  }, [data.priorities]);

  const statusMap = useMemo(() => {
    const m = new Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean }>();
    for (const s of data.statuses) m.set(s.id, { name: s.name, color: s.color, final: s.final, initial: s.initial });
    return m;
  }, [data.statuses]);

  const userMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const u of data.users) m.set(u.id, u.name);
    return m;
  }, [data.users]);

  const tagNameMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const t of data.tags) m.set(t.id, t.name);
    return m;
  }, [data.tags]);

  const assigneeMap = useMemo(() => {
    const m = new Map<AnyId, string[]>();
    for (const tu of data.taskUsers) {
      const list = m.get(tu.task_id) ?? [];
      const name = userMap.get(tu.user_id);
      if (name) list.push(name);
      m.set(tu.task_id, list);
    }
    return m;
  }, [data.taskUsers, userMap]);

  const tagMap = useMemo(() => {
    const m = new Map<AnyId, string[]>();
    for (const tt of data.taskTags) {
      const list = m.get(tt.task_id) ?? [];
      const name = tagNameMap.get(tt.tag_id);
      if (name) list.push(name);
      m.set(tt.task_id, list);
    }
    return m;
  }, [data.taskTags, tagNameMap]);

  // Build template → form lookup
  const templateFormMap = useMemo(() => {
    const formMap = new Map<AnyId, string>();
    for (const f of data.forms) formMap.set(f.id, f.name);

    const m = new Map<AnyId, { formId: AnyId; formName: string }>();
    for (const tpl of data.templates) {
      if (tpl.form_id) {
        const formName = formMap.get(tpl.form_id) ?? 'Form';
        m.set(tpl.id, { formId: tpl.form_id, formName });
      }
    }
    return m;
  }, [data.templates, data.forms]);

  const workspaces = useMemo(() => {
    const names = data.workspaces.map((w) => w.name);
    return ['Everything', ...names];
  }, [data.workspaces]);

  const workspaceObjects = useMemo(() => data.workspaces, [data.workspaces]);

  const statuses: StatusOption[] = useMemo(() => {
    return data.statuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? null,
      initial: s.initial,
      final: s.final,
    }));
  }, [data.statuses]);

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

  // Status transition logic
  const categoryTransitionGroupMap = useMemo(() => {
    const m = new Map<AnyId, AnyId>();
    for (const c of data.categories) {
      if (c.status_transition_group_id) m.set(c.id, c.status_transition_group_id);
    }
    return m;
  }, [data.categories]);

  const transitionMap = useMemo(() => {
    const m = new Map<string, Set<AnyId>>();
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

  const getAllowedStatuses = useCallback((task: TaskItem): StatusOption[] => {
    const categoryId = task.categoryId;
    const statusId = task.statusId;
    if (!categoryId || !statusId) return statuses;

    const groupId = categoryTransitionGroupMap.get(categoryId);
    if (!groupId) return statuses;

    const key = `${groupId}:${statusId}`;
    const allowedIds = transitionMap.get(key);
    if (!allowedIds || allowedIds.size === 0) return statuses;

    return statuses.filter((s) => s.id === statusId || allowedIds.has(s.id));
  }, [statuses, categoryTransitionGroupMap, transitionMap]);

  // ---------------------------------------------------------------------------
  // Map tasks
  // ---------------------------------------------------------------------------
  const activeTasks = useMemo(() => {
    return data.tasks.filter((t) => !t.deleted_at);
  }, [data.tasks]);

  const allMappedTasks = useMemo(() => {
    if (activeTasks.length === 0) return [];
    return activeTasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap),
    );
  }, [activeTasks, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap]);

  const taskWorkspaceIds = useMemo(() => {
    return activeTasks.map((t) => t.workspace_id);
  }, [activeTasks]);

  // ---------------------------------------------------------------------------
  // Filter + paginate
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

    if (localOverrides.size > 0) {
      result = result.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    return result;
  }, [allMappedTasks, taskWorkspaceIds, data.workspaces, selectedWorkspace, localOverrides, filters, hasActiveFilters]);

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

  // Pagination
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const prevWorkspaceRef = useRef(selectedWorkspace);
  useEffect(() => {
    if (prevWorkspaceRef.current !== selectedWorkspace) {
      setVisibleCount(PAGE_SIZE);
      setFilters(emptyFilters);
      prevWorkspaceRef.current = selectedWorkspace;
    }
  }, [selectedWorkspace]);

  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    if (prevFiltersRef.current !== filters) {
      setVisibleCount(PAGE_SIZE);
      prevFiltersRef.current = filters;
    }
  }, [filters]);

  const tasks = useMemo(() => filteredTasks.slice(0, visibleCount), [filteredTasks, visibleCount]);
  const totalTaskCount = filteredTasks.length;
  const hasMoreTasks = visibleCount < filteredTasks.length;

  const loadMoreTasks = useCallback(() => {
    if (hasMoreTasks) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredTasks.length));
    }
  }, [hasMoreTasks, filteredTasks.length]);

  // ---------------------------------------------------------------------------
  // Mutations (Convex)
  // ---------------------------------------------------------------------------

  const addTask = (_task: TaskItem) => {
    // TODO: implement via Convex mutation
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

    // Persist via Convex
    if (tenantId) {
      patchTaskMutation({
        tenantId,
        id: taskId as any,
        statusId: status.id,
      }).catch((err: any) => {
        console.warn('[TaskContext] Failed to change status:', err);
        setLocalOverrides((prev) => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      });
    }
  }, [tenantId, patchTaskMutation]);

  const markTaskDone = useCallback((taskId: string) => {
    if (!finalStatus) return;
    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;

    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, { status: finalStatus.name, statusColor: finalStatus.color });
      return next;
    });
    if (activeTask?.id === taskId) setActiveTaskState(null);

    if (finalStatusId && tenantId) {
      patchTaskMutation({
        tenantId,
        id: taskId as any,
        statusId: finalStatusId,
      }).catch((err: any) => {
        console.warn('[TaskContext] Failed to mark task done:', err);
      });
    }
  }, [finalStatus, data.statuses, activeTask, tenantId, patchTaskMutation]);

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

  // Form version map
  const formVersionMap = useMemo(() => {
    const formToCurrentVersion = new Map<AnyId, AnyId>();
    for (const f of data.forms) {
      if (f.current_version_id) formToCurrentVersion.set(f.id, f.current_version_id);
    }

    const m = new Map<AnyId, SyncedFormVersion>();
    for (const fv of data.formVersions) {
      const currentVersionId = formToCurrentVersion.get(fv.form_id);
      if (currentVersionId === fv.id) {
        m.set(fv.form_id, fv);
      }
    }
    return m;
  }, [data.forms, data.formVersions]);

  const taskFormMap = useMemo(() => {
    const m = new Map<AnyId, SyncedTaskForm>();
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

  const getFormVersionId = useCallback((formId: AnyId): AnyId | null => {
    const fv = formVersionMap.get(formId);
    return fv?.id ?? null;
  }, [formVersionMap]);

  const getTaskFormSubmission = useCallback((taskId: string): { id: AnyId; formVersionId: AnyId; data: Record<string, unknown> } | null => {
    const tf = taskFormMap.get(taskId) ?? taskFormMap.get(Number(taskId));
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
      changeTaskStatus,
      markTaskDone,
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
