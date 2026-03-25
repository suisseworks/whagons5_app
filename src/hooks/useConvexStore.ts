/**
 * useConvexStore – Mobile version.
 *
 * Mirrors the web client's useConvexStore hook.
 * Fetches all reference data for the current tenant via a single bulk query.
 * All data is live-reactive via Convex useQuery().
 */
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from './useTenant';
import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Legacy shape mapper
// ---------------------------------------------------------------------------
// Convex docs have _id (string) and camelCase fields.
// The old DataContext data had numeric `id` and snake_case fields.
// Map Convex -> legacy shape so existing components work without changes.

function mapDoc(doc: any): any {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
  };
}

function mapDocs(docs: any[] | undefined): any[] {
  if (!docs) return [];
  return docs.map(mapDoc);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ConvexStoreData {
  teams: any[];
  users: any[];
  workspaces: any[];
  categories: any[];
  statuses: any[];
  priorities: any[];
  spots: any[];
  spotTypes: any[];
  tags: any[];
  templates: any[];
  cleaningStatuses: any[];
  statusTransitionGroups: any[];
  statusTransitions: any[];

  loading: boolean;
  tenantId: string | null;
}

const EMPTY: any[] = [];

export function useConvexStore(): ConvexStoreData {
  const { tenantId } = useTenant();

  const data = useQuery(
    api.bulk.allReferenceData,
    tenantId ? { tenantId } : 'skip',
  );

  return useMemo(() => {
    const loading = data === undefined && !!tenantId;

    return {
      teams: data ? mapDocs(data.teams) : EMPTY,
      users: data ? mapDocs(data.users) : EMPTY,
      workspaces: data ? mapDocs(data.workspaces) : EMPTY,
      categories: data ? mapDocs(data.categories) : EMPTY,
      statuses: data ? mapDocs(data.statuses) : EMPTY,
      priorities: data ? mapDocs(data.priorities) : EMPTY,
      spots: data ? mapDocs(data.spots) : EMPTY,
      spotTypes: data ? mapDocs(data.spotTypes) : EMPTY,
      tags: data ? mapDocs(data.tags) : EMPTY,
      templates: data ? mapDocs(data.templates) : EMPTY,
      cleaningStatuses: data ? mapDocs(data.cleaningStatuses) : EMPTY,
      statusTransitionGroups: data ? mapDocs(data.statusTransitionGroups) : EMPTY,
      statusTransitions: data ? mapDocs(data.statusTransitions) : EMPTY,
      loading,
      tenantId,
    };
  }, [data, tenantId]);
}

/**
 * Hook to get tasks reactively.
 * Fetches up to `limit` tasks for the tenant.
 * Client-side workspace filter applied if workspaceId is provided.
 */
export function useConvexTasks(workspaceId?: string, limit = 2000) {
  const { tenantId } = useTenant();

  const allTasks = useQuery(
    api.bulk.tasksByWorkspace,
    tenantId ? { tenantId, limit } : 'skip',
  );

  return useMemo(() => {
    const mapped = allTasks ? mapDocs(allTasks) : EMPTY;

    if (workspaceId && workspaceId !== 'all' && mapped.length > 0) {
      const filtered = mapped.filter(
        (t: any) =>
          String(t.workspaceId) === workspaceId ||
          String(t.workspace_id) === workspaceId,
      );
      return { tasks: filtered, loading: false };
    }

    return {
      tasks: mapped,
      loading: allTasks === undefined && !!tenantId,
    };
  }, [allTasks, tenantId, workspaceId]);
}
