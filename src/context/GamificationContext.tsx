import React, { createContext, useContext, useState, useCallback } from 'react';
import type {
  LeaderboardEntry,
  PointsSummary,
  PointTransaction,
  GamificationBadge,
  GamificationLevel,
  LevelProgress,
  LevelDistribution,
} from '../models/types';

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
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [pointsSummary, setPointsSummary] = useState<PointsSummary | null>(null);
  const [pointHistory, setPointHistory] = useState<PointTransaction[]>([]);
  const [recentActivity, setRecentActivity] = useState<PointTransaction[]>([]);
  const [badges, setBadges] = useState<GamificationBadge[]>([]);
  const [levels, setLevels] = useState<GamificationLevel[]>([]);
  const [levelProgress, setLevelProgress] = useState<LevelProgress | null>(null);
  const [levelDistribution, setLevelDistribution] = useState<LevelDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gamification not yet available in Convex — all fetches are no-ops
  const fetchLeaderboard = useCallback(async (_period?: string, _limit?: number) => {}, []);
  const fetchPointsSummary = useCallback(async () => {}, []);
  const fetchPointHistory = useCallback(async (_page?: number) => {}, []);
  const fetchRecentActivity = useCallback(async () => {}, []);
  const fetchBadges = useCallback(async () => {}, []);
  const fetchLevels = useCallback(async () => {}, []);
  const fetchLevelProgress = useCallback(async () => {}, []);
  const fetchLevelDistribution = useCallback(async () => {}, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchLeaderboard(),
        fetchPointsSummary(),
        fetchBadges(),
        fetchLevels(),
        fetchLevelProgress(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchLeaderboard, fetchPointsSummary, fetchBadges, fetchLevels, fetchLevelProgress]);

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
