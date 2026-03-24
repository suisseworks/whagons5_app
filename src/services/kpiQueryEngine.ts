/**
 * KPI Query Engine – Computes KPI card values client-side from synced task data.
 *
 * This is a simplified port of the web client's kpiCardService.ts + useWorkspaceKpiCards hook.
 * It operates on in-memory task arrays from DataContext rather than IndexedDB.
 * Only metric-type cards are supported (no charts/gauges/tables).
 */

import { SyncedTask, SyncedStatus, SyncedKpiCard } from '../context/DataContext';
import { KpiComputedCard, KpiCardMetricType } from '../models/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyId = number | string | null | undefined;

/** Type-safe ID equality: handles mixed number/string IDs from Convex + pgId */
function idEq(a: AnyId, b: AnyId): boolean {
  if (a == null || b == null) return a == b;
  // eslint-disable-next-line eqeqeq
  return a == b || String(a) === String(b);
}

/** Check if an ID is contained in a list (handles mixed types) */
function idIn(id: AnyId, list: AnyId[]): boolean {
  if (id == null) return false;
  const s = String(id);
  return list.some(v => String(v) === s);
}

function parseJson(val: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return val as Record<string, unknown>;
}

/** Check if a card type is a metric type we can render on mobile */
const METRIC_TYPES: Set<string> = new Set([
  'task_count', 'task_percentage', 'custom_query',
  'count_completed_today', 'count_overdue', 'count_created_today',
  'time_avg', 'trend', 'trend_7d', 'trend_30d',
]);

export function isMetricType(type: string): type is KpiCardMetricType {
  return METRIC_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Task filtering
// ---------------------------------------------------------------------------

interface TaskFilter {
  status_id?: AnyId | AnyId[];
  priority_id?: AnyId | AnyId[];
  spot_id?: AnyId | AnyId[];
  statuses?: AnyId[];
  priorities?: AnyId[];
  assignees?: AnyId[];
  status_type?: string;
  dateRange?: string;
  unassigned?: boolean;
  [key: string]: unknown;
}

function matchesFilter(
  task: SyncedTask,
  filters: TaskFilter,
  workspaceId: AnyId,
  statusesByAction: Map<string, AnyId[]>,
  taskUserMap: Map<string, AnyId[]>,
): boolean {
  // Workspace filter
  if (workspaceId != null && !idEq(task.workspace_id, workspaceId)) return false;

  // Status filter (singular legacy)
  if (filters.status_id != null) {
    const ids = Array.isArray(filters.status_id) ? filters.status_id : [filters.status_id];
    if (!idIn(task.status_id, ids)) return false;
  }

  // Status filter (plural / builder)
  if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
    if (!idIn(task.status_id, filters.statuses)) return false;
  }

  // Status type filter (e.g., 'in_progress' -> WORKING action)
  if (filters.status_type && !filters.statuses?.length && !filters.status_id) {
    const actionMap: Record<string, string> = {
      in_progress: 'WORKING', working: 'WORKING',
      finished: 'FINISHED', completed: 'FINISHED', done: 'FINISHED',
      paused: 'PAUSED',
      none: 'NONE', pending: 'NONE', open: 'NONE',
    };
    const action = actionMap[filters.status_type];
    if (action) {
      const allowedIds = statusesByAction.get(action) ?? [];
      if (allowedIds.length > 0 && !idIn(task.status_id, allowedIds)) return false;
    }
  }

  // Priority filter
  if (filters.priority_id != null) {
    const ids = Array.isArray(filters.priority_id) ? filters.priority_id : [filters.priority_id];
    if (!idIn(task.priority_id, ids)) return false;
  }
  if (Array.isArray(filters.priorities) && filters.priorities.length > 0) {
    if (!idIn(task.priority_id, filters.priorities)) return false;
  }

  // Assignee filter
  if (Array.isArray(filters.assignees) && filters.assignees.length > 0) {
    const taskAssignees = taskUserMap.get(String(task.id)) ?? [];
    if (!taskAssignees.some(a => idIn(a, filters.assignees!))) return false;
  }

  // Unassigned filter
  if (filters.unassigned === true) {
    const taskAssignees = taskUserMap.get(String(task.id)) ?? [];
    if (taskAssignees.length > 0) return false;
  }

  // Spot filter
  if (filters.spot_id != null) {
    const ids = Array.isArray(filters.spot_id) ? filters.spot_id : [filters.spot_id];
    if (!idIn(task.spot_id, ids)) return false;
  }

  return true;
}

function applyDateRange(tasks: SyncedTask[], dateRange: string | undefined, dateField: string = 'updated_at'): SyncedTask[] {
  if (!dateRange || typeof dateRange !== 'string') return tasks;

  let since: Date | null = null;

  if (dateRange === 'today') {
    since = new Date();
    since.setHours(0, 0, 0, 0);
  } else {
    const match = dateRange.match(/^(\d+)d$/);
    if (match) {
      const days = parseInt(match[1], 10);
      since = new Date();
      since.setDate(since.getDate() - days);
    }
  }

  if (!since) return tasks;

  const sinceTime = since.getTime();
  return tasks.filter(t => {
    const val = t[dateField] as string | null | undefined;
    if (!val) return false;
    return new Date(val).getTime() >= sinceTime;
  });
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export interface KpiComputeParams {
  tasks: SyncedTask[];
  statuses: SyncedStatus[];
  kpiCards: SyncedKpiCard[];
  workspaceId: AnyId;
  currentUserId: AnyId;
  /** Map of taskId (string key) -> array of assigned userIds */
  taskUserMap: Map<string, AnyId[]>;
}

/**
 * Compute KPI values for all metric-type cards that are enabled and
 * scoped to the given workspace/user.
 */
export function computeKpiCards(params: KpiComputeParams): KpiComputedCard[] {
  const { tasks, statuses, kpiCards, workspaceId, currentUserId, taskUserMap } = params;

  // Pre-compute status lookups
  const finalStatusIds: AnyId[] = statuses.filter(s => s.final).map(s => s.id);
  const statusesByAction = new Map<string, AnyId[]>();
  for (const s of statuses) {
    const action = String((s as any).action || '').toUpperCase();
    if (action) {
      const list = statusesByAction.get(action) ?? [];
      list.push(s.id);
      statusesByAction.set(action, list);
    }
  }

  // Working status IDs (WORKING action)
  const workingStatusIds: AnyId[] = statusesByAction.get('WORKING') ?? [];

  // Filter + scope cards
  const scopedCards = kpiCards
    .filter(c => c.is_enabled !== false)
    .filter(c => isMetricType(c.type))
    .filter(c => {
      if (workspaceId == null) return c.workspace_id == null;
      return c.workspace_id == null || idEq(c.workspace_id, workspaceId);
    })
    .filter(c => {
      if (currentUserId == null) return c.user_id == null;
      return c.user_id == null || idEq(c.user_id, currentUserId);
    })
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (scopedCards.length === 0) return [];

  // Exclude soft-deleted tasks, then filter by workspace
  const activeTasks = tasks.filter(t => !t.deleted_at);
  const workspaceTasks = workspaceId != null
    ? activeTasks.filter(t => idEq(t.workspace_id, workspaceId))
    : activeTasks;

  const results: KpiComputedCard[] = [];

  for (const card of scopedCards) {
    const queryConfig = parseJson(card.query_config as any);
    const displayConfig = parseJson(card.display_config as any);
    const filters = (queryConfig.filters ?? queryConfig) as TaskFilter;

    // Resolve icon and color from display_config
    const iconName = resolveIconName(displayConfig);
    const iconColor = resolveIconColor(displayConfig);

    try {
      const computed = computeSingleCard(
        card, queryConfig, filters, workspaceTasks, workspaceId,
        finalStatusIds, workingStatusIds, statusesByAction, taskUserMap,
      );

      results.push({
        id: card.id,
        label: card.name,
        value: computed.value,
        iconName,
        iconColor,
        helperText: computed.helperText ?? (displayConfig.helperText as string | undefined),
        trendData: computed.trendData,
      });
    } catch (err) {
      // Silently skip broken cards
      console.warn(`[KPI] Failed to compute card ${card.id} (${card.name}):`, err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-card computation
// ---------------------------------------------------------------------------

interface CardResult {
  value: string;
  helperText?: string;
  trendData?: number[];
}

function computeSingleCard(
  card: SyncedKpiCard,
  queryConfig: Record<string, unknown>,
  filters: TaskFilter,
  workspaceTasks: SyncedTask[],
  workspaceId: AnyId,
  finalStatusIds: AnyId[],
  workingStatusIds: AnyId[],
  statusesByAction: Map<string, AnyId[]>,
  taskUserMap: Map<string, AnyId[]>,
): CardResult {
  // Filter tasks based on card's query_config
  const filtered = workspaceTasks.filter(t =>
    matchesFilter(t, filters, null, statusesByAction, taskUserMap),
  );

  switch (card.type) {
    case 'task_count':
    case 'custom_query': {
      // Check if this is an in-progress card
      const defaultKey = queryConfig.default_key as string | undefined;
      const isInProgress = defaultKey === 'inProgress' || filters.status_type === 'in_progress';

      let count: number;
      if (isInProgress && workingStatusIds.length > 0) {
        count = workspaceTasks.filter(t =>
          idIn(t.status_id, workingStatusIds) &&
          matchesFilter(t, { ...filters, status_id: undefined, status_type: undefined }, null, statusesByAction, taskUserMap),
        ).length;
      } else if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        count = workspaceTasks.filter(t =>
          idIn(t.status_id, filters.statuses!) &&
          matchesFilter(t, { ...filters, statuses: undefined }, null, statusesByAction, taskUserMap),
        ).length;
      } else {
        count = applyDateRange(filtered, filters.dateRange as string | undefined).length;
      }
      return { value: count.toLocaleString() };
    }

    case 'count_completed_today': {
      if (finalStatusIds.length === 0) return { value: '0' };
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const midnightTime = midnight.getTime();
      const count = workspaceTasks.filter(t => {
        if (!idIn(t.status_id, finalStatusIds)) return false;
        const updated = t.updated_at;
        if (!updated) return false;
        return new Date(updated).getTime() >= midnightTime;
      }).length;
      return { value: count.toLocaleString() };
    }

    case 'count_overdue': {
      const now = new Date();
      const count = filtered.filter(t => {
        const dueDate = t.due_date as string | null | undefined;
        if (!dueDate) return false;
        if (idIn(t.status_id, finalStatusIds)) return false;
        return new Date(dueDate) < now;
      }).length;
      return {
        value: count.toLocaleString(),
        helperText: count > 0 ? 'Action needed' : undefined,
      };
    }

    case 'count_created_today': {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const midnightTime = midnight.getTime();
      const count = filtered.filter(t => {
        if (!t.created_at) return false;
        return new Date(t.created_at).getTime() >= midnightTime;
      }).length;
      return { value: count.toLocaleString() };
    }

    case 'task_percentage': {
      const numFilters = (queryConfig.numerator_filters ?? {}) as TaskFilter;
      const denFilters = (queryConfig.denominator_filters ?? {}) as TaskFilter;
      const numerator = workspaceTasks.filter(t =>
        matchesFilter(t, numFilters, null, statusesByAction, taskUserMap),
      ).length;
      const denominator = workspaceTasks.filter(t =>
        matchesFilter(t, denFilters, null, statusesByAction, taskUserMap),
      ).length;
      const pct = denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
      return { value: `${pct}%` };
    }

    case 'time_avg': {
      let taskPool = filtered;
      if (finalStatusIds.length > 0) {
        taskPool = workspaceTasks.filter(t => idIn(t.status_id, finalStatusIds));
      }
      let totalMs = 0;
      let validCount = 0;
      for (const t of taskPool) {
        if (t.created_at && t.updated_at) {
          const diff = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime();
          if (diff > 0) { totalMs += diff; validCount++; }
        }
      }
      if (validCount === 0) return { value: '--' };
      const avgMs = totalMs / validCount;
      const hours = avgMs / (1000 * 60 * 60);
      let label: string;
      if (hours < 1) label = `${Math.round(avgMs / (1000 * 60))}m`;
      else if (hours < 24) label = `${Math.round(hours * 10) / 10}h`;
      else label = `${Math.round(hours / 24 * 10) / 10}d`;
      return { value: label, helperText: `${validCount} tasks` };
    }

    case 'trend':
    case 'trend_7d':
    case 'trend_30d': {
      const days = card.type === 'trend_30d' ? 30
        : card.type === 'trend_7d' ? 7
        : Math.max(3, Math.min(30, Number(queryConfig.days ?? 7) || 7));

      if (finalStatusIds.length === 0) return { value: '--' };

      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const startDate = new Date(midnight);
      startDate.setDate(startDate.getDate() - (days - 1));
      const startTime = startDate.getTime();

      const recentDone = workspaceTasks.filter(t => {
        if (!idIn(t.status_id, finalStatusIds)) return false;
        if (!t.updated_at) return false;
        return new Date(t.updated_at).getTime() >= startTime;
      });

      const trend: number[] = Array.from({ length: days }, (_, idx) => {
        const dayStart = new Date(startDate);
        dayStart.setDate(dayStart.getDate() + idx);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const dayStartTime = dayStart.getTime();
        const dayEndTime = dayEnd.getTime();
        return recentDone.filter(t => {
          const d = new Date(t.updated_at!).getTime();
          return d >= dayStartTime && d < dayEndTime;
        }).length;
      });

      const sum = trend.reduce((a, b) => a + b, 0);
      const delta = trend.length >= 2 ? trend[trend.length - 1] - trend[trend.length - 2] : 0;
      const helperText = sum === 0
        ? undefined
        : `${delta >= 0 ? '+' : ''}${delta} vs yesterday`;

      return {
        value: `${sum.toLocaleString()} done`,
        helperText,
        trendData: trend,
      };
    }

    default:
      return { value: '0' };
  }
}

// ---------------------------------------------------------------------------
// Display config resolution
// ---------------------------------------------------------------------------

/** Map of FontAwesome icon keys used in the web client -> MaterialIcons equivalents */
const ICON_FALLBACK_MAP: Record<string, string> = {
  faChartBar: 'bar-chart',
  faChartLine: 'show-chart',
  faChartPie: 'pie-chart',
  faListCheck: 'checklist',
  faCheckCircle: 'check-circle',
  faClock: 'schedule',
  faCalendarCheck: 'event-available',
  faTasks: 'task-alt',
  faGauge: 'speed',
  faBullseye: 'gps-fixed',
  faTrophy: 'emoji-events',
  faStar: 'star',
  faFire: 'local-fire-department',
  faRocket: 'rocket-launch',
  faBolt: 'bolt',
  faUsers: 'groups',
  faUserCheck: 'how-to-reg',
  faClipboardCheck: 'assignment-turned-in',
  faHashtag: 'tag',
  faPercent: 'percent',
  // Lucide BarChart3 default
  BarChart3: 'bar-chart',
};

function resolveIconName(displayConfig: Record<string, unknown>): string {
  const icon = displayConfig.icon as string | undefined;
  if (!icon) return 'bar-chart';
  return ICON_FALLBACK_MAP[icon] || 'bar-chart';
}

/** Map Tailwind color classes to hex colors */
const COLOR_MAP: Record<string, string> = {
  'text-blue-500': '#3B82F6',
  'text-blue-600': '#2563EB',
  'text-indigo-500': '#6366F1',
  'text-indigo-600': '#4F46E5',
  'text-amber-500': '#F59E0B',
  'text-amber-600': '#D97706',
  'text-emerald-500': '#10B981',
  'text-emerald-600': '#059669',
  'text-green-500': '#22C55E',
  'text-green-600': '#16A34A',
  'text-purple-500': '#A855F7',
  'text-purple-600': '#9333EA',
  'text-rose-500': '#F43F5E',
  'text-rose-600': '#E11D48',
  'text-red-500': '#EF4444',
  'text-red-600': '#DC2626',
  'text-teal-500': '#14B8A6',
  'text-teal-600': '#0D9488',
  'text-orange-500': '#F97316',
  'text-orange-600': '#EA580C',
  'text-cyan-500': '#06B6D4',
  'text-cyan-600': '#0891B2',
  'text-lime-500': '#84CC16',
  'text-pink-500': '#EC4899',
  'text-slate-500': '#64748B',
  // Short color names
  blue: '#3B82F6',
  indigo: '#6366F1',
  amber: '#F59E0B',
  emerald: '#10B981',
  green: '#22C55E',
  purple: '#A855F7',
  rose: '#F43F5E',
  red: '#EF4444',
  teal: '#14B8A6',
  orange: '#F97316',
  cyan: '#06B6D4',
};

function resolveIconColor(displayConfig: Record<string, unknown>): string {
  const color = displayConfig.color as string | undefined;
  if (!color) return '#10B981'; // default emerald
  // Direct hex
  if (color.startsWith('#')) return color;
  // Tailwind class or color name
  return COLOR_MAP[color] || '#10B981';
}
