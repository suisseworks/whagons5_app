import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { useTasks } from '../context/TaskContext';
import { fontFamilies } from '../config/designTokens';

type TimePeriod = 'today' | 'week' | 'month' | 'all';

const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), diff));
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getPeriodRange(period: TimePeriod): { start: Date; end: Date } | null {
  if (period === 'all') return null;
  const now = new Date();
  let start: Date;
  if (period === 'today') start = startOfDay(now);
  else if (period === 'week') start = startOfWeek(now);
  else start = startOfMonth(now);
  return { start, end: now };
}

function getPreviousPeriodRange(period: TimePeriod): { start: Date; end: Date } | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: startOfDay(yesterday), end: startOfDay(now) };
  }
  if (period === 'week') {
    const thisWeekStart = startOfWeek(now);
    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    return { start: prevWeekStart, end: thisWeekStart };
  }
  const thisMonthStart = startOfMonth(now);
  const prevMonthStart = new Date(thisMonthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  return { start: prevMonthStart, end: thisMonthStart };
}

function periodLabel(period: TimePeriod): string {
  if (period === 'today') return 'vs yesterday';
  if (period === 'week') return 'vs last week';
  if (period === 'month') return 'vs last month';
  return '';
}

function filterRawTasks(rawTasks: any[], range: { start: Date; end: Date } | null): any[] {
  if (!range) return rawTasks.filter((t: any) => !t.deleted_at);
  return rawTasks.filter((t: any) => {
    if (!t.created_at || t.deleted_at) return false;
    const cd = new Date(t.created_at);
    return cd >= range.start && cd < range.end;
  });
}

interface TrendInfo {
  delta: number;
  label: string;
  color: string;
  arrow: string;
}

function computeTrend(
  current: number,
  previous: number,
  suffix: string,
  isPercentage: boolean,
  invertColor: boolean,
): TrendInfo | null {
  if (!suffix) return null;
  const delta = current - previous;
  if (delta === 0) return { delta: 0, label: `→ 0 ${suffix}`, color: 'tertiary', arrow: '→' };
  const positive = delta > 0;
  const isGood = invertColor ? !positive : positive;
  const arrow = positive ? '↑' : '↓';
  const display = isPercentage ? `${Math.abs(delta)}%` : String(Math.abs(delta));
  return {
    delta,
    label: `${arrow} ${display} ${suffix}`,
    color: isGood ? '#1E7A34' : '#A32D2D',
    arrow,
  };
}

export const StatsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();
  const { data } = useData();
  const { tasks, availableStatuses } = useTasks();

  const [period, setPeriod] = useState<TimePeriod>('week');

  const secondarySurface = isDarkMode ? '#242424' : '#F5F5F7';
  const tertiaryText = isDarkMode ? 'rgba(255,255,255,0.45)' : '#73726C';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const trackBg = isDarkMode ? '#2E2E2E' : '#F0F0F0';

  const rawTasks = data.tasks as any[];

  const currentRange = useMemo(() => getPeriodRange(period), [period]);
  const previousRange = useMemo(() => getPreviousPeriodRange(period), [period]);

  const filteredRaw = useMemo(() => filterRawTasks(rawTasks, currentRange), [rawTasks, currentRange]);
  const previousRaw = useMemo(() => filterRawTasks(rawTasks, previousRange), [rawTasks, previousRange]);

  const filteredTasks = useMemo(() => {
    if (period === 'all') return tasks;
    if (!currentRange) return tasks;
    const idSet = new Set(filteredRaw.map((t: any) => String(t.id)));
    return tasks.filter((t) => idSet.has(String(t.id)));
  }, [tasks, filteredRaw, period, currentRange]);

  const totalCount = filteredTasks.length;

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filteredTasks) {
      const key = t.status.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [filteredTasks]);

  const finalStatusIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of data.statuses) {
      if (s.final) ids.add(String(s.id));
    }
    return ids;
  }, [data.statuses]);

  const completedCount = useMemo(() => {
    let count = 0;
    for (const [key, val] of statusCounts) {
      if (key.includes('complet') || key.includes('done') || key.includes('cerr')) count += val;
    }
    return count;
  }, [statusCounts]);

  const blockedCount = useMemo(() => {
    let count = 0;
    for (const [key, val] of statusCounts) {
      if (key.includes('bloqu') || key.includes('block')) count += val;
    }
    return count;
  }, [statusCounts]);

  const overdueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    for (const raw of filteredRaw) {
      const due = (raw as any).dueDate;
      if (!due || typeof due !== 'number') continue;
      if (due >= now) continue;
      if (finalStatusIds.has(String(raw.status_id ?? raw.statusId))) continue;
      count++;
    }
    return count;
  }, [filteredRaw, finalStatusIds]);

  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const prevCounts = useMemo(() => {
    const prevTotalCount = previousRaw.length;
    let prevCompleted = 0;
    let prevBlocked = 0;
    let prevOverdue = 0;
    const now = Date.now();
    for (const raw of previousRaw) {
      const statusName = (() => {
        const sid = raw.status_id ?? raw.statusId;
        if (!sid) return '';
        const s = data.statuses.find((st: any) => String(st.id) === String(sid));
        return s ? s.name.toLowerCase() : '';
      })();
      if (statusName.includes('complet') || statusName.includes('done') || statusName.includes('cerr')) prevCompleted++;
      if (statusName.includes('bloqu') || statusName.includes('block')) prevBlocked++;
      const due = (raw as any).dueDate;
      if (due && typeof due === 'number' && due < now && !finalStatusIds.has(String(raw.status_id ?? raw.statusId))) {
        prevOverdue++;
      }
    }
    const prevCompletionRate = prevTotalCount > 0 ? Math.round((prevCompleted / prevTotalCount) * 100) : 0;
    return { total: prevTotalCount, completionRate: prevCompletionRate, blocked: prevBlocked, overdue: prevOverdue };
  }, [previousRaw, data.statuses, finalStatusIds]);

  const trendSuffix = periodLabel(period);
  const totalTrend = computeTrend(totalCount, prevCounts.total, trendSuffix, false, false);
  const rateTrend = computeTrend(completionRate, prevCounts.completionRate, trendSuffix, true, false);
  const overdueTrend = computeTrend(overdueCount, prevCounts.overdue, trendSuffix, false, true);
  const blockedTrend = computeTrend(blockedCount, prevCounts.blocked, trendSuffix, false, true);

  const statusBars = useMemo(() => {
    const bars: { name: string; color: string; count: number }[] = [];
    const seen = new Set<string>();
    for (const s of availableStatuses) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const count = statusCounts.get(key) ?? 0;
      bars.push({ name: s.name, color: s.color || '#9CA3AF', count });
    }
    bars.sort((a, b) => b.count - a.count);
    return bars;
  }, [availableStatuses, statusCounts]);

  const maxStatusCount = useMemo(
    () => Math.max(...statusBars.map((b) => b.count), 1),
    [statusBars],
  );

  const dailyCounts = useMemo(() => {
    const days: { label: string; count: number; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = startOfDay(d);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = rawTasks.filter((t: any) => {
        if (!t.created_at || t.deleted_at) return false;
        const cd = new Date(t.created_at);
        return cd >= dayStart && cd < dayEnd;
      }).length;
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
        count,
        isToday: i === 0,
      });
    }
    return days;
  }, [rawTasks]);

  const maxDaily = useMemo(() => Math.max(...dailyCounts.map((d) => d.count), 1), [dailyCounts]);

  const topLocations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filteredTasks) {
      if (!t.spot) continue;
      counts.set(t.spot, (counts.get(t.spot) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [filteredTasks]);

  const renderTrend = (trend: TrendInfo | null) => {
    if (!trend) return null;
    const color = trend.color === 'tertiary' ? tertiaryText : trend.color;
    return <Text style={[styles.kpiTrend, { color }]}>{trend.label}</Text>;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Stats</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Time period selector */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.periodPill,
                  {
                    backgroundColor: active ? (isDarkMode ? '#1A1A1A' : '#FFFFFF') : secondarySurface,
                    borderColor: active ? borderColor : 'transparent',
                  },
                ]}
                onPress={() => setPeriod(p.key)}
              >
                <Text
                  style={[
                    styles.periodLabel,
                    { color: active ? colors.text : tertiaryText },
                    active && styles.periodLabelActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* KPI grid 2×2 */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: secondarySurface }]}>
            <Text style={[styles.kpiLabel, { color: tertiaryText }]}>TOTAL TASKS</Text>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{totalCount}</Text>
            {renderTrend(totalTrend)}
          </View>
          <View style={[styles.kpiCard, { backgroundColor: secondarySurface }]}>
            <Text style={[styles.kpiLabel, { color: tertiaryText }]}>COMPLETION RATE</Text>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{completionRate}%</Text>
            {renderTrend(rateTrend)}
          </View>
          <View style={[styles.kpiCard, { backgroundColor: secondarySurface }]}>
            <Text style={[styles.kpiLabel, { color: tertiaryText }]}>OVERDUE</Text>
            <Text style={[styles.kpiValue, { color: overdueCount > 0 ? '#A32D2D' : colors.text }]}>
              {overdueCount}
            </Text>
            {renderTrend(overdueTrend)}
          </View>
          <View style={[styles.kpiCard, { backgroundColor: secondarySurface }]}>
            <Text style={[styles.kpiLabel, { color: tertiaryText }]}>BLOCKED</Text>
            <Text style={[styles.kpiValue, { color: blockedCount > 0 ? '#A32D2D' : colors.text }]}>
              {blockedCount}
            </Text>
            {renderTrend(blockedTrend)}
          </View>
        </View>

        {/* Status breakdown */}
        <Text style={[styles.sectionTitle, { color: tertiaryText }]}>BY STATUS</Text>
        <View style={styles.statusBars}>
          {statusBars.map((bar) => (
            <View key={bar.name} style={styles.statusBarRow}>
              <Text style={[styles.statusBarLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {bar.name}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: trackBg }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: bar.color,
                      width: `${Math.max((bar.count / maxStatusCount) * 100, bar.count > 0 ? 3 : 0)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.statusBarCount, { color: colors.text }]}>{bar.count}</Text>
            </View>
          ))}
        </View>

        {/* 7-day creation chart */}
        <Text style={[styles.sectionTitle, { color: tertiaryText }]}>TASKS CREATED (7 DAYS)</Text>
        <View style={[styles.chartContainer, { backgroundColor: secondarySurface }]}>
          <View style={styles.chartBars}>
            {dailyCounts.map((day, i) => {
              const hasData = day.count > 0;
              const barHeight = hasData
                ? `${Math.max((day.count / maxDaily) * 100, 5)}%`
                : undefined;
              return (
                <View key={i} style={styles.chartBarCol}>
                  <View style={styles.chartBarTrack}>
                    {hasData ? (
                      <View
                        style={[
                          styles.chartBarFill,
                          {
                            height: barHeight,
                            backgroundColor: day.isToday ? '#B5D4F4' : '#DCEEFB',
                          },
                        ]}
                      />
                    ) : (
                      <View style={[styles.chartBarEmpty, { backgroundColor: trackBg }]} />
                    )}
                  </View>
                  {!hasData && (
                    <Text style={[styles.chartZeroLabel, { color: tertiaryText }]}>0</Text>
                  )}
                  <Text style={[styles.chartDayLabel, { color: tertiaryText }]}>{day.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Top locations */}
        {topLocations.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: tertiaryText }]}>TOP LOCATIONS</Text>
            <View style={styles.locationsContainer}>
              {topLocations.map((loc, i) => (
                <View
                  key={loc.name}
                  style={[
                    styles.locationRow,
                    i < topLocations.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: borderColor },
                  ]}
                >
                  <Text style={[styles.locationName, { color: colors.text }]} numberOfLines={1}>
                    {loc.name}
                  </Text>
                  <Text style={[styles.locationCount, { color: colors.text }]}>{loc.count}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontFamily: fontFamilies.bodySemibold },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  periodPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  periodLabel: { fontSize: 11, fontFamily: fontFamilies.bodyRegular },
  periodLabelActive: { fontFamily: fontFamilies.bodySemibold },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  kpiCard: {
    width: '48.5%' as any,
    flexGrow: 1,
    flexBasis: '46%' as any,
    padding: 12,
    borderRadius: 8,
  },
  kpiLabel: {
    fontSize: 10.5,
    fontFamily: fontFamilies.bodyMedium,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  kpiValue: { fontSize: 22, fontFamily: fontFamilies.bodySemibold },
  kpiTrend: { fontSize: 11, fontFamily: fontFamilies.bodyMedium, marginTop: 4 },

  sectionTitle: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    letterSpacing: 0.44,
    marginBottom: 10,
  },
  statusBars: { gap: 10, marginBottom: 24 },
  statusBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBarLabel: { width: 72, fontSize: 11, fontFamily: fontFamilies.bodyRegular },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  statusBarCount: { width: 28, fontSize: 11, fontFamily: fontFamilies.bodySemibold, textAlign: 'right' },

  chartContainer: { borderRadius: 8, padding: 16, marginBottom: 24 },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 100, gap: 6 },
  chartBarCol: { flex: 1, alignItems: 'center' },
  chartBarTrack: { width: '100%', height: 80, justifyContent: 'flex-end' },
  chartBarFill: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartBarEmpty: { width: '100%', height: 2, borderRadius: 1 },
  chartZeroLabel: { fontSize: 8, fontFamily: fontFamilies.bodyRegular, marginTop: 2 },
  chartDayLabel: { fontSize: 9.5, fontFamily: fontFamilies.bodyRegular, marginTop: 4 },

  locationsContainer: { marginBottom: 24 },
  locationRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  locationName: { fontSize: 12, fontFamily: fontFamilies.bodyRegular, flex: 1 },
  locationCount: { fontSize: 12, fontFamily: fontFamilies.bodySemibold },
});
