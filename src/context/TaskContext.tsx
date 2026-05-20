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
import { useQuery } from 'convex/react';
import { TaskItem, Assignee, CardDensity, TaskCommentVoiceMemo } from '../models/types';
import { useData, SyncedTask, SyncedWorkspace, SyncedTemplate, SyncedForm, SyncedFormVersion, SyncedTaskForm } from './DataContext';
import { useAuth } from './AuthContext';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { computeApprovalStatusForTask } from '../utils/approvalStatus';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { useMutationQueue } from './MutationQueueContext';
import { useNetwork } from './NetworkContext';
import { useLanguage } from './LanguageContext';
import * as DB from '../store/database';
import type { TimeFormatPreference } from './LanguageContext';

const WORKING_TASKS_STORAGE_KEY = '@whagons/working_task_ids';
const CARD_DENSITY_STORAGE_KEY = '@whagons/card_density';
const MAX_WORKING_TASKS = 5;
const TASK_SQL_THRESHOLD = 10000;

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
  return p?.name ?? 'Medium';
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

function formatTaskTime(d: Date, locale: string, timeFormat: TimeFormatPreference): string {
  if (timeFormat === '24h') {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function formatDate(
  dateStr: string | null | undefined,
  t: (scope: string, options?: Record<string, any>) => string,
  locale: string,
  timeFormat: TimeFormatPreference,
): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const time = formatTaskTime(d, locale, timeFormat);

    if (d.toDateString() === now.toDateString()) return `${t('common.today')} ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `${t('common.yesterday')} ${time}`;

    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
      return `${weekday} ${time}`;
    }
    const label = d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    return `${label} ${time}`;
  } catch {
    return dateStr ?? '';
  }
}

function normalizeStatusAction(action?: string | null): string | null {
  if (typeof action !== 'string') return null;
  const normalized = action.trim().toUpperCase();
  return normalized || null;
}

function normalizeCardDensity(value: unknown): CardDensity | null {
  return value === 'normal' || value === 'detailed' ? value : null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function resolveTaskStatusMeta(
  task: TaskItem,
  override: Partial<TaskItem> | undefined,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>,
): { action: string | null; final: boolean; initial: boolean } {
  const statusId = override?.statusId ?? task.statusId;
  const statusInfo = statusId != null ? statusMap.get(statusId) : undefined;

  return {
    action: normalizeStatusAction(override?.statusAction ?? statusInfo?.action ?? task.statusAction ?? null),
    final: statusInfo?.final === true,
    initial: statusInfo?.initial === true,
  };
}

function isWorkingListAction(action: string | null): boolean {
  return action === 'WORKING' || action === 'PAUSED';
}

function pendingTaskHeuristicKey(task: Pick<TaskItem, 'title' | 'workspaceId' | 'createdBy' | 'description'>): string {
  return [
    task.title?.trim().toLowerCase() ?? '',
    String(task.workspaceId ?? ''),
    String(task.createdBy ?? ''),
    String(task.description ?? '').trim().toLowerCase(),
  ].join('|');
}

function isTaskEligibleForWorkingList(
  task: TaskItem,
  override: Partial<TaskItem> | undefined,
  myTaskIds: Set<string>,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>,
): boolean {
  if (!task.id || !myTaskIds.has(task.id)) return false;
  const statusMeta = resolveTaskStatusMeta(task, override, statusMap);
  return isWorkingListAction(statusMeta.action) && !statusMeta.final && !statusMeta.initial;
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
  commentSummaryMap: Map<string, { count: number; lastText?: string | null; lastVoiceMemo?: TaskCommentVoiceMemo | null; lastUnread?: boolean }>,
  formatTaskDate: (dateStr?: string | null) => string,
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);

  const templateId = task.template_id;
  const formInfo = templateId ? templateFormMap.get(templateId) : undefined;

  const flagColor = userFlagMap.get(task.id) ?? (task as any).flagColor ?? (task as any).flag_color ?? null;
  const catInfo = task.category_id ? categoryInfoMap.get(task.category_id) : undefined;
  const taskConvexId = (task as any)._id ? String((task as any)._id) : null;
  const commentSummary = taskConvexId ? commentSummaryMap.get(taskConvexId) : undefined;

  return {
    id: String(task.id),
    convexId: taskConvexId ?? undefined,
    title: task.name || 'Untitled',
    description: (task as any).description || null,
    spot: task.spot_id ? (spotMap.get(task.spot_id) ?? '') : '',
    spotId: task.spot_id ?? null,
    priority: mapPriority(task.priority_id, priorityMap),
    priorityColor: task.priority_id ? (priorityMap.get(task.priority_id)?.color ?? null) : null,
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
    createdAt: formatTaskDate(task.created_at),
    tags: tagMap.get(task.id) ?? [],
    approval: null,
    sla: null,
    templateId: task.template_id ?? null,
    formId: formInfo?.formId ?? null,
    formName: formInfo?.formName ?? null,
    flagColor,
    createdBy: task.created_by ?? null,
    firstViewedAt: (task as any).firstViewedAt ?? null,
    latitude: (task as any).latitude ?? null,
    longitude: (task as any).longitude ?? null,
    requiresSignature: (task as any).requiresSignature === true || (task as any).requires_signature === true,
    commentCount: commentSummary?.count ?? 0,
    lastCommentText: commentSummary?.lastText ?? null,
    lastCommentVoiceMemo: commentSummary?.lastVoiceMemo ?? null,
    lastCommentUnread: commentSummary?.lastUnread === true,
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
  categoryIds: AnyId[];
  statuses: string[];
  priorities: string[];
  assignees: string[];
  flagColors: string[];
  tags: string[];
}

export const emptyFilters: TaskFilters = {
  categoryIds: [],
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
    min?: number;
    max?: number;
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
  tagIds?: Array<string | number>;
  userConvexIds?: string[];
  dueDate?: number;
  startDate?: number;
  attachments?: CreateTaskAttachment[];
  latitude?: number;
  longitude?: number;
}

export interface CreatedTaskResult {
  _id: string;
  pgId: number;
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
  createTask: (args: CreateTaskArgs) => Promise<CreatedTaskResult>;
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
  changeTaskStatus: (taskId: string, status: StatusOption) => boolean;
  changeTaskPriority: (taskId: string, priorityId: AnyId) => void;
  markTaskDone: (taskId: string) => void;
  assignTaskToYou: (taskId: string) => void;
  assignTaskToUser: (taskId: string, userId: AnyId, userName: string) => void;
  getFormSchema: (task: TaskItem) => FormSchema | null;
  getTaskFormSubmission: (taskId: string) => { id: AnyId; formVersionId: AnyId; data: Record<string, unknown> } | null;
  getFormVersionId: (formId: AnyId) => AnyId | null;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    data,
    sharedTaskIds,
    sharedCount,
    rawSharedToMe,
    approvals: approvalsList,
    approvalApprovers,
    taskApprovalInstances,
    hasMoreTaskRows,
    loadMoreTaskRows,
    setTaskQuery,
  } = useData();
  const { user: authUser, token } = useAuth();
  const { tenantId } = useTenant();
  const { t, language, timeFormat } = useLanguage();
  const activeTenantId = token ? tenantId : null;
  const convexUser = useQuery(api.users.me, activeTenantId ? { tenantId: activeTenantId } : 'skip');
  const taskSummaryCounts = useQuery(
    api.bulk.taskSummaryCounts,
    activeTenantId ? { tenantId: activeTenantId } : 'skip',
  );
  const { queue } = useMutationQueue();
  const { isOnline } = useNetwork();
  const [storedTenantId, setStoredTenantId] = useState<string | null>(null);
  const [cardDensity, setCardDensityState] = useState<CardDensity>('normal');
  const compactCards = false;
  const taskNoteSummaries = useQuery(
    api.taskResources.noteSummariesByTenant,
    activeTenantId && cardDensity === 'detailed' ? { tenantId: activeTenantId } : 'skip',
  );
  const updateMeMutation = useOfflineMutation(api.users.updateMe, 'users.updateMe');
  const formatTaskDate = useCallback(
    (dateStr?: string | null) => formatDate(dateStr, t, language, timeFormat),
    [language, t, timeFormat],
  );

  useEffect(() => {
    AsyncStorage.getItem('wh_auth_subdomain')
      .then((value) => {
        if (typeof value === 'string' && value.trim().length > 0) {
          setStoredTenantId(value);
        }
      })
      .catch(() => {});
  }, []);

  const inferredTenantId = useMemo(() => {
    for (const task of data.tasks as any[]) {
      const candidate = task?.tenantId ?? task?.tenant_id;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    for (const workspace of data.workspaces as any[]) {
      const candidate = workspace?.tenantId ?? workspace?.tenant_id;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return null;
  }, [data.tasks, data.workspaces]);

  const effectiveTenantId = tenantId
    ?? inferredTenantId
    ?? storedTenantId
    ?? (typeof (authUser as any)?.tenant_domain_prefix === 'string'
      ? String((authUser as any).tenant_domain_prefix)
      : null);

  // Convex mutations
  const createTaskOfflineMutation = useOfflineMutation(api.tasks.create, 'tasks.create');
  const patchTaskMutation = useOfflineMutation(api.tasks.update, 'tasks.update');
  const patchTaskByPgIdMutation = useOfflineMutation(api.tasks.updateByPgId, 'tasks.updateByPgId');
  const assignUserMutation = useOfflineMutation(api.taskResources.assignUser, 'taskResources.assignUser');

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

  useEffect(() => {
    AsyncStorage.getItem(CARD_DENSITY_STORAGE_KEY)
      .then((raw) => {
        const storedDensity = normalizeCardDensity(raw);
        if (storedDensity) setCardDensityState(storedDensity);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!convexUser) return;
    const settings = (convexUser as any).settings ?? {};
    const serverDensity = normalizeCardDensity(settings.cardDensity ?? settings.card_density);
    if (!serverDensity) return;
    setCardDensityState(serverDensity);
    AsyncStorage.setItem(CARD_DENSITY_STORAGE_KEY, serverDensity).catch(() => {});
  }, [convexUser]);

  const setCardDensity = useCallback((density: CardDensity) => {
    setCardDensityState(density);
    AsyncStorage.setItem(CARD_DENSITY_STORAGE_KEY, density).catch(() => {});
    if (!tenantId) return;
    updateMeMutation({
      tenantId,
      settings: { cardDensity: density },
    }).catch((err: any) => {
      console.warn('[TaskContext] Failed to save card density:', err);
    });
  }, [tenantId, updateMeMutation]);

  const [selectedWorkspace, setSelectedWorkspace] = useState('Everything');
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const [localOverrides, setLocalOverrides] = useState<Map<string, Partial<TaskItem>>>(new Map());
  const [pendingCreatedTasks, setPendingCreatedTasks] = useState<TaskItem[]>([]);
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
    for (const s of data.statuses) {
      const convexId = (s as any)._id;
      if (!convexId) continue;
      m.set(s.id, convexId);
      if (s.id != null) {
        m.set(String(s.id), convexId);
      }
      const numericId = Number(s.id);
      if (Number.isFinite(numericId)) {
        m.set(numericId, convexId);
      }
    }
    return m;
  }, [data.statuses]);

  // Reverse lookup: resolved pgId → Convex _id for priorities
  const priorityConvexIdMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const p of data.priorities) {
      const convexId = (p as any)._id;
      if (!convexId) continue;
      m.set(p.id, convexId);
      if (p.id != null) {
        m.set(String(p.id), convexId);
      }
      const numericId = Number(p.id);
      if (Number.isFinite(numericId)) {
        m.set(numericId, convexId);
      }
    }
    return m;
  }, [data.priorities]);

  const userMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const u of data.users) m.set(u.id, u.name);
    return m;
  }, [data.users]);

  const userConvexIdMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const u of data.users) {
      const convexId = (u as any)._id;
      if (!convexId) continue;
      m.set(u.id, convexId);
      if (u.id != null) {
        m.set(String(u.id), convexId);
      }
      const numericId = Number(u.id);
      if (Number.isFinite(numericId)) {
        m.set(numericId, convexId);
      }
    }
    return m;
  }, [data.users]);

  const tagNameMap = useMemo(() => {
    const m = new Map<AnyId, string>();
    for (const t of data.tags) {
      m.set(t.id, t.name);
      if ((t as any)._id) m.set((t as any)._id, t.name);
      if ((t as any).pgId != null) m.set((t as any).pgId, t.name);
    }
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
    const m = new Map<AnyId, string | null>();
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

  const transitionGroupStatusIdsMap = useMemo(() => {
    const m = new Map<AnyId, Set<AnyId>>();
    for (const t of data.statusTransitions) {
      let set = m.get(t.status_transition_group_id);
      if (!set) {
        set = new Set();
        m.set(t.status_transition_group_id, set);
      }
      set.add(t.from_status);
      set.add(t.to_status);
    }
    return m;
  }, [data.statusTransitions]);

  const categoryStatusIdsMap = useMemo(() => {
    const m = new Map<AnyId, Set<AnyId>>();
    for (const c of data.categories) {
      if (c.status_transition_group_id) {
        const ids = transitionGroupStatusIdsMap.get(c.status_transition_group_id);
        if (ids) m.set(c.id, ids);
      }
    }
    return m;
  }, [data.categories, transitionGroupStatusIdsMap]);

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

    const groupStatusIds = transitionGroupStatusIdsMap.get(groupId);
    if (!groupStatusIds || groupStatusIds.size === 0) return fallback;

    const key = `${groupId}:${statusId}`;
    const allowedIds = transitionMap.get(key);
    if (!allowedIds || allowedIds.size === 0) {
      return statuses.filter((s) => s.id === statusId);
    }

    return statuses.filter((s) => s.id === statusId || allowedIds.has(s.id));
  }, [statuses, categoryTransitionGroupMap, transitionMap, categoryStatusIdsMap, transitionGroupStatusIdsMap]);

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

  const commentSummaryMap = useMemo(() => {
    const m = new Map<string, { count: number; lastText?: string | null; lastVoiceMemo?: TaskCommentVoiceMemo | null; lastUnread?: boolean }>();
    for (const summary of taskNoteSummaries ?? []) {
      if (!summary?.taskId) continue;
      m.set(String(summary.taskId), {
        count: Number(summary.count ?? 0),
        lastText: summary.lastText ?? null,
        lastVoiceMemo: summary.lastVoiceMemo ?? null,
        lastUnread: summary.lastUnread === true,
      });
    }
    return m;
  }, [taskNoteSummaries]);

  const mappedActiveTasks = useMemo(() => {
    if (activeTasks.length === 0) return [];
    return activeTasks.map((t) =>
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap, commentSummaryMap, formatTaskDate),
    );
  }, [activeTasks, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap, commentSummaryMap, formatTaskDate]);

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
      if (taskConvexId) {
        m.set(String(taskConvexId), m.get(String(taskId))!);
      }
    }
    return m;
  }, [rawSharedToMe, approvalMap, taskApprovalInstances]);

  const sharedMappedTasks = useMemo(() => {
    if (!rawSharedToMe?.length) return EMPTY_TASKS;

    const visibleTaskKeys = new Set<string>();
    for (const task of mappedActiveTasks) {
      if (task.id) visibleTaskKeys.add(String(task.id));
      if (task.convexId) visibleTaskKeys.add(String(task.convexId));
    }

    const resolveId = (items: any[], id: any) => {
      if (id == null) return null;
      const match = items.find((item: any) => String((item as any)._id ?? '') === String(id));
      return match?.id ?? id;
    };

    const sharedTasks: TaskItem[] = [];
    const seen = new Set<string>();

    for (const share of rawSharedToMe) {
      const rawTask = share.task;
      if (!rawTask || rawTask.deletedAt) continue;

      const taskId = rawTask.id ?? rawTask.pgId ?? rawTask._id;
      if (taskId == null || seen.has(String(taskId))) continue;
      seen.add(String(taskId));

      const convexId = rawTask._id ? String(rawTask._id) : null;
      if (visibleTaskKeys.has(String(taskId)) || (convexId && visibleTaskKeys.has(convexId))) {
        continue;
      }

      const syncedTask: SyncedTask = {
        ...rawTask,
        id: taskId,
        workspace_id: resolveId(data.workspaces, rawTask.workspaceId ?? rawTask.workspace_id),
        category_id: resolveId(data.categories, rawTask.categoryId ?? rawTask.category_id),
        status_id: resolveId(data.statuses, rawTask.statusId ?? rawTask.status_id),
        priority_id: resolveId(data.priorities, rawTask.priorityId ?? rawTask.priority_id),
        spot_id: resolveId(data.spots, rawTask.spotId ?? rawTask.spot_id),
        template_id: resolveId(data.templates, rawTask.templateId ?? rawTask.template_id),
        created_by: resolveId(data.users, rawTask.createdBy ?? rawTask.created_by),
        created_at: rawTask.created_at ?? (rawTask.createdAt || rawTask._creationTime ? new Date(rawTask.createdAt ?? rawTask._creationTime).toISOString() : null),
        updated_at: rawTask.updated_at ?? (rawTask.updatedAt ? new Date(rawTask.updatedAt).toISOString() : null),
        deleted_at: rawTask.deleted_at ?? (rawTask.deletedAt ? new Date(rawTask.deletedAt).toISOString() : null),
      };
      const item = mapTaskToItem(syncedTask, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap, commentSummaryMap, formatTaskDate);
      const enrichment = sharedEnrichmentMap.get(String(taskId)) ?? (convexId ? sharedEnrichmentMap.get(convexId) : undefined);
      sharedTasks.push(enrichment ? {
        ...item,
        approvalStatus: enrichment.approvalStatus,
        shareId: enrichment.shareId,
        shareStatus: enrichment.shareStatus,
        ackTotal: enrichment.ackTotal,
        ackDone: enrichment.ackDone,
        sharePermission: enrichment.permission,
        approvalId: enrichment.approvalId,
        taskConvexId: enrichment.taskConvexId,
      } : item);
    }

    return sharedTasks;
  }, [rawSharedToMe, mappedActiveTasks, data.workspaces, data.categories, data.statuses, data.priorities, data.spots, data.templates, data.users, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap, commentSummaryMap, sharedEnrichmentMap, formatTaskDate]);

  useEffect(() => {
    if (pendingCreatedTasks.length === 0 || mappedActiveTasks.length === 0) return;

    const syncedKeys = new Set(mappedActiveTasks.map((task) => pendingTaskHeuristicKey(task)));
    setPendingCreatedTasks((prev) => prev.filter((task) => !syncedKeys.has(pendingTaskHeuristicKey(task))));
  }, [mappedActiveTasks, pendingCreatedTasks.length]);

  const allMappedTasks = useMemo(() => {
    const baseTasks = sharedMappedTasks.length > 0
      ? [...mappedActiveTasks, ...sharedMappedTasks]
      : mappedActiveTasks;
    if (baseTasks.length === 0) return pendingCreatedTasks;
    if (pendingCreatedTasks.length === 0) return baseTasks;

    const syncedKeys = new Set(baseTasks.map((task) => pendingTaskHeuristicKey(task)));
    const pending = pendingCreatedTasks.filter((task) => !syncedKeys.has(pendingTaskHeuristicKey(task)));
    return [...baseTasks, ...pending];
  }, [mappedActiveTasks, pendingCreatedTasks, sharedMappedTasks]);

  const taskIdByConvexId = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of allMappedTasks) {
      if (!task.id || !task.convexId) continue;
      map.set(String(task.convexId), String(task.id));
    }
    return map;
  }, [allMappedTasks]);

  const statusByAnyId = useMemo(() => {
    const map = new Map<string, { id: AnyId; name: string; color: string | null; icon?: string | null; action?: string | null }>();
    for (const status of data.statuses) {
      const payload = {
        id: status.id,
        name: status.name,
        color: status.color ?? null,
        icon: (status as any).icon ?? null,
        action: (status as any).action ?? null,
      };
      map.set(String(status.id), payload);
      const convexId = (status as any)._id;
      if (convexId) map.set(String(convexId), payload);
    }
    return map;
  }, [data.statuses]);

  const priorityByAnyId = useMemo(() => {
    const map = new Map<string, { id: AnyId; name: string; color: string | null }>();
    for (const priority of data.priorities) {
      const payload = {
        id: priority.id,
        name: priority.name,
        color: priority.color ?? null,
      };
      map.set(String(priority.id), payload);
      const convexId = (priority as any)._id;
      if (convexId) map.set(String(convexId), payload);
    }
    return map;
  }, [data.priorities]);

  const queuedTaskOverrides = useMemo(() => {
    const map = new Map<string, Partial<TaskItem>>();
    const applyOverride = (taskId: string, override: Partial<TaskItem>) => {
      const existing = map.get(taskId) ?? {};
      map.set(taskId, { ...existing, ...override });
    };

    for (const row of queue) {
      if (row.status === 'failed') continue;

      let args: any;
      try {
        args = JSON.parse(row.args);
      } catch {
        continue;
      }

      if (!args || typeof args !== 'object') continue;

      if (row.api_path === 'tasks.update') {
        const taskId = args.id != null
          ? taskIdByConvexId.get(String(args.id))
          : (args.pgId != null ? String(args.pgId) : undefined);
        if (!taskId) continue;

        const override: Partial<TaskItem> = {};

        if (args.statusId != null) {
          const status = statusByAnyId.get(String(args.statusId));
          if (status) {
            override.status = status.name;
            override.statusColor = status.color;
            override.statusId = status.id;
            override.statusIcon = status.icon ?? null;
            override.statusAction = status.action ?? null;
          }
        }

        if (args.priorityId != null) {
          const priority = priorityByAnyId.get(String(args.priorityId));
          if (priority) {
            override.priority = priority.name;
            override.priorityColor = priority.color;
            override.priorityId = priority.id;
          }
        }

        if (Object.keys(override).length > 0) {
          applyOverride(taskId, override);
        }
        continue;
      }

      if (row.api_path === 'tasks.updateByPgId') {
        if (args.pgId == null) continue;
        const taskId = String(args.pgId);
        const updates = (args.updates && typeof args.updates === 'object') ? args.updates : {};
        const override: Partial<TaskItem> = {};

        if (updates.status_id != null) {
          const status = statusByAnyId.get(String(updates.status_id));
          if (status) {
            override.status = status.name;
            override.statusColor = status.color;
            override.statusId = status.id;
            override.statusIcon = status.icon ?? null;
            override.statusAction = status.action ?? null;
          }
        }

        if (updates.priority_id != null) {
          const priority = priorityByAnyId.get(String(updates.priority_id));
          if (priority) {
            override.priority = priority.name;
            override.priorityColor = priority.color;
            override.priorityId = priority.id;
          }
        }

        if (Object.keys(override).length > 0) {
          applyOverride(taskId, override);
        }
      }
    }

    return map;
  }, [queue, taskIdByConvexId, statusByAnyId, priorityByAnyId]);

  const hasQueueAwaitingReplay = useMemo(
    () => queue.some((row) => row.status === 'pending' || row.status === 'syncing'),
    [queue],
  );

  const shouldShowPendingTaskState = !isOnline || hasQueueAwaitingReplay;

  // Helper: set a local override that auto-clears after a short delay
  const setTimedOverride = useCallback((taskId: string, override: Partial<TaskItem>) => {
    const timedOverride = override;
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, timedOverride);
      return next;
    });
    setTimeout(() => {
      setLocalOverrides((prev) => {
        if (!prev.has(taskId)) return prev;
        if (prev.get(taskId) !== timedOverride) return prev;
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
    }, 3000);
  }, []);

  const resolveTenantIdForTask = useCallback((taskId: string): string | null => {
    if (effectiveTenantId) return effectiveTenantId;

    const rawTask = data.tasks.find((task: any) => String(task.id) === String(taskId));
    const taskTenant = rawTask?.tenantId ?? rawTask?.tenant_id;
    if (typeof taskTenant === 'string' && taskTenant.trim().length > 0) {
      return taskTenant;
    }

    const taskWorkspaceId = rawTask?.workspace_id ?? rawTask?.workspaceId ?? rawTask?.workspaceIdPg;
    if (taskWorkspaceId != null) {
      const workspace = data.workspaces.find((item: any) => (
        String(item.id) === String(taskWorkspaceId) ||
        String((item as any)._id ?? '') === String(taskWorkspaceId)
      ));
      const workspaceTenant = workspace?.tenantId ?? workspace?.tenant_id;
      if (typeof workspaceTenant === 'string' && workspaceTenant.trim().length > 0) {
        return workspaceTenant;
      }
    }

    const authTenant = (authUser as any)?.tenant_domain_prefix;
    if (typeof authTenant === 'string' && authTenant.trim().length > 0) {
      return authTenant;
    }

    return null;
  }, [effectiveTenantId, data.tasks, data.workspaces, authUser]);

  // workspace_id is now embedded directly on each TaskItem (workspaceId field)
  // so we no longer need a separate parallel array for index-based filtering.

  // ---------------------------------------------------------------------------
  // Shared task enrichment: approval status + ack progress
  // ---------------------------------------------------------------------------

  const visibleWorkspaceKeySet = useMemo(() => {
    const keys = new Set<string>();
    for (const workspace of data.workspaces) {
      const candidates = [workspace.id, (workspace as any)._id, (workspace as any).pgId, (workspace as any).pg_id];
      for (const candidate of candidates) {
        if (candidate != null && candidate !== '') keys.add(String(candidate));
      }
    }
    return keys;
  }, [data.workspaces]);

  const isSharedOnlyTask = useCallback((task: TaskItem): boolean => {
    const taskIds = [task.id, task.taskConvexId, task.convexId].filter((value) => value != null && value !== '');
    const isShared = taskIds.some((value) => {
      const numeric = Number(value);
      return sharedTaskIds.has(value as any) || (Number.isFinite(numeric) && sharedTaskIds.has(numeric as any));
    });
    if (!isShared) return false;

    const workspaceKey = task.workspaceId == null ? '' : String(task.workspaceId);
    return workspaceKey === '' || !visibleWorkspaceKeySet.has(workspaceKey);
  }, [sharedTaskIds, visibleWorkspaceKeySet]);

  const workspaceVisibleMappedTasks = useMemo(
    () => allMappedTasks.filter((task) => !isSharedOnlyTask(task)),
    [allMappedTasks, isSharedOnlyTask],
  );

  // ---------------------------------------------------------------------------
  // Filter + paginate
  // ---------------------------------------------------------------------------
  const hasActiveFilters = filters.categoryIds.length > 0 || filters.statuses.length > 0 || filters.priorities.length > 0 || filters.assignees.length > 0 || filters.flagColors.length > 0 || filters.tags.length > 0;

  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sqlFilterWorkspaceId = useMemo(() => {
    if (selectedWorkspace === 'Everything') return undefined;
    if (selectedWorkspace === 'Shared') return null;
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    return ws?.id ?? null;
  }, [data.workspaces, selectedWorkspace]);

  const canUseIndexedTaskList = useMemo(() => (
    selectedWorkspace !== 'Shared'
    && filters.categoryIds.length === 0
    && filters.priorities.length === 0
    && filters.assignees.length === 0
    && filters.flagColors.length === 0
    && filters.tags.length === 0
    && !shouldShowPendingTaskState
  ), [filters, selectedWorkspace, shouldShowPendingTaskState]);

  const effectiveTaskUniverseCount = taskSummaryCounts?.total ?? allMappedTasks.length;
  const shouldUseSqlTaskList = canUseIndexedTaskList && effectiveTaskUniverseCount >= TASK_SQL_THRESHOLD;

  const indexedTaskLists = useMemo(() => {
    if (!canUseIndexedTaskList || shouldUseSqlTaskList) return null;

    const sortedAll = [...workspaceVisibleMappedTasks].sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
    const byWorkspace = new Map<string, TaskItem[]>();
    const byStatus = new Map<string, TaskItem[]>();
    const byWorkspaceStatus = new Map<string, Map<string, TaskItem[]>>();

    for (const task of sortedAll) {
      const workspaceKey = task.workspaceId == null ? '' : String(task.workspaceId);
      const statusKey = task.status;

      if (workspaceKey) {
        const workspaceList = byWorkspace.get(workspaceKey) ?? [];
        workspaceList.push(task);
        byWorkspace.set(workspaceKey, workspaceList);
      }

      const statusList = byStatus.get(statusKey) ?? [];
      statusList.push(task);
      byStatus.set(statusKey, statusList);

      if (workspaceKey) {
        let statusMap = byWorkspaceStatus.get(workspaceKey);
        if (!statusMap) {
          statusMap = new Map<string, TaskItem[]>();
          byWorkspaceStatus.set(workspaceKey, statusMap);
        }
        const workspaceStatusList = statusMap.get(statusKey) ?? [];
        workspaceStatusList.push(task);
        statusMap.set(statusKey, workspaceStatusList);
      }
    }

    return { sortedAll, byWorkspace, byStatus, byWorkspaceStatus };
  }, [canUseIndexedTaskList, shouldUseSqlTaskList, workspaceVisibleMappedTasks]);

  const activeIndexedTasks = useMemo(() => {
    if (!indexedTaskLists) return null;

    const statuses = filters.statuses;
    const workspaceKey = sqlFilterWorkspaceId == null ? undefined : String(sqlFilterWorkspaceId);

    if (workspaceKey && statuses.length === 1) {
      return indexedTaskLists.byWorkspaceStatus.get(workspaceKey)?.get(statuses[0]) ?? EMPTY_TASKS;
    }

    if (workspaceKey && statuses.length === 0) {
      return indexedTaskLists.byWorkspace.get(workspaceKey) ?? EMPTY_TASKS;
    }

    if (!workspaceKey && statuses.length === 1) {
      return indexedTaskLists.byStatus.get(statuses[0]) ?? EMPTY_TASKS;
    }

    if (!workspaceKey && statuses.length === 0) {
      return indexedTaskLists.sortedAll;
    }

    if (workspaceKey) {
      const statusMap = indexedTaskLists.byWorkspaceStatus.get(workspaceKey);
      if (!statusMap) return EMPTY_TASKS;
      return statuses
        .flatMap((status) => statusMap.get(status) ?? EMPTY_TASKS)
        .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
    }

    return statuses
      .flatMap((status) => indexedTaskLists.byStatus.get(status) ?? EMPTY_TASKS)
      .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
  }, [filters.statuses, indexedTaskLists, sqlFilterWorkspaceId]);

  const sqlFilterKey = useMemo(() => {
    if (!shouldUseSqlTaskList) return '';
    return JSON.stringify({
      workspaceId: sqlFilterWorkspaceId ?? null,
      statuses: filters.statuses,
      limit: visibleCount,
    });
  }, [filters.statuses, shouldUseSqlTaskList, sqlFilterWorkspaceId, visibleCount]);

  const [sqlFilteredState, setSqlFilteredState] = useState<{
    key: string;
    tasks: TaskItem[];
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!shouldUseSqlTaskList || !sqlFilterKey) {
      setSqlFilteredState(null);
      return;
    }

    let cancelled = false;
    DB.queryTaskCache<SyncedTask>({
      workspaceId: sqlFilterWorkspaceId ?? undefined,
      statuses: filters.statuses,
      limit: visibleCount,
    })
      .then(({ rows, total }) => {
        if (cancelled) return;
        if (total === 0 && allMappedTasks.length > 0) {
          setSqlFilteredState(null);
          return;
        }
        const mapped = rows.map((task) =>
          mapTaskToItem(task, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, userFlagMap, categoryInfoMap, commentSummaryMap, formatTaskDate),
        );
        setSqlFilteredState({ key: sqlFilterKey, tasks: mapped, total });
      })
      .catch(() => {
        if (!cancelled) setSqlFilteredState(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    allMappedTasks.length,
    assigneeMap,
    categoryInfoMap,
    commentSummaryMap,
    formatTaskDate,
    filters.statuses,
    initialStatus,
    priorityMap,
    spotMap,
    sqlFilterKey,
    sqlFilterWorkspaceId,
    statusMap,
    shouldUseSqlTaskList,
    tagMap,
    templateFormMap,
    userFlagMap,
    visibleCount,
  ]);

  const activeSqlFilteredState = sqlFilteredState?.key === sqlFilterKey ? sqlFilteredState : null;

  const filteredTasks = useMemo(() => {
    if (activeSqlFilteredState) return activeSqlFilteredState.tasks;
    if (activeIndexedTasks) return activeIndexedTasks;
    if (allMappedTasks.length === 0) return EMPTY_TASKS;

    let result: TaskItem[];
    if (selectedWorkspace === 'Everything') {
      result = workspaceVisibleMappedTasks;
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
        result = workspaceVisibleMappedTasks.filter((t) => String(t.workspaceId) === wsIdStr);
        if (result.length === 0 && allMappedTasks.length > 0) {
          const sampleIds = workspaceVisibleMappedTasks.slice(0, 5).map((t) => `${t.workspaceId}(${typeof t.workspaceId})`);
          console.warn(`[TaskContext] Workspace "${selectedWorkspace}" (id=${ws.id}, type=${typeof ws.id}) matched 0/${workspaceVisibleMappedTasks.length} tasks. Sample task wsIds: [${sampleIds.join(', ')}]`);
        }
      } else {
        result = workspaceVisibleMappedTasks;
      }
    }

    if (hasActiveFilters) {
      const categoryIdSet = filters.categoryIds.length > 0 ? new Set(filters.categoryIds.map(String)) : null;
      const statusSet = filters.statuses.length > 0 ? new Set(filters.statuses) : null;
      const prioritySet = filters.priorities.length > 0 ? new Set(filters.priorities) : null;
      const assigneeSet = filters.assignees.length > 0 ? new Set(filters.assignees) : null;
      const flagColorSet = filters.flagColors.length > 0 ? new Set(filters.flagColors) : null;
      const tagSet = filters.tags.length > 0 ? new Set(filters.tags) : null;

      result = result.filter((t) => {
        if (categoryIdSet && (!t.categoryId || !categoryIdSet.has(String(t.categoryId)))) return false;
        if (statusSet && !statusSet.has(t.status)) return false;
        if (prioritySet && !prioritySet.has(t.priority)) return false;
        if (assigneeSet && !t.assignees.some((a) => assigneeSet.has(a.name))) return false;
        if (flagColorSet && (!t.flagColor || !flagColorSet.has(t.flagColor))) return false;
        if (tagSet && !t.tags.some((tag) => tagSet.has(tag))) return false;
        return true;
      });
    }

    if (shouldShowPendingTaskState && queuedTaskOverrides.size > 0) {
      result = result.map((t) => {
        const override = queuedTaskOverrides.get(String(t.id ?? ''));
        return override ? { ...t, ...override } : t;
      });
    }

    if (shouldShowPendingTaskState && localOverrides.size > 0) {
      result = result.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    result.sort((a, b) => {
      if (selectedWorkspace === 'Shared') {
        const score = (task: TaskItem) => {
          if (task.approvalStatus === 'pending') return 0;
          if (task.shareStatus === 'pending') return 1;
          if (task.approvalStatus === 'rejected') return 2;
          if (task.approvalStatus === 'approved') return 3;
          return 4;
        };
        const scoreDiff = score(a) - score(b);
        if (scoreDiff !== 0) return scoreDiff;
      }
      const idA = Number(a.id ?? 0);
      const idB = Number(b.id ?? 0);
      return idB - idA;
    });

    return result;
  }, [activeIndexedTasks, activeSqlFilteredState, allMappedTasks, data.workspaces, selectedWorkspace, localOverrides, queuedTaskOverrides, shouldShowPendingTaskState, filters, hasActiveFilters, sharedTaskIds, sharedEnrichmentMap, workspaceVisibleMappedTasks]);

  const wsFilteredTasks = useMemo(() => {
    let result = selectedWorkspace === 'Everything' ? workspaceVisibleMappedTasks : EMPTY_TASKS;
    if (selectedWorkspace === 'Shared') {
      result = allMappedTasks.filter((t) => {
        const numId = Number(t.id);
        return sharedTaskIds.has(numId) || sharedTaskIds.has(t.id ?? '');
      });
    } else if (selectedWorkspace !== 'Everything') {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        const wsIdStr = String(ws.id);
        result = workspaceVisibleMappedTasks.filter((t) => String(t.workspaceId) === wsIdStr);
      } else {
        result = workspaceVisibleMappedTasks;
      }
    }

    if (shouldShowPendingTaskState && queuedTaskOverrides.size > 0) {
      result = result.map((t) => {
        const override = queuedTaskOverrides.get(String(t.id ?? ''));
        return override ? { ...t, ...override } : t;
      });
    }

    if (shouldShowPendingTaskState && localOverrides.size > 0) {
      result = result.map((t) => {
        const override = localOverrides.get(t.id ?? '');
        return override ? { ...t, ...override } : t;
      });
    }

    return result;
  }, [allMappedTasks, data.workspaces, selectedWorkspace, sharedTaskIds, queuedTaskOverrides, localOverrides, shouldShowPendingTaskState, workspaceVisibleMappedTasks]);

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

  const taskQueryWorkspaceId = useMemo(() => {
    if (selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared') return undefined;
    const workspace = data.workspaces.find((w) => w.name === selectedWorkspace);
    const convexId = (workspace as any)?._id;
    return convexId ? String(convexId) : undefined;
  }, [data.workspaces, selectedWorkspace]);

  const taskQueryStatusIds = useMemo(() => {
    if (filters.statuses.length === 0) return undefined;
    const selectedNames = new Set(filters.statuses.map((status) => status.toLowerCase()));
    const ids = data.statuses
      .filter((status) => selectedNames.has(String(status.name).toLowerCase()))
      .map((status) => (status as any)._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return ids.length > 0 ? ids : undefined;
  }, [data.statuses, filters.statuses]);

  useEffect(() => {
    const useServerFilteredRows = shouldUseSqlTaskList;
    setTaskQuery({
      workspaceId: taskQueryWorkspaceId,
      mode: useServerFilteredRows ? 'all' : 'hot',
      statusIds: useServerFilteredRows ? taskQueryStatusIds : undefined,
    });
  }, [setTaskQuery, shouldUseSqlTaskList, taskQueryStatusIds, taskQueryWorkspaceId]);

  // Pagination
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
  const totalTaskCount = activeSqlFilteredState?.total ?? filteredTasks.length;
  const hasMoreTasks = visibleCount < totalTaskCount || (!activeSqlFilteredState && hasMoreTaskRows);

  const loadMoreTasks = useCallback(() => {
    if (visibleCount < totalTaskCount) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalTaskCount));
      return;
    }
    if (!activeSqlFilteredState && hasMoreTaskRows) {
      loadMoreTaskRows();
    }
  }, [activeSqlFilteredState, hasMoreTaskRows, loadMoreTaskRows, totalTaskCount, visibleCount]);

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

  useEffect(() => {
    if (localOverrides.size === 0) return;

    setLocalOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const [taskId, override] of prev) {
        const baseTask = allMappedTaskMap.get(taskId);
        if (!baseTask) continue;

        const keys = Object.keys(override) as Array<keyof TaskItem>;
        const synced = keys.every((key) => (baseTask as any)[key] === (override as any)[key]);

        if (synced) {
          next.delete(taskId);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [allMappedTaskMap, localOverrides.size]);

  useEffect(() => {
    if (!isOnline || hasQueueAwaitingReplay) return;
    if (localOverrides.size === 0) return;
    setLocalOverrides(new Map());
  }, [isOnline, hasQueueAwaitingReplay, localOverrides.size]);

  // Build set of task IDs the current user is assigned to
  const myTaskIds = useMemo(() => {
    const currentUserId = authUser?.id;
    if (!currentUserId) return new Set<string>();
    const s = new Set<string>();
    for (const tu of data.taskUsers) {
      if (String(tu.user_id) === String(currentUserId)) s.add(String(tu.task_id));
    }
    return s;
  }, [data.taskUsers, authUser]);

  const workingTasks = useMemo(() => {
    const result: TaskItem[] = [];
    for (const id of workingTaskIds) {
      const task = allMappedTaskMap.get(id);
      if (!task) continue;
      const override = localOverrides.get(id);
      if (!isTaskEligibleForWorkingList(task, override, myTaskIds, statusMap)) continue;
      result.push(override ? { ...task, ...override } : task);
    }
    return result;
  }, [workingTaskIds, allMappedTaskMap, localOverrides, myTaskIds, statusMap]);

  // Keep the working strip tied to real eligibility: assigned to me + active status action.
  useEffect(() => {
    if (!workingTaskIdsLoaded.current) return;

    const eligibleIds: string[] = [];
    for (const task of allMappedTasks) {
      if (!task.id) continue;
      const override = localOverrides.get(task.id);
      if (isTaskEligibleForWorkingList(task, override, myTaskIds, statusMap)) {
        eligibleIds.push(task.id);
      }
    }

    setWorkingTaskIds((prev) => {
      const next: string[] = [];
      const seen = new Set<string>();

      for (const id of prev) {
        const task = allMappedTaskMap.get(id);
        const override = localOverrides.get(id);
        if (!task || !isTaskEligibleForWorkingList(task, override, myTaskIds, statusMap) || seen.has(id)) {
          continue;
        }
        next.push(id);
        seen.add(id);
        if (next.length >= MAX_WORKING_TASKS) break;
      }

      if (next.length < MAX_WORKING_TASKS) {
        for (const id of eligibleIds) {
          if (seen.has(id)) continue;
          next.push(id);
          seen.add(id);
          if (next.length >= MAX_WORKING_TASKS) break;
        }
      }

      if (prev.length === next.length && prev.every((id, index) => id === next[index])) {
        return prev;
      }

      return next;
    });
  }, [allMappedTaskMap, allMappedTasks, localOverrides, myTaskIds, statusMap]);

  const activeTask = workingTasks.length > 0 ? workingTasks[0] : null;

  const addWorkingTask = useCallback((task: TaskItem) => {
    if (!task.id) return;
    const override = localOverrides.get(task.id);
    if (!isTaskEligibleForWorkingList(task, override, myTaskIds, statusMap)) return;
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
  }, [localOverrides, myTaskIds, statusMap]);

  const removeWorkingTask = useCallback((taskId: string) => {
    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));
  }, []);

  const completeWorkingTask = useCallback((taskId: string) => {
    if (!finalStatus) return;
    const currentTask = allMappedTaskMap.get(String(taskId));
    if (currentTask && (currentTask.shareId || currentTask.approvalStatus || isSharedOnlyTask(currentTask))) return;

    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;
    const finalStatusAction = readStringValue((finalStatusObj as Record<string, unknown> | undefined)?.action);

    setTimedOverride(taskId, {
      status: finalStatus.name,
      statusColor: finalStatus.color,
      statusId: finalStatusId ?? null,
      statusAction: finalStatusAction,
    });

    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskId));

    const mutationTenantId = resolveTenantIdForTask(taskId);
    if (finalStatusId && mutationTenantId) {
      const taskConvexId = allMappedTaskMap.get(taskId)?.convexId;
      const statusConvexId = statusConvexIdMap.get(finalStatusId);
      if (taskConvexId && statusConvexId) {
        patchTaskMutation({
          tenantId: mutationTenantId,
          id: taskConvexId as any,
          statusId: statusConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to complete working task:', err);
        });
      }
    }
  }, [finalStatus, data.statuses, patchTaskMutation, setTimedOverride, allMappedTaskMap, statusConvexIdMap, resolveTenantIdForTask, isSharedOnlyTask]);

  const isTaskWorking = useCallback((taskId: string) => {
    if (!workingTaskIds.includes(taskId)) return false;
    const task = allMappedTaskMap.get(taskId);
    if (!task) return false;
    const override = localOverrides.get(taskId);
    return isTaskEligibleForWorkingList(task, override, myTaskIds, statusMap);
  }, [workingTaskIds, allMappedTaskMap, localOverrides, myTaskIds, statusMap]);

  const setActiveTask = useCallback((task: TaskItem | null, markDone = false) => {
    if (markDone && task?.id && finalStatus) {
      completeWorkingTask(task.id);
    } else if (task) {
      addWorkingTask(task);
    }
  }, [finalStatus, completeWorkingTask, addWorkingTask]);

  const toggleCompactCards = useCallback(() => {
    setCardDensity(cardDensity === 'detailed' ? 'normal' : 'detailed');
  }, [cardDensity, setCardDensity]);

  // ---------------------------------------------------------------------------
  // Mutations (Convex)
  // ---------------------------------------------------------------------------

  const createTask = useCallback(async (args: CreateTaskArgs): Promise<CreatedTaskResult> => {
    if (!effectiveTenantId) throw new Error('No tenant selected');

    const mutationArgs: Record<string, any> = {
      tenantId: effectiveTenantId,
      name: args.name,
      workspaceId: args.workspaceConvexId,
    };
    if (args.description) mutationArgs.description = args.description;
    if (args.categoryConvexId) mutationArgs.categoryId = args.categoryConvexId;
    if (args.templateConvexId) mutationArgs.templateId = args.templateConvexId;
    if (args.spotConvexId) mutationArgs.spotId = args.spotConvexId;
    if (args.statusConvexId) mutationArgs.statusId = args.statusConvexId;
    if (args.priorityConvexId) mutationArgs.priorityId = args.priorityConvexId;
    if (args.tagIds?.length) mutationArgs.tagIds = args.tagIds;
    if (args.dueDate) mutationArgs.dueDate = args.dueDate;
    if (args.startDate) mutationArgs.startDate = args.startDate;
    if (args.latitude != null) mutationArgs.latitude = args.latitude;
    if (args.longitude != null) mutationArgs.longitude = args.longitude;
    if (args.userConvexIds?.length) mutationArgs.assigneeUserIds = args.userConvexIds;

    const result = await createTaskOfflineMutation(mutationArgs as any);
    if ((result as any)?._offlineQueued) {
      const nowIso = new Date().toISOString();
      const pendingId = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
      const queueId = String((result as any)?._queueId ?? `pending_task_${pendingId}`);

      const workspace = data.workspaces.find((w: any) => String((w as any)._id) === String(args.workspaceConvexId));
      const category = args.categoryConvexId
        ? data.categories.find((c: any) => String((c as any)._id) === String(args.categoryConvexId))
        : null;
      const status = args.statusConvexId
        ? data.statuses.find((s: any) => String((s as any)._id) === String(args.statusConvexId))
        : data.statuses.find((s: any) => s.initial) ?? null;
      const priority = args.priorityConvexId
        ? data.priorities.find((p: any) => String((p as any)._id) === String(args.priorityConvexId))
        : null;
      const spot = args.spotConvexId
        ? data.spots.find((s: any) => String((s as any)._id) === String(args.spotConvexId))
        : null;
      const template = args.templateConvexId
        ? data.templates.find((t: any) => String((t as any)._id) === String(args.templateConvexId))
        : null;
      const templateForm = template ? templateFormMap.get((template as any).id ?? (template as any)._id) : undefined;

      const assignees: Assignee[] = (args.userConvexIds ?? [])
        .map((id) => data.users.find((user: any) => String((user as any)._id) === String(id)))
        .filter(Boolean)
        .map((user: any) => ({ name: user.name, picture: user.url_picture ?? null }));

      const tags: string[] = (args.tagIds ?? [])
        .map((rawId) => data.tags.find((tag: any) => (
          String(tag.id) === String(rawId) ||
          String((tag as any)._id ?? '') === String(rawId)
        )))
        .filter(Boolean)
        .map((tag: any) => tag.name);

      const pendingTask: TaskItem = {
        id: pendingId,
        convexId: undefined,
        title: args.name || 'Untitled',
        description: args.description ?? null,
        spot: spot?.name ?? '',
        spotId: spot?.id ?? null,
        priority: priority?.name ?? 'Medium',
        priorityColor: priority?.color ?? null,
        priorityId: priority?.id ?? null,
        status: status?.name ?? initialStatus?.name ?? '',
        statusColor: status?.color ?? initialStatus?.color ?? null,
        statusId: status?.id ?? null,
        statusIcon: (status as any)?.icon ?? null,
        statusAction: (status as any)?.action ?? null,
        categoryId: category?.id ?? null,
        categoryColor: category?.color ?? null,
        categoryIcon: (category as any)?.icon ?? null,
        workspaceId: workspace?.id ?? null,
        assignees,
        createdAt: formatTaskDate(nowIso),
        tags,
        approval: null,
        sla: null,
        formId: templateForm?.formId ?? null,
        formName: templateForm?.formName ?? null,
        flagColor: null,
        createdBy: authUser?.id ?? null,
        latitude: args.latitude ?? null,
        longitude: args.longitude ?? null,
        requiresSignature: false,
      };

      setPendingCreatedTasks((prev) => [pendingTask, ...prev]);
      return { _id: queueId, pgId: -Date.now() };
    }
    return result as CreatedTaskResult;
  }, [effectiveTenantId, createTaskOfflineMutation, data.workspaces, data.categories, data.statuses, data.priorities, data.spots, data.templates, data.users, data.tags, templateFormMap, initialStatus, authUser?.id, formatTaskDate]);

  const addTask = (_task: TaskItem) => {
    // Legacy stub - use createTask instead
  };

  const updateTask = (index: number, task: TaskItem) => {
    if (task.id) {
      setTimedOverride(task.id, task);
    }
  };

  const changeTaskStatus = useCallback((taskId: string, status: StatusOption): boolean => {
    const taskKey = String(taskId);
    const currentTask = allMappedTaskMap.get(taskKey);
    if (currentTask) {
      if (currentTask.shareId || currentTask.approvalStatus || isSharedOnlyTask(currentTask)) {
        return false;
      }

      const allowedStatuses = getAllowedStatuses(currentTask);
      const isAllowed = allowedStatuses.some((candidate) => String(candidate.id) === String(status.id));
      if (!isAllowed) {
        Alert.alert('Invalid status change', 'This task cannot move to that status from its current state.');
        return false;
      }
    }

    const fullStatus = data.statuses.find((s) => s.id === status.id);
    const nextStatusAction = status.action ?? readStringValue((fullStatus as Record<string, unknown> | undefined)?.action);

    const statusOverride: Partial<TaskItem> = {
      status: status.name,
      statusColor: status.color,
      statusId: status.id,
      statusAction: nextStatusAction,
    };

    const taskConvexId = allMappedTaskMap.get(taskKey)?.convexId
      ?? (data.tasks.find((t: any) => String(t.id) === taskKey)?.['_id'] as string | undefined);
    const statusConvexId = statusConvexIdMap.get(status.id)
      ?? (data.statuses.find((s: any) => String(s.id) === String(status.id))?.['_id'] as string | undefined);
    const mutationTenantId = resolveTenantIdForTask(taskKey);

    const hasConvexMutationTarget = Boolean(taskConvexId && statusConvexId);
    const hasPgMutationTarget = Number.isFinite(Number(taskKey));

    if (!mutationTenantId) {
      console.warn('[TaskContext] Missing tenantId for status change', { taskId: taskKey, statusId: status.id });
      return false;
    }

    if (!hasConvexMutationTarget && !hasPgMutationTarget) {
      console.warn('[TaskContext] Could not resolve Convex IDs for status change', { taskId: taskKey, taskConvexId, statusId: status.id, statusConvexId });
      return false;
    }

    setTimedOverride(taskKey, statusOverride);

    if (isWorkingListAction(normalizeStatusAction(nextStatusAction)) && myTaskIds.has(taskKey)) {
      setWorkingTaskIds((prev) => {
        if (prev.includes(taskKey)) return prev;
        if (prev.length >= MAX_WORKING_TASKS) return prev;
        return [...prev, taskKey];
      });
    } else {
      setWorkingTaskIds((prev) => prev.filter((id) => id !== taskKey));
    }

    if (hasConvexMutationTarget) {
      patchTaskMutation({
        tenantId: mutationTenantId,
        id: taskConvexId as any,
        statusId: statusConvexId as any,
      }).catch((err: any) => {
        console.warn('[TaskContext] Failed to change status:', err);
      });
      return true;
    }

    patchTaskByPgIdMutation({
      tenantId: mutationTenantId,
      pgId: Number(taskKey),
      updates: {
        status_id: status.id,
      },
    }).catch((err: any) => {
      console.warn('[TaskContext] Failed to change status by pgId:', err);
    });
    return true;
  }, [data.statuses, data.tasks, patchTaskMutation, patchTaskByPgIdMutation, allMappedTaskMap, statusConvexIdMap, getAllowedStatuses, isSharedOnlyTask, myTaskIds, setTimedOverride, resolveTenantIdForTask]);

  const changeTaskPriority = useCallback((taskId: string, priorityId: AnyId) => {
    const taskKey = String(taskId);
    const priorityInfo = priorityMap.get(priorityId);
    const priorityOverride: Partial<TaskItem> | null = priorityInfo
      ? { priority: priorityInfo.name, priorityColor: priorityInfo.color ?? null, priorityId }
      : null;

    if (priorityInfo) {
      setTimedOverride(taskKey, priorityOverride as Partial<TaskItem>);
    }

    const mutationTenantId = resolveTenantIdForTask(taskKey);
    if (mutationTenantId) {
      const taskConvexId = allMappedTaskMap.get(taskKey)?.convexId
        ?? (data.tasks.find((t: any) => String(t.id) === taskKey)?.['_id'] as string | undefined);
      const priorityConvexId = priorityConvexIdMap.get(priorityId)
        ?? (data.priorities.find((p: any) => String(p.id) === String(priorityId))?.['_id'] as string | undefined);
      if (taskConvexId && priorityConvexId) {
        patchTaskMutation({
          tenantId: mutationTenantId,
          id: taskConvexId as any,
          priorityId: priorityConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to change priority:', err);
        });
      } else if (Number.isFinite(Number(taskKey))) {
        patchTaskByPgIdMutation({
          tenantId: mutationTenantId,
          pgId: Number(taskKey),
          updates: {
            priority_id: priorityId,
          },
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to change priority by pgId:', err);
        });
      } else {
        console.warn('[TaskContext] Could not resolve Convex IDs for priority change', { taskId: taskKey, taskConvexId, priorityId, priorityConvexId });
      }
    } else {
      console.warn('[TaskContext] Missing tenantId for priority change', { taskId: taskKey, priorityId });
    }
  }, [priorityMap, patchTaskMutation, patchTaskByPgIdMutation, allMappedTaskMap, priorityConvexIdMap, setTimedOverride, data.tasks, data.priorities, resolveTenantIdForTask]);

  const markTaskDone = useCallback((taskId: string) => {
    const taskKey = String(taskId);
    if (!finalStatus) return;
    const finalStatusObj = data.statuses.find((s) => s.final);
    const finalStatusId = finalStatusObj?.id;
    const finalStatusAction = readStringValue((finalStatusObj as Record<string, unknown> | undefined)?.action);

    const doneOverride: Partial<TaskItem> = {
      status: finalStatus.name,
      statusColor: finalStatus.color,
      statusId: finalStatusId ?? null,
      statusAction: finalStatusAction,
    };

    setTimedOverride(taskKey, doneOverride);

    setWorkingTaskIds((prev) => prev.filter((id) => id !== taskKey));

    const mutationTenantId = resolveTenantIdForTask(taskKey);
    if (finalStatusId && mutationTenantId) {
      const taskConvexId = allMappedTaskMap.get(taskKey)?.convexId
        ?? (data.tasks.find((t: any) => String(t.id) === taskKey)?.['_id'] as string | undefined);
      const statusConvexId = statusConvexIdMap.get(finalStatusId)
        ?? (data.statuses.find((s: any) => String(s.id) === String(finalStatusId))?.['_id'] as string | undefined);
      if (taskConvexId && statusConvexId) {
        patchTaskMutation({
          tenantId: mutationTenantId,
          id: taskConvexId as any,
          statusId: statusConvexId as any,
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to mark task done:', err);
        });
      } else if (Number.isFinite(Number(taskKey))) {
        patchTaskByPgIdMutation({
          tenantId: mutationTenantId,
          pgId: Number(taskKey),
          updates: {
            status_id: finalStatusId,
          },
        }).catch((err: any) => {
          console.warn('[TaskContext] Failed to mark task done by pgId:', err);
        });
      }
    } else if (finalStatusId) {
      console.warn('[TaskContext] Missing tenantId for mark task done', { taskId: taskKey, finalStatusId });
    }
  }, [finalStatus, data.statuses, data.tasks, patchTaskMutation, patchTaskByPgIdMutation, allMappedTaskMap, statusConvexIdMap, setTimedOverride, resolveTenantIdForTask]);

  const assignTaskToUser = useCallback((taskId: string, userId: AnyId, userName: string) => {
    const taskKey = String(taskId);
    const task = filteredTasks.find((t) => String(t.id) === taskKey);
    if (task && !task.assignees.some((a) => a.name === userName)) {
      setPendingAssigns((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(taskKey) ?? []);
        set.add(userName);
        next.set(taskKey, set);
        return next;
      });

      const mutationTenantId = resolveTenantIdForTask(taskKey);
      if (mutationTenantId) {
        const taskConvexId = allMappedTaskMap.get(taskKey)?.convexId
          ?? (data.tasks.find((t: any) => String(t.id) === taskKey)?.['_id'] as string | undefined);
        const userConvexId = userConvexIdMap.get(userId)
          ?? (data.users.find((u: any) => String(u.id) === String(userId))?.['_id'] as string | undefined);
        if (taskConvexId && userConvexId) {
          assignUserMutation({
            tenantId: mutationTenantId,
            taskId: taskConvexId as any,
            userId: userConvexId as any,
          }).catch((err: any) => {
            console.warn('[TaskContext] Failed to assign user:', err);
            setPendingAssigns((prev) => {
              const next = new Map(prev);
              const set = next.get(taskKey);
              if (set) {
                set.delete(userName);
                if (set.size === 0) next.delete(taskKey);
              }
              return next;
            });
            Alert.alert('Error', `Failed to assign ${userName}`);
          });
        }
      } else {
        console.warn('[TaskContext] Missing tenantId for assign user', { taskId: taskKey, userId });
      }
    }
  }, [filteredTasks, allMappedTaskMap, userConvexIdMap, assignUserMutation, data.tasks, data.users, resolveTenantIdForTask]);

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
      setCardDensity,
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
