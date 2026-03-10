/**
 * DataContext – Provides synced data from the DataManager to the entire app.
 *
 * Automatically runs bootstrapAndSync when auth credentials become available,
 * and exposes a `refresh()` function for pull-to-refresh.
 *
 * All wh_* data is read from the local SQLite cache after sync completes.
 * Components subscribe to the `data` object and re-render when it changes.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { DataManager } from '../store/DataManager';
import { useAuth } from './AuthContext';
import * as DB from '../store/database';
import { apiClient } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a raw task from the wh_tasks table */
export interface SyncedTask {
  id: number;
  name: string;
  description?: string | null;
  workspace_id?: number | null;
  category_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  spot_id?: number | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedWorkspace {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  [key: string]: unknown;
}

export interface SyncedStatus {
  id: number;
  name: string;
  color?: string | null;
  category_id?: number | null;
  initial?: boolean;
  final?: boolean;
  [key: string]: unknown;
}

export interface SyncedPriority {
  id: number;
  name: string;
  color?: string | null;
  category_id?: number | null;
  [key: string]: unknown;
}

export interface SyncedCategory {
  id: number;
  name: string;
  color?: string | null;
  status_transition_group_id?: number | null;
  [key: string]: unknown;
}

export interface SyncedStatusTransitionGroup {
  id: number;
  name: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface SyncedStatusTransition {
  id: number;
  status_transition_group_id: number;
  from_status: number;
  to_status: number;
  initial?: boolean;
  [key: string]: unknown;
}

export interface SyncedSpot {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface SyncedUser {
  id: number;
  name: string;
  email?: string;
  url_picture?: string | null;
  [key: string]: unknown;
}

export interface SyncedTeam {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface SyncedTag {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface SyncedTaskUser {
  id: number;
  task_id: number;
  user_id: number;
  [key: string]: unknown;
}

export interface SyncedTaskTag {
  id: number;
  task_id: number;
  tag_id: number;
  [key: string]: unknown;
}

export interface SyncedBoard {
  id: number;
  name: string;
  description?: string | null;
  visibility: 'public' | 'private';
  birthday_messages_enabled?: boolean;
  birthday_message_template?: string | null;
  created_by: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedBoardMember {
  id: number;
  board_id: number;
  member_type: 'user' | 'team';
  member_id: number;
  role: 'admin' | 'member';
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedBoardMessage {
  id: number;
  board_id: number;
  created_by: number;
  title?: string | null;
  content?: string | null;
  is_pinned: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
  source_type?: string | null;
  source_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface SyncedTemplate {
  id: number;
  name: string;
  form_id?: number | null;
  [key: string]: unknown;
}

export interface SyncedForm {
  id: number;
  name: string;
  description?: string | null;
  current_version_id?: number | null;
  [key: string]: unknown;
}

export interface SyncedFormVersion {
  id: number;
  form_id: number;
  version: number;
  fields?: string | Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SyncedTaskForm {
  id: number;
  task_id: number;
  form_version_id: number;
  data?: string | Record<string, unknown> | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Chat / Messaging types
// ---------------------------------------------------------------------------

export interface SyncedConversation {
  id: number;
  uuid: string;
  type: 'dm' | 'group';
  name: string | null;
  avatar_url: string | null;
  created_by: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedConversationParticipant {
  id: number;
  conversation_id: number;
  user_id: number;
  last_read_at: string | null;
  is_muted: boolean;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedDirectMessage {
  id: number;
  uuid: string;
  conversation_id: number;
  user_id: number;
  message: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedMessageReaction {
  id: number;
  message_id: number;
  user_id: number;
  emoji: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SyncedLinkPreview {
  id: number;
  message_id: number | null;
  workspace_chat_id: number | null;
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
  id: number;
  uuid: string;
  workspace_id: number;
  message: string;
  user_id: number;
  created_at: string;
  updated_at: string;
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
  users: SyncedUser[];
  teams: SyncedTeam[];
  tags: SyncedTag[];
  taskUsers: SyncedTaskUser[];
  taskTags: SyncedTaskTag[];
  boards: SyncedBoard[];
  boardMembers: SyncedBoardMember[];
  boardMessages: SyncedBoardMessage[];
  templates: SyncedTemplate[];
  forms: SyncedForm[];
  formVersions: SyncedFormVersion[];
  taskForms: SyncedTaskForm[];
  // Chat / Messaging
  conversations: SyncedConversation[];
  conversationParticipants: SyncedConversationParticipant[];
  directMessages: SyncedDirectMessage[];
  messageReactions: SyncedMessageReaction[];
  linkPreviews: SyncedLinkPreview[];
  // Workspace-scoped chat (Spaces / Collab)
  workspaceChat: SyncedWorkspaceChat[];
}

interface DataContextType {
  /** The synced data from the local cache. */
  data: SyncedData;
  /** Whether a sync is currently in progress. */
  isSyncing: boolean;
  /** The last sync error, if any. */
  syncError: string | null;
  /** Trigger a manual sync (for pull-to-refresh). */
  refresh: () => Promise<void>;
  /** Force clear all cached data and do a full resync. */
  forceResync: () => Promise<void>;
  /** DataManager instance for advanced access. */
  dataManager: DataManager | null;
}

const EMPTY_DATA: SyncedData = {
  tasks: [],
  workspaces: [],
  statuses: [],
  priorities: [],
  categories: [],
  statusTransitionGroups: [],
  statusTransitions: [],
  spots: [],
  users: [],
  teams: [],
  tags: [],
  taskUsers: [],
  taskTags: [],
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
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, subdomain, isLoading: authLoading } = useAuth();

  const [data, setData] = useState<SyncedData>(EMPTY_DATA);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const dmRef = useRef<DataManager | null>(null);

  // Create / update the DataManager + apiClient when auth changes
  useEffect(() => {
    if (authLoading) return; // Wait for auth to fully resolve
    if (token && subdomain) {
      // Configure the shared API client so all screens can use it
      apiClient.configure(subdomain, token);

      // Always recreate DataManager when subdomain changes
      if (!dmRef.current || dmRef.current.getSubdomain() !== subdomain) {
        dmRef.current = new DataManager({ subdomain, authToken: token });
        console.log(`[DataContext] Created DataManager for tenant: ${subdomain}`);
      } else {
        dmRef.current.setAuthToken(token);
      }
    } else {
      dmRef.current = null;
    }
  }, [token, subdomain, authLoading]);

  // Load data from SQLite into state
  const hydrateFromCache = useCallback(async () => {
    try {
      const [
        tasks,
        workspaces,
        statuses,
        priorities,
        categories,
        statusTransitionGroups,
        statusTransitions,
        spots,
        users,
        teams,
        tags,
        taskUsers,
        taskTags,
        boards,
        boardMembers,
        boardMessages,
        templates,
        forms,
        formVersions,
        taskForms,
        conversations,
        conversationParticipants,
        directMessages,
        messageReactions,
        linkPreviews,
        workspaceChat,
      ] = await Promise.all([
        DB.getAllRows<SyncedTask>('wh_tasks'),
        DB.getAllRows<SyncedWorkspace>('wh_workspaces'),
        DB.getAllRows<SyncedStatus>('wh_statuses'),
        DB.getAllRows<SyncedPriority>('wh_priorities'),
        DB.getAllRows<SyncedCategory>('wh_categories'),
        DB.getAllRows<SyncedStatusTransitionGroup>('wh_status_transition_groups'),
        DB.getAllRows<SyncedStatusTransition>('wh_status_transitions'),
        DB.getAllRows<SyncedSpot>('wh_spots'),
        DB.getAllRows<SyncedUser>('wh_users'),
        DB.getAllRows<SyncedTeam>('wh_teams'),
        DB.getAllRows<SyncedTag>('wh_tags'),
        DB.getAllRows<SyncedTaskUser>('wh_task_user'),
        DB.getAllRows<SyncedTaskTag>('wh_task_tag'),
        DB.getAllRows<SyncedBoard>('wh_boards'),
        DB.getAllRows<SyncedBoardMember>('wh_board_members'),
        DB.getAllRows<SyncedBoardMessage>('wh_board_messages'),
        DB.getAllRows<SyncedTemplate>('wh_templates'),
        DB.getAllRows<SyncedForm>('wh_forms'),
        DB.getAllRows<SyncedFormVersion>('wh_form_versions'),
        DB.getAllRows<SyncedTaskForm>('wh_task_form'),
        DB.getAllRows<SyncedConversation>('wh_conversations'),
        DB.getAllRows<SyncedConversationParticipant>('wh_conversation_participants'),
        DB.getAllRows<SyncedDirectMessage>('wh_direct_messages'),
        DB.getAllRows<SyncedMessageReaction>('wh_message_reactions'),
        DB.getAllRows<SyncedLinkPreview>('wh_link_previews'),
        DB.getAllRows<SyncedWorkspaceChat>('wh_workspace_chat'),
      ]);
      console.log(`[DataContext] hydrate counts: tasks=${tasks.length} workspaces=${workspaces.length} statuses=${statuses.length} users=${users.length} conversations=${conversations.length} boards=${boards.length}`);
      setData({
        tasks,
        workspaces,
        statuses,
        priorities,
        categories,
        statusTransitionGroups,
        statusTransitions,
        spots,
        users,
        teams,
        tags,
        taskUsers,
        taskTags,
        boards,
        boardMembers,
        boardMessages,
        templates,
        forms,
        formVersions,
        taskForms,
        conversations,
        conversationParticipants,
        directMessages,
        messageReactions,
        linkPreviews,
        workspaceChat,
      });
    } catch (err) {
      console.warn('DataContext: hydrate failed', err);
    }
  }, []);

  // Run sync
  const runSync = useCallback(async () => {
    const dm = dmRef.current;
    if (!dm) {
      console.log('[DataContext] runSync: no DataManager');
      return;
    }

    console.log('[DataContext] runSync: starting...');
    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await dm.bootstrapAndSync();
      console.log(`[DataContext] sync result: success=${result.success} touched=${result.touchedTables.join(',')} error=${result.error || 'none'}`);
      if (!result.success && result.error) {
        setSyncError(result.error);
      }
    } catch (err: any) {
      console.warn('[DataContext] sync exception:', err);
      setSyncError(err?.message ?? 'Sync failed');
    }

    // Always hydrate from cache even if sync had partial errors
    console.log('[DataContext] hydrating from cache...');
    await hydrateFromCache();
    setIsSyncing(false);
    console.log('[DataContext] runSync: done');
  }, [hydrateFromCache]);

  // Auto-sync when auth becomes available (wait for auth to finish loading)
  useEffect(() => {
    if (authLoading) return; // Don't sync while auth is still resolving
    if (token && subdomain) {
      console.log(`[DataContext] Auth ready, starting sync for tenant: ${subdomain}`);
      runSync();
    } else {
      // Logged out – clear data
      setData(EMPTY_DATA);
    }
  }, [token, subdomain, authLoading, runSync]);

  // Re-sync when app comes to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !authLoading && token && subdomain) {
        runSync();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [token, subdomain, runSync]);

  // Public refresh for pull-to-refresh
  const refresh = useCallback(async () => {
    await runSync();
  }, [runSync]);

  // Force clear all data and do a full resync from scratch
  const forceResync = useCallback(async () => {
    console.log('[DataContext] forceResync: clearing all data...');
    await DB.clearAllData();
    setData(EMPTY_DATA);
    await runSync();
  }, [runSync]);

  return (
    <DataContext.Provider
      value={{
        data,
        isSyncing,
        syncError,
        refresh,
        forceResync,
        dataManager: dmRef.current,
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
