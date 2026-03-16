import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, PointTransaction } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useGamification } from '../context/GamificationContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type PointHistoryNavProp = NativeStackNavigationProp<RootStackParamList, 'PointHistory'>;

const ACTION_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  task_completed: 'check-circle',
  task_created: 'add-task',
  comment_added: 'chat-bubble',
  document_uploaded: 'upload-file',
  daily_login: 'login',
  board_created: 'dashboard',
  board_message_posted: 'message',
  reaction_added: 'thumb-up',
  mention_made: 'alternate-email',
  profile_completed: 'person',
  working_hours_logged: 'schedule',
};

export const PointHistoryScreen: React.FC = () => {
  const navigation = useNavigation<PointHistoryNavProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { pointsSummary, pointHistory, fetchPointsSummary, fetchPointHistory } = useGamification();
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchPointsSummary();
    fetchPointHistory(1);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await Promise.all([fetchPointsSummary(), fetchPointHistory(1)]);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchPointHistory(nextPage);
    setLoadingMore(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' },
  ];

  const renderStatCard = (label: string, value: string | number, icon: keyof typeof MaterialIcons.glyphMap) => (
    <View style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' }]}>
      <MaterialIcons name={icon} size={18} color={primaryColor} />
      <Text style={[styles.miniCardValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.miniCardLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  const renderTransaction = ({ item }: { item: PointTransaction }) => {
    const actionSlug = item.action?.slug ?? '';
    const iconName = ACTION_ICONS[actionSlug] ?? 'stars';
    return (
      <View style={[styles.txRow, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
        <View style={[styles.txIcon, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)' }]}>
          <MaterialIcons name={iconName} size={18} color={primaryColor} />
        </View>
        <View style={styles.txContent}>
          <Text style={[styles.txAction, { color: colors.text }]} numberOfLines={1}>
            {item.action?.name ?? 'Action'}
          </Text>
          <Text style={[styles.txDesc, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={[styles.txDate, { color: colors.textSecondary }]}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={[styles.txPointsBadge, { backgroundColor: item.points > 0 ? '#10B981' : '#EF4444' }]}>
          <Text style={styles.txPointsText}>{item.points > 0 ? '+' : ''}{item.points}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Point History</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={pointHistory}
        keyExtractor={item => String(item.id)}
        renderItem={renderTransaction}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          pointsSummary ? (
            <View style={styles.statsRow}>
              {renderStatCard('Total', pointsSummary.total_points, 'stars')}
              {renderStatCard('Weekly', pointsSummary.weekly_points, 'date-range')}
              {renderStatCard('Monthly', pointsSummary.monthly_points, 'calendar-today')}
              {renderStatCard('Rank', `#${pointsSummary.rank}`, 'emoji-events')}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="emoji-events" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No point history yet</Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={primaryColor} style={{ padding: 16 }} /> : null}
      />
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
  statsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: 16, paddingBottom: 8,
  },
  miniCard: {
    flex: 1, minWidth: '22%', alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, ...shadows.subtle,
  },
  miniCardValue: { fontSize: fontSizes.md, fontFamily: fontFamilies.displayBold, marginTop: 4 },
  miniCardLabel: { fontSize: 10, fontFamily: fontFamilies.bodyRegular, marginTop: 2 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  txContent: { flex: 1, marginLeft: 12 },
  txAction: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  txDesc: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular, marginTop: 1 },
  txDate: { fontSize: 10, fontFamily: fontFamilies.bodyRegular, marginTop: 2 },
  txPointsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  txPointsText: { color: '#fff', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyBold },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular, marginTop: spacing.sm },
  card: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, ...shadows.subtle,
  },
});
