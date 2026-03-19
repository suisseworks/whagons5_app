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
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';

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

interface DataContextType {
  data: SyncedData;
  isSyncing: boolean;
  hasEverSynced: boolean;
  syncError: string | null;
  syncProgress: null;
  isInitialSync: boolean;
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
}

/** Map a Convex task doc to the SyncedTask shape, resolving FK fields to pgIds */
function mapTask(doc: any, fk: FkLookups): SyncedTask {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    workspace_id: resolveFk(fk.workspaces, doc.workspaceId),
    category_id: resolveFk(fk.categories, doc.categoryId),
    status_id: resolveFk(fk.statuses, doc.statusId),
    priority_id: resolveFk(fk.priorities, doc.priorityId),
    spot_id: resolveFk(fk.spots, doc.spotId),
    template_id: resolveFk(fk.templates, doc.templateId),
    created_by: resolveFk(fk.users, doc.createdBy),
    deleted_at: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : null,
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

function mapTemplate(doc: any): SyncedTemplate {
  return { ...doc, id: doc.pgId ?? doc._id, form_id: doc.formId ?? null };
}

function mapForm(doc: any): SyncedForm {
  return { ...doc, id: doc.pgId ?? doc._id, current_version_id: doc.currentVersionId ?? null };
}

function mapFormVersion(doc: any): SyncedFormVersion {
  return { ...doc, id: doc.pgId ?? doc._id, form_id: doc.formId, version: doc.version ?? 0 };
}

function mapTaskUser(doc: any, fk: FkLookups): SyncedTaskUser {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: resolveFk(fk.tasks, doc.taskId),
    user_id: resolveFk(fk.users, doc.userId),
  };
}

function mapTaskTag(doc: any, fk: FkLookups): SyncedTaskTag {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: resolveFk(fk.tasks, doc.taskId),
    tag_id: resolveFk(fk.tags, doc.tagId),
  };
}

function mapTaskForm(doc: any): SyncedTaskForm {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    task_id: doc.taskId,
    form_version_id: doc.formVersionId,
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

function mapWorkspaceChat(doc: any): SyncedWorkspaceChat {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    workspace_id: doc.workspaceId,
    user_id: doc.userId,
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

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenantId } = useTenant();
  const skipArgs = !tenantId ? 'skip' as const : undefined;

  // Reference data (bulk query)
  const refData = useQuery(
    api.bulk.allReferenceData,
    skipArgs ?? { tenantId: tenantId! },
  );

  // Tasks
  const rawTasks = useQuery(
    api.bulk.tasksByWorkspace,
    skipArgs ?? { tenantId: tenantId!, limit: 4096 },
  );

  // Pivot data (taskUsers, taskTags)
  const pivotData = useQuery(
    api.bulk.taskPivotData,
    skipArgs ?? { tenantId: tenantId! },
  );

  // Chat data
  const rawConversations = useQuery(
    api.chat.listConversations,
    skipArgs ?? { tenantId: tenantId! },
  );

  // Chat sub-data
  const rawParticipants = useQuery(
    api.chat.listAllParticipants,
    skipArgs ?? { tenantId: tenantId! },
  );
  const rawDirectMessages = useQuery(
    api.chat.listAllMessages,
    skipArgs ?? { tenantId: tenantId! },
  );
  const rawReactions = useQuery(
    api.chat.listAllReactions,
    skipArgs ?? { tenantId: tenantId! },
  );
  const rawLinkPreviews = useQuery(
    api.chat.listAllLinkPreviews,
    skipArgs ?? { tenantId: tenantId! },
  );

  // Boards
  const rawBoards = useQuery(
    api.boards.list,
    skipArgs ?? { tenantId: tenantId! },
  );
  const rawBoardMembers = useQuery(
    api.boards.listAllMembers,
    skipArgs ?? { tenantId: tenantId! },
  );
  const rawBoardMessages = useQuery(
    api.boards.listAllMessages,
    skipArgs ?? { tenantId: tenantId! },
  );

  // KPI Cards
  const rawKpiCards = useQuery(
    api.analytics.listKpiCards,
    skipArgs ?? { tenantId: tenantId! },
  );

  // Build the SyncedData object by mapping Convex docs → legacy shape
  const data: SyncedData = useMemo(() => {
    if (!tenantId) return EMPTY_DATA;

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
      templates: refData ? refData.templates.map(mapTemplate) : EMPTY,
      forms: refData ? refData.forms?.map(mapForm) ?? EMPTY : EMPTY,
      formVersions: refData ? refData.formVersions?.map(mapFormVersion) ?? EMPTY : EMPTY,
      taskForms: EMPTY,

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
      plugins: EMPTY,
    };
  }, [tenantId, refData, rawTasks, pivotData, rawBoards, rawBoardMembers, rawBoardMessages, rawConversations, rawParticipants, rawDirectMessages, rawReactions, rawLinkPreviews, rawKpiCards]);

  const isLoading = !!tenantId && (refData === undefined || rawTasks === undefined);
  const hasEverSynced = !!tenantId && refData !== undefined && rawTasks !== undefined;

  // refresh / forceResync are no-ops with Convex (data is always live)
  const refresh = useCallback(async () => {}, []);
  const forceResync = useCallback(async () => {}, []);

  return (
    <DataContext.Provider
      value={{
        data,
        isSyncing: isLoading,
        hasEverSynced,
        syncError: null,
        syncProgress: null,
        isInitialSync: isLoading,
        refresh,
        forceResync,
        dataManager: null,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
