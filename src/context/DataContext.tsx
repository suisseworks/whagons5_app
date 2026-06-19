/**
 * DataContext – Provides live data from Convex to the entire app.
 *
 * Replaces the old NDJSON sync + SQLite cache with Convex reactive queries.
 * All data is automatically live – no manual sync, no pull-to-refresh needed.
 *
 * The SyncedData shape and useData() hook are preserved so TaskContext and
 * all downstream components work without changes.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useConvex, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useNetwork } from './NetworkContext';
import { useAuth } from './AuthContext';
import * as DB from '../store/database';

// ---------------------------------------------------------------------------
// Types (preserved from original – downstream code depends on these)
// ---------------------------------------------------------------------------

export interface SyncedTask {
  id: number | string;
  name: string;
  description?: string | null;
  workspace_id?: number | string | null;
  category_id?: number | string | null;
  status_id?: number | string | null;
  priority_id?: number | string | null;
  spot_id?: number | string | null;
  template_id?: number | string | null;
  created_by?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedWorkspace {
  id: number | string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  [key: string]: unknown;
}

export interface SyncedStatus {
  id: number | string;
  name: string;
  color?: string | null;
  category_id?: number | string | null;
  initial?: boolean;
  final?: boolean;
  [key: string]: unknown;
}

export interface SyncedPriority {
  id: number | string;
  name: string;
  color?: string | null;
  category_id?: number | string | null;
  [key: string]: unknown;
}

export interface SyncedCategory {
  id: number | string;
  name: string;
  color?: string | null;
  status_transition_group_id?: number | string | null;
  [key: string]: unknown;
}

export interface SyncedStatusTransitionGroup {
  id: number | string;
  name: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface SyncedStatusTransition {
  id: number | string;
  status_transition_group_id: number | string;
  from_status: number | string;
  to_status: number | string;
  initial?: boolean;
  [key: string]: unknown;
}

export interface SyncedSpot {
  id: number | string;
  name: string;
  alias?: string | null;
  parent_id?: number | string | null;
  spot_type_id?: number | string | null;
  is_branch?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  cleaning_status_id?: number | string | null;
  current_cleaning_task_id?: number | string | null;
  last_cleaned_by?: number | string | null;
  last_cleaned_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedSpotType {
  id: number | string;
  name: string;
  color?: string | null;
  [key: string]: unknown;
}

export interface SyncedUser {
  id: number | string;
  name: string;
  email?: string;
  url_picture?: string | null;
  [key: string]: unknown;
}

export interface SyncedTeam {
  id: number | string;
  name: string;
  [key: string]: unknown;
}

export interface SyncedTag {
  id: number | string;
  name: string;
  color?: string | null;
  icon?: string | null;
  [key: string]: unknown;
}

export interface SyncedTaskFlag {
  id: number | string;
  task_id: number | string;
  user_id: number | string;
  color: string;
  [key: string]: unknown;
}

export interface SyncedTaskUser {
  id: number | string;
  task_id: number | string;
  user_id: number | string;
  [key: string]: unknown;
}

export interface SyncedTaskTag {
  id: number | string;
  task_id: number | string;
  tag_id: number | string;
  [key: string]: unknown;
}

export interface SyncedBoard {
  id: number | string;
  name: string;
  description?: string | null;
  visibility: 'public' | 'private';
  birthday_messages_enabled?: boolean;
  birthday_message_template?: string | null;
  created_by: number | string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedBoardMember {
  id: number | string;
  board_id: number | string;
  member_type: 'user' | 'team';
  member_id: number | string;
  role: 'admin' | 'member';
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedBoardMessage {
  id: number | string;
  board_id: number | string;
  created_by: number | string;
  title?: string | null;
  content?: string | null;
  is_pinned: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
  source_type?: string | null;
  source_id?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedTemplate {
  id: number | string;
  name: string;
  form_id?: number | string | null;
  [key: string]: unknown;
}

export interface SyncedForm {
  id: number | string;
  name: string;
  description?: string | null;
  current_version_id?: number | string | null;
  [key: string]: unknown;
}

export interface SyncedFormVersion {
  id: number | string;
  form_id: number | string;
  version: number;
  fields?: string | Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SyncedTaskForm {
  id: number | string;
  task_id: number | string;
  form_version_id: number | string;
  data?: string | Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SyncedConversation {
  id: number | string;
  uuid?: string;
  type: 'dm' | 'group';
  name: string | null;
  avatar_url: string | null;
  created_by: number | string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedConversationParticipant {
  id: number | string;
  conversation_id: number | string;
  user_id: number | string;
  last_read_at: string | null;
  is_muted: boolean;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedDirectMessage {
  id: number | string;
  uuid?: string;
  conversation_id: number | string;
  user_id: number | string;
  message: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedMessageReaction {
  id: number | string;
  message_id: number | string;
  user_id: number | string;
  emoji: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedLinkPreview {
  id: number | string;
  message_id: number | string | null;
  workspace_chat_id: number | string | null;
  url: string;
  url_hash: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  favicon_url: string | null;
  type: string | null;
  status: 'pending' | 'fetched' | 'failed';
  [key: string]: unknown;
}

export interface SyncedWorkspaceChat {
  id: number | string;
  uuid?: string;
  workspace_id: number | string;
  message: string;
  user_id: number | string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedKpiCard {
  id: number | string;
  name: string;
  type: string;
  query_config: string | Record<string, unknown>;
  display_config: string | Record<string, unknown>;
  workspace_id?: number | string | null;
  user_id?: number | string | null;
  position: number;
  is_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedPlugin {
  id: number | string;
  slug: string;
  name: string;
  description?: string | null;
  version?: string;
  is_enabled: boolean;
  settings?: string | Record<string, unknown> | null;
  category_ids?: (number | string)[] | string;
  [key: string]: unknown;
}

export interface SyncedData {
  tasks: SyncedTask[];
  workspaces: SyncedWorkspace[];
  statuses: SyncedStatus[];
  priorities: SyncedPriority[];
  categories: SyncedCategory[];
  statusTransitionGroups: SyncedStatusTransitionGroup[];
  statusTransitions: SyncedStatusTransition[];
  spots: SyncedSpot[];
  spotTypes: SyncedSpotType[];
  users: SyncedUser[];
  teams: SyncedTeam[];
  tags: SyncedTag[];
  taskUsers: SyncedTaskUser[];
  taskTags: SyncedTaskTag[];
  taskFlags: SyncedTaskFlag[];
  boards: SyncedBoard[];
  boardMembers: SyncedBoardMember[];
  boardMessages: SyncedBoardMessage[];
  templates: SyncedTemplate[];
  forms: SyncedForm[];
  formVersions: SyncedFormVersion[];
  taskForms: SyncedTaskForm[];
  conversations: SyncedConversation[];
  conversationParticipants: SyncedConversationParticipant[];
  directMessages: SyncedDirectMessage[];
  messageReactions: SyncedMessageReaction[];
  linkPreviews: SyncedLinkPreview[];
  workspaceChat: SyncedWorkspaceChat[];
  kpiCards: SyncedKpiCard[];
  plugins: SyncedPlugin[];
}

export interface TaskQueryOptions {
  workspaceId?: string;
  mode?: 'hot' | 'recent' | 'all' | 'archive' | 'olderFinalized';
  recentFinishedSince?: number | null;
  statusIds?: string[];
  archiveEnabled?: boolean;
}

interface DataContextType {
  data: SyncedData;
  sharedTaskIds: Set<number | string>;
  sharedCount: number;
  rawSharedToMe: any[] | undefined;
  approvals: any[];
  approvalApprovers: any[];
  taskApprovalInstances: any[];
  userTeams: any[];
  roles: any[];
  isSyncing: boolean;
  hasEverSynced: boolean;
  syncError: string | null;
  syncProgress: number | null;
  isInitialSync: boolean;
  hasMoreTaskRows: boolean;
  isTaskPageLoading: boolean;
  isTaskPageIncomplete: boolean;
  isArchiveSyncing: boolean;
  isArchiveIncomplete: boolean;
  taskCacheVersion: number;
  loadMoreTaskRows: () => void;
  setTaskQuery: (query: TaskQueryOptions) => void;
  refresh: () => Promise<void>;
  forceResync: () => Promise<void>;
  dataManager: null;
}

const EMPTY: any[] = [];

const EMPTY_DATA: SyncedData = {
  tasks: [],
  workspaces: [],
  statuses: [],
  priorities: [],
  categories: [],
  statusTransitionGroups: [],
  statusTransitions: [],
  spots: [],
  spotTypes: [],
  users: [],
  teams: [],
  tags: [],
  taskUsers: [],
  taskTags: [],
  taskFlags: [],
  boards: [],
  boardMembers: [],
  boardMessages: [],
  templates: [],
  forms: [],
  formVersions: [],
  taskForms: [],
  conversations: [],
  conversationParticipants: [],
  directMessages: [],
  messageReactions: [],
  linkPreviews: [],
  workspaceChat: [],
  kpiCards: [],
  plugins: [],
};

// ---------------------------------------------------------------------------
// Convex doc → legacy Synced* mapper
// ---------------------------------------------------------------------------
// Convex docs use _id (string) + camelCase fields.
// Downstream code expects numeric-like `id` + snake_case fields.
// We map _id → id and camelCase → snake_case where needed.

function mapId(doc: any): any {
  if (!doc) return doc;
  return { ...doc, id: doc.pgId ?? doc._id };
}

function mapIds(docs: any[] | undefined): any[] {
  if (!docs) return EMPTY;
  return docs.map(mapId);
}

function mapApproval(doc: any): any {
  return {
    ...mapId(doc),
    approval_type: doc.approvalType ?? doc.approval_type,
    require_all: doc.requireAll ?? doc.require_all,
    minimum_approvals: doc.minimumApprovals ?? doc.minimum_approvals,
    require_signature: doc.requireSignature ?? doc.require_signature,
    require_rejection_comment: doc.requireRejectionComment ?? doc.require_rejection_comment,
  };
}

function mapApprovalApprover(doc: any): any {
  return {
    ...mapId(doc),
    approval_id: doc.approvalId ?? doc.approval_id,
    approver_type: doc.approverType ?? doc.approver_type,
    approver_id: doc.approverId ?? doc.approver_id,
    order_index: doc.orderIndex ?? doc.order_index,
  };
}

function mapTaskApprovalInstance(doc: any, fk: FkLookups): any {
  const rawTaskId = doc.taskId ?? doc.task_id;
  const rawApprovalId = doc.approvalId ?? doc.approval_id;
  const rawApproverUserId = doc.approverUserId ?? doc.approver_user_id;

  return {
    ...mapId(doc),
    task_id: rawTaskId ? (resolveFk(fk.tasks, rawTaskId) ?? rawTaskId) : rawTaskId,
    approval_id: rawApprovalId ? (resolveFk(fk.approvals, rawApprovalId) ?? rawApprovalId) : rawApprovalId,
    approver_user_id: rawApproverUserId ? (resolveFk(fk.users, rawApproverUserId) ?? rawApproverUserId) : rawApproverUserId,
    source_approver_id: doc.sourceApproverId ?? doc.source_approver_id,
    order_index: doc.orderIndex ?? doc.order_index,
    is_required: doc.isRequired ?? doc.is_required,
    response_comment: doc.responseComment ?? doc.response_comment,
    responded_at: doc.respondedAt ?? doc.responded_at,
    signature_storage_id: doc.signatureStorageId ?? doc.signature_storage_id,
  };
}

/**
 * Build a lookup map from Convex _id → pgId for a set of docs.
 * Used to resolve FK references on tasks from Convex _id strings to pgId numbers.
 */
function buildPgLookup(docs: any[] | undefined): Map<string, any> {
  const m = new Map<string, any>();
  if (!docs) return m;
  for (const doc of docs) {
    m.set(doc._id, doc.pgId ?? doc._id);
  }
  return m;
}

/** Resolve a FK Convex _id to the target's pgId (or return as-is if not found). */
function resolveFk(lookup: Map<string, any>, convexId: any): any {
  if (!convexId) return null;
  return lookup.get(convexId) ?? convexId;
}

/** FK lookup maps for resolving FK fields from Convex _id → pgId */
interface FkLookups {
  workspaces: Map<string, any>;
  categories: Map<string, any>;
  statuses: Map<string, any>;
  priorities: Map<string, any>;
  spots: Map<string, any>;
  templates: Map<string, any>;
  users: Map<string, any>;
  tasks: Map<string, any>;
  tags: Map<string, any>;
  statusTransitionGroups: Map<string, any>;
  forms: Map<string, any>;
  formVersions: Map<string, any>;
  approvals: Map<string, any>;
}

/** Map a Convex task doc to the SyncedTask shape, resolving FK fields to pgIds */
function mapTask(doc: any, fk: FkLookups): SyncedTask {
  const activeWorkspaceContext = doc.activeWorkspaceContext ?? doc.active_workspace_context ?? null;
  const contextWorkspaceId = activeWorkspaceContext?.workspaceId ?? activeWorkspaceContext?.workspace_id ?? null;
  const sourceWorkspaceId = resolveFk(fk.workspaces, doc.workspaceId);
  const overlayWorkspaceId = contextWorkspaceId ? resolveFk(fk.workspaces, contextWorkspaceId) : sourceWorkspaceId;

  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    source_workspace_id: sourceWorkspaceId,
    workspace_id: overlayWorkspaceId,
    category_id: resolveFk(fk.categories, doc.categoryId),
    status_id: resolveFk(fk.statuses, doc.statusId),
    priority_id: resolveFk(fk.priorities, doc.priorityId),
    approval_id: resolveFk(fk.approvals, doc.approvalId) ?? doc.approvalId ?? null,
    spot_id: resolveFk(fk.spots, doc.spotId),
    template_id: resolveFk(fk.templates, doc.templateId),
    created_by: resolveFk(fk.users, doc.createdBy),
    deleted_at: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    completed_at: doc.completedAt ? new Date(doc.completedAt).toISOString() : null,
    created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : (doc._creationTime ? new Date(doc._creationTime).toISOString() : null),
    updated_at: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : (doc._creationTime ? new Date(doc._creationTime).toISOString() : null),
  };
}

function mapStatus(doc: any, fk: FkLookups): SyncedStatus {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    category_id: resolveFk(fk.categories, doc.categoryId),
    initial: doc.initial ?? false,
    final: doc.final ?? false,
  };
}

function mapPriority(doc: any, fk: FkLookups): SyncedPriority {
  return { ...doc, id: doc.pgId ?? doc._id, category_id: resolveFk(fk.categories, doc.categoryId) };
}

function mapCategory(doc: any, fk: FkLookups): SyncedCategory {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    status_transition_group_id: resolveFk(fk.statusTransitionGroups, doc.statusTransitionGroupId),
  };
}

function mapStatusTransitionGroup(doc: any): SyncedStatusTransitionGroup {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    is_default: doc.isDefault ?? false,
    is_active: doc.isActive ?? false,
  };
}

function mapStatusTransition(doc: any, fk: FkLookups): SyncedStatusTransition {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    status_transition_group_id: resolveFk(fk.statusTransitionGroups, doc.statusTransitionGroupId),
    from_status: resolveFk(fk.statuses, doc.fromStatus),
    to_status: resolveFk(fk.statuses, doc.toStatus),
    initial: doc.initial ?? false,
  };
}

function mapTemplate(doc: any, fk: FkLookups): SyncedTemplate {
  return {
    ...doc,
    _id: doc._id,
    id: doc.pgId ?? doc._id,
    category_id: resolveFk(fk.categories, doc.categoryId),
    priority_id: resolveFk(fk.priorities, doc.priorityId),
    form_id: resolveFk(fk.forms, doc.formId) ?? doc.formId ?? null,
    approval_id: resolveFk(fk.approvals, doc.approvalId) ?? doc.approvalId ?? null,
  };
}

function mapForm(doc: any): SyncedForm {
  return { ...doc, id: doc.pgId ?? doc._id, current_version_id: doc.currentVersionId ?? null };
}

function mapFormVersion(doc: any): SyncedFormVersion {
  return { ...doc, id: doc.pgId ?? doc._id, form_id: doc.formId, version: doc.version ?? 0 };
}

function mapTaskUser(doc: any, fk: FkLookups): SyncedTaskUser {
  const rawTaskId = doc.taskId ?? doc.task_id;
  const rawUserId = doc.userId ?? doc.user_id;

  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: rawTaskId ? resolveFk(fk.tasks, rawTaskId) : rawTaskId,
    user_id: rawUserId ? resolveFk(fk.users, rawUserId) : rawUserId,
  };
}

function mapTaskTag(doc: any, fk: FkLookups): SyncedTaskTag {
  const rawTaskId = doc.taskId ?? doc.task_id;
  const rawTagId = doc.tagId ?? doc.tag_id;

  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: rawTaskId ? resolveFk(fk.tasks, rawTaskId) : rawTaskId,
    tag_id: rawTagId ? resolveFk(fk.tags, rawTagId) : rawTagId,
  };
}

function mapTaskForm(doc: any, fk?: FkLookups): SyncedTaskForm {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: fk?.tasks ? (resolveFk(fk.tasks, doc.taskId) ?? doc.taskId) : doc.taskId,
    form_version_id: fk?.formVersions ? (resolveFk(fk.formVersions, doc.formVersionId) ?? doc.formVersionId) : doc.formVersionId,
  };
}

function mapUser(doc: any): SyncedUser {
  return { ...doc, id: doc.pgId ?? doc._id, url_picture: doc.urlPicture ?? null };
}

function mapBoard(doc: any): SyncedBoard {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    created_by: doc.createdBy,
    birthday_messages_enabled: doc.birthdayMessagesEnabled ?? false,
    birthday_message_template: doc.birthdayMessageTemplate ?? null,
    deleted_at: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
  };
}

function mapBoardMember(doc: any): SyncedBoardMember {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    board_id: doc.boardId,
    member_type: doc.memberType,
    member_id: doc.memberId,
  };
}

function mapBoardMessage(doc: any): SyncedBoardMessage {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    board_id: doc.boardId,
    created_by: doc.createdBy,
    is_pinned: doc.isPinned ?? false,
    starts_at: doc.startsAt ? new Date(doc.startsAt).toISOString() : null,
    ends_at: doc.endsAt ? new Date(doc.endsAt).toISOString() : null,
    source_type: doc.sourceType ?? null,
    source_id: doc.sourceId ?? null,
    deleted_at: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
  };
}

function mapConversation(doc: any, fk: FkLookups): SyncedConversation {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    created_by: resolveFk(fk.users, doc.createdBy),
    avatar_url: doc.avatarUrl ?? null,
    last_message_at: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : null,
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

function mapConversationParticipant(doc: any, fk: FkLookups & { conversations: Map<string, any> }): SyncedConversationParticipant {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    conversation_id: resolveFk(fk.conversations, doc.conversationId),
    user_id: resolveFk(fk.users, doc.userId),
    last_read_at: doc.lastReadAt ? new Date(doc.lastReadAt).toISOString() : null,
    is_muted: doc.isMuted ?? false,
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

function mapDirectMessage(doc: any, fk: FkLookups & { conversations: Map<string, any> }): SyncedDirectMessage {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    conversation_id: resolveFk(fk.conversations, doc.conversationId),
    user_id: resolveFk(fk.users, doc.userId),
    status: doc.status ?? 'sent',
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

function mapMessageReaction(doc: any, fk: FkLookups): SyncedMessageReaction {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    message_id: doc.messageId,
    user_id: resolveFk(fk.users, doc.userId),
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

function mapLinkPreview(doc: any): SyncedLinkPreview {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    message_id: doc.directMessageId ?? doc.messageId ?? null,
    workspace_chat_id: doc.workspaceChatId ?? null,
    url_hash: doc.urlHash ?? '',
    image_url: doc.imageUrl ?? null,
    site_name: doc.siteName ?? null,
    favicon_url: doc.faviconUrl ?? null,
  };
}

function mapWorkspaceChat(doc: any, fk: FkLookups): SyncedWorkspaceChat {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    workspace_id: resolveFk(fk.workspaces, doc.workspaceId),
    user_id: resolveFk(fk.users, doc.userId),
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

function mapKpiCard(doc: any): SyncedKpiCard {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    query_config: doc.queryConfig ?? doc.query_config ?? {},
    display_config: doc.displayConfig ?? doc.display_config ?? {},
    workspace_id: doc.workspaceId ?? doc.workspace_id ?? null,
    user_id: doc.userId ?? doc.user_id ?? null,
    is_enabled: doc.isEnabled ?? doc.is_enabled ?? true,
    position: doc.position ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DataContext = createContext<DataContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// SQLite table names for offline cache
// ---------------------------------------------------------------------------

const SQLITE_TABLES: (keyof SyncedData)[] = [
  'tasks', 'workspaces', 'statuses', 'priorities', 'categories',
  'statusTransitionGroups', 'statusTransitions', 'spots', 'spotTypes',
  'users', 'teams', 'tags', 'taskUsers', 'taskTags', 'taskFlags',
  'boards', 'boardMembers', 'boardMessages', 'templates', 'forms',
  'formVersions', 'taskForms', 'conversations', 'conversationParticipants',
  'directMessages', 'messageReactions', 'linkPreviews', 'workspaceChat',
  'kpiCards', 'plugins',
];

const GENERIC_SQLITE_TABLES = SQLITE_TABLES.filter((table) => table !== 'tasks');

const TASKS_PAGE_SIZE = 512;
const ARCHIVE_PAGE_SIZE = 200;
const TASK_ARCHIVE_SYNC_VERSION = 12;

function readIdArray(value: unknown): Array<string | number> {
  if (Array.isArray(value)) return value.filter((item) => item != null) as Array<string | number>;
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item != null) : [];
  } catch {
    return [];
  }
}

function addSearchValue(parts: string[], value: unknown) {
  if (value == null || value === '') return;
  parts.push(String(value).toLowerCase());
}

function isFinishedStatusDoc(status: any): boolean {
  const action = String(status?.action ?? '').toUpperCase();
  const name = String(status?.name ?? '').trim().toLowerCase();
  return status?.final === true
    || action === 'FINISHED'
    || action === 'DONE'
    || action === 'COMPLETED'
    || name === 'finalizado'
    || name === 'finalizada'
    || name === 'finalizadas'
    || name === 'finished'
    || name === 'done'
    || name === 'completed'
    || name === 'completado'
    || name === 'completada';
}

/** Persist an array of mapped docs to SQLite (fire-and-forget). */
function persistToSqlite(table: string, rows: any[]) {
  if (!rows || rows.length === 0) return;
  const dbRows = rows.map((r) => ({
    id: String(r.id ?? r._id ?? ''),
    record: r,
  }));
  DB.upsertRows(table, dbRows).catch(() => {});
}

/** Load a table from SQLite and return parsed rows. */
async function loadFromSqlite<T = any>(table: string): Promise<T[]> {
  try {
    return await DB.getAllRows<T>(table);
  } catch {
    return [];
  }
}

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenantId } = useTenant();
  const { token } = useAuth();
  const { isOnline } = useNetwork();
  const convex = useConvex();
  const activeTenantId = token ? tenantId : null;
  const skipArgs = !activeTenantId ? 'skip' as const : undefined;
  const [taskQuery, setTaskQueryState] = useState<TaskQueryOptions>({ mode: 'hot' });
  const taskStatusIdsKey = (taskQuery.statusIds ?? []).join('|');
  const [taskCacheVersion, setTaskCacheVersion] = useState(0);
  const [archiveSyncState, setArchiveSyncState] = useState<{
    key: string;
    syncing: boolean;
    incomplete: boolean;
  }>({ key: '', syncing: false, incomplete: false });

  const setTaskQuery = useCallback((query: TaskQueryOptions) => {
    setTaskQueryState((prev) => {
      const prevStatusIds = prev.statusIds ?? [];
      const nextStatusIds = query.statusIds ?? [];
      const sameStatusIds = prevStatusIds.length === nextStatusIds.length
        && prevStatusIds.every((id, index) => id === nextStatusIds[index]);
      const nextMode = query.mode ?? 'hot';
      if (
        prev.workspaceId === query.workspaceId
        && prev.mode === nextMode
        && prev.recentFinishedSince === query.recentFinishedSince
        && prev.archiveEnabled === query.archiveEnabled
        && sameStatusIds
      ) return prev;
      return {
        workspaceId: query.workspaceId,
        mode: nextMode,
        recentFinishedSince: query.recentFinishedSince,
        statusIds: nextStatusIds.length > 0 ? nextStatusIds : undefined,
        archiveEnabled: query.archiveEnabled === true,
      };
    });
  }, []);

  // SQLite-hydrated data (loaded once on mount, replaced when Convex arrives)
  const [cachedData, setCachedData] = useState<SyncedData | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const hydrationTenantRef = useRef<string | null>(null);

  // Hydrate from SQLite on mount / tenant change
  useEffect(() => {
    if (!activeTenantId) {
      setCachedData(null);
      setCacheLoaded(true);
      return;
    }
    // Only hydrate once per tenant
    if (hydrationTenantRef.current === activeTenantId) return;
    hydrationTenantRef.current = activeTenantId;

    let cancelled = false;
    (async () => {
      try {
        await DB.initDb();
        const results: Partial<SyncedData> = {};
        await Promise.all(
          GENERIC_SQLITE_TABLES.map(async (table) => {
            const rows = await loadFromSqlite(table);
            if (rows.length > 0) {
              (results as any)[table] = rows;
            }
          }),
        );
        if (cancelled) return;
        // Only set cached data if we actually got rows
        const hasData = Object.values(results).some((arr) => (arr as any[]).length > 0);
        if (hasData) {
          setCachedData({ ...EMPTY_DATA, ...results });
        }
      } catch {
        // SQLite init failed — continue without cache
      } finally {
        if (!cancelled) setCacheLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Reference data (bulk query)
  const refData = useQuery(
    api.bulk.allReferenceData,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  const taskQueryArgs = useMemo(() => {
    if (!activeTenantId) return 'skip' as const;
    return {
      tenantId: activeTenantId,
      mode: taskQuery.mode ?? 'hot',
      ...(Number.isFinite(taskQuery.recentFinishedSince ?? NaN) ? { recentFinishedSince: taskQuery.recentFinishedSince } : {}),
      ...(taskQuery.workspaceId ? { workspaceId: taskQuery.workspaceId } : {}),
      ...(taskQuery.statusIds && taskQuery.statusIds.length > 0 ? { statusIds: taskQuery.statusIds } : {}),
    };
  }, [activeTenantId, taskQuery.mode, taskQuery.recentFinishedSince, taskQuery.workspaceId, taskStatusIdsKey]);

  const taskQueryKey = useMemo(() => JSON.stringify({
    tenantId: activeTenantId ?? null,
    mode: taskQuery.mode ?? 'hot',
    recentFinishedSince: taskQuery.recentFinishedSince ?? null,
    workspaceId: taskQuery.workspaceId ?? null,
    statusIds: taskQuery.statusIds ?? [],
  }), [activeTenantId, taskQuery.mode, taskQuery.recentFinishedSince, taskQuery.workspaceId, taskStatusIdsKey]);

  const taskRowsByQueryRef = useRef<Map<string, any[]>>(new Map());
  const lastTaskRowsRef = useRef<any[] | undefined>(undefined);

  // Tasks: use the paginated path so mobile does not hit the legacy 1000-row cap.
  const {
    results: pagedTasks,
    status: tasksStatus,
    loadMore: loadMoreTaskRowsPage,
  } = usePaginatedQuery(
    api.bulk.tasksByWorkspace,
    taskQueryArgs,
    { initialNumItems: TASKS_PAGE_SIZE },
  );

  const hasMoreTaskRows = tasksStatus === 'CanLoadMore';
  const isTaskPageLoading = tasksStatus === 'LoadingFirstPage' || tasksStatus === 'LoadingMore';
  const isTaskPageIncomplete = tasksStatus === 'LoadingFirstPage' || tasksStatus === 'LoadingMore';
  const loadMoreTaskRows = useCallback(() => {
    if (tasksStatus === 'CanLoadMore') {
      loadMoreTaskRowsPage(TASKS_PAGE_SIZE);
    }
  }, [loadMoreTaskRowsPage, tasksStatus]);

  useEffect(() => {
    if (tasksStatus === 'LoadingFirstPage') return;
    taskRowsByQueryRef.current.set(taskQueryKey, pagedTasks);
    lastTaskRowsRef.current = pagedTasks;
  }, [pagedTasks, taskQueryKey, tasksStatus]);

  const rawTasks = tasksStatus === 'LoadingFirstPage'
    ? (taskRowsByQueryRef.current.get(taskQueryKey) ?? lastTaskRowsRef.current)
    : pagedTasks;

  // Pivot data (taskUsers, taskTags)
  const pivotData = useQuery(
    api.bulk.taskPivotData,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Chat data
  const rawConversations = useQuery(
    api.chat.listConversations,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Chat sub-data
  const rawParticipants = useQuery(
    api.chat.listAllParticipants,
    skipArgs ?? { tenantId: activeTenantId! },
  );
  const rawDirectMessages = useQuery(
    api.chat.listAllMessages,
    skipArgs ?? { tenantId: activeTenantId! },
  );
  const rawReactions = useQuery(
    api.chat.listAllReactions,
    skipArgs ?? { tenantId: activeTenantId! },
  );
  const rawLinkPreviews = useQuery(
    api.chat.listAllLinkPreviews,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Boards
  const rawBoards = useQuery(
    api.boards.list,
    skipArgs ?? { tenantId: activeTenantId! },
  );
  const rawBoardMembers = useQuery(
    api.boards.listAllMembers,
    skipArgs ?? { tenantId: activeTenantId! },
  );
  const rawBoardMessages = useQuery(
    api.boards.listAllMessages,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // KPI Cards
  const rawKpiCards = useQuery(
    api.analytics.listKpiCards,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Plugins (powerups)
  const rawPlugins = useQuery(
    api.settings.listPlugins,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Shared tasks
  const rawSharedToMe = useQuery(
    api.taskResources.listSharedToMe,
    skipArgs ?? { tenantId: activeTenantId! },
  );

  // Build the SyncedData object by mapping Convex docs → legacy shape
  const data: SyncedData = useMemo(() => {
    if (!activeTenantId) return EMPTY_DATA;

    // Build FK lookup maps so FK fields resolve from Convex _id → pgId
    const fk: FkLookups = {
      workspaces: buildPgLookup(refData?.workspaces),
      categories: buildPgLookup(refData?.categories),
      statuses: buildPgLookup(refData?.statuses),
      priorities: buildPgLookup(refData?.priorities),
      spots: buildPgLookup(refData?.spots),
      templates: buildPgLookup(refData?.templates),
      users: buildPgLookup(refData?.users),
      tasks: buildPgLookup(rawTasks),
      tags: buildPgLookup(refData?.tags),
      statusTransitionGroups: buildPgLookup(refData?.statusTransitionGroups),
      forms: buildPgLookup(refData?.forms),
      formVersions: buildPgLookup(refData?.formVersions),
      approvals: buildPgLookup(refData?.approvals),
    };

    return {
      tasks: rawTasks ? rawTasks.map((t: any) => mapTask(t, fk)) : EMPTY,

      workspaces: refData ? mapIds(refData.workspaces) : EMPTY,
      statuses: refData ? refData.statuses.map((d: any) => mapStatus(d, fk)) : EMPTY,
      priorities: refData ? refData.priorities.map((d: any) => mapPriority(d, fk)) : EMPTY,
      categories: refData ? refData.categories.map((d: any) => mapCategory(d, fk)) : EMPTY,
      statusTransitionGroups: refData
        ? refData.statusTransitionGroups.map(mapStatusTransitionGroup)
        : EMPTY,
      statusTransitions: refData
        ? refData.statusTransitions.map((d: any) => mapStatusTransition(d, fk))
        : EMPTY,
      spots: refData ? mapIds(refData.spots) : EMPTY,
      spotTypes: EMPTY,
      users: refData ? refData.users.map(mapUser) : EMPTY,
      teams: refData ? mapIds(refData.teams) : EMPTY,
      tags: refData ? mapIds(refData.tags) : EMPTY,
      templates: refData ? refData.templates.map((d: any) => mapTemplate(d, fk)) : EMPTY,
      forms: refData ? refData.forms?.map(mapForm) ?? EMPTY : EMPTY,
      formVersions: refData ? refData.formVersions?.map(mapFormVersion) ?? EMPTY : EMPTY,
      taskForms: refData ? refData.taskForms?.map((d: any) => mapTaskForm(d, fk)) ?? EMPTY : EMPTY,

      taskUsers: pivotData ? pivotData.taskUsers.map((d: any) => mapTaskUser(d, fk)) : EMPTY,
      taskTags: pivotData ? pivotData.taskTags.map((d: any) => mapTaskTag(d, fk)) : EMPTY,
      taskFlags: EMPTY,

      boards: rawBoards ? rawBoards.map(mapBoard) : EMPTY,
      boardMembers: rawBoardMembers ? (() => {
        const boardLookup = buildPgLookup(rawBoards);
        return rawBoardMembers.map((d: any) => ({
          ...mapBoardMember(d),
          board_id: resolveFk(boardLookup, d.boardId),
          member_id: d.memberType === 'user'
            ? resolveFk(fk.users, d.memberId) ?? d.memberId
            : d.memberId,
        }));
      })() : EMPTY,
      boardMessages: rawBoardMessages ? (() => {
        const boardLookup = buildPgLookup(rawBoards);
        return rawBoardMessages.map((d: any) => ({
          ...mapBoardMessage(d),
          board_id: resolveFk(boardLookup, d.boardId),
          created_by: resolveFk(fk.users, d.createdBy),
        }));
      })() : EMPTY,

      conversations: rawConversations ? rawConversations.map((d: any) => mapConversation(d, fk)) : EMPTY,
      conversationParticipants: rawParticipants
        ? rawParticipants.map((d: any) => mapConversationParticipant(d, { ...fk, conversations: buildPgLookup(rawConversations) }))
        : EMPTY,
      directMessages: rawDirectMessages
        ? rawDirectMessages.map((d: any) => mapDirectMessage(d, { ...fk, conversations: buildPgLookup(rawConversations) }))
        : EMPTY,
      messageReactions: rawReactions ? rawReactions.map((d: any) => mapMessageReaction(d, fk)) : EMPTY,
      linkPreviews: rawLinkPreviews ? rawLinkPreviews.map(mapLinkPreview) : EMPTY,
      workspaceChat: EMPTY,

      kpiCards: rawKpiCards ? rawKpiCards.map(mapKpiCard) : EMPTY,
      plugins: rawPlugins ? rawPlugins.map((p: any) => ({
        ...p,
        id: p.pgId ?? p._id,
        is_enabled: p.isEnabled ?? p.is_enabled ?? false,
      })) : EMPTY,
    };
  }, [activeTenantId, refData, rawTasks, pivotData, rawBoards, rawBoardMembers, rawBoardMessages, rawConversations, rawParticipants, rawDirectMessages, rawReactions, rawLinkPreviews, rawKpiCards, rawPlugins]);

  const taskCacheLookups = useMemo(() => {
    const statusNameById = new Map<string, string>();
    for (const status of data.statuses) {
      statusNameById.set(String(status.id), status.name);
      if ((status as any)._id) statusNameById.set(String((status as any)._id), status.name);
    }

    const workspaceNameById = new Map<string, string>();
    for (const workspace of data.workspaces) {
      workspaceNameById.set(String(workspace.id), workspace.name);
      if ((workspace as any)._id) workspaceNameById.set(String((workspace as any)._id), workspace.name);
    }

    const spotNameById = new Map<string, string>();
    for (const spot of data.spots) {
      spotNameById.set(String(spot.id), spot.name);
      if ((spot as any)._id) spotNameById.set(String((spot as any)._id), spot.name);
    }

    const userNameById = new Map<string, string>();
    for (const user of data.users) {
      userNameById.set(String(user.id), user.name);
      if ((user as any)._id) userNameById.set(String((user as any)._id), user.name);
    }

    const tagNameById = new Map<string, string>();
    for (const tag of data.tags) {
      tagNameById.set(String(tag.id), tag.name);
      if ((tag as any)._id) tagNameById.set(String((tag as any)._id), tag.name);
    }

    const taskUserIdsByTaskId = new Map<string, Array<string | number>>();
    for (const taskUser of data.taskUsers) {
      const taskId = String(taskUser.task_id);
      const list = taskUserIdsByTaskId.get(taskId) ?? [];
      list.push(taskUser.user_id);
      taskUserIdsByTaskId.set(taskId, list);
    }

    const taskTagIdsByTaskId = new Map<string, Array<string | number>>();
    for (const taskTag of data.taskTags) {
      const taskId = String(taskTag.task_id);
      const list = taskTagIdsByTaskId.get(taskId) ?? [];
      list.push(taskTag.tag_id);
      taskTagIdsByTaskId.set(taskId, list);
    }

    return {
      statusNameById,
      workspaceNameById,
      spotNameById,
      userNameById,
      tagNameById,
      taskUserIdsByTaskId,
      taskTagIdsByTaskId,
    };
  }, [data.statuses, data.workspaces, data.spots, data.users, data.tags, data.taskUsers, data.taskTags]);

  const buildTaskCacheRows = useCallback((tasks: SyncedTask[]): DB.CachedTaskRecord[] => (
    tasks.map((task) => {
      const userIds = readIdArray((task as any).user_ids ?? (task as any).userIds);
      const tagIds = readIdArray((task as any).tag_ids ?? (task as any).tagIds);
      const resolvedUserIds = userIds.length > 0 ? userIds : (taskCacheLookups.taskUserIdsByTaskId.get(String(task.id)) ?? []);
      const resolvedTagIds = tagIds.length > 0 ? tagIds : (taskCacheLookups.taskTagIdsByTaskId.get(String(task.id)) ?? []);
      const statusName = task.status_id == null ? null : taskCacheLookups.statusNameById.get(String(task.status_id)) ?? null;

      const searchParts: string[] = [];
      addSearchValue(searchParts, task.id);
      addSearchValue(searchParts, (task as any)._id);
      addSearchValue(searchParts, task.name);
      addSearchValue(searchParts, task.description);
      addSearchValue(searchParts, statusName);
      addSearchValue(searchParts, task.workspace_id == null ? null : taskCacheLookups.workspaceNameById.get(String(task.workspace_id)));
      addSearchValue(searchParts, task.spot_id == null ? null : taskCacheLookups.spotNameById.get(String(task.spot_id)));
      for (const userId of resolvedUserIds) addSearchValue(searchParts, taskCacheLookups.userNameById.get(String(userId)));
      for (const tagId of resolvedTagIds) addSearchValue(searchParts, taskCacheLookups.tagNameById.get(String(tagId)));

      return {
        ...task,
        tenant_id: activeTenantId,
        status: statusName,
        user_ids: resolvedUserIds,
        tag_ids: resolvedTagIds,
        search_text: searchParts.join(' '),
      };
    })
  ), [activeTenantId, taskCacheLookups]);

  const sharedTaskIds = useMemo(() => {
    const ids = new Set<number | string>();
    if (rawSharedToMe) {
      for (const share of rawSharedToMe) {
        if (share.task) {
          const id = share.task.id ?? share.task.pgId ?? share.task._id;
          if (id != null) ids.add(id);
        }
      }
    }
    return ids;
  }, [rawSharedToMe]);

  const sharedCount = sharedTaskIds.size;

  const approvalFk = useMemo(() => ({
    workspaces: new Map<string, any>(),
    categories: new Map<string, any>(),
    statuses: new Map<string, any>(),
    priorities: new Map<string, any>(),
    spots: new Map<string, any>(),
    templates: new Map<string, any>(),
    users: buildPgLookup(refData?.users),
    tasks: buildPgLookup(rawTasks),
    tags: new Map<string, any>(),
    statusTransitionGroups: new Map<string, any>(),
    forms: new Map<string, any>(),
    formVersions: new Map<string, any>(),
    approvals: buildPgLookup(refData?.approvals),
  }), [refData?.approvals, refData?.users, rawTasks]);
  const approvals = useMemo(() => refData?.approvals ? refData.approvals.map(mapApproval) : EMPTY, [refData?.approvals]);
  const approvalApprovers = useMemo(() => refData?.approvalApprovers ? refData.approvalApprovers.map(mapApprovalApprover) : EMPTY, [refData?.approvalApprovers]);
  const taskApprovalInstances = useMemo(() => refData?.taskApprovalInstances ? refData.taskApprovalInstances.map((doc: any) => mapTaskApprovalInstance(doc, approvalFk)) : EMPTY, [approvalFk, refData?.taskApprovalInstances]);
  const userTeamsData = useMemo(() => refData?.userTeams ? mapIds(refData.userTeams) : EMPTY, [refData?.userTeams]);
  const rolesData = useMemo(() => refData?.roles ? mapIds(refData.roles) : EMPTY, [refData?.roles]);

  // ---------------------------------------------------------------------------
  // Persist mapped Convex data to SQLite whenever it changes
  // ---------------------------------------------------------------------------
  const prevDataRef = useRef<SyncedData | null>(null);
  useEffect(() => {
    if (!activeTenantId) return;
    const convexReady = refData !== undefined && rawTasks !== undefined;
    if (!convexReady) return;
    const shouldPersistTables = prevDataRef.current !== data;
    if (shouldPersistTables) {
      prevDataRef.current = data;

      for (const table of GENERIC_SQLITE_TABLES) {
        const rows = data[table] as any[];
        if (rows && rows.length > 0) {
          persistToSqlite(table, rows);
        }
      }
    }

    if (data.tasks.length > 0) {
      const rows = buildTaskCacheRows(data.tasks);
      const write = tasksStatus === 'Exhausted' && !taskQuery.archiveEnabled
        ? DB.replaceTaskCacheBucketRows(rows, { tenantId: activeTenantId, bucket: 'live' })
        : DB.upsertTaskCacheRows(rows, { tenantId: activeTenantId, bucket: 'live' });
      write
        .then(() => setTaskCacheVersion((version) => version + 1))
        .catch(() => {});
    }

    DB.setMeta('last_sync_ts', String(Date.now())).catch(() => {});
  }, [data, activeTenantId, refData, rawTasks, buildTaskCacheRows, tasksStatus, taskQuery.archiveEnabled]);

  useEffect(() => {
    if (!activeTenantId || !taskQuery.archiveEnabled || !refData) {
      setArchiveSyncState({ key: '', syncing: false, incomplete: false });
      return;
    }

    const archiveDayKey = Math.floor(Date.now() / 86400000);
    const archiveKey = `v${TASK_ARCHIVE_SYNC_VERSION}:${activeTenantId}:all-finalized:${archiveDayKey}`;
    const cursorKey = `task_archive:${archiveKey}:cursor`;
    const doneKey = `task_archive:${archiveKey}:done`;
    const clearedKey = `task_archive:${archiveKey}:cleared`;
    let cancelled = false;

    const finishedStatusIds = new Set<string>();
    const finishedStatusConvexIds: string[] = [];
    for (const status of refData.statuses ?? []) {
      if (!isFinishedStatusDoc(status)) continue;
      if (status._id != null) finishedStatusConvexIds.push(String(status._id));
      if (status._id != null) finishedStatusIds.add(String(status._id));
      if (status.pgId != null) finishedStatusIds.add(String(status.pgId));
      if (status.id != null) finishedStatusIds.add(String(status.id));
    }

    const mapArchiveRows = (rawRows: any[]): SyncedTask[] => {
      const fk: FkLookups = {
        workspaces: buildPgLookup(refData.workspaces),
        categories: buildPgLookup(refData.categories),
        statuses: buildPgLookup(refData.statuses),
        priorities: buildPgLookup(refData.priorities),
        spots: buildPgLookup(refData.spots),
        templates: buildPgLookup(refData.templates),
        users: buildPgLookup(refData.users),
        tasks: buildPgLookup(rawRows),
        tags: buildPgLookup(refData.tags),
        statusTransitionGroups: buildPgLookup(refData.statusTransitionGroups),
        forms: buildPgLookup(refData.forms),
        formVersions: buildPgLookup(refData.formVersions),
        approvals: buildPgLookup(refData.approvals),
      };

      return rawRows.map((row) => {
        const mapped = mapTask(row, fk);
        const userIds = readIdArray(row.userIds ?? row.user_ids)
          .map((userId) => resolveFk(fk.users, userId))
          .filter((userId) => userId != null);
        const tagIds = readIdArray(row.tagIds ?? row.tag_ids)
          .map((tagId) => resolveFk(fk.tags, tagId))
          .filter((tagId) => tagId != null);
        return {
          ...mapped,
          user_ids: userIds,
          tag_ids: tagIds,
        };
      });
    };

    const runArchiveSync = async () => {
      const done = await DB.getMeta(doneKey);
      if (cancelled) return;

      if (done === 'true') {
        const archiveSummary = await DB.queryTaskCacheSummary({
          tenantId: activeTenantId,
          buckets: ['live'],
        });
        if (archiveSummary.total > 0) {
          setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: false });
          return;
        }
        await DB.deleteMeta(doneKey);
      }

      if (!isOnline) {
        setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: true });
        return;
      }

      setArchiveSyncState({ key: archiveKey, syncing: true, incomplete: true });
      let statusIndex = 0;
      let statusCursor: string | null = null;
      const savedCursor = await DB.getMeta(cursorKey);
      if (savedCursor) {
        try {
          const parsed = JSON.parse(savedCursor);
          if (Number.isFinite(parsed?.statusIndex)) {
            statusIndex = Math.max(0, Math.min(Math.floor(parsed.statusIndex), finishedStatusConvexIds.length));
          }
          statusCursor = typeof parsed?.statusCursor === 'string' ? parsed.statusCursor : null;
        } catch {
          statusIndex = 0;
          statusCursor = null;
        }
      }

      try {
        const cleared = await DB.getMeta(clearedKey);
        if (!savedCursor && cleared !== 'true') {
          await DB.setMeta(clearedKey, 'true');
        }

        if (finishedStatusConvexIds.length === 0) {
          await DB.setMeta(doneKey, 'true');
          await DB.deleteMeta(cursorKey);
          if (!cancelled) setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: false });
          return;
        }

        while (!cancelled && statusIndex < finishedStatusConvexIds.length) {
          const statusId = finishedStatusConvexIds[statusIndex];
          const page = await convex.query(api.bulk.tasksByWorkspace as any, {
            tenantId: activeTenantId,
            mode: 'all',
            statusIds: [statusId],
            paginationOpts: {
              numItems: ARCHIVE_PAGE_SIZE,
              cursor: statusCursor,
            },
          }) as { page?: any[]; isDone?: boolean; continueCursor?: string };

          const rows = mapArchiveRows(page.page ?? []);
          if (rows.length > 0) {
            await DB.upsertTaskCacheRows(buildTaskCacheRows(rows), {
              tenantId: activeTenantId,
              bucket: 'live',
            });
            if (!cancelled) setTaskCacheVersion((version) => version + 1);
          }

          if (page.isDone) {
            statusIndex += 1;
            statusCursor = null;
          } else if (page.continueCursor) {
            statusCursor = page.continueCursor;
          } else {
            if (!cancelled) setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: true });
            return;
          }

          await DB.setMeta(cursorKey, JSON.stringify({ statusIndex, statusCursor }));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        await DB.setMeta(doneKey, 'true');
        await DB.deleteMeta(cursorKey);
        if (!cancelled) setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: false });
      } catch {
        if (!cancelled) setArchiveSyncState({ key: archiveKey, syncing: false, incomplete: true });
      }
    };

    void runArchiveSync();

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, buildTaskCacheRows, convex, isOnline, refData, taskQuery.archiveEnabled]);

  // ---------------------------------------------------------------------------
  // Determine loading / sync state
  // ---------------------------------------------------------------------------
  const convexReady = refData !== undefined && rawTasks !== undefined;
  const hasCachedData = cachedData !== null;

  // We're "loading" only if Convex hasn't arrived AND we have no cached data
  const isLoading = !!activeTenantId && !convexReady && !hasCachedData;
  const hasEverSynced = !!activeTenantId && (convexReady || hasCachedData);

  // Use Convex data when available, else fall back to SQLite cache
  const effectiveData = convexReady ? data : (cachedData ?? data);

  const syncError = (!isOnline && !convexReady) ? 'No internet connection' : null;
  const isSyncing = !!activeTenantId && !convexReady && isOnline;

  // refresh / forceResync are no-ops with Convex (data is always live)
  const refresh = useCallback(async () => {}, []);
  const forceResync = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      await DB.clearAllData();
      setCachedData(null);
      hydrationTenantRef.current = null;
    } catch {}
  }, [activeTenantId]);

  const contextValue = useMemo(() => ({
    data: effectiveData,
    sharedTaskIds,
    sharedCount,
    rawSharedToMe,
    approvals,
    approvalApprovers,
    taskApprovalInstances,
    userTeams: userTeamsData,
    roles: rolesData,
    isSyncing,
    hasEverSynced,
    syncError,
    syncProgress: null as number | null,
    isInitialSync: isLoading,
    hasMoreTaskRows,
    isTaskPageLoading,
    isTaskPageIncomplete,
    isArchiveSyncing: archiveSyncState.syncing,
    isArchiveIncomplete: archiveSyncState.incomplete,
    taskCacheVersion,
    loadMoreTaskRows,
    setTaskQuery,
    refresh,
    forceResync,
    dataManager: null,
  }), [effectiveData, sharedTaskIds, sharedCount, rawSharedToMe, approvals, approvalApprovers, taskApprovalInstances, userTeamsData, rolesData, isSyncing, hasEverSynced, syncError, isLoading, hasMoreTaskRows, isTaskPageLoading, isTaskPageIncomplete, archiveSyncState.syncing, archiveSyncState.incomplete, taskCacheVersion, loadMoreTaskRows, setTaskQuery, refresh, forceResync]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
