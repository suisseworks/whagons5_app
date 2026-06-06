import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type {
  LeaderboardEntry,
  PointsSummary,
  PointTransaction,
  GamificationBadge,
  GamificationLevel,
  LevelProgress,
  LevelDistribution,
} from '../models/types';
import { useTenant } from '../hooks/useTenant';
import {
  normalizeGamificationBadge,
  normalizeGamificationLevel,
  normalizeLeaderboardEntry,
  normalizeLevelDistribution,
  normalizeLevelProgress,
  normalizePointTransaction,
  normalizePointsSummary,
} from '../utils/gamification';

interface GamificationState {
  leaderboard: LeaderboardEntry[];
  pointsSummary: PointsSummary | null;
  pointHistory: PointTransaction[];
  recentActivity: PointTransaction[];
  badges: GamificationBadge[];
  levels: GamificationLevel[];
  levelProgress: LevelProgress | null;
  levelDistribution: LevelDistribution[];
  loading: boolean;
  error: string | null;
}

interface GamificationContextValue extends GamificationState {
  fetchLeaderboard: (period?: 'all_time' | 'weekly' | 'monthly', limit?: number) => Promise<void>;
  fetchPointsSummary: () => Promise<void>;
  fetchPointHistory: (page?: number) => Promise<void>;
  fetchRecentActivity: () => Promise<void>;
  fetchBadges: () => Promise<void>;
  fetchLevels: () => Promise<void>;
  fetchLevelProgress: () => Promise<void>;
  fetchLevelDistribution: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export const GamificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenantId } = useTenant();
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all_time' | 'weekly' | 'monthly'>('all_time');
  const [leaderboardLimit, setLeaderboardLimit] = useState(20);
  const [pointHistoryLimit, setPointHistoryLimit] = useState(20);
  const [recentActivityLimit, setRecentActivityLimit] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const leaderboardQuery = useQuery(
    api.gamification.leaderboard,
    tenantId ? { tenantId, period: leaderboardPeriod, limit: leaderboardLimit } : 'skip',
  );
  const pointsSummaryQuery = useQuery(api.gamification.myPointsSummary, tenantId ? { tenantId } : 'skip');
  const pointHistoryQuery = useQuery(
    api.gamification.pointHistory,
    tenantId ? { tenantId, limit: pointHistoryLimit } : 'skip',
  );
  const recentActivityQuery = useQuery(
    api.gamification.recentActivity,
    tenantId ? { tenantId, limit: recentActivityLimit } : 'skip',
  );
  const badgesQuery = useQuery(api.gamification.badgesWithProgress, tenantId ? { tenantId } : 'skip');
  const levelsQuery = useQuery(api.gamification.levelsWithProgress, tenantId ? { tenantId } : 'skip');
  const levelProgressQuery = useQuery(api.gamification.myLevelProgress, tenantId ? { tenantId } : 'skip');
  const levelDistributionQuery = useQuery(api.gamification.teamLevelDistribution, tenantId ? { tenantId } : 'skip');

  const leaderboard = useMemo<LeaderboardEntry[]>(
    () => (leaderboardQuery ?? []).map(normalizeLeaderboardEntry),
    [leaderboardQuery],
  );
  const pointsSummary = useMemo<PointsSummary | null>(
    () => normalizePointsSummary(pointsSummaryQuery),
    [pointsSummaryQuery],
  );
  const pointHistory = useMemo<PointTransaction[]>(
    () => ((pointHistoryQuery as any)?.data ?? []).map(normalizePointTransaction),
    [pointHistoryQuery],
  );
  const recentActivity = useMemo<PointTransaction[]>(
    () => (recentActivityQuery ?? []).map(normalizePointTransaction),
    [recentActivityQuery],
  );
  const badges = useMemo<GamificationBadge[]>(
    () => (badgesQuery ?? []).map(normalizeGamificationBadge),
    [badgesQuery],
  );
  const levels = useMemo<GamificationLevel[]>(
    () => (levelsQuery ?? []).map(normalizeGamificationLevel),
    [levelsQuery],
  );
  const levelProgress = useMemo<LevelProgress | null>(
    () => normalizeLevelProgress(levelProgressQuery),
    [levelProgressQuery],
  );
  const levelDistribution = useMemo<LevelDistribution[]>(
    () => (levelDistributionQuery ?? []).map(normalizeLevelDistribution),
    [levelDistributionQuery],
  );

  const loading = !!tenantId && [
    leaderboardQuery,
    pointsSummaryQuery,
    pointHistoryQuery,
    recentActivityQuery,
    badgesQuery,
    levelsQuery,
    levelProgressQuery,
    levelDistributionQuery,
  ].some((value) => value === undefined);

  const fetchLeaderboard = useCallback(async (period?: 'all_time' | 'weekly' | 'monthly', limit?: number) => {
    if (period) setLeaderboardPeriod(period);
    if (limit) setLeaderboardLimit(limit);
    setError(null);
  }, []);
  const fetchPointsSummary = useCallback(async () => setError(null), []);
  const fetchPointHistory = useCallback(async (page?: number) => {
    setPointHistoryLimit(Math.max(20, (page ?? 1) * 20));
    setError(null);
  }, []);
  const fetchRecentActivity = useCallback(async () => {
    setRecentActivityLimit(10);
    setError(null);
  }, []);
  const fetchBadges = useCallback(async () => setError(null), []);
  const fetchLevels = useCallback(async () => setError(null), []);
  const fetchLevelProgress = useCallback(async () => setError(null), []);
  const fetchLevelDistribution = useCallback(async () => setError(null), []);

  const refreshAll = useCallback(async () => {
    setError(null);
    await Promise.all([
      fetchLeaderboard(),
      fetchPointsSummary(),
      fetchRecentActivity(),
      fetchBadges(),
      fetchLevels(),
      fetchLevelProgress(),
      fetchLevelDistribution(),
    ]);
  }, [
    fetchLeaderboard,
    fetchPointsSummary,
    fetchRecentActivity,
    fetchBadges,
    fetchLevels,
    fetchLevelProgress,
    fetchLevelDistribution,
  ]);

  return (
    <GamificationContext.Provider
      value={{
        leaderboard,
        pointsSummary,
        pointHistory,
        recentActivity,
        badges,
        levels,
        levelProgress,
        levelDistribution,
        loading,
        error,
        fetchLeaderboard,
        fetchPointsSummary,
        fetchPointHistory,
        fetchRecentActivity,
        fetchBadges,
        fetchLevels,
        fetchLevelProgress,
        fetchLevelDistribution,
        refreshAll,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
};

export const useGamification = (): GamificationContextValue => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return context;
};
