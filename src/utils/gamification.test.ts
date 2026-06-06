import assert from 'node:assert/strict';
import {
  normalizeGamificationBadge,
  normalizeGamificationLevel,
  normalizeLeaderboardEntry,
  normalizeLevelProgress,
  normalizePointTransaction,
  normalizePointsSummary,
} from './gamification';

const leaderboardEntry = normalizeLeaderboardEntry({
  rank: 2,
  user_id: 'user_123',
  total_points: 80,
  weekly_points: 15,
  monthly_points: 40,
  user: { _id: 'user_123', name: 'Ana', email: 'ana@example.com', avatar: 'avatar.png' },
});
assert.equal(leaderboardEntry.user_id, 'user_123');
assert.equal(leaderboardEntry.user.url_picture, 'avatar.png');
assert.equal(leaderboardEntry.total_points, 80);

const pointsSummary = normalizePointsSummary({
  total_points: 125,
  weekly_points: 20,
  monthly_points: 90,
  rank: null,
  total_users: 6,
});
assert.equal(pointsSummary?.rank, 0);
assert.equal(pointsSummary?.total_users, 6);

const transaction = normalizePointTransaction({
  _id: 'tx_1',
  userId: 'user_123',
  points: 5,
  description: 'Task completed',
  createdAt: 1790000000000,
  action: { slug: 'task_completed', name: 'Task completed' },
});
assert.equal(transaction.id, 'tx_1');
assert.equal(transaction.created_at, '1790000000000');
assert.equal(transaction.action?.slug, 'task_completed');

const badge = normalizeGamificationBadge({
  _id: 'badge_1',
  slug: 'closer',
  name: 'Closer',
  criteriaType: 'points_threshold',
  criteriaValue: 100,
  isSecret: true,
  earned: false,
  progress: { current: 40, target: 100, percentage: 40 },
});
assert.equal(badge.id, 'badge_1');
assert.equal(badge.criteria_type, 'points_threshold');
assert.equal(badge.progress?.percentage, 40);

const level = normalizeGamificationLevel({
  _id: 'level_1',
  levelNumber: 3,
  minPoints: 100,
  maxPoints: 199,
  is_current: true,
  is_unlocked: true,
  perks: ['Priority queue'],
});
assert.equal(level.id, 'level_1');
assert.equal(level.level_number, 3);
assert.deepEqual(level.perks, ['Priority queue']);

const progress = normalizeLevelProgress({
  total_points: 140,
  progress_percentage: 40,
  points_to_next_level: 60,
  current_level: level,
});
assert.equal(progress?.current_level?.id, 'level_1');
assert.equal(progress?.progress_percentage, 40);

process.stdout.write('gamification utils tests passed\n');
