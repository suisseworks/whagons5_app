/**
 * useKpiCards – Hook that provides computed KPI card values for the current workspace.
 *
 * Reads KPI card configs from the sync'd data, computes values client-side
 * from the task data, and returns an array of ready-to-render card objects.
 *
 * Only returns metric-type cards (no charts/gauges/tables).
 */

import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { KpiComputedCard } from '../models/types';
import { computeKpiCards } from '../services/kpiQueryEngine';

interface UseKpiCardsParams {
  /** The selected workspace name (e.g., 'Everything' or a workspace name) */
  selectedWorkspace: string;
}

interface UseKpiCardsResult {
  /** Computed KPI cards for the current workspace */
  cards: KpiComputedCard[];
  /** Whether the kpi-cards powerup is enabled for this tenant */
  isKpiEnabled: boolean;
  /** Whether there are any KPI cards to show */
  hasCards: boolean;
}

export function useKpiCards({ selectedWorkspace }: UseKpiCardsParams): UseKpiCardsResult {
  const { data } = useData();
  const { user } = useAuth();

  const currentUserId = user?.id as number | null ?? null;

  // Resolve workspace name → ID
  const workspaceId = useMemo(() => {
    if (selectedWorkspace === 'Everything') return null;
    const ws = data.workspaces.find(w => w.name === selectedWorkspace);
    return ws?.id ?? null;
  }, [selectedWorkspace, data.workspaces]);

  // Check if kpi-cards powerup is enabled
  const isKpiEnabled = useMemo(() => {
    // If no plugins synced yet, show cards anyway (graceful fallback)
    if (data.plugins.length === 0 && data.kpiCards.length > 0) return true;
    const kpiPlugin = data.plugins.find(p => p.slug === 'kpi-cards');
    return kpiPlugin?.is_enabled === true;
  }, [data.plugins, data.kpiCards]);

  // Build taskUser map (taskId -> userIds[])
  const taskUserMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const tu of data.taskUsers) {
      const list = m.get(tu.task_id) ?? [];
      list.push(tu.user_id);
      m.set(tu.task_id, list);
    }
    return m;
  }, [data.taskUsers]);

  // Compute card values
  const cards = useMemo(() => {
    if (!isKpiEnabled || data.kpiCards.length === 0) return [];

    return computeKpiCards({
      tasks: data.tasks,
      statuses: data.statuses,
      kpiCards: data.kpiCards,
      workspaceId,
      currentUserId,
      taskUserMap,
    });
  }, [
    isKpiEnabled,
    data.kpiCards,
    data.tasks,
    data.statuses,
    workspaceId,
    currentUserId,
    taskUserMap,
  ]);

  return {
    cards,
    isKpiEnabled,
    hasCards: cards.length > 0,
  };
}
