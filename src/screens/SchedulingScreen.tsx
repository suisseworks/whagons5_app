import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useTenant } from '../hooks/useTenant';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

const DAY_MS = 24 * 60 * 60 * 1000;

const LEAVE_COLORS: Record<string, string> = {
  L: '#dcfce7',
  V: '#fef3c7',
  I: '#fee2e2',
  R: '#ede9fe',
  A: '#e2e8f0',
};

function startOfUtcWeek(ts: number): number {
  const date = new Date(ts);
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = new Date(utcMidnight).getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return utcMidnight + diff * DAY_MS;
}

function formatWeekRange(ts: number, locale: string): string {
  const start = startOfUtcWeek(ts);
  const end = start + (6 * DAY_MS);
  const startLabel = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
  return `${startLabel} - ${endLabel}`;
}

function buildDayColumns(ts: number, locale: string) {
  const start = startOfUtcWeek(ts);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = start + (index * DAY_MS);
    return {
      ts: date,
      key: new Date(date).toISOString().slice(0, 10),
      dayLabel: new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date),
      numberLabel: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(date),
    };
  });
}

function entryDateKey(ts: number): string {
  const date = new Date(ts);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function dayBounds(ts: number) {
  const startMs = Date.parse(`${entryDateKey(ts)}T00:00:00Z`);
  return { start: startMs, end: startMs + DAY_MS - 1 };
}

export const SchedulingScreen: React.FC = () => {
  const { tenantId } = useTenant();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t, language } = useLanguage();
  const locale = language === 'es' ? 'es-CR' : 'en-US';
  const currentWeekStart = useMemo(() => startOfUtcWeek(Date.now()), []);

  const boardsQuery = useQuery(
    api.scheduling.listBoards,
    tenantId ? { tenantId } : 'skip',
  );

  const boards = useMemo(
    () => (boardsQuery ?? []).filter((board: any) => board.isActive !== false),
    [boardsQuery],
  );

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  useEffect(() => {
    if (boards.length === 0) {
      setSelectedBoardId(null);
      return;
    }
    if (!selectedBoardId || !boards.some((board: any) => String(board._id) === selectedBoardId)) {
      setSelectedBoardId(String(boards[0]._id));
    }
  }, [boards, selectedBoardId]);

  const selectedBoard = useMemo(
    () => boards.find((board: any) => String(board._id) === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  const weeksQuery = useQuery(
    api.scheduling.listWeeks,
    tenantId && selectedBoardId
      ? { tenantId, boardId: selectedBoardId as Id<'scheduleBoards'> }
      : 'skip',
  );

  const weeks = weeksQuery ?? [];

  useEffect(() => {
    if (!selectedBoardId) return;
    if (weeks.some((week: any) => week.weekStartDate === selectedWeekStart)) return;
    setSelectedWeekStart(weeks[0]?.weekStartDate ?? currentWeekStart);
  }, [currentWeekStart, selectedBoardId, selectedWeekStart, weeks]);

  const plannerData = useQuery(
    api.scheduling.getPlannerData,
    tenantId && selectedBoardId
      ? {
          tenantId,
          boardId: selectedBoardId as Id<'scheduleBoards'>,
          weekStartDate: selectedWeekStart,
        }
      : 'skip',
  );

  const loadingBoards = Boolean(tenantId) && boardsQuery === undefined;
  const loadingPlanner = Boolean(selectedBoardId) && (weeksQuery === undefined || plannerData === undefined);

  const dayColumns = useMemo(
    () => buildDayColumns(selectedWeekStart, locale),
    [locale, selectedWeekStart],
  );

  const rosterMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const entry of plannerData?.rosterEntries ?? []) {
      map.set(`${String(entry.userId)}:${entryDateKey(entry.date)}`, entry);
    }
    return map;
  }, [plannerData?.rosterEntries]);

  const shiftMap = useMemo(
    () => new Map<string, any>((plannerData?.shifts ?? []).map((shift: any) => [String(shift._id), shift])),
    [plannerData?.shifts],
  );

  const latestSubmissionByUser = useMemo(() => {
    const map = new Map<string, any>();
    const sorted = [...(plannerData?.submissions ?? [])].sort(
      (a, b) => (b.parsedAt ?? 0) - (a.parsedAt ?? 0),
    );
    for (const submission of sorted) {
      const key = String(submission.userId);
      if (!map.has(key)) {
        map.set(key, submission);
      }
    }
    return map;
  }, [plannerData?.submissions]);

  const rosterEntryCount = useMemo(
    () =>
      (plannerData?.rosterEntries ?? []).filter(
        (entry: any) => Boolean(entry.shiftTemplateId) || Boolean(entry.leaveCode),
      ).length,
    [plannerData?.rosterEntries],
  );

  const boardKindLabel = useMemo(() => {
    if (!plannerData?.boardKind) return null;
    if (plannerData.boardKind === 'rollup') return t('main.schedulingRollup');
    if (plannerData.boardKind === 'management') return t('main.schedulingManagement');
    return t('main.schedulingStandard');
  }, [plannerData?.boardKind, t]);

  const weekStatusLabel = plannerData?.week?._id
    ? plannerData.week.status === 'published'
      ? t('main.schedulingPublished')
      : t('main.schedulingDraft')
    : t('main.schedulingNoPublishedWeek');

  const renderAssignment = (member: any, dayTs: number) => {
    const key = `${String(member._id)}:${entryDateKey(dayTs)}`;
    const entry = rosterMap.get(key);
    const shift = entry?.shiftTemplateId ? shiftMap.get(String(entry.shiftTemplateId)) : null;
    const bounds = dayBounds(dayTs);
    const hasApprovedTimeOff = (plannerData?.approvedTimeOff ?? []).some((request: any) => {
      if (String(request.userId) !== String(member._id)) return false;
      return request.startDate <= bounds.end && bounds.start <= request.endDate;
    });

    if (entry?.leaveCode) {
      return {
        title: entry.leaveCode,
        subtitle: entry.stationLabel || t('main.schedulingLeave'),
        backgroundColor: LEAVE_COLORS[entry.leaveCode] || (isDarkMode ? '#333333' : '#F3F4F6'),
        titleColor: '#111827',
        subtitleColor: '#4B5563',
      };
    }

    if (shift) {
      return {
        title: shift.code || shift.label || t('main.schedulingAssigned'),
        subtitle: entry?.stationLabel || shift.label || '',
        backgroundColor: shift.color || (isDarkMode ? '#253247' : '#EAF2FF'),
        titleColor: shift.color ? '#111827' : (isDarkMode ? '#E5EEF9' : '#111827'),
        subtitleColor: shift.color ? '#4B5563' : (isDarkMode ? '#C8D8ED' : '#4B5563'),
      };
    }

    if (hasApprovedTimeOff) {
      return {
        title: t('main.schedulingTimeOff'),
        subtitle: t('main.schedulingApproved'),
        backgroundColor: isDarkMode ? '#3D2A2A' : '#FEE2E2',
        titleColor: isDarkMode ? '#FDE2E2' : '#991B1B',
        subtitleColor: isDarkMode ? '#F6CACA' : '#B91C1C',
      };
    }

    return {
      title: t('main.schedulingNoAssignment'),
      subtitle: '',
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F7F7F8',
      titleColor: isDarkMode ? colors.text : '#111827',
      subtitleColor: isDarkMode ? colors.textSecondary : '#4B5563',
    };
  };

  if (loadingBoards) {
    return (
      <View style={[styles.centeredState, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          {t('main.schedulingLoading')}
        </Text>
      </View>
    );
  }

  if (!tenantId || boards.length === 0) {
    return (
      <View style={[styles.centeredState, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : `${primaryColor}18` },
          ]}
        >
          <MaterialIcons name="calendar-month" size={34} color={primaryColor} />
        </View>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          {t('main.noSchedulingBoards')}
        </Text>
        <Text style={[styles.stateSubtitle, { color: colors.textSecondary }]}>
          {t('main.schedulingBoardsWillAppear')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('main.schedulingTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('main.schedulingSubtitle')}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardTabs}
      >
        {boards.map((board: any) => {
          const isSelected = String(board._id) === selectedBoardId;
          return (
            <TouchableOpacity
              key={String(board._id)}
              style={[
                styles.boardTab,
                {
                  backgroundColor: isSelected ? primaryColor : (isDarkMode ? colors.surface : '#FFFFFF'),
                  borderColor: isSelected
                    ? primaryColor
                    : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                },
              ]}
              onPress={() => setSelectedBoardId(String(board._id))}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.boardTabName,
                  { color: isSelected ? '#FFFFFF' : colors.text },
                ]}
                numberOfLines={1}
              >
                {board.name}
              </Text>
              <Text
                style={[
                  styles.boardTabMeta,
                  { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {board.timezone || 'UTC'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: isDarkMode ? colors.surface : '#FFFFFF',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              {selectedBoard?.name}
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              {boardKindLabel ? `${boardKindLabel} · ${selectedBoard?.timezone || 'UTC'}` : (selectedBoard?.timezone || 'UTC')}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  plannerData?.week?.status === 'published'
                    ? (isDarkMode ? '#183824' : '#DCFCE7')
                    : (isDarkMode ? '#3B2F1B' : '#FEF3C7'),
              },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                {
                  color:
                    plannerData?.week?.status === 'published'
                      ? (isDarkMode ? '#86EFAC' : '#166534')
                      : (isDarkMode ? '#FDE68A' : '#92400E'),
                },
              ]}
            >
              {weekStatusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.weekSwitcher}>
          <TouchableOpacity
            style={[
              styles.weekArrow,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
              },
            ]}
            onPress={() => setSelectedWeekStart((current) => current - (7 * DAY_MS))}
          >
            <MaterialIcons name="chevron-left" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.weekLabelWrap}>
            <Text style={[styles.weekLabelCaption, { color: colors.textSecondary }]}>
              {t('main.schedulingWeekOf')}
            </Text>
            <Text style={[styles.weekLabel, { color: colors.text }]}>
              {formatWeekRange(selectedWeekStart, locale)}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.weekArrow,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
              },
            ]}
            onPress={() => setSelectedWeekStart((current) => current + (7 * DAY_MS))}
          >
            <MaterialIcons name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
              },
            ]}
          >
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {plannerData?.teamMembers?.length ?? 0}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('main.schedulingTeamMembers')}
            </Text>
          </View>
          <View
            style={[
              styles.metricCard,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
              },
            ]}
          >
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {rosterEntryCount}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {t('main.schedulingAssignedShifts')}
            </Text>
          </View>
        </View>
      </View>

      {loadingPlanner ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('main.schedulingLoadingWeek')}
          </Text>
        </View>
      ) : (plannerData?.teamMembers ?? []).length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: isDarkMode ? colors.surface : '#FFFFFF',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <MaterialIcons name="groups-2" size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyCardTitle, { color: colors.text }]}>
            {t('main.schedulingNoMembers')}
          </Text>
          <Text style={[styles.emptyCardSubtitle, { color: colors.textSecondary }]}>
            {t('main.schedulingNoMembersSubtitle')}
          </Text>
        </View>
      ) : (
        <View style={styles.memberList}>
          {(plannerData?.teamMembers ?? []).map((member: any) => {
            const submission = latestSubmissionByUser.get(String(member._id));
            return (
              <View
                key={String(member._id)}
                style={[
                  styles.memberCard,
                  {
                    backgroundColor: isDarkMode ? colors.surface : '#FFFFFF',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <View style={styles.memberHeader}>
                  <View style={styles.memberIdentity}>
                    <View style={[styles.memberAvatar, { backgroundColor: primaryColor }]}>
                      <Text style={styles.memberAvatarText}>
                        {(member.name ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {member.name}
                      </Text>
                      <Text style={[styles.memberMeta, { color: colors.textSecondary }]}>
                        {submission?.parseStatus ?? t('main.schedulingNoSubmission')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.dayList}>
                  {dayColumns.map((day) => {
                    const assignment = renderAssignment(member, day.ts);
                    return (
                      <View
                        key={`${String(member._id)}:${day.key}`}
                        style={[
                          styles.dayRow,
                          {
                            borderBottomColor: isDarkMode
                              ? 'rgba(255,255,255,0.06)'
                              : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        <View style={styles.dayLabelWrap}>
                          <Text style={[styles.dayName, { color: colors.text }]}>
                            {day.dayLabel}
                          </Text>
                          <Text style={[styles.dayNumber, { color: colors.textSecondary }]}>
                            {day.numberLabel}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.assignmentCard,
                            { backgroundColor: assignment.backgroundColor },
                          ]}
                        >
                          <Text style={[styles.assignmentTitle, { color: assignment.titleColor }]}>
                            {assignment.title}
                          </Text>
                          {assignment.subtitle ? (
                            <Text style={[styles.assignmentSubtitle, { color: assignment.subtitleColor }]}>
                              {assignment.subtitle}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  boardTabs: {
    gap: 10,
    paddingRight: spacing.md,
  },
  boardTab: {
    minWidth: 150,
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  boardTabName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  boardTabMeta: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  weekSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabelCaption: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  weekLabel: {
    marginTop: 2,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricValue: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  loadingWrap: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  stateTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  stateSubtitle: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyCardTitle: {
    marginTop: 12,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  emptyCardSubtitle: {
    marginTop: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
    lineHeight: 20,
  },
  memberList: {
    gap: spacing.md,
  },
  memberCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  memberHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  memberIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  memberName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  memberMeta: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    textTransform: 'capitalize',
  },
  dayList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dayLabelWrap: {
    width: 84,
  },
  dayName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'capitalize',
  },
  dayNumber: {
    marginTop: 1,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  assignmentCard: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assignmentTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  assignmentSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
});
