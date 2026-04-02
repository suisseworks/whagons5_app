/**
 * TaskContext – Bridges the synced data from DataContext into the existing
 * TaskItem interface that all the UI components consume.
 *
 * If synced data is available (user is logged in + Convex connected),
 * tasks are derived from DataContext. Otherwise the original static
 * data is used as a fallback so the UI never shows an empty screen.
 */

import React, { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { TaskItem, Assignee, CardDensity } from '../models/types';
import { useData, SyncedTask, SyncedWorkspace, SyncedTemplate, SyncedForm, SyncedFormVersion, SyncedTaskForm } from './DataContext';
import { useAuth } from './AuthContext';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { computeApprovalStatusForTask } from '../utils/approvalStatus';

const WORKING_TASKS_STORAGE_KEY = '@whagons/working_task_ids';
const MAX_WORKING_TASKS = 5;

// ---------------------------------------------------------------------------
// Helpers – map synced backend data → UI TaskItem
// ---------------------------------------------------------------------------

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
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>,
  initialStatus: { name: string; color: string | null } | null,
): { name: string; color: string | null; icon: string | null; action: string | null } {
  if (!statusId) return { ...(initialStatus ?? { name: '', color: null }), icon: null, action: null };
  const s = statusMap.get(statusId);
  if (!s) return { ...(initialStatus ?? { name: '', color: null }), icon: null, action: null };
  return { name: s.name, color: s.color ?? null, icon: s.icon ?? null, action: s.action ?? null };
}

function formatTime12(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const time = formatTime12(d);

    if (d.toDateString() === now.toDateString()) return `Today ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
      return `${weekday} ${time}`;
    }
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${label} ${time}`;
  } catch {
    return dateStr ?? '';
  }
}

function mapTaskToItem(
  task: SyncedTask,
  spotMap: Map<AnyId, string>,
  priorityMap: Map<AnyId, { name: string; color?: string | null }>,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>,
  assigneeMap: Map<AnyId, Assignee[]>,
  tagMap: Map<AnyId, string[]>,
  initialStatus: { name: string; color: string | null } | null,
  templateFormMap: Map<AnyId, { formId: AnyId; formName: string }>,
  userFlagMap: Map<AnyId, string>,
  categoryInfoMap: Map<AnyId, { color?: string | null; icon?: string | null }>,
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);

  const templateId = task.template_id;
  const formInfo = templateId ? templateFormMap.get(templateId) : undefined;

  const flagColor = userFlagMap.get(task.id) ?? (task as any).flagColor ?? (task as any).flag_color ?? null;
  const catInfo = task.category_id ? categoryInfoMap.get(task.category_id) : undefined;

  return {
    id: String(task.id),
    convexId: (task as any)._id ?? undefined,
    title: task.name || 'Untitled',
    description: (task as any).description || null,
    spot: task.spot_id ? (spotMap.get(task.spot_id) ?? '') : '',
    spotId: task.spot_id ?? null,
    priority: mapPriority(task.priority_id, priorityMap),
    priorityId: task.priority_id ?? null,
    status: status.name,
    statusColor: status.color,
    statusId: task.status_id ?? null,
    statusIcon: status.icon,
    statusAction: status.action,
    categoryId: task.category_id ?? null,
    categoryColor: catInfo?.color ?? null,
    categoryIcon: catInfo?.icon ?? null,
    workspaceId: task.workspace_id ?? null,
    assignees: assigneeMap.get(task.id) ?? [],
    createdAt: formatDate(task.created_at),
    tags: tagMap.get(task.id) ?? [],
    approval: null,
    sla: null,
    formId: formInfo?.formId ?? null,
    formName: formInfo?.formName ?? null,
    flagColor,
    createdBy: task.created_by ?? null,
    firstViewedAt: (task as any).firstViewedAt ?? null,
    latitude: (task as any).latitude ?? null,
    longitude: (task as any).longitude ?? null,
  };
}

// ---------------------------------------------------------------------------
// Empty fallback (MainScreen handles the empty/syncing UI itself)
// ---------------------------------------------------------------------------
const EMPTY_TASKS: TaskItem[] = [];

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

export interface StatusOption {
  id: AnyId;
  name: string;
  color: string | null;
  categoryId?: AnyId;
  initial?: boolean;
  final?: boolean;
  icon?: string | null;
  action?: string | null;
}

export interface CategoryOption {
  id: AnyId;
  name: string;
  color?: string | null;
}

export interface TaskFilters {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  flagColors: string[];
  tags: string[];
}

export const emptyFilters: TaskFilters = {
  statuses: [],
  priorities: [],
  assignees: [],
  flagColors: [],
  tags: [],
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
       | 'barcode' | 'list' | 'single-checkbox' | 'section';
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

export interface CreateTaskAttachment {
  storageId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface CreateTaskArgs {
  name: string;
  description?: string;
  workspaceConvexId: string;
  categoryConvexId?: string;
  templateConvexId?: string;
  spotConvexId?: string;
  statusConvexId?: string;
  priorityConvexId?: string;
  userConvexIds?: string[];
  dueDate?: number;
  startDate?: number;
  attachments?: CreateTaskAttachment[];
  latitude?: number;
  longitude?: number;
}

interface TaskContextType {
  tasks: TaskItem[];
  totalTaskCount: number;
  loadMoreTasks: () => void;
  hasMoreTasks: boolean;
  activeTask: TaskItem | null;
  workingTasks: TaskItem[];
  cardDensity: CardDensity;
  selectedWorkspace: string;
  workspaces: string[];
  workspaceObjects: SyncedWorkspace[];
  sharedCount: number;
  statuses: StatusOption[];
  categories: CategoryOption[];
  initialStatus: { name: string; color: string | null } | null;
  finalStatus: { name: string; color: string | null } | null;
  getAllowedStatuses: (task: TaskItem) => StatusOption[];
  createTask: (args: CreateTaskArgs) => Promise<string>;
  addTask: (task: TaskItem) => void;
  updateTask: (index: number, task: TaskItem) => void;
  setActiveTask: (task: TaskItem | null, markDone?: boolean) => void;
  addWorkingTask: (task: TaskItem) => void;
  removeWorkingTask: (taskId: string) => void;
  completeWorkingTask: (taskId: string) => void;
  isTaskWorking: (taskId: string) => boolean;
  setCardDensity: (density: CardDensity) => void;
  toggleCompactCards: () => void;
  compactCards: boolean;
  setSelectedWorkspace: (workspace: string) => void;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  hasActiveFilters: boolean;
  unfilteredTasks: TaskItem[];
  availableAssignees: string[];
  availableStatuses: StatusOption[];
  availableTags: string[];
  tagInfoMap: Map<string, { color: string | null; icon: string | null }>;
  changeTaskStatus: (taskId: string, status: StatusOption) => void;
  changeTaskPriority: (taskId: string, priorityId: AnyId) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
  assignTaskToUser: (taskId: string, userId: number, userName: string) => void;
  getFormSchema: (task: TaskItem) => FormSchema | null;
  getTaskFormSubmission: (taskId: string) => { id: AnyId; formVersionId: AnyId; data: Record<string, unknown> } | null;
  getFormVersionId: (formId: AnyId) => AnyId | null;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data, sharedTaskIds, sharedCount, rawSharedToMe, approvals: approvalsList, approvalApprovers, taskApprovalInstances } = useData();
  const { user: authUser } = useAuth();
  const { tenantId } = useTenant();

  // Convex mutations
  const createTaskMutation = useMutation(api.tasks.create);
  const patchTaskMutation = useMutation(api.tasks.update);
  const assignUserMutation = useMutation(api.taskResources.assignUser);

  // Multi-task working state (persisted to AsyncStorage)
  const [workingTaskIds, setWorkingTaskIds] = useState<string[]>([]);
  const workingTaskIdsLoaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(WORKING_TASKS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const ids = JSON.parse(raw);
          if (Array.isArray(ids)) setWorkingTaskIds(ids.slice(0, MAX_WORKING_TASKS));
        } catch {}
      }
      workingTaskIdsLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (workingTaskIdsLoaded.current) {
      AsyncStorage.setItem(WORKING_TASKS_STORAGE_KEY, JSON.stringify(workingTaskIds));
    }
  }, [workingTaskIds]);

  const [cardDensity, setCardDensity] = useState<CardDensity>('normal');
  const compactCards = cardDensity === 'compact';
  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const [localOverrides, setLocalOverrides] = useState<Map<string, Partial<TaskItem>>>(new Map());
  const [pendingAssigns, setPendingAssigns] = useState<Map<string, Set<string>>>(new Map());

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
    const m = new Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>();
    for (const s of data.statuses) m.set(s.id, { name: s.name, color: s.color, final: s.final, initial: s.initial, icon: (s as any).icon ?? null, action: (s as any).action ?? null });
    return m;
  }, [data.statuses]);

  // Reverse lookup: resolved pgId → Convex _id for statuses
  const statusConvexIdMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const s of data.statuses) m.set(s.id, (s as any)._id);
    return m;
  }, [data.statuses]);

  // Reverse lookup: resolved pgId → Convex _id for priorities
  const priorityConvexIdMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const p of data.priorities) m.set(p.id, (p as any)._id);
    return m;
  }, [data.priorities]);

  const userMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const u of data.users) m.set(u.id, u.name);
    return m;
  }, [data.users]);

  const userConvexIdMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const u of data.users) m.set(u.id, (u as any)._id);
    return m;
  }, [data.users]);

  const tagNameMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const t of data.tags) m.set(t.id, t.name);
    return m;
  }, [data.tags]);

  const tagInfoMap = useMemo(() => {
    const m = new Map<string, { color: string | null; icon: string | null }>();
    for (const t of data.tags) {
      m.set(t.name, { color: t.color ?? null, icon: t.icon ?? null });
    }
    return m;
  }, [data.tags]);

  const userPictureMap = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const u of data.users) m.set(u.id, u.url_picture ?? null);
    return m;
  }, [data.users]);

  const assigneeMap = useMemo(() => {
    const m = new Map<AnyId, Assignee[]>();
    for (const tu of data.taskUsers) {
      const list = m.get(tu.task_id) ?? [];
      const name = userMap.get(tu.user_id);
      if (name) {
        list.push({ name, picture: userPictureMap.get(tu.user_id) ?? null });
      }
      m.set(tu.task_id, list);
    }

    if (pendingAssigns.size > 0) {
      for (const [taskId, names] of pendingAssigns) {
        const existing = m.get(taskId) ?? m.get(Number(taskId)) ?? [];
        const merged = [...existing];
        for (const userName of names) {
          if (!merged.some((a) => a.name === userName)) {
            merged.push({ name: userName, picture: userPictureMap.get(
              [...userMap.entries()].find(([, n]) => n === userName)?.[0] as number
            ) ?? null });
          }
        }
        m.set(taskId, merged);
        m.set(Number(taskId), merged);
      }
    }

    return m;
  }, [data.taskUsers, userMap, userPictureMap, pendingAssigns]);

  useEffect(() => {
    if (pendingAssigns.size === 0) return;
    const syncedNames = new Map<string, Set<string>>();
    for (const tu of data.taskUsers) {
      const name = userMap.get(tu.user_id);
      if (!name) continue;
      const taskKey = String(tu.task_id);
      const set = syncedNames.get(taskKey) ?? new Set();
      set.add(name);
      syncedNames.set(taskKey, set);
    }
    let changed = false;
    const next = new Map(pendingAssigns);
    for (const [taskId, names] of next) {
      const synced = syncedNames.get(taskId);
      if (!synced) continue;
      const remaining = new Set<string>();
      for (const n of names) {
        if (!synced.has(n)) remaining.add(n);
      }
      if (remaining.size === 0) {
        next.delete(taskId);
        changed = true;
      } else if (remaining.size < names.size) {
        next.set(taskId, remaining);
        changed = true;
      }
    }
    if (changed) setPendingAssigns(next);
  }, [data.taskUsers, userMap, pendingAssigns]);

  const userFlagMap = useMemo(() => {
    const currentUserId = authUser?.id;
    if (!currentUserId) return new Map<AnyId, string>();
    const m = new Map<AnyId, string>();
    for (const tf of data.taskFlags) {
      if (tf.user_id === currentUserId && tf.color) {
        m.set(tf.task_id, tf.color);
      }
    }
    return m;
  }, [data.taskFlags, authUser]);

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
    const list = ['Everything', ...names];
    if (sharedCount > 0) list.push('Shared');
    return list;
  }, [data.workspaces, sharedCount]);

  const workspaceObjects = useMemo(() => data.workspaces, [data.workspaces]);

  const statuses: StatusOption[] = useMemo(() => {
    return data.statuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? null,
      categoryId: s.category_id ?? null,
      initial: s.initial,
      final: s.final,
      icon: (s as any).icon ?? null,
      action: (s as any).action ?? null,
    }));
  }, [data.statuses]);

  const categories: CategoryOption[] = useMemo(() => {
    return data.categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color ?? null,
    }));
  }, [data.categories]);

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

  const categoryStatusIdsMap = useMemo(() => {
    const m = new Map<AnyId, Set<AnyId>>();
    const groupStatusIds = new Map<AnyId, Set<AnyId>>();
    for (const t of data.statusTransitions) {
      let set = groupStatusIds.get(t.status_transition_group_id);
      if (!set) {
        set = new Set();
        groupStatusIds.set(t.status_transition_group_id, set);
      }
      set.add(t.from_status);
      set.add(t.to_status);
    }
    for (const c of data.categories) {
      if (c.status_transition_group_id) {
        const ids = groupStatusIds.get(c.status_transition_group_id);
        if (ids) m.set(c.id, ids);
      }
    }
    return m;
  }, [data.categories, data.statusTransitions]);

  const getAllowedStatuses = useCallback((task: TaskItem): StatusOption[] => {
    const categoryId = task.categoryId;
    const statusId = task.statusId;

    const categoryStatusIds = categoryId ? categoryStatusIdsMap.get(categoryId) : undefined;
    const categoryFiltered = categoryStatusIds
      ? statuses.filter((s) => categoryStatusIds.has(s.id))
      : statuses.filter((s) => categoryId && s.categoryId != null && String(s.categoryId) === String(categoryId));
    const fallback = categoryFiltered.length > 0 ? categoryFiltered : statuses;

    if (!categoryId || !statusId) return fallback;

    const groupId = categoryTransitionGroupMap.get(categoryId);
    if (!groupId) return fallback;

    const key = `${groupId}:${statusId}`;
    const allowedIds = transitionMap.get(key);
    if (!allowedIds || allowedIds.size === 0) return fallback;

    return statuses.filter((s) => s.id === statusId || allowedIds.has(s.id));
  }, [statuses, categoryTransitionGroupMap, transitionMap, categoryStatusIdsMap]);

  // ---------------------------------------------------------------------------
  // Map tasks
  // ---------------------------------------------------------------------------

  const activeTasks = useMemo(() => {
    return data.tasks.filter((t) => !t.deleted_at);
  }, [data.tasks]);

  const categoryInfoMap = useMemo(() => {
    const m = new Map<AnyId, { color?: string | null; icon?: string | null }>();
    for (const c of data.categories) {
      m.set(c.id, { color: c.color ?? null, icon: (c as any).icon ?? null });
    }
    return m;
  }, [data.categories]);

  const allMappedTasks = useMemo(() => {
    if (activeTasks.length === 0) return [];
    return activeTasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap),
    );
  }, [activeTasks, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap]);

  // Helper: set a local override that auto-clears after a short delay
  const setTimedOverride = useCallback((taskId: string, override: Partial<TaskItem>) => {
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, override);
      return next;
    });
    setTimeout(() => {
      setLocalOverrides((prev) => {
        if (!prev.has(taskId)) return prev;
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    }, 3000);
  }, []);

  // workspace_id is now embedded directly on each TaskItem (workspaceId field)
  // so we no longer need a separate parallel array for index-based filtering.

  // ---------------------------------------------------------------------------
  // Shared task enrichment: approval status + ack progress
  // ---------------------------------------------------------------------------

  const approvalMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const a of approvalsList) {
      m[String(a._id ?? a.id)] = a;
      if (a.id != null) m[String(a.id)] = a;
    }
    return m;
  }, [approvalsList]);

  const sharedEnrichmentMap = useMemo(() => {
    const m = new Map<string, {
      approvalStatus: 'pending' | 'approved' | 'rejected' | null;
      shareId: string;
      shareStatus: 'pending' | 'acknowledged' | null;
      ackTotal: number;
      ackDone: number;
      permission: string | null;
      approvalId: string | number | null;
      taskConvexId: string | null;
    }>();
    if (!rawSharedToMe) return m;

    for (const share of rawSharedToMe) {
      if (!share.task) continue;
      const taskId = share.task.id ?? share.task.pgId ?? share.task._id;
      if (taskId == null) continue;

      const task = share.task;
      const taskConvexId = task._id ?? null;
      const approvalId = task.approvalId ?? task.approval_id ?? null;
      const approval = approvalId ? approvalMap[String(approvalId)] : undefined;

      const derived = computeApprovalStatusForTask({
        taskId: String(taskId),
        taskConvexId: taskConvexId ?? undefined,
        approvalId,
        approval,
        taskApprovalInstances: taskApprovalInstances as any[],
      });

      m.set(String(taskId), {
        approvalStatus: derived,
        shareId: share._id,
        shareStatus: share.status ?? null,
        ackTotal: share.ackTotal ?? 0,
        ackDone: share.ackDone ?? 0,
        permission: share.permission ?? null,
        approvalId,
        taskConvexId,
      });
    }
    return m;
  }, [rawSharedToMe, approvalMap, taskApprovalInstances]);

  // ---------------------------------------------------------------------------
  // Filter + paginate
  // ---------------------------------------------------------------------------
  const hasActiveFilters = filters.statuses.length > 0 || filters.priorities.length > 0 || filters.assignees.length > 0 || filters.flagColors.length > 0 || filters.tags.length > 0;

  const filteredTasks = useMemo(() => {
    if (allMappedTasks.length === 0) return EMPTY_TASKS;

    let result: TaskItem[];
    if (selectedWorkspace === 'Everything') {
      result = allMappedTasks;
    } else if (selectedWorkspace === 'Shared') {
      result = allMappedTasks
        .filter((t) => {
          const numId = Number(t.id);
          return sharedTaskIds.has(numId) || sharedTaskIds.has(t.id ?? '');
        })
        .map((t) => {
          const enrichment = sharedEnrichmentMap.get(String(t.id));
          if (!enrichment) return t;
          return {
            ...t,
            approvalStatus: enrichment.approvalStatus,
            shareId: enrichment.shareId,
            shareStatus: enrichment.shareStatus,
            ackTotal: enrichment.ackTotal,
            ackDone: enrichment.ackDone,
            sharePermission: enrichment.permission,
            approvalId: enrichment.approvalId,
            taskConvexId: enrichment.taskConvexId,
          };
        });
    } else {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        const wsIdStr = String(ws.id);
        result = allMappedTasks.filter((t) => String(t.workspaceId) === wsIdStr);
        if (result.length === 0 && allMappedTasks.length > 0) {
          const sampleIds = allMappedTasks.slice(0, 5).map((t) => `${t.workspaceId}(${typeof t.workspaceId})`);
          console.warn(`[TaskContext] Workspace "${selectedWorkspace}" (id=${ws.id}, type=${typeof ws.id}) matched 0/${allMappedTasks.length} tasks. Sample task wsIds: [${sampleIds.join(', ')}]`);
        }
      } else {
        result = allMappedTasks;
      }
    }

    if (hasActiveFilters) {
      const statusSet = filters.statuses.length > 0 ? new Set(filters.statuses) : null;
      const prioritySet = filters.priorities.length > 0 ? new Set(filters.priorities) : null;
      const assigneeSet = filters.assignees.length > 0 ? new Set(filters.assignees) : null;
      const flagColorSet = filters.flagColors.length > 0 ? new Set(filters.flagColors) : null;
      const tagSet = filters.tags.length > 0 ? new Set(filters.tags) : null;

      result = result.filter((t) => {
        if (statusSet && !statusSet.has(t.status)) return false;
        if (prioritySet && !prioritySet.has(t.priority)) return false;
        if (assigneeSet && !t.assignees.some((a) => assigneeSet.has(a.name))) return false;
        if (flagColorSet && (!t.flagColor || !flagColorSet.has(t.flagColor))) return false;
        if (tagSet && !t.tags.some((tag) => tagSet.has(tag))) return false;
        return true;
      });
    }

    if (localOverrides.size > 0) {
      result = result.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    result.sort((a, b) => {
      const idA = Number(a.id ?? 0);
      const idB = Number(b.id ?? 0);
      return idB - idA;
    });

    return result;
  }, [allMappedTasks, data.workspaces, selectedWorkspace, localOverrides, filters, hasActiveFilters, sharedTaskIds, sharedEnrichmentMap]);

  const wsFilteredTasks = useMemo(() => {
    if (selectedWorkspace === 'Everything') return allMappedTasks;
    if (selectedWorkspace === 'Shared') {
      return allMappedTasks.filter((t) => {
        const numId = Number(t.id);
        return sharedTaskIds.has(numId) || sharedTaskIds.has(t.id ?? '');
      });
    }
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    if (ws) {
      const wsIdStr = String(ws.id);
      return allMappedTasks.filter((t) => String(t.workspaceId) === wsIdStr);
    }
    return allMappedTasks;
  }, [allMappedTasks, data.workspaces, selectedWorkspace, sharedTaskIds]);

  const availableAssignees = useMemo(() => {
    const names = new Set<string>();
    for (const t of wsFilteredTasks) {
      for (const a of t.assignees) names.add(a.name);
    }
    return Array.from(names).sort();
  }, [wsFilteredTasks]);

  const availableTags = useMemo(() => {
    const tagNames = new Set<string>();
    for (const t of wsFilteredTasks) {
      for (const tag of t.tags) tagNames.add(tag);
    }
    return Array.from(tagNames).sort();
  }, [wsFilteredTasks]);

  const availableStatuses: StatusOption[] = useMemo(() => {
    const wsFiltered = wsFilteredTasks;

    const catIds = new Set<AnyId>();
    for (const t of wsFiltered) {
      if (t.categoryId) catIds.add(t.categoryId);
    }

    if (catIds.size === 0) return statuses;

    const statusIds = new Set<AnyId>();
    for (const catId of catIds) {
      const ids = categoryStatusIdsMap.get(catId);
      if (ids) {
        for (const id of ids) statusIds.add(id);
      }
    }

    if (statusIds.size === 0) return statuses;

    return statuses.filter((s) => statusIds.has(s.id));
  }, [wsFilteredTasks, statuses, categoryStatusIdsMap]);

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
  // Working tasks
  // ---------------------------------------------------------------------------
  const allMappedTaskMap = useMemo(() => {
    const m = new Map<string, TaskItem>();
    for (const t of allMappedTasks) {
      if (t.id) m.set(t.id, t);
    }
    return m;
  }, [allMappedTasks]);

  const workingTasks = useMemo(() => {
    const result: TaskItem[] = [];
    for (const id of workingTaskIds) {
      const task = allMappedTaskMap.get(id);
      if (task) {
        const override = localOverrides.get(id);
        result.push(override ? { ...task, ...override } : task);
      }
    }
    return result;
  }, [workingTaskIds, allMappedTaskMap, localOverrides]);

  useEffect(() => {
    if (allMappedTasks.length === 0) return;
    const validIds = workingTaskIds.filter((id) => {
      const task = allMappedTaskMap.get(id);
      if (!task) return false; // task deleted
      // Remove tasks that reached a final or initial status
      if (task.statusId != null) {
        const statusInfo = statusMap.get(task.statusId);
        if (statusInfo?.final || statusInfo?.initial) return false;
      }
      return true;
    });
    if (validIds.length !== workingTaskIds.length) {
      setWorkingTaskIds(validIds);
    }
  }, [allMappedTaskMap, allMappedTasks, statusMap]);

  // Build set of task IDs the current user is assigned to
  const myTaskIds = useMemo(() => {
    const currentUserId = authUser?.id;
    if (!currentUserId) return new Set<string>();
    const s = new Set<string>();
    for (const tu of data.taskUsers) {
      if (tu.user_id === currentUserId) s.add(String(tu.task_id));
    }
    return s;
  }, [data.taskUsers, authUser]);

  // Auto-populate working tasks: any task assigned to me with a WORKING status action
  useEffect(() => {
    if (!workingTaskIdsLoaded.current) return;
    if (allMappedTasks.length === 0) return;

    const autoWorkingIds = new Set<string>();
    for (const task of allMappedTasks) {
      if (!task.id) continue;
      if (task.statusAction?.toUpperCase() !== 'WORKING') continue;
      if (!myTaskIds.has(task.id)) continue;
      autoWorkingIds.add(task.id);
    }

    if (autoWorkingIds.size === 0) return;

    setWorkingTaskIds((prev) => {
      const existing = new Set(prev);
      let changed = false;
      for (const id of autoWorkingIds) {
        if (!existing.has(id)) {
          existing.add(id);
          changed = true;
        }
      }
      if (!changed) return prev;
      return Array.from(existing).slice(0, MAX_WORKING_TASKS);
    });
  }, [allMappedTasks, myTaskIds]);

  const activeTask = workingTasks.length > 0 ? workingTasks[0] : null;

  const addWorkingTask = useCallback((task: TaskItem) => {
    if (!task.id) return;
    setWorkingTaskIds((prev) => {
      if (prev.includes(task.id!)) return prev;
      if (prev.length >= MAX_WORKING_TASKS) {
        Alert.alert(
          'Limit Reached',
          `You can work on up to ${MAX_WORKING_TASKS} tasks at once. Please complete or stop one first.`,
        );
        return prev;
      }
      return [...prev, task.id!];
    });
  }, []);

  const removeWorkingTask = useCallback((taskId: string) => {
    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));
  }, []);

  const completeWorkingTask = useCallback((taskId: string) => {
    if (!finalStatus) return;
    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;

    setTimedOverride(taskId, { status: finalStatus.name, statusColor: finalStatus.color });

    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));

    if (finalStatusId && tenantId) {
      const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
      const statusConvexId = statusConvexIdMap.get(finalStatusId);
      if (taskConvexId && statusConvexId) {
        patchTaskMutation({
          tenantId,
          id: taskConvexId as any,
          statusId: statusConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to complete working task:', err);
        });
      }
    }
  }, [finalStatus, data.statuses, tenantId, patchTaskMutation, setTimedOverride, allMappedTaskMap, statusConvexIdMap]);

  const isTaskWorking = useCallback((taskId: string) => {
    return workingTaskIds.includes(taskId);
  }, [workingTaskIds]);

  const setActiveTask = useCallback((task: TaskItem | null, markDone = false) => {
    if (markDone && task?.id && finalStatus) {
      completeWorkingTask(task.id);
    } else if (task) {
      addWorkingTask(task);
    }
  }, [finalStatus, completeWorkingTask, addWorkingTask]);

  const toggleCompactCards = useCallback(() => {
    setCardDensity((prev) => prev === 'compact' ? 'normal' : 'compact');
  }, []);

  // ---------------------------------------------------------------------------
  // Mutations (Convex)
  // ---------------------------------------------------------------------------

  const createTask = useCallback(async (args: CreateTaskArgs): Promise<string> => {
    if (!tenantId) throw new Error('No tenant selected');

    const mutationArgs: Record<string, any> = {
      tenantId,
      name: args.name,
      workspaceId: args.workspaceConvexId,
    };
    if (args.description) mutationArgs.description = args.description;
    if (args.categoryConvexId) mutationArgs.categoryId = args.categoryConvexId;
    if (args.templateConvexId) mutationArgs.templateId = args.templateConvexId;
    if (args.spotConvexId) mutationArgs.spotId = args.spotConvexId;
    if (args.statusConvexId) mutationArgs.statusId = args.statusConvexId;
    if (args.priorityConvexId) mutationArgs.priorityId = args.priorityConvexId;
    if (args.dueDate) mutationArgs.dueDate = args.dueDate;
    if (args.startDate) mutationArgs.startDate = args.startDate;
    if (args.attachments?.length) mutationArgs.attachments = args.attachments;
    if (args.latitude != null) mutationArgs.latitude = args.latitude;
    if (args.longitude != null) mutationArgs.longitude = args.longitude;

    const result = await createTaskMutation(mutationArgs as any);
    const taskConvexId = (result as any)?._id ?? String(result);

    // Assign selected users to the newly created task
    if (args.userConvexIds?.length) {
      await Promise.all(
        args.userConvexIds.map(userId =>
          assignUserMutation({
            tenantId,
            taskId: taskConvexId as any,
            userId: userId as any,
          }).catch(err => console.warn('[TaskContext] Failed to assign user:', err))
        )
      );
    }

    return String(result);
  }, [tenantId, createTaskMutation, assignUserMutation]);

  const addTask = (_task: TaskItem) => {
    // Legacy stub - use createTask instead
  };

  const updateTask = (index: number, task: TaskItem) => {
    if (task.id) {
      setTimedOverride(task.id, task);
    }
  };

  const changeTaskStatus = useCallback((taskId: string, status: StatusOption) => {
    setTimedOverride(taskId, { status: status.name, statusColor: status.color, statusId: status.id });

    const fullStatus = data.statuses.find((s) => s.id === status.id);
    const isFinal = status.final ?? fullStatus?.final ?? false;
    const isInitial = status.initial ?? fullStatus?.initial ?? false;

    if (isFinal || isInitial) {
      setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));
    } else {
      setWorkingTaskIds((prev) => {
        if (prev.includes(taskId)) return prev;
        if (prev.length >= MAX_WORKING_TASKS) return prev;
        return [...prev, taskId];
      });
    }

    if (tenantId) {
      // Resolve pgIds → Convex _ids for the mutation
      const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
      const statusConvexId = statusConvexIdMap.get(status.id);
      if (taskConvexId && statusConvexId) {
        patchTaskMutation({
          tenantId,
          id: taskConvexId as any,
          statusId: statusConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to change status:', err);
        });
      } else {
        console.warn('[TaskContext] Could not resolve Convex IDs for status change', { taskId, taskConvexId, statusId: status.id, statusConvexId });
      }
    }
  }, [data.statuses, tenantId, patchTaskMutation, allMappedTaskMap, statusConvexIdMap]);

  const changeTaskPriority = useCallback((taskId: string, priorityId: AnyId) => {
    const priorityInfo = priorityMap.get(priorityId);
    if (priorityInfo) {
      setTimedOverride(taskId, { priority: mapPriority(priorityId, priorityMap), priorityId });
    }

    if (tenantId) {
      const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
      const priorityConvexId = priorityConvexIdMap.get(priorityId);
      if (taskConvexId && priorityConvexId) {
        patchTaskMutation({
          tenantId,
          id: taskConvexId as any,
          priorityId: priorityConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to change priority:', err);
        });
      } else {
        console.warn('[TaskContext] Could not resolve Convex IDs for priority change', { taskId, taskConvexId, priorityId, priorityConvexId });
      }
    }
  }, [priorityMap, tenantId, patchTaskMutation, allMappedTaskMap, priorityConvexIdMap]);

  const markTaskDone = useCallback((taskId: string) => {
    if (!finalStatus) return;
    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;

    setTimedOverride(taskId, { status: finalStatus.name, statusColor: finalStatus.color });

    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));

    if (finalStatusId && tenantId) {
      const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
      const statusConvexId = statusConvexIdMap.get(finalStatusId);
      if (taskConvexId && statusConvexId) {
        patchTaskMutation({
          tenantId,
          id: taskConvexId as any,
          statusId: statusConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to mark task done:', err);
        });
      }
    }
  }, [finalStatus, data.statuses, tenantId, patchTaskMutation, allMappedTaskMap, statusConvexIdMap]);

  const assignTaskToUser = useCallback((taskId: string, userId: number, userName: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (task && !task.assignees.some((a) => a.name === userName)) {
      setPendingAssigns((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(taskId) ?? []);
        set.add(userName);
        next.set(taskId, set);
        return next;
      });

      if (tenantId) {
        const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
        const userConvexId = userConvexIdMap.get(userId);
        if (taskConvexId && userConvexId) {
          assignUserMutation({
            tenantId,
            taskId: taskConvexId as any,
            userId: userConvexId as any,
          }).catch((err: any) => {
            console.warn('[TaskContext] Failed to assign user:', err);
            setPendingAssigns((prev) => {
              const next = new Map(prev);
              const set = next.get(taskId);
              if (set) {
                set.delete(userName);
                if (set.size === 0) next.delete(taskId);
              }
              return next;
            });
            Alert.alert('Error', `Failed to assign ${userName}`);
          });
        }
      }
    }
  }, [filteredTasks, tenantId, allMappedTaskMap, userConvexIdMap, assignUserMutation]);

  const assignTaskToYou = useCallback((taskId: string) => {
    if (!authUser) return;
    assignTaskToUser(taskId, authUser.id, authUser.name);
  }, [authUser, assignTaskToUser]);

  // Form version maps
  // formVersionMap: formId → current version (for new/unfilled forms)
  // formVersionByIdMap: versionId → version (for looking up specific versions from submissions)
  const { formVersionMap, formVersionByIdMap } = useMemo(() => {
    // Build form → currentVersionId map, keyed by BOTH pgId and Convex _id
    // so lookups by either ID type succeed.
    const formToCurrentVersion = new Map<AnyId, AnyId>();
    for (const f of data.forms) {
      if (!f.current_version_id) continue;
      formToCurrentVersion.set(f.id, f.current_version_id);
      // f.id prefers pgId; also store under Convex _id for cross-type lookups
      if ((f as any)._id && (f as any)._id !== f.id) {
        formToCurrentVersion.set((f as any)._id, f.current_version_id);
      }
    }

    const byFormId = new Map<AnyId, SyncedFormVersion>();
    const byId = new Map<AnyId, SyncedFormVersion>();
    for (const fv of data.formVersions) {
      // Index every version by its own ID (pgId AND Convex _id)
      byId.set(fv.id, fv);
      if ((fv as any)._id) byId.set((fv as any)._id, fv);

      // Check if this version is the current one for its form.
      // current_version_id may be a Convex ID while fv.id may be a pgId,
      // so compare against both.
      const currentVersionId = formToCurrentVersion.get(fv.form_id);
      if (currentVersionId && (currentVersionId === fv.id || currentVersionId === (fv as any)._id)) {
        byFormId.set(fv.form_id, fv);
      }
    }
    return { formVersionMap: byFormId, formVersionByIdMap: byId };
  }, [data.forms, data.formVersions]);

  const taskFormMap = useMemo(() => {
    const m = new Map<AnyId, SyncedTaskForm>();
    const dataKeyCount = (tf: SyncedTaskForm) => {
      if (!tf.data) return 0;
      try {
        const d = typeof tf.data === 'string' ? JSON.parse(tf.data) : tf.data;
        return Object.keys(d).length;
      } catch { return 0; }
    };

    for (const tf of data.taskForms) {
      const lookupKeys: AnyId[] = [tf.task_id];
      const numId = Number(tf.task_id);
      if (Number.isFinite(numId)) lookupKeys.push(numId as any);
      if (tf.task_id != null) lookupKeys.push(String(tf.task_id) as any);

      for (const key of lookupKeys) {
        const existing = m.get(key);
        // Keep the entry with the most data (most complete submission)
        if (!existing || dataKeyCount(tf) > dataKeyCount(existing)) {
          m.set(key, tf);
        }
      }
    }
    return m;
  }, [data.taskForms]);

  const getFormSchema = useCallback((task: TaskItem): FormSchema | null => {
    if (!task.formId) return null;

    // Check if there's an existing submission whose form_version belongs to
    // a DIFFERENT form than the task's current formId (i.e. the template was
    // switched to a completely different form). In that case, show the old
    // form so the filled data still maps correctly.
    //
    // If the submission's form version belongs to the SAME form, always use
    // the current version so newly added fields are visible.
    const tf = taskFormMap.get(task.id) ?? taskFormMap.get(Number(task.id));
    let fv: SyncedFormVersion | undefined;

    if (tf?.form_version_id) {
      const submissionVersion = formVersionByIdMap.get(tf.form_version_id);
      if (submissionVersion) {
        const submissionFormId = String(submissionVersion.form_id);
        const taskFormId = String(task.formId);
        // Template was switched to a different form entirely — use the
        // CURRENT version of the submission's original form (not the exact
        // old version) so newly added fields are still visible.
        if (submissionFormId !== taskFormId) {
          fv = formVersionMap.get(submissionVersion.form_id) ?? submissionVersion;
        }
      }
    }

    // Default: use the current version of the task's form
    if (!fv) {
      fv = formVersionMap.get(task.formId);
    }
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
  }, [formVersionMap, formVersionByIdMap, taskFormMap]);

  const getFormVersionId = useCallback((formId: AnyId): AnyId | null => {
    const fv = formVersionMap.get(formId);
    if (!fv) return null;
    return (fv as any)._id ?? fv.id ?? null;
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
      workingTasks,
      cardDensity,
      compactCards,
      selectedWorkspace,
      workspaces,
      workspaceObjects,
      sharedCount,
      statuses,
      categories,
      initialStatus,
      finalStatus,
      getAllowedStatuses,
      createTask,
      addTask,
      updateTask,
      setActiveTask,
      addWorkingTask,
      removeWorkingTask,
      completeWorkingTask,
      isTaskWorking,
      setCardDensity,
      toggleCompactCards,
      setSelectedWorkspace,
      filters,
      setFilters,
      hasActiveFilters,
      unfilteredTasks: wsFilteredTasks,
      availableAssignees,
      availableStatuses,
      availableTags,
      tagInfoMap,
      changeTaskStatus,
      changeTaskPriority,
      markTaskDone,
      assignTaskToYou,
      assignTaskToUser,
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
      workingTasks,
      cardDensity,
      compactCards,
      selectedWorkspace,
      workspaces,
      workspaceObjects,
      sharedCount,
      statuses,
      categories,
      initialStatus,
      finalStatus,
      getAllowedStatuses,
      createTask,
      setActiveTask,
      addWorkingTask,
      removeWorkingTask,
      completeWorkingTask,
      isTaskWorking,
      filters,
      hasActiveFilters,
      wsFilteredTasks,
      availableAssignees,
      availableStatuses,
      availableTags,
      tagInfoMap,
      changeTaskStatus,
      changeTaskPriority,
      markTaskDone,
      assignTaskToUser,
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
