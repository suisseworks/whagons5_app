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
import { useSafeConvexQuery } from '../hooks/useSafeConvexQuery';
import { useMutationQueue } from './MutationQueueContext';
import { useNetwork } from './NetworkContext';
import { useLanguage } from './LanguageContext';
import { FINALIZED_TASK_WINDOW_DAYS_STORAGE_KEY } from '../config/storageKeys';
import * as DB from '../store/database';
import type { TimeFormatPreference } from './LanguageContext';

const WORKING_TASKS_STORAGE_KEY = '@whagons/working_task_ids';
const CARD_DENSITY_STORAGE_KEY = '@whagons/card_density';
const MAX_WORKING_TASKS = 5;
const FINALIZED_TASK_WINDOW_OPTIONS = [7, 30, 90, 'all'] as const;
export type FinalizedTaskWindowValue = typeof FINALIZED_TASK_WINDOW_OPTIONS[number];
const DEFAULT_FINALIZED_TASK_WINDOW_VALUE: FinalizedTaskWindowValue = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
// SQLite is the default list source (Phase 2): the indexed in-memory path is
// only a fallback. Set to 0 so the SQLite-backed list is used whenever no
// memory-only filters are active — this hydrates instantly from the on-disk
// cache on cold start (no network round-trip) and keeps memory bounded to the
// visible window instead of the whole tenant.
const TASK_SQL_THRESHOLD = 0;

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

function normalizeFinalizedTaskWindowValue(value: unknown): FinalizedTaskWindowValue | null {
  if (value === 'all') return 'all';
  const numeric = typeof value === 'number' ? value : Number(value);
  return FINALIZED_TASK_WINDOW_OPTIONS.includes(numeric as FinalizedTaskWindowValue)
    ? numeric as FinalizedTaskWindowValue
    : null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDeletedTaskRow(task: unknown): boolean {
  if (!task || typeof task !== 'object') return false;
  const row = task as Record<string, unknown>;
  const deletedAt = row.deletedAt ?? row.deleted_at;
  return deletedAt != null && deletedAt !== '';
}

function readIdArray(value: unknown): AnyId[] {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item != null) : [];
  } catch {
    return [];
  }
}

function taskMatchesSearchQuery(task: TaskItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const idTerm = q.startsWith('#') ? q.slice(1) : q;
  const isIdSearch = /^\d+$/.test(idTerm);
  return (
    task.title.toLowerCase().includes(q) ||
    task.description?.toLowerCase().includes(q) ||
    task.spot.toLowerCase().includes(q) ||
    task.status.toLowerCase().includes(q) ||
    task.assignees.some((assignee) => assignee.name.toLowerCase().includes(q)) ||
    task.tags.some((tag) => tag.toLowerCase().includes(q)) ||
    (isIdSearch && task.id != null && String(task.id) === idTerm)
  );
}

function parseExactTaskIdSearch(query: string): number | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^\d+$/.test(candidate)) return null;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

function isWorkspaceActionTask(task: TaskItem): boolean {
  const activeContext = task.activeWorkspaceContext ?? task.active_workspace_context ?? null;
  const kind = String(activeContext?.kind ?? '').toLowerCase();
  return kind === 'approval' || kind === 'acknowledgment';
}

function isWorkingListAction(action: string | null): boolean {
  return action === 'WORKING' || action === 'PAUSED';
}

function isFinishedListTask(
  task: TaskItem,
  statusMap: Map<AnyId, { name: string; color?: string | null; final?: boolean; initial?: boolean; icon?: string | null; action?: string | null }>,
): boolean {
  const statusMeta = resolveTaskStatusMeta(task, undefined, statusMap);
  return statusMeta.final || statusMeta.action === 'FINISHED' || statusMeta.action === 'DONE' || statusMeta.action === 'COMPLETED';
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
  formInfoMap: Map<AnyId, { formId: AnyId; formName: string }>,
  userFlagMap: Map<AnyId, string>,
  categoryInfoMap: Map<AnyId, { color?: string | null; icon?: string | null }>,
  commentSummaryMap: Map<string, { count: number; lastText?: string | null; lastVoiceMemo?: TaskCommentVoiceMemo | null; lastUnread?: boolean }>,
  userMap: Map<AnyId, string>,
  userPictureMap: Map<AnyId, string | null>,
  tagNameMap: Map<AnyId, string>,
  formatTaskDate: (dateStr?: string | null) => string,
): TaskItem {
  const status = resolveStatus(task.status_id, statusMap, initialStatus);

  const templateId = task.template_id;
  const directFormId = (task as any).formId ?? (task as any).form_id ?? null;
  const directFormInfo = directFormId ? formInfoMap.get(directFormId) ?? { formId: directFormId, formName: 'Form' } : undefined;
  const templateFormInfo = templateId ? templateFormMap.get(templateId) : undefined;
  const formInfo = directFormInfo ?? templateFormInfo;

  const flagColor = userFlagMap.get(task.id) ?? (task as any).flagColor ?? (task as any).flag_color ?? null;
  const catInfo = task.category_id ? categoryInfoMap.get(task.category_id) : undefined;
  const taskConvexId = (task as any)._id ? String((task as any)._id) : null;
  const commentSummary = taskConvexId ? commentSummaryMap.get(taskConvexId) : undefined;
  const fallbackAssignees = readIdArray((task as any).user_ids ?? (task as any).userIds)
    .map((userId) => {
      const name = userMap.get(userId) ?? userMap.get(String(userId));
      if (!name) return null;
      return { name, picture: userPictureMap.get(userId) ?? userPictureMap.get(String(userId)) ?? null };
    })
    .filter(Boolean) as Assignee[];
  const fallbackTags = readIdArray((task as any).tag_ids ?? (task as any).tagIds)
    .map((tagId) => tagNameMap.get(tagId) ?? tagNameMap.get(String(tagId)))
    .filter(Boolean) as string[];

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
    assignees: assigneeMap.get(task.id) ?? fallbackAssignees,
    createdAt: formatTaskDate(task.created_at),
    completedAt: readEpochMs((task as any).completedAt ?? (task as any).completed_at),
    updatedAt: readEpochMs((task as any).updatedAt ?? (task as any).updated_at),
    tags: tagMap.get(task.id) ?? fallbackTags,
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
    approvalId: (task as any).approval_id ?? (task as any).approvalId ?? null,
    approvalActionDecision: (task as any).approvalActionDecision ?? (task as any).approval_action_decision ?? null,
    approval_action_decision: (task as any).approval_action_decision ?? (task as any).approvalActionDecision ?? null,
    activeWorkspaceContext: (task as any).activeWorkspaceContext ?? (task as any).active_workspace_context ?? null,
    active_workspace_context: (task as any).active_workspace_context ?? (task as any).activeWorkspaceContext ?? null,
    workspaceContexts: (task as any).workspaceContexts ?? (task as any).workspace_contexts ?? [],
    workspace_contexts: (task as any).workspace_contexts ?? (task as any).workspaceContexts ?? [],
    commentCount: commentSummary?.count ?? 0,
    lastCommentText: commentSummary?.lastText ?? null,
    lastCommentVoiceMemo: commentSummary?.lastVoiceMemo ?? null,
    lastCommentUnread: commentSummary?.lastUnread === true,
  };
}

function taskWithActiveWorkspaceContext(task: TaskItem, workspace: any): TaskItem {
  const contexts = task.workspaceContexts ?? task.workspace_contexts ?? [];
  if (!Array.isArray(contexts) || contexts.length === 0) return task;

  const workspaceKeys = workspaceKeySetForWorkspace(workspace);
  if (workspaceKeys.size === 0) return task;

  const activeContext = contexts.find((context: any) => {
    const contextWorkspaceId = context?.workspaceId ?? context?.workspace_id;
    return contextWorkspaceId != null && workspaceKeys.has(String(contextWorkspaceId));
  });
  if (!activeContext) return task;

  return {
    ...task,
    activeWorkspaceContext: activeContext,
    active_workspace_context: activeContext,
  };
}

function workspaceKeySetForWorkspace(workspace: any): Set<string> {
  return new Set(
    [workspace?.id, workspace?._id, workspace?.pgId, workspace?.pg_id]
      .filter((value) => value != null && value !== '')
      .map(String),
  );
}

function taskWorkspaceKeys(task: TaskItem): string[] {
  const keys = new Set<string>();
  const addKey = (value: unknown) => {
    if (value != null && value !== '') keys.add(String(value));
  };

  const activeContext = task.activeWorkspaceContext ?? task.active_workspace_context ?? null;
  const activeContextKind = String(activeContext?.kind ?? '').toLowerCase();
  const isActionContext = activeContextKind === 'approval' || activeContextKind === 'acknowledgment';

  if (!isActionContext) {
    addKey(task.workspaceId);
    addKey((task as any).workspace_id);
    addKey((task as any).sourceWorkspaceId);
    addKey((task as any).source_workspace_id);
  }

  addKey(activeContext?.workspaceId);
  addKey(activeContext?.workspace_id);

  const contexts = task.workspaceContexts ?? task.workspace_contexts ?? [];
  if (Array.isArray(contexts)) {
    for (const context of contexts) {
      addKey(context?.workspaceId);
      addKey(context?.workspace_id);
    }
  }

  return [...keys];
}

function taskMatchesWorkspace(task: TaskItem, workspace: any): boolean {
  const workspaceKeys = workspaceKeySetForWorkspace(workspace);
  if (workspaceKeys.size === 0) return false;
  return taskWorkspaceKeys(task).some((key) => workspaceKeys.has(key));
}

function addVisibilityKey(keys: Set<string>, value: unknown) {
  if (value != null && value !== '') keys.add(String(value));
}

function taskMatchesVisibleSpot(
  task: TaskItem,
  visibleSpotKeys: Set<string>,
  spotScopeRestricted: boolean,
  currentUserNames: Set<string>,
): boolean {
  if (task.spotId == null || task.spotId === '') return true;
  if (task.assignees.some((assignee) => currentUserNames.has(String(assignee.name ?? '').trim().toLowerCase()))) return true;
  if (visibleSpotKeys.size === 0) return !spotScopeRestricted;
  return visibleSpotKeys.has(String(task.spotId));
}

function taskWorkspaceIndexKeys(task: TaskItem, workspaces: any[]): string[] {
  const keys: string[] = [];
  for (const workspace of workspaces) {
    if (!taskMatchesWorkspace(task, workspace)) continue;
    const workspaceId = workspace?.id;
    if (workspaceId != null && workspaceId !== '') keys.push(String(workspaceId));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Empty fallback (MainScreen handles the empty/syncing UI itself)
// ---------------------------------------------------------------------------
const EMPTY_TASKS: TaskItem[] = [];
const EMPTY_STRINGS: string[] = [];

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
  taskListMode: 'hot' | 'recent' | 'all';
  taskUniverseCount: number;
  totalTaskCount: number;
  loadMoreTasks: () => void;
  hasMoreTasks: boolean;
  isTaskListLoading: boolean;
  isTaskListIncomplete: boolean;
  activeTask: TaskItem | null;
  workingTasks: TaskItem[];
  cardDensity: CardDensity;
  selectedWorkspace: string;
  workspaces: string[];
  workspaceObjects: SyncedWorkspace[];
  workspaceTaskCounts: Map<string | number, number>;
  taskStatusCounts: Map<string, number>;
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
  finalizedTaskWindowValue: FinalizedTaskWindowValue;
  finalizedTaskWindowOptions: readonly FinalizedTaskWindowValue[];
  setFinalizedTaskWindowValue: (value: FinalizedTaskWindowValue) => void;
  setSelectedWorkspace: (workspace: string) => void;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
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
    isTaskPageLoading,
    isTaskPageIncomplete,
    taskCacheVersion,
    loadMoreTaskRows,
    setTaskQuery,
  } = useData();
  const { user: authUser, token } = useAuth();
  const { tenantId } = useTenant();
  const { t, language, timeFormat } = useLanguage();
  const activeTenantId = token ? tenantId : null;
  const [storedTenantId, setStoredTenantId] = useState<string | null>(null);
  const [cardDensity, setCardDensityState] = useState<CardDensity>('normal');
  const [finalizedTaskWindowValue, setFinalizedTaskWindowValueState] = useState<FinalizedTaskWindowValue>(DEFAULT_FINALIZED_TASK_WINDOW_VALUE);
  const [searchQuery, setSearchQueryState] = useState('');
  const convexUser = useQuery(api.users.me, activeTenantId ? { tenantId: activeTenantId } : 'skip');
  const { queue } = useMutationQueue();
  const { isOnline } = useNetwork();
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

  useEffect(() => {
    AsyncStorage.getItem(FINALIZED_TASK_WINDOW_DAYS_STORAGE_KEY)
      .then((raw) => {
        const storedWindow = normalizeFinalizedTaskWindowValue(raw);
        if (storedWindow) setFinalizedTaskWindowValueState(storedWindow);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!convexUser) return;
    const settings = (convexUser as any).settings ?? {};
    const serverWindow = normalizeFinalizedTaskWindowValue(
      settings.finalizedTaskWindowDays ?? settings.finalized_task_window_days,
    );
    if (serverWindow) {
      setFinalizedTaskWindowValueState(serverWindow);
      AsyncStorage.setItem(FINALIZED_TASK_WINDOW_DAYS_STORAGE_KEY, String(serverWindow)).catch(() => {});
    }
  }, [convexUser]);

  const setFinalizedTaskWindowValue = useCallback((value: FinalizedTaskWindowValue) => {
    const next = normalizeFinalizedTaskWindowValue(value) ?? DEFAULT_FINALIZED_TASK_WINDOW_VALUE;
    setFinalizedTaskWindowValueState(next);
    AsyncStorage.setItem(FINALIZED_TASK_WINDOW_DAYS_STORAGE_KEY, String(next)).catch(() => {});
    if (!tenantId) return;
    updateMeMutation({
      tenantId,
      settings: { finalizedTaskWindowDays: next },
    }).catch(() => {});
  }, [tenantId, updateMeMutation]);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  const recentFinishedSince = useMemo(
    () => finalizedTaskWindowValue === 'all' ? null : Date.now() - finalizedTaskWindowValue * DAY_MS,
    [finalizedTaskWindowValue],
  );
  const taskListMode = finalizedTaskWindowValue === 'all' ? 'all' as const : 'recent' as const;
  const exactSearchPgId = useMemo(() => parseExactTaskIdSearch(searchQuery), [searchQuery]);
  const serverSearchTask = useQuery(
    (api.bulk as any).taskByPgId,
    activeTenantId && exactSearchPgId != null
      ? { tenantId: activeTenantId, pgId: exactSearchPgId }
      : 'skip',
  );

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

  const formInfoMap = useMemo(() => {
    const m = new Map<AnyId, { formId: AnyId; formName: string }>();
    for (const f of data.forms) {
      const primaryId = (f as any)._id ?? f.id;
      const formInfo = { formId: primaryId, formName: f.name ?? 'Form' };
      m.set(f.id, formInfo);
      if ((f as any)._id) m.set((f as any)._id, formInfo);
    }
    return m;
  }, [data.forms]);

  const templateFormMap = useMemo(() => {
    const m = new Map<AnyId, { formId: AnyId; formName: string }>();
    for (const tpl of data.templates) {
      if (tpl.form_id) {
        const formInfo = formInfoMap.get(tpl.form_id) ?? { formId: tpl.form_id, formName: 'Form' };
        m.set(tpl.id, formInfo);
      }
    }
    return m;
  }, [data.templates, formInfoMap]);

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

  const finishedStatusNames = useMemo(() => (
    statuses
      .filter((status) => {
        const action = normalizeStatusAction(status.action);
        return status.final === true || action === 'FINISHED' || action === 'DONE' || action === 'COMPLETED';
      })
      .map((status) => status.name)
  ), [statuses]);

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
    return data.tasks.filter((t) => !isDeletedTaskRow(t));
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
      mapTaskToItem(t, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, formatTaskDate),
    );
  }, [activeTasks, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, formatTaskDate]);

  const serverSearchTaskItem = useMemo(() => {
    if (!serverSearchTask || typeof serverSearchTask !== 'object') return null;
    const rawTask = serverSearchTask as any;
    if (isDeletedTaskRow(rawTask)) return null;
    const resolveId = (items: any[], rawId: any) => {
      if (rawId == null) return null;
      const match = items.find((item: any) => String(item?._id ?? '') === String(rawId));
      return match?.id ?? rawId;
    };
    const resolveIds = (items: any[], rawIds: unknown) => (
      readIdArray(rawIds)
        .map((rawId) => resolveId(items, rawId))
        .filter((rawId) => rawId != null)
    );
    const activeWorkspaceContext = rawTask.activeWorkspaceContext ?? rawTask.active_workspace_context ?? null;
    const sourceWorkspaceId = resolveId(data.workspaces, rawTask.workspaceId ?? rawTask.workspace_id);
    const overlayWorkspaceId = activeWorkspaceContext
      ? resolveId(data.workspaces, activeWorkspaceContext.workspaceId ?? activeWorkspaceContext.workspace_id)
      : sourceWorkspaceId;
    const syncedTask: SyncedTask = {
      ...rawTask,
      id: rawTask.pgId ?? rawTask.id ?? rawTask._id,
      source_workspace_id: sourceWorkspaceId,
      workspace_id: overlayWorkspaceId,
      category_id: resolveId(data.categories, rawTask.categoryId ?? rawTask.category_id),
      status_id: resolveId(data.statuses, rawTask.statusId ?? rawTask.status_id),
      priority_id: resolveId(data.priorities, rawTask.priorityId ?? rawTask.priority_id),
      approval_id: resolveId(approvalsList, rawTask.approvalId ?? rawTask.approval_id) ?? rawTask.approvalId ?? rawTask.approval_id ?? null,
      spot_id: resolveId(data.spots, rawTask.spotId ?? rawTask.spot_id),
      template_id: resolveId(data.templates, rawTask.templateId ?? rawTask.template_id),
      created_by: resolveId(data.users, rawTask.createdBy ?? rawTask.created_by),
      user_ids: resolveIds(data.users, rawTask.userIds ?? rawTask.user_ids),
      tag_ids: resolveIds(data.tags, rawTask.tagIds ?? rawTask.tag_ids),
      deleted_at: rawTask.deletedAt ? new Date(rawTask.deletedAt).toISOString() : rawTask.deleted_at ?? null,
      completed_at: rawTask.completedAt ? new Date(rawTask.completedAt).toISOString() : rawTask.completed_at ?? null,
      created_at: rawTask.createdAt ? new Date(rawTask.createdAt).toISOString() : (rawTask._creationTime ? new Date(rawTask._creationTime).toISOString() : rawTask.created_at ?? null),
      updated_at: rawTask.updatedAt ? new Date(rawTask.updatedAt).toISOString() : (rawTask._creationTime ? new Date(rawTask._creationTime).toISOString() : rawTask.updated_at ?? null),
    };
    return mapTaskToItem(syncedTask, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, formatTaskDate);
  }, [approvalsList, assigneeMap, categoryInfoMap, commentSummaryMap, data.categories, data.priorities, data.spots, data.statuses, data.tags, data.templates, data.users, data.workspaces, formInfoMap, formatTaskDate, initialStatus, priorityMap, serverSearchTask, spotMap, statusMap, tagMap, tagNameMap, templateFormMap, userFlagMap, userMap, userPictureMap]);

  const approvalMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const a of approvalsList) {
      m[String(a._id ?? a.id)] = a;
      if (a.id != null) m[String(a.id)] = a;
    }
    return m;
  }, [approvalsList]);

  const getTaskApprovalStatus = useCallback((task: TaskItem): 'pending' | 'approved' | 'rejected' | null => {
    if (isWorkspaceActionTask(task)) return null;
    const approvalId = task.approvalId ?? (task as any).approval_id ?? null;
    if (!approvalId || !task.id) return null;

    const derived = computeApprovalStatusForTask({
      taskId: String(task.id),
      taskConvexId: task.convexId ?? task.taskConvexId ?? undefined,
      approvalId,
      approval: approvalMap[String(approvalId)],
      taskApprovalInstances: taskApprovalInstances as any[],
    });

    return derived ?? 'pending';
  }, [approvalMap, taskApprovalInstances]);

  const isTaskStatusLockedByApproval = useCallback((task: TaskItem): boolean => {
    const approvalStatus = getTaskApprovalStatus(task);
    return approvalStatus != null && approvalStatus !== 'approved';
  }, [getTaskApprovalStatus]);

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
      if (!rawTask || isDeletedTaskRow(rawTask)) continue;

      const taskId = rawTask.id ?? rawTask.pgId ?? rawTask._id;
      if (taskId == null || seen.has(String(taskId))) continue;
      seen.add(String(taskId));

      const convexId = rawTask._id ? String(rawTask._id) : null;
      if (visibleTaskKeys.has(String(taskId)) || (convexId && visibleTaskKeys.has(convexId))) {
        continue;
      }

      const activeWorkspaceContext = rawTask.activeWorkspaceContext ?? rawTask.active_workspace_context ?? null;
      const contextWorkspaceId = activeWorkspaceContext?.workspaceId ?? activeWorkspaceContext?.workspace_id ?? null;
      const sourceWorkspaceId = resolveId(data.workspaces, rawTask.workspaceId ?? rawTask.workspace_id);
      const overlayWorkspaceId = contextWorkspaceId ? resolveId(data.workspaces, contextWorkspaceId) : sourceWorkspaceId;

      const syncedTask: SyncedTask = {
        ...rawTask,
        id: taskId,
        source_workspace_id: sourceWorkspaceId,
        workspace_id: overlayWorkspaceId,
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
      const item = mapTaskToItem(syncedTask, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, formatTaskDate);
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
  }, [rawSharedToMe, mappedActiveTasks, data.workspaces, data.categories, data.statuses, data.priorities, data.spots, data.templates, data.users, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, sharedEnrichmentMap, formatTaskDate]);

  useEffect(() => {
    if (pendingCreatedTasks.length === 0 || mappedActiveTasks.length === 0) return;

    const syncedKeys = new Set(mappedActiveTasks.map((task) => pendingTaskHeuristicKey(task)));
    setPendingCreatedTasks((prev) => prev.filter((task) => !syncedKeys.has(pendingTaskHeuristicKey(task))));
  }, [mappedActiveTasks, pendingCreatedTasks.length]);

  const allMappedTasks = useMemo(() => {
    const visibleBaseTasks = sharedMappedTasks.length > 0
      ? [...mappedActiveTasks, ...sharedMappedTasks]
      : mappedActiveTasks;
    const visiblePendingTasks = pendingCreatedTasks;
    const withApprovalStatus = (tasks: TaskItem[]) => tasks.map((task) => {
      const approvalStatus = task.approvalStatus ?? getTaskApprovalStatus(task);
      return approvalStatus ? { ...task, approvalStatus } : task;
    });

    if (visibleBaseTasks.length === 0) return withApprovalStatus(visiblePendingTasks);
    if (visiblePendingTasks.length === 0) return withApprovalStatus(visibleBaseTasks);

    const syncedKeys = new Set(visibleBaseTasks.map((task) => pendingTaskHeuristicKey(task)));
    const pending = visiblePendingTasks.filter((task) => !syncedKeys.has(pendingTaskHeuristicKey(task)));
    return withApprovalStatus([...visibleBaseTasks, ...pending]);
  }, [getTaskApprovalStatus, mappedActiveTasks, pendingCreatedTasks, sharedMappedTasks]);

  const taskIdByConvexId = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of allMappedTasks) {
      if (!task.id || !task.convexId) continue;
      map.set(String(task.convexId), String(task.id));
    }
    return map;
  }, [allMappedTasks]);

  const liveTaskKeySet = useMemo(() => {
    const keys = new Set<string>();
    for (const task of allMappedTasks) {
      for (const value of [task.id, task.convexId, task.taskConvexId]) {
        if (value != null && value !== '') keys.add(String(value));
      }
    }
    return keys;
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

  const visibleSpotKeySet = useMemo(() => {
    const keys = new Set<string>();
    for (const spot of data.spots as any[]) {
      addVisibilityKey(keys, spot.id);
      addVisibilityKey(keys, spot._id);
      addVisibilityKey(keys, spot.pgId);
      addVisibilityKey(keys, spot.pg_id);
    }
    return keys;
  }, [data.spots]);

  const spotScopeRestricted = useMemo(() => {
    return convexUser !== undefined;
  }, [convexUser]);

  const currentUserNames = useMemo(() => {
    const names = new Set<string>();
    for (const value of [(convexUser as any)?.name, (convexUser as any)?.email, (authUser as any)?.name, (authUser as any)?.email]) {
      if (typeof value === 'string' && value.trim()) names.add(value.trim().toLowerCase());
    }
    return names;
  }, [authUser, convexUser]);

  const workspaceVisibleMappedTasks = useMemo(
    () => allMappedTasks.filter((task) => !isSharedOnlyTask(task) && taskMatchesVisibleSpot(task, visibleSpotKeySet, spotScopeRestricted, currentUserNames)),
    [allMappedTasks, currentUserNames, isSharedOnlyTask, spotScopeRestricted, visibleSpotKeySet],
  );
  const countableWorkspaceVisibleMappedTasks = useMemo(
    () => workspaceVisibleMappedTasks.filter((task) => !isFinishedListTask(task, statusMap)),
    [statusMap, workspaceVisibleMappedTasks],
  );
  const liveTaskUniverseCount = countableWorkspaceVisibleMappedTasks.length;

  const liveWorkspaceTaskCounts = useMemo(() => {
    const counts = new Map<string | number, number>();

    for (const workspace of workspaceObjects) {
      const workspaceId = workspace?.id;
      if (workspaceId == null || workspaceId === '') continue;
      const convexId = (workspace as any)?._id;

      let count = 0;
      for (const task of countableWorkspaceVisibleMappedTasks) {
        if (taskMatchesWorkspace(task, workspace)) count++;
      }

      counts.set(workspaceId, count);
      counts.set(String(workspaceId), count);

      if (convexId != null && convexId !== '') {
        counts.set(String(convexId), count);
      }
    }

    return counts;
  }, [countableWorkspaceVisibleMappedTasks, workspaceObjects]);

  // ---------------------------------------------------------------------------
  // Filter + paginate
  // ---------------------------------------------------------------------------
  const hasActiveFilters = filters.categoryIds.length > 0 || filters.statuses.length > 0 || filters.priorities.length > 0 || filters.assignees.length > 0 || filters.flagColors.length > 0 || filters.tags.length > 0;

  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // The visible window grows by PAGE_SIZE (30) on each scroll, but re-querying +
  // re-mapping the whole SQLite window every 30 rows is what makes deep scrolling
  // slow. Fetch in coarser buckets instead: the SQLite query (and the expensive
  // mapTaskToItem pass) only re-runs when the window crosses a bucket boundary;
  // smooth per-row scrolling is handled by slicing the already-fetched rows.
  const SQL_QUERY_BUCKET = 150;
  const sqlQueryLimit = Math.ceil(Math.max(1, visibleCount) / SQL_QUERY_BUCKET) * SQL_QUERY_BUCKET;

  const sqlFilterWorkspaceId = useMemo(() => {
    if (selectedWorkspace === 'Everything') return undefined;
    if (selectedWorkspace === 'Shared') return null;
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    return ws?.id ?? null;
  }, [data.workspaces, selectedWorkspace]);

  const selectedWorkspaceObject = useMemo(() => {
    if (selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared') return null;
    return data.workspaces.find((w) => w.name === selectedWorkspace) ?? null;
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

  const shouldUseSqlTaskList = canUseIndexedTaskList && allMappedTasks.length >= TASK_SQL_THRESHOLD;

  // Finished rows are limited by finalized timestamp unless the user selects
  // the full finalized history.
  const sqlExcludeStatuses = EMPTY_STRINGS;
  const sqlRecentFinishedStatuses = finalizedTaskWindowValue === 'all' ? EMPTY_STRINGS : finishedStatusNames;
  const sqlRecentFinishedSince = recentFinishedSince;

  const sqlFilterKey = useMemo(() => {
    if (!shouldUseSqlTaskList) return '';
    return JSON.stringify({
      tenantId: effectiveTenantId ?? null,
      workspaceId: sqlFilterWorkspaceId ?? null,
      statuses: filters.statuses,
      excludeStatuses: sqlExcludeStatuses,
      recentFinishedStatuses: sqlRecentFinishedStatuses,
      recentFinishedSince: sqlRecentFinishedSince,
      search: searchQuery.trim().toLowerCase(),
      limit: sqlQueryLimit,
      // Re-run the SQLite query when the local cache is rewritten so the list
      // reflects synced/optimistic changes in (near) real time.
      cacheVersion: taskCacheVersion,
    });
  }, [effectiveTenantId, filters.statuses, sqlExcludeStatuses, sqlRecentFinishedSince, sqlRecentFinishedStatuses, searchQuery, taskCacheVersion, shouldUseSqlTaskList, sqlFilterWorkspaceId, sqlQueryLimit]);

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
      tenantId: effectiveTenantId,
      buckets: ['live'],
      workspaceId: sqlFilterWorkspaceId ?? undefined,
      statuses: filters.statuses,
      excludeStatuses: sqlExcludeStatuses,
      recentFinishedStatuses: sqlRecentFinishedStatuses,
      recentFinishedSince: sqlRecentFinishedSince,
      search: searchQuery.trim() || undefined,
      limit: sqlQueryLimit,
    })
      .then(({ rows, total }) => {
        if (cancelled) return;
        if (total === 0 && allMappedTasks.length > 0) {
          setSqlFilteredState(null);
          return;
        }
        const visibleRows = liveTaskKeySet.size > 0
          ? rows.filter((task) => {
            const keys = [
              (task as any).id,
              (task as any)._id,
              (task as any).convexId,
              (task as any).taskConvexId,
            ].filter((value) => value != null && value !== '').map(String);
            return keys.some((key) => liveTaskKeySet.has(key));
          })
          : rows;
        if (rows.length > 0 && visibleRows.length === 0 && allMappedTasks.length > 0) {
          setSqlFilteredState(null);
          return;
        }
        const mapped = visibleRows.map((task) => {
          const item = mapTaskToItem(task, spotMap, priorityMap, statusMap, assigneeMap, tagMap, initialStatus, templateFormMap, formInfoMap, userFlagMap, categoryInfoMap, commentSummaryMap, userMap, userPictureMap, tagNameMap, formatTaskDate);
          return selectedWorkspaceObject ? taskWithActiveWorkspaceContext(item, selectedWorkspaceObject) : item;
        });
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
    effectiveTenantId,
    sqlExcludeStatuses,
    sqlRecentFinishedSince,
    sqlRecentFinishedStatuses,
    searchQuery,
    formatTaskDate,
    filters.statuses,
    initialStatus,
    liveTaskKeySet,
    priorityMap,
    spotMap,
    sqlFilterKey,
    sqlFilterWorkspaceId,
    selectedWorkspaceObject,
    statusMap,
    shouldUseSqlTaskList,
    tagMap,
    templateFormMap,
    formInfoMap,
    userMap,
    userPictureMap,
    tagNameMap,
    userFlagMap,
    sqlQueryLimit,
  ]);

  const activeSqlFilteredState = sqlFilteredState?.key === sqlFilterKey ? sqlFilteredState : null;

  const computedFilteredTasks = useMemo(() => {
    if (activeSqlFilteredState) {
      return activeSqlFilteredState.tasks.length === 0 && serverSearchTaskItem
        ? [serverSearchTaskItem]
        : activeSqlFilteredState.tasks;
    }
    if (allMappedTasks.length === 0) return serverSearchTaskItem ? [serverSearchTaskItem] : EMPTY_TASKS;

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
        result = workspaceVisibleMappedTasks
          .filter((t) => taskMatchesWorkspace(t, ws))
          .map((t) => taskWithActiveWorkspaceContext(t, ws));
        if (result.length === 0 && allMappedTasks.length > 0) {
          const sampleIds = workspaceVisibleMappedTasks.slice(0, 5).map((t) => taskWorkspaceKeys(t).join('|') || 'none');
          console.warn(`[TaskContext] Workspace "${selectedWorkspace}" (id=${ws.id}, type=${typeof ws.id}) matched 0/${workspaceVisibleMappedTasks.length} tasks. Sample task workspace keys: [${sampleIds.join(', ')}]`);
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

    if (searchQuery.trim().length > 0) {
      result = result.filter((task) => taskMatchesSearchQuery(task, searchQuery));
    }

    if (result.length === 0 && serverSearchTaskItem) {
      result = [serverSearchTaskItem];
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
  }, [activeSqlFilteredState, allMappedTasks, data.workspaces, selectedWorkspace, localOverrides, queuedTaskOverrides, shouldShowPendingTaskState, filters, hasActiveFilters, searchQuery, serverSearchTaskItem, sharedTaskIds, sharedEnrichmentMap, workspaceVisibleMappedTasks]);

  const filteredTaskViewKey = useMemo(() => JSON.stringify({
    workspace: selectedWorkspace,
    filters,
    searchQuery,
    finalizedTaskWindowValue,
    taskListMode,
  }), [filters, finalizedTaskWindowValue, searchQuery, selectedWorkspace, taskListMode]);
  const filteredTaskViewCacheRef = useRef<Map<string, TaskItem[]>>(new Map());
  const canUseCachedFilteredTasks = isTaskPageLoading || isTaskPageIncomplete;
  const cachedFilteredTasks = filteredTaskViewCacheRef.current.get(filteredTaskViewKey);
  const filteredTasks = computedFilteredTasks.length === 0 && canUseCachedFilteredTasks && cachedFilteredTasks
    ? cachedFilteredTasks
    : computedFilteredTasks;

  useEffect(() => {
    if (computedFilteredTasks.length > 0 || !canUseCachedFilteredTasks) {
      filteredTaskViewCacheRef.current.set(filteredTaskViewKey, computedFilteredTasks);
    }
  }, [canUseCachedFilteredTasks, computedFilteredTasks, filteredTaskViewKey]);

  const computedWsFilteredTasks = useMemo(() => {
    let result = selectedWorkspace === 'Everything' ? workspaceVisibleMappedTasks : EMPTY_TASKS;
    if (selectedWorkspace === 'Shared') {
      result = allMappedTasks.filter((t) => {
        const numId = Number(t.id);
        return sharedTaskIds.has(numId) || sharedTaskIds.has(t.id ?? '');
      });
    } else if (selectedWorkspace !== 'Everything') {
      const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
      if (ws) {
        result = workspaceVisibleMappedTasks
          .filter((t) => taskMatchesWorkspace(t, ws))
          .map((t) => taskWithActiveWorkspaceContext(t, ws));
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

  const wsFilteredTaskViewKey = useMemo(() => JSON.stringify({
    workspace: selectedWorkspace,
    searchQuery,
    finalizedTaskWindowValue,
    taskListMode,
  }), [finalizedTaskWindowValue, searchQuery, selectedWorkspace, taskListMode]);
  const wsFilteredTaskViewCacheRef = useRef<Map<string, TaskItem[]>>(new Map());
  const cachedWsFilteredTasks = wsFilteredTaskViewCacheRef.current.get(wsFilteredTaskViewKey);
  const wsFilteredTasks = computedWsFilteredTasks.length === 0 && canUseCachedFilteredTasks && cachedWsFilteredTasks
    ? cachedWsFilteredTasks
    : computedWsFilteredTasks;

  useEffect(() => {
    if (computedWsFilteredTasks.length > 0 || !canUseCachedFilteredTasks) {
      wsFilteredTaskViewCacheRef.current.set(wsFilteredTaskViewKey, computedWsFilteredTasks);
    }
  }, [canUseCachedFilteredTasks, computedWsFilteredTasks, wsFilteredTaskViewKey]);

  // ---------------------------------------------------------------------------
  // Counts (sidebar / workspace / status pills / view total)
  // ---------------------------------------------------------------------------
  // Source of truth = the SERVER: the real, visibility-scoped count of every task the
  // user may view for the current view/filter (e.g. "Everything" + finished-off = all
  // non-finished tasks in their workspaces/spots, not just what is loaded locally).
  // SQLite is only a fast/offline cache: cached counts render instantly (and while
  // offline), then the authoritative server counts override them as soon as they
  // arrive. In-memory is the last resort.
  const searchActiveForCounts = searchQuery.trim().length > 0;
  const countsMode = 'hot' as const;
  const countExcludeStatuses = finishedStatusNames;
  const statusPillMode = taskListMode;

  // Server: all-workspaces summary → sidebar (every workspace) + "Everything" totals.
  const serverAllSummary = useSafeConvexQuery(
    api.bulk.taskSummaryCounts,
    effectiveTenantId ? { tenantId: effectiveTenantId, mode: countsMode, preferEstimated: true } : 'skip',
    'bulk.taskSummaryCounts',
  );

  const scopedWorkspaceCountId = useMemo(() => {
    if (selectedWorkspace === 'Everything' || selectedWorkspace === 'Shared') return null;
    const ws = data.workspaces.find((w) => w.name === selectedWorkspace);
    return ws?.id != null && ws.id !== '' ? String(ws.id) : null;
  }, [data.workspaces, selectedWorkspace]);

  // Server: workspace-scoped summary → status pills + the current view total.
  const serverScopedSummary = useSafeConvexQuery(
    api.bulk.taskSummaryCounts,
    effectiveTenantId && scopedWorkspaceCountId
      ? { tenantId: effectiveTenantId, workspaceId: scopedWorkspaceCountId, mode: countsMode, preferEstimated: true }
      : 'skip',
    'bulk.taskSummaryCounts',
  );

  // Status pills describe the visible task list, so they include finalized
  // statuses inside the selected finalized-date window.
  const serverStatusSummary = useSafeConvexQuery(
    api.bulk.taskSummaryCounts,
    effectiveTenantId
      ? {
          tenantId: effectiveTenantId,
          ...(scopedWorkspaceCountId ? { workspaceId: scopedWorkspaceCountId } : {}),
          mode: statusPillMode,
          ...(statusPillMode === 'recent' && recentFinishedSince != null ? { recentFinishedSince } : {}),
          preferEstimated: true,
        }
      : 'skip',
    'bulk.taskSummaryCounts',
  );

  const serverViewSummary = scopedWorkspaceCountId ? serverScopedSummary : serverAllSummary;
  // The server query has no text-search term, so when searching we rely on the cache.
  const serverCountsUsable = selectedWorkspace !== 'Shared' && !searchActiveForCounts;
  const serverStatusCountsUsable = serverCountsUsable && serverStatusSummary?.exact === true;

  // Cache counts apply for any non-"Shared" view without memory-only filters. This is
  // deliberately NOT gated on online/pending state (unlike the SQL list path) so the
  // counts still hydrate from the on-disk cache on reload and while offline.
  const canUseCacheCounts = selectedWorkspace !== 'Shared'
    && filters.categoryIds.length === 0
    && filters.priorities.length === 0
    && filters.assignees.length === 0
    && filters.flagColors.length === 0
    && filters.tags.length === 0;

  const cacheCountsKey = useMemo(() => {
    if (!canUseCacheCounts || !effectiveTenantId) return '';
    return JSON.stringify({
      tenantId: effectiveTenantId,
      workspaceId: sqlFilterWorkspaceId ?? null,
      excludeStatuses: countExcludeStatuses,
      statusPillMode,
      recentFinishedSince: statusPillMode === 'recent' ? recentFinishedSince : null,
      search: searchQuery.trim().toLowerCase(),
      cacheVersion: taskCacheVersion,
    });
  }, [canUseCacheCounts, countExcludeStatuses, effectiveTenantId, recentFinishedSince, sqlFilterWorkspaceId, searchQuery, statusPillMode, taskCacheVersion]);

  const [cacheCounts, setCacheCounts] = useState<{
    key: string;
    byWorkspace: Map<string | number, number>;
    byStatus: Map<string, number>;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!cacheCountsKey || !effectiveTenantId) {
      setCacheCounts(null);
      return;
    }
    let cancelled = false;
    const search = searchQuery.trim();
    const buckets: DB.TaskCacheBucket[] = ['live'];
    const statusPillSummaryArgs = statusPillMode === 'recent'
      ? {
          tenantId: effectiveTenantId,
          buckets,
          workspaceId: sqlFilterWorkspaceId ?? undefined,
          recentFinishedStatuses: finishedStatusNames,
          recentFinishedSince,
          search,
        }
      : {
          tenantId: effectiveTenantId,
          buckets,
          workspaceId: sqlFilterWorkspaceId ?? undefined,
          search,
        };
    Promise.all([
      // Sidebar: per-workspace counts across all workspaces (no workspace filter).
      DB.queryTaskCacheSummary({ tenantId: effectiveTenantId, buckets, excludeStatuses: countExcludeStatuses, search }),
      // Status pills: scoped to the selected workspace and aligned to the visible
      // finalized-task window.
      DB.queryTaskCacheSummary(statusPillSummaryArgs),
    ])
      .then(([allSummary, scopedSummary]) => {
        if (cancelled) return;
        const byWorkspace = new Map<string | number, number>();
        for (const workspace of workspaceObjects) {
          const wsId = workspace?.id;
          const convexId = (workspace as any)?._id;
          const count = (wsId != null ? allSummary.byWorkspace[String(wsId)] : undefined)
            ?? (convexId != null ? allSummary.byWorkspace[String(convexId)] : undefined)
            ?? 0;
          if (wsId != null && wsId !== '') {
            byWorkspace.set(wsId, count);
            byWorkspace.set(String(wsId), count);
          }
          if (convexId != null && convexId !== '') byWorkspace.set(String(convexId), count);
        }
        const byStatus = new Map<string, number>();
        for (const entry of Object.values(scopedSummary.byStatus)) {
          if (entry && typeof entry.name === 'string') byStatus.set(entry.name.toLowerCase(), entry.count);
        }
        setCacheCounts({ key: cacheCountsKey, byWorkspace, byStatus, total: allSummary.total });
      })
      .catch(() => {
        if (!cancelled) setCacheCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheCountsKey, countExcludeStatuses, effectiveTenantId, finishedStatusNames, recentFinishedSince, searchQuery, sqlFilterWorkspaceId, statusPillMode, workspaceObjects]);

  const resolvedCacheCounts = cacheCounts?.key === cacheCountsKey ? cacheCounts : null;
  // Only trust the cache result when it actually has data, OR when there is nothing in
  // memory to fall back to. Otherwise an empty cache (e.g. not yet written after a cold
  // reload) would pin every count to zero even after the network data has loaded.
  const activeCacheCounts = resolvedCacheCounts != null
    && (resolvedCacheCounts.total > 0 || allMappedTasks.length === 0)
    ? resolvedCacheCounts
    : null;

  // ---- Server counts (source of truth), built from the reactive summaries ----
  const serverWorkspaceTaskCounts = useMemo(() => {
    if (!serverCountsUsable) return null;
    const byWorkspace = serverAllSummary?.byWorkspace;
    if (!byWorkspace) return null;
    // Override the selected workspace's entry with its scoped view total, so the
    // sidebar number for the active workspace equals its status-pill sum / header.
    const scopedTotal = (scopedWorkspaceCountId && serverScopedSummary && typeof serverScopedSummary.total === 'number')
      ? serverScopedSummary.total
      : null;
    const counts = new Map<string | number, number>();
    for (const workspace of workspaceObjects) {
      const convexId = (workspace as any)?._id;
      const wsId = workspace?.id;
      let count = (convexId != null ? byWorkspace[String(convexId)] : undefined) ?? 0;
      if (scopedTotal != null && wsId != null && String(wsId) === scopedWorkspaceCountId) {
        count = scopedTotal;
      }
      if (wsId != null && wsId !== '') {
        counts.set(wsId, count);
        counts.set(String(wsId), count);
      }
      if (convexId != null && convexId !== '') counts.set(String(convexId), count);
    }
    return counts.size > 0 ? counts : null;
  }, [serverCountsUsable, serverAllSummary, serverScopedSummary, scopedWorkspaceCountId, workspaceObjects]);

  const serverTaskStatusCounts = useMemo(() => {
    if (!serverStatusCountsUsable) return null;
    const byStatus = serverStatusSummary?.byStatus;
    if (!byStatus) return null;
    const counts = new Map<string, number>();
    for (const entry of Object.values(byStatus) as Array<{ name?: string; count?: number }>) {
      if (entry && typeof entry.name === 'string') counts.set(entry.name.toLowerCase(), entry.count ?? 0);
    }
    // Empty byStatus = large-tenant materialized fallback on the server; fall through
    // to the cache so the pills still show (best-effort) counts.
    return counts.size > 0 ? counts : null;
  }, [serverStatusCountsUsable, serverStatusSummary]);

  const serverAllTotal = (serverCountsUsable && serverAllSummary && typeof serverAllSummary.total === 'number')
    ? serverAllSummary.total
    : null;

  // ---- Combine: server (truth) → cache (fast/offline) → in-memory (last resort) ----
  const taskUniverseCount = serverAllTotal != null
    ? serverAllTotal
    : allMappedTasks.length > 0
      ? liveTaskUniverseCount
      : activeCacheCounts
        ? activeCacheCounts.total
        : liveTaskUniverseCount;

  const workspaceTaskCounts = useMemo(() => {
    if (serverWorkspaceTaskCounts) return serverWorkspaceTaskCounts;
    if (allMappedTasks.length > 0) return liveWorkspaceTaskCounts;
    if (activeCacheCounts) return activeCacheCounts.byWorkspace;
    return liveWorkspaceTaskCounts;
  }, [serverWorkspaceTaskCounts, allMappedTasks.length, activeCacheCounts, liveWorkspaceTaskCounts]);

  const taskStatusCounts = useMemo(() => {
    if (serverTaskStatusCounts) return serverTaskStatusCounts;
    if (activeCacheCounts && allMappedTasks.length === 0) return activeCacheCounts.byStatus;
    const counts = new Map<string, number>();
    const source = searchActiveForCounts
      ? wsFilteredTasks.filter((task) => taskMatchesSearchQuery(task, searchQuery))
      : wsFilteredTasks;
    for (const task of source) {
      const key = task.status.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [serverTaskStatusCounts, activeCacheCounts, allMappedTasks.length, searchActiveForCounts, searchQuery, wsFilteredTasks]);

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
    const presentStatusNames = new Set(wsFiltered.map((task) => task.status.toLowerCase()).filter(Boolean));

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

    return statuses.filter((s) => statusIds.has(s.id) || presentStatusNames.has(s.name.toLowerCase()));
  }, [categoryStatusIdsMap, statuses, wsFilteredTasks]);

  useEffect(() => {
    // Finished tasks flow through the normal list query, scoped by the selected
    // finalized-date window or the full history when "All" is selected.
    setTaskQuery({
      mode: taskListMode,
      recentFinishedSince: taskListMode === 'recent' ? recentFinishedSince : undefined,
      archiveEnabled: false,
    });
  }, [recentFinishedSince, setTaskQuery, taskListMode]);

  const prevFinishedWindowRef = useRef(finalizedTaskWindowValue);
  useEffect(() => {
    if (prevFinishedWindowRef.current !== finalizedTaskWindowValue) {
      setVisibleCount(PAGE_SIZE);
      prevFinishedWindowRef.current = finalizedTaskWindowValue;
    }
  }, [finalizedTaskWindowValue]);

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

  const prevSearchRef = useRef(searchQuery);
  useEffect(() => {
    if (prevSearchRef.current !== searchQuery) {
      setVisibleCount(PAGE_SIZE);
      prevSearchRef.current = searchQuery;
    }
  }, [searchQuery]);

  const tasks = useMemo(() => filteredTasks.slice(0, visibleCount), [filteredTasks, visibleCount]);
  const totalTaskCount = activeSqlFilteredState
    ? Math.max(activeSqlFilteredState.total, filteredTasks.length)
    : filteredTasks.length;
  const hasMoreTasks = visibleCount < totalTaskCount || (!activeSqlFilteredState && hasMoreTaskRows);
  const isTaskListLoading = !activeSqlFilteredState && isTaskPageLoading;
  const isTaskListIncomplete = !activeSqlFilteredState && isTaskPageIncomplete;

  const loadMoreTasks = useCallback(() => {
    if (visibleCount < totalTaskCount) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, totalTaskCount));
      return;
    }
    if (!activeSqlFilteredState && hasMoreTaskRows) {
      loadMoreTaskRows();
    }
  }, [activeSqlFilteredState, hasMoreTaskRows, loadMoreTaskRows, totalTaskCount, visibleCount]);

  useEffect(() => {
    if (activeSqlFilteredState || !hasMoreTaskRows) return;
    if (filteredTasks.length >= visibleCount) return;
    loadMoreTaskRows();
  }, [activeSqlFilteredState, filteredTasks.length, hasMoreTaskRows, loadMoreTaskRows, visibleCount]);

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
    if (currentTask && isTaskStatusLockedByApproval(currentTask)) {
      Alert.alert(t('taskDetail.statusLockedByApprovalTitle'), t('taskDetail.statusLockedByApprovalBody'));
      return;
    }

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
  }, [finalStatus, data.statuses, patchTaskMutation, setTimedOverride, allMappedTaskMap, statusConvexIdMap, resolveTenantIdForTask, isSharedOnlyTask, isTaskStatusLockedByApproval, t]);

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

    const template = args.templateConvexId
      ? data.templates.find((t: any) => String((t as any)._id) === String(args.templateConvexId))
      : null;
    if (template) {
      const templateClass = (template as any).template_class ?? (template as any).templateClass;
      if (templateClass === 'announcement') {
        mutationArgs.slaId = null;
      }
    }

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
      if (currentTask.shareId || isSharedOnlyTask(currentTask)) {
        return false;
      }

      if (isTaskStatusLockedByApproval(currentTask)) {
        Alert.alert(t('taskDetail.statusLockedByApprovalTitle'), t('taskDetail.statusLockedByApprovalBody'));
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

    const revertStatusOverride = () => {
      const originalTask = currentTask ?? allMappedTaskMap.get(taskKey);
      if (!originalTask) return;
      setTimedOverride(taskKey, {
        status: originalTask.status,
        statusColor: originalTask.statusColor,
        statusId: originalTask.statusId,
        statusIcon: originalTask.statusIcon,
        statusAction: originalTask.statusAction,
      });
    };

    const handleStatusMutationError = (err: any) => {
      revertStatusOverride();
      const message = err?.message || t('errors.noPermissionChangeStatus');
      Alert.alert(t('common.error'), message);
    };

    if (hasConvexMutationTarget) {
      patchTaskMutation({
        tenantId: mutationTenantId,
        id: taskConvexId as any,
        statusId: statusConvexId as any,
      }).catch((err: any) => {
        handleStatusMutationError(err);
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
      handleStatusMutationError(err);
    });
    return true;
  }, [data.statuses, data.tasks, patchTaskMutation, patchTaskByPgIdMutation, allMappedTaskMap, statusConvexIdMap, getAllowedStatuses, isSharedOnlyTask, isTaskStatusLockedByApproval, myTaskIds, setTimedOverride, resolveTenantIdForTask, t]);

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
    const currentTask = allMappedTaskMap.get(taskKey);
    if (currentTask && isTaskStatusLockedByApproval(currentTask)) {
      Alert.alert(t('taskDetail.statusLockedByApprovalTitle'), t('taskDetail.statusLockedByApprovalBody'));
      return;
    }

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
  }, [finalStatus, data.statuses, data.tasks, patchTaskMutation, patchTaskByPgIdMutation, allMappedTaskMap, statusConvexIdMap, setTimedOverride, resolveTenantIdForTask, isTaskStatusLockedByApproval, t]);

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
      taskListMode,
      taskUniverseCount,
      totalTaskCount,
      loadMoreTasks,
      hasMoreTasks,
      isTaskListLoading,
      isTaskListIncomplete,
      activeTask,
      workingTasks,
      cardDensity,
      compactCards,
      selectedWorkspace,
      workspaces,
      workspaceObjects,
      workspaceTaskCounts,
      taskStatusCounts,
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
      finalizedTaskWindowValue,
      finalizedTaskWindowOptions: FINALIZED_TASK_WINDOW_OPTIONS,
      setFinalizedTaskWindowValue,
      setSelectedWorkspace,
      filters,
      setFilters,
      searchQuery,
      setSearchQuery,
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
      taskListMode,
      taskUniverseCount,
      totalTaskCount,
      loadMoreTasks,
      hasMoreTasks,
      isTaskListLoading,
      isTaskListIncomplete,
      activeTask,
      workingTasks,
      cardDensity,
      compactCards,
      selectedWorkspace,
      workspaces,
      workspaceObjects,
      workspaceTaskCounts,
      taskStatusCounts,
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
      finalizedTaskWindowValue,
      setFinalizedTaskWindowValue,
      filters,
      searchQuery,
      setSearchQuery,
      hasActiveFilters,
      wsFilteredTasks,
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
