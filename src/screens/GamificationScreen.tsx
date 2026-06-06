import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, LeaderboardEntry } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useGamification } from '../context/GamificationContext';
import { useAuth } from '../context/AuthContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type GamificationNavProp = NativeStackNavigationProp<RootStackParamList, 'Gamification'>;

type TabId = 'leaderboard' | 'badges' | 'levels';

export const GamificationScreen: React.FC = () => {
  const navigation = useNavigation<GamificationNavProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  const {
    leaderboard, pointsSummary, badges, levels, levelProgress,
    recentActivity, loading,
    fetchLeaderboard, fetchPointsSummary, fetchBadges, fetchLevels,
    fetchLevelProgress, fetchRecentActivity, refreshAll,
  } = useGamification();

  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all_time' | 'weekly' | 'monthly'>('all_time');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    refreshAll();
    fetchRecentActivity();
  }, []);

  useEffect(() => {
    fetchLeaderboard(leaderboardPeriod);
  }, [leaderboardPeriod]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    await fetchRecentActivity();
    setRefreshing(false);
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
  ];

  const getRankIcon = (rank: number) => {
    if (rank === 1) return { icon: 'emoji-events' as const, color: '#FFD700' };
    if (rank === 2) return { icon: 'emoji-events' as const, color: '#C0C0C0' };
    if (rank === 3) return { icon: 'emoji-events' as const, color: '#CD7F32' };
    return null;
  };

  const renderYourStats = () => (
    <View style={cardStyle}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="stars" size={20} color={primaryColor} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.yourStats')}</Text>
      </View>
      {pointsSummary ? (
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: primaryColor }]}>{pointsSummary.total_points}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('gamification.statTotal')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>{pointsSummary.weekly_points}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('gamification.statThisWeek')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>{pointsSummary.monthly_points}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('gamification.statThisMonth')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>#{pointsSummary.rank}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('gamification.statRank')}</Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator color={primaryColor} style={{ padding: spacing.md }} />
      )}
      {levelProgress?.current_level && (
        <View style={styles.levelProgressSection}>
          <View style={styles.levelRow}>
            <View style={[styles.levelBadge, { backgroundColor: levelProgress.current_level.color }]}>
              <Text style={styles.levelBadgeText}>{levelProgress.current_level.level_number}</Text>
            </View>
            <Text style={[styles.levelName, { color: colors.text }]}>{levelProgress.current_level.name}</Text>
          </View>
          <View style={[styles.progressBarBg, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}>
            <View style={[styles.progressBarFill, { width: `${levelProgress.progress_percentage}%`, backgroundColor: levelProgress.current_level.color }]} />
          </View>
          {levelProgress.points_to_next_level != null && (
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {t('gamification.ptsToNextLevel', { points: levelProgress.points_to_next_level, level: levelProgress.next_level?.name ?? 'next level' })}
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const renderLeaderboardEntry = (entry: LeaderboardEntry, index: number) => {
    const rankInfo = getRankIcon(entry.rank);
    const currentUserIds = [user?.id, (user as any)?.convexId, (user as any)?._id]
      .filter((value) => value != null)
      .map(String);
    const isMe = currentUserIds.includes(String(entry.user_id));
    return (
      <View
        key={entry.user_id}
        style={[
          styles.leaderboardRow,
          { backgroundColor: isMe ? (isDarkMode ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.05)') : 'transparent' },
          index < leaderboard.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6' },
        ]}
      >
        <View style={styles.rankCol}>
          {rankInfo ? (
            <MaterialIcons name={rankInfo.icon} size={20} color={rankInfo.color} />
          ) : (
            <Text style={[styles.rankText, { color: colors.textSecondary }]}>{entry.rank}</Text>
          )}
        </View>
        <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
          <Text style={styles.avatarText}>{(entry.user?.name ?? '?')[0].toUpperCase()}</Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={1}>{entry.user?.name}</Text>
        </View>
        <View style={[styles.pointsBadge, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)' }]}>
          <Text style={[styles.pointsBadgeText, { color: primaryColor }]}>
            {leaderboardPeriod === 'weekly' ? entry.weekly_points
              : leaderboardPeriod === 'monthly' ? entry.monthly_points
              : entry.total_points}
          </Text>
        </View>
      </View>
    );
  };

  const renderLeaderboard = () => (
    <View>
      {/* Period tabs */}
      <View style={styles.periodTabs}>
        {(['all_time', 'weekly', 'monthly'] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, leaderboardPeriod === p && { backgroundColor: primaryColor }]}
            onPress={() => setLeaderboardPeriod(p)}
          >
            <Text style={[styles.periodTabText, { color: leaderboardPeriod === p ? '#fff' : colors.textSecondary }]}>
              {p === 'all_time' ? t('gamification.periodAllTime') : p === 'weekly' ? t('gamification.periodWeekly') : t('gamification.periodMonthly')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={cardStyle}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="leaderboard" size={20} color={primaryColor} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.topPerformers')}</Text>
        </View>
        {leaderboard.length > 0 ? (
          leaderboard.map((entry, i) => renderLeaderboardEntry(entry, i))
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('gamification.noDataYet')}</Text>
        )}
      </View>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <View style={[cardStyle, { marginTop: spacing.md }]}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="bolt" size={20} color={primaryColor} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.recentActivity')}</Text>
          </View>
          {recentActivity.slice(0, 5).map(tx => (
            <View key={tx.id} style={styles.activityRow}>
              <View style={[styles.avatarSmall, { backgroundColor: primaryColor }]}>
                <Text style={styles.avatarSmallText}>{(tx.user?.name ?? '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activityText, { color: colors.text }]} numberOfLines={1}>
                  {tx.user?.name} - {tx.description ?? tx.action?.name}
                </Text>
              </View>
              <Text style={[styles.activityPoints, { color: primaryColor }]}>+{tx.points}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderBadges = () => (
    <View style={cardStyle}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="military-tech" size={20} color={primaryColor} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.badgesTitle')}</Text>
      </View>
      {badges.length > 0 ? (
        <View style={styles.badgeGrid}>
          {badges.map(badge => (
            <View key={badge.id} style={[styles.badgeItem, { opacity: badge.earned ? 1 : 0.5 }]}>
              <View style={[styles.badgeCircle, { backgroundColor: badge.earned ? badge.color : (isDarkMode ? '#374151' : '#D1D5DB') }]}>
                {badge.earned ? (
                  <Text style={styles.badgeCircleText}>{badge.name[0]}</Text>
                ) : badge.is_secret ? (
                  <MaterialIcons name="lock" size={18} color="#9CA3AF" />
                ) : (
                  <Text style={styles.badgeCircleText}>{badge.name[0]}</Text>
                )}
              </View>
              <Text style={[styles.badgeName, { color: colors.text }]} numberOfLines={1}>{badge.name}</Text>
              <Text style={[styles.badgeDesc, { color: colors.textSecondary }]} numberOfLines={2}>{badge.description}</Text>
              {!badge.earned && badge.progress && (
                <View style={styles.badgeProgressContainer}>
                  <View style={[styles.badgeProgressBg, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}>
                    <View style={[styles.badgeProgressFill, { width: `${badge.progress.percentage}%`, backgroundColor: badge.color }]} />
                  </View>
                  <Text style={[styles.badgeProgressText, { color: colors.textSecondary }]}>
                    {badge.progress.current}/{badge.progress.target}
                  </Text>
                </View>
              )}
              {badge.earned && (
                <View style={[styles.earnedBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.earnedBadgeText}>{t('gamification.earnedBadge')}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('gamification.noBadgesYet')}</Text>
      )}
    </View>
  );

  const renderLevels = () => (
    <View>
      {/* Current level progress */}
      {levelProgress?.current_level && (
        <View style={cardStyle}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="trending-up" size={20} color={primaryColor} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.currentLevel')}</Text>
          </View>
          <View style={styles.currentLevelSection}>
            <View style={[styles.levelCircleLarge, { backgroundColor: levelProgress.current_level.color }]}>
              <Text style={styles.levelCircleLargeText}>{levelProgress.current_level.level_number}</Text>
            </View>
            <Text style={[styles.currentLevelName, { color: colors.text }]}>{levelProgress.current_level.name}</Text>
            <Text style={[styles.currentLevelDesc, { color: colors.textSecondary }]}>{levelProgress.current_level.description}</Text>
            <Text style={[styles.totalPointsText, { color: primaryColor }]}>{levelProgress.total_points} {t('gamification.ptsUnit')}</Text>
            <View style={[styles.progressBarBg, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E5E7EB', marginTop: spacing.sm }]}>
              <View style={[styles.progressBarFill, { width: `${levelProgress.progress_percentage}%`, backgroundColor: levelProgress.current_level.color }]} />
            </View>
          </View>
        </View>
      )}

      {/* Level ladder */}
      <View style={[cardStyle, { marginTop: spacing.md }]}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="format-list-numbered" size={20} color={primaryColor} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('gamification.allLevels')}</Text>
        </View>
        {levels.map(level => (
          <View
            key={level.id}
            style={[
              styles.levelListItem,
              { opacity: level.is_unlocked ? 1 : 0.5 },
              level.is_current && { backgroundColor: isDarkMode ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.05)' },
            ]}
          >
            <View style={[styles.levelCircleSmall, { backgroundColor: level.color }]}>
              <Text style={styles.levelCircleSmallText}>{level.level_number}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.levelItemName, { color: colors.text }]}>{level.name}</Text>
              <Text style={[styles.levelItemRange, { color: colors.textSecondary }]}>
                {level.min_points} - {level.max_points != null ? `${level.max_points} ${t('gamification.ptsUnit')}` : t('gamification.unlimitedPoints')}
              </Text>
            </View>
            {level.is_current && (
              <View style={[styles.currentTag, { backgroundColor: '#8B5CF6' }]}>
                <Text style={styles.currentTagText}>{t('gamification.currentTag')}</Text>
              </View>
            )}
            {level.is_unlocked && !level.is_current && (
              <MaterialIcons name="check-circle" size={18} color="#10B981" />
            )}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('gamification.headerTitle')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('PointHistory')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialIcons name="history" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
        {([
          { id: 'leaderboard' as TabId, label: t('gamification.tabLeaderboard'), icon: 'leaderboard' as const },
          { id: 'badges' as TabId, label: t('gamification.tabBadges'), icon: 'military-tech' as const },
          { id: 'levels' as TabId, label: t('gamification.tabLevels'), icon: 'trending-up' as const },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <MaterialIcons name={tab.icon} size={18} color={activeTab === tab.id ? primaryColor : colors.textSecondary} />
            <Text style={[styles.tabText, { color: activeTab === tab.id ? primaryColor : colors.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
      >
        {renderYourStats()}
        <View style={{ height: spacing.md }} />
        {activeTab === 'leaderboard' && renderLeaderboard()}
        {activeTab === 'badges' && renderBadges()}
        {activeTab === 'levels' && renderLevels()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: fontSizes.lg, fontFamily: fontFamilies.displaySemibold },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 4,
  },
  tabText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md,
    ...shadows.subtle,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.displaySemibold },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  statItem: {
    flex: 1, minWidth: '40%', alignItems: 'center', paddingVertical: spacing.xs,
  },
  statValue: { fontSize: fontSizes.xl, fontFamily: fontFamilies.displayBold },
  statLabel: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular, marginTop: 2 },
  levelProgressSection: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  levelBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  levelBadgeText: { color: '#fff', fontSize: 12, fontFamily: fontFamilies.bodyBold },
  levelName: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: fontSizes.xs, marginTop: 4, fontFamily: fontFamilies.bodyRegular },
  periodTabs: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  periodTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  periodTabText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  leaderboardRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
  },
  rankCol: { width: 30, alignItems: 'center' },
  rankText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  avatarText: { color: '#fff', fontSize: 14, fontFamily: fontFamilies.bodyBold },
  nameCol: { flex: 1, marginLeft: 10 },
  entryName: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  pointsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pointsBadgeText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  avatarSmall: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: '#fff', fontSize: 12, fontFamily: fontFamilies.bodyBold },
  activityText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  activityPoints: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badgeItem: { width: '30%', alignItems: 'center', marginBottom: spacing.md },
  badgeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badgeCircleText: { color: '#fff', fontSize: 18, fontFamily: fontFamilies.bodyBold },
  badgeName: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold, marginTop: 6, textAlign: 'center' },
  badgeDesc: { fontSize: 10, fontFamily: fontFamilies.bodyRegular, textAlign: 'center', marginTop: 2 },
  badgeProgressContainer: { width: '100%', marginTop: 4 },
  badgeProgressBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  badgeProgressFill: { height: '100%', borderRadius: 2 },
  badgeProgressText: { fontSize: 9, fontFamily: fontFamilies.bodyRegular, textAlign: 'center', marginTop: 2 },
  earnedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  earnedBadgeText: { color: '#fff', fontSize: 10, fontFamily: fontFamilies.bodySemibold },
  currentLevelSection: { alignItems: 'center', paddingVertical: spacing.sm },
  levelCircleLarge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  levelCircleLargeText: { color: '#fff', fontSize: fontSizes.xl, fontFamily: fontFamilies.displayBold },
  currentLevelName: { fontSize: fontSizes.lg, fontFamily: fontFamilies.displayBold, marginTop: spacing.xs },
  currentLevelDesc: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular, textAlign: 'center', marginTop: 2 },
  totalPointsText: { fontSize: fontSizes.xl, fontFamily: fontFamilies.displayBold, marginTop: spacing.xs },
  levelListItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.md,
  },
  levelCircleSmall: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  levelCircleSmallText: { color: '#fff', fontSize: 14, fontFamily: fontFamilies.bodyBold },
  levelItemName: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  levelItemRange: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular },
  currentTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  currentTagText: { color: '#fff', fontSize: 10, fontFamily: fontFamilies.bodySemibold },
  emptyText: { textAlign: 'center', padding: spacing.lg, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
});
