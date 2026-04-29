import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useNetwork } from '../context/NetworkContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'OfflineQueue'>;

function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return '-';
  return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export const OfflineQueueScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { isOnline } = useNetwork();
  const {
    queue,
    pendingCount,
    failedCount,
    isReplaying,
    refreshQueue,
    replayNow,
    retryMutation,
    removeQueuedMutation,
    clearQueue,
  } = useMutationQueue();

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const statusLabel = useCallback((status: 'pending' | 'syncing' | 'failed') => {
    if (status === 'syncing') return t('settings.queueStatusSyncing');
    if (status === 'failed') return t('settings.queueStatusFailed');
    return t('settings.queueStatusPending');
  }, [t]);

  const statusColor = useCallback((status: 'pending' | 'syncing' | 'failed') => {
    if (status === 'syncing') return '#0284C7';
    if (status === 'failed') return '#DC2626';
    return '#F59E0B';
  }, []);

  const sortedQueue = useMemo(
    () => [...queue].sort((a, b) => b.created_at - a.created_at),
    [queue],
  );

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      t('settings.queueClearTitle'),
      t('settings.queueClearMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.queueClearButton'),
          style: 'destructive',
          onPress: () => {
            void clearQueue();
          },
        },
      ],
    );
  }, [clearQueue, t]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background }]}> 
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings.offlineQueueTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' }]}> 
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('settings.queueConnection')}</Text>
          <Text style={[styles.summaryValue, { color: isOnline ? '#16A34A' : '#DC2626' }]}>
            {isOnline ? t('settings.queueOnline') : t('settings.queueOffline')}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('settings.queuePending')}</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{pendingCount}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('settings.queueFailed')}</Text>
          <Text style={[styles.summaryValue, { color: failedCount > 0 ? '#DC2626' : colors.text }]}>{failedCount}</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: primaryColor,
                opacity: !isOnline || pendingCount === 0 || isReplaying ? 0.5 : 1,
              },
            ]}
            disabled={!isOnline || pendingCount === 0 || isReplaying}
            onPress={() => {
              void replayNow();
            }}
          >
            <Text style={styles.actionButtonText}>
              {isReplaying ? t('settings.queueSyncingNow') : t('settings.queueRetryAll')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.clearButton, { borderColor: '#DC2626' }]}
            onPress={handleClearQueue}
            disabled={queue.length === 0}
          >
            <Text style={[styles.clearButtonText, { opacity: queue.length === 0 ? 0.5 : 1 }]}>
              {t('settings.queueClearButton')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sortedQueue}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="task-alt" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('settings.queueEmptyTitle')}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('settings.queueEmptySubtitle')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = statusColor(item.status);
          const canRetry = isOnline && !isReplaying;
          return (
            <View style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7' }]}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemApiPath, { color: colors.text }]} numberOfLines={1}>{item.api_path}</Text>
                <Text style={[styles.itemStatus, { color }]}>{statusLabel(item.status)}</Text>
              </View>

              <Text style={[styles.itemMeta, { color: colors.textSecondary }]}> 
                {t('settings.queueCreatedAt')}: {formatTimestamp(item.created_at)}
              </Text>
              <Text style={[styles.itemMeta, { color: colors.textSecondary }]}> 
                {t('settings.queueAttempts')}: {item.attempts ?? 0}
              </Text>
              {item.next_retry_at > 0 && (
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}> 
                  {t('settings.queueNextRetry')}: {formatTimestamp(item.next_retry_at)}
                </Text>
              )}
              {!!item.last_error && (
                <Text style={[styles.itemError, { color: '#DC2626' }]} numberOfLines={2}>
                  {item.last_error}
                </Text>
              )}

              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={[styles.itemButton, { borderColor: primaryColor, opacity: canRetry ? 1 : 0.5 }]}
                  disabled={!canRetry}
                  onPress={() => {
                    void retryMutation(item.id);
                  }}
                >
                  <Text style={[styles.itemButtonText, { color: primaryColor }]}>{t('settings.queueRetryButton')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.itemButton, { borderColor: '#DC2626' }]}
                  onPress={() => {
                    void removeQueuedMutation(item.id);
                  }}
                >
                  <Text style={[styles.itemButtonText, { color: '#DC2626' }]}>{t('settings.queueRemoveButton')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  summaryValue: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  clearButtonText: {
    color: '#DC2626',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: 8,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemApiPath: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  itemStatus: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'uppercase',
  },
  itemMeta: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
  },
  itemError: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  itemButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemButtonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    gap: 8,
  },
  emptyTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  emptySubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
});
