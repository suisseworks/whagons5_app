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

export interface SyncedData {
  tasks: SyncedTask[];
  workspaces: SyncedWorkspace[];
  statuses: SyncedStatus[];
  priorities: SyncedPriority[];
  categories: SyncedCategory[];
  spots: SyncedSpot[];
  users: SyncedUser[];
  teams: SyncedTeam[];
  tags: SyncedTag[];
  taskUsers: SyncedTaskUser[];
  taskTags: SyncedTaskTag[];
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
  /** DataManager instance for advanced access. */
  dataManager: DataManager | null;
}

const EMPTY_DATA: SyncedData = {
  tasks: [],
  workspaces: [],
  statuses: [],
  priorities: [],
  categories: [],
  spots: [],
  users: [],
  teams: [],
  tags: [],
  taskUsers: [],
  taskTags: [],
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, subdomain } = useAuth();

  const [data, setData] = useState<SyncedData>(EMPTY_DATA);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const dmRef = useRef<DataManager | null>(null);

  // Create / update the DataManager when auth changes
  useEffect(() => {
    if (token && subdomain) {
      if (!dmRef.current) {
        dmRef.current = new DataManager({ subdomain, authToken: token });
      } else {
        dmRef.current.setAuthToken(token);
      }
    } else {
      dmRef.current = null;
    }
  }, [token, subdomain]);

  // Load data from SQLite into state
  const hydrateFromCache = useCallback(async () => {
    try {
      const [
        tasks,
        workspaces,
        statuses,
        priorities,
        categories,
        spots,
        users,
        teams,
        tags,
        taskUsers,
        taskTags,
      ] = await Promise.all([
        DB.getAllRows<SyncedTask>('wh_tasks'),
        DB.getAllRows<SyncedWorkspace>('wh_workspaces'),
        DB.getAllRows<SyncedStatus>('wh_statuses'),
        DB.getAllRows<SyncedPriority>('wh_priorities'),
        DB.getAllRows<SyncedCategory>('wh_categories'),
        DB.getAllRows<SyncedSpot>('wh_spots'),
        DB.getAllRows<SyncedUser>('wh_users'),
        DB.getAllRows<SyncedTeam>('wh_teams'),
        DB.getAllRows<SyncedTag>('wh_tags'),
        DB.getAllRows<SyncedTaskUser>('wh_task_users'),
        DB.getAllRows<SyncedTaskTag>('wh_task_tags'),
      ]);
      setData({
        tasks,
        workspaces,
        statuses,
        priorities,
        categories,
        spots,
        users,
        teams,
        tags,
        taskUsers,
        taskTags,
      });
    } catch (err) {
      console.warn('DataContext: hydrate failed', err);
    }
  }, []);

  // Run sync
  const runSync = useCallback(async () => {
    const dm = dmRef.current;
    if (!dm) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await dm.bootstrapAndSync();
      if (!result.success && result.error) {
        setSyncError(result.error);
      }
    } catch (err: any) {
      setSyncError(err?.message ?? 'Sync failed');
    }

    // Always hydrate from cache even if sync had partial errors
    await hydrateFromCache();
    setIsSyncing(false);
  }, [hydrateFromCache]);

  // Auto-sync when auth becomes available
  useEffect(() => {
    if (token && subdomain) {
      runSync();
    } else {
      // Logged out – clear data
      setData(EMPTY_DATA);
    }
  }, [token, subdomain, runSync]);

  // Re-sync when app comes to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && token && subdomain) {
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

  return (
    <DataContext.Provider
      value={{
        data,
        isSyncing,
        syncError,
        refresh,
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
