import React, { createContext, useContext, useState, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
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

  const fetchLeaderboard = useCallback(async (period: 'all_time' | 'weekly' | 'monthly' = 'all_time', limit = 20) => {
    try {
      const data = await apiClient.getLeaderboard(period, limit);
      setLeaderboard(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchPointsSummary = useCallback(async () => {
    try {
      const data = await apiClient.getMyPointsSummary();
      setPointsSummary(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchPointHistory = useCallback(async (page = 1) => {
    try {
      const res = await apiClient.getPointHistory(page);
      const items = res?.data ?? res;
      if (page === 1) {
        setPointHistory(Array.isArray(items) ? items : []);
      } else {
        setPointHistory(prev => [...prev, ...(Array.isArray(items) ? items : [])]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchRecentActivity = useCallback(async () => {
    try {
      const data = await apiClient.getRecentActivity();
      setRecentActivity(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const data = await apiClient.getBadges();
      setBadges(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchLevels = useCallback(async () => {
    try {
      const data = await apiClient.getLevels();
      setLevels(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchLevelProgress = useCallback(async () => {
    try {
      const data = await apiClient.getMyLevelProgress();
      setLevelProgress(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchLevelDistribution = useCallback(async () => {
    try {
      const data = await apiClient.getTeamLevelDistribution();
      setLevelDistribution(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

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
