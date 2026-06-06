import type {
  GamificationBadge,
  GamificationLevel,
  LeaderboardEntry,
  LevelDistribution,
  LevelProgress,
  PointTransaction,
  PointsSummary,
} from '../models/types';

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringOrEmpty = (value: unknown): string => value == null ? '' : String(value);
const toId = (value: unknown): number | string => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return 0;
};

const normalizeUser = (user: any) => ({
  id: toId(user?.id ?? user?._id ?? user?.user_id),
  name: toStringOrEmpty(user?.name),
  email: toStringOrEmpty(user?.email),
  url_picture: user?.url_picture ?? user?.urlPicture ?? user?.avatar ?? null,
});

const normalizeTransactionAction = (action: any) => ({
  slug: toStringOrEmpty(action?.slug),
  name: toStringOrEmpty(action?.name ?? action?.slug),
  icon: toStringOrEmpty(action?.icon),
});

export function normalizeLeaderboardEntry(entry: any): LeaderboardEntry {
  return {
    rank: toNumber(entry?.rank),
    user_id: toId(entry?.user_id ?? entry?.userId),
    total_points: toNumber(entry?.total_points ?? entry?.totalPoints),
    weekly_points: toNumber(entry?.weekly_points ?? entry?.weeklyPoints),
    monthly_points: toNumber(entry?.monthly_points ?? entry?.monthlyPoints),
    user: normalizeUser(entry?.user),
  };
}

export function normalizePointsSummary(summary: any): PointsSummary | null {
  if (!summary) return null;
  return {
    total_points: toNumber(summary.total_points ?? summary.totalPoints),
    weekly_points: toNumber(summary.weekly_points ?? summary.weeklyPoints),
    monthly_points: toNumber(summary.monthly_points ?? summary.monthlyPoints),
    rank: toNumber(summary.rank),
    total_users: toNumber(summary.total_users ?? summary.totalUsers),
  };
}

export function normalizePointTransaction(transaction: any): PointTransaction {
  return {
    id: toId(transaction?.id ?? transaction?._id),
    user_id: toId(transaction?.user_id ?? transaction?.userId),
    team_id: toId(transaction?.team_id ?? transaction?.teamId),
    point_action_id: toId(transaction?.point_action_id ?? transaction?.pointActionId),
    points: toNumber(transaction?.points),
    description: toStringOrEmpty(transaction?.description),
    reference_type: transaction?.reference_type ?? transaction?.referenceType ?? null,
    reference_id: transaction?.reference_id ?? transaction?.referenceId ?? null,
    created_at: String(transaction?.created_at ?? transaction?.createdAt ?? ''),
    action: transaction?.action ? normalizeTransactionAction(transaction.action) : undefined,
    user: transaction?.user ? {
      id: toId(transaction.user.id ?? transaction.user._id),
      name: toStringOrEmpty(transaction.user.name),
      url_picture: transaction.user.url_picture ?? transaction.user.urlPicture ?? transaction.user.avatar ?? null,
    } : undefined,
  };
}

export function normalizeGamificationBadge(badge: any): GamificationBadge {
  return {
    id: toId(badge?.id ?? badge?._id),
    slug: toStringOrEmpty(badge?.slug),
    name: toStringOrEmpty(badge?.name),
    description: toStringOrEmpty(badge?.description),
    icon: toStringOrEmpty(badge?.icon),
    color: toStringOrEmpty(badge?.color),
    category: toStringOrEmpty(badge?.category),
    criteria_type: toStringOrEmpty(badge?.criteria_type ?? badge?.criteriaType),
    criteria_value: toNumber(badge?.criteria_value ?? badge?.criteriaValue, 1),
    is_secret: Boolean(badge?.is_secret ?? badge?.isSecret),
    earned: Boolean(badge?.earned),
    earned_at: badge?.earned_at ?? badge?.earnedAt ?? null,
    progress: badge?.progress ? {
      current: toNumber(badge.progress.current),
      target: toNumber(badge.progress.target, 1),
      percentage: toNumber(badge.progress.percentage),
    } : undefined,
  };
}

export function normalizeGamificationLevel(level: any): GamificationLevel {
  return {
    id: toId(level?.id ?? level?._id),
    slug: toStringOrEmpty(level?.slug),
    name: toStringOrEmpty(level?.name),
    description: toStringOrEmpty(level?.description),
    icon: toStringOrEmpty(level?.icon),
    color: toStringOrEmpty(level?.color),
    level_number: toNumber(level?.level_number ?? level?.levelNumber),
    min_points: toNumber(level?.min_points ?? level?.minPoints),
    max_points: level?.max_points ?? level?.maxPoints ?? null,
    perks: Array.isArray(level?.perks) ? level.perks.map(String) : [],
    is_current: Boolean(level?.is_current ?? level?.isCurrent),
    is_unlocked: Boolean(level?.is_unlocked ?? level?.isUnlocked),
    progress: toNumber(level?.progress),
  };
}

export function normalizeLevelProgress(progress: any): LevelProgress | null {
  if (!progress) return null;
  return {
    current_level: progress.current_level ? normalizeGamificationLevel(progress.current_level) : null,
    total_points: toNumber(progress.total_points ?? progress.totalPoints),
    progress_percentage: toNumber(progress.progress_percentage ?? progress.progressPercentage),
    points_to_next_level: progress.points_to_next_level ?? progress.pointsToNextLevel ?? null,
    next_level: progress.next_level ? normalizeGamificationLevel(progress.next_level) : null,
  };
}

export function normalizeLevelDistribution(row: any): LevelDistribution {
  return {
    level: normalizeGamificationLevel(row?.level),
    user_count: toNumber(row?.user_count ?? row?.userCount),
  };
}
