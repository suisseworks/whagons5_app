import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TaskContext';
import { fontFamilies, radius } from '../config/designTokens';
import { RootStackParamList, TaskItem } from '../models/types';

type TaskShareLinkRoute = RouteProp<RootStackParamList, 'TaskShareLink'>;

function formatDate(timestamp?: number | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function buildTaskItemFromPreview(preview: any): TaskItem {
  return {
    id: preview.taskPgId != null ? String(preview.taskPgId) : undefined,
    convexId: preview.taskConvexId ?? undefined,
    taskConvexId: preview.taskConvexId ?? null,
    title: preview.title ?? 'Untitled',
    description: preview.description ?? null,
    spot: preview.spotName ?? '',
    spotId: preview.spotPgId ?? null,
    priority: preview.priorityName ?? 'Medium',
    priorityColor: preview.priorityColor ?? null,
    status: preview.statusName ?? '',
    statusColor: preview.statusColor ?? null,
    workspaceId: preview.workspacePgId ?? null,
    assignees: [],
    createdAt: formatDate(preview.createdAt) ?? '',
    tags: [],
  };
}

export const TaskShareLinkScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<TaskShareLinkRoute>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { token: authToken, isLoading: authLoading, subdomain, selectTenant } = useAuth();
  const { unfilteredTasks } = useTasks();
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const handoffStartedRef = useRef(false);
  const { token } = route.params;

  const preview = useQuery(
    api.taskPublicShares.getPublicPreviewByToken,
    token ? { token } : 'skip',
  );

  const matchedTask = useMemo(() => {
    if (!preview) return null;
    return unfilteredTasks.find((candidate) => (
      (preview.taskConvexId && candidate.convexId === preview.taskConvexId)
      || (preview.taskPgId != null && String(candidate.id) === String(preview.taskPgId))
    )) ?? null;
  }, [preview, unfilteredTasks]);

  const openTask = useCallback(async () => {
    if (!preview || !authToken) return;
    try {
      setHandoffError(null);
      if (subdomain !== preview.tenantId) {
        await selectTenant(preview.tenantId);
      }

      const task = matchedTask ?? buildTaskItemFromPreview(preview);
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'Main' },
            { name: 'TaskDetail', params: { task } },
          ],
        }),
      );
    } catch (error: any) {
      handoffStartedRef.current = false;
      setHandoffError(error?.message || t('taskShareLink.openFailed'));
    }
  }, [authToken, matchedTask, navigation, preview, selectTenant, subdomain, t]);

  useEffect(() => {
    if (!preview || authLoading || !authToken || handoffStartedRef.current) return;
    handoffStartedRef.current = true;
    void openTask();
  }, [authLoading, authToken, openTask, preview]);

  const surfaceColor = isDarkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const secondaryText = isDarkMode ? 'rgba(255,255,255,0.65)' : '#6B7280';
  const tertiaryText = isDarkMode ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  if (preview === undefined || authLoading || (preview && authToken && !handoffError)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.title, { color: colors.text }]}>{t('taskShareLink.openingTitle')}</Text>
          <Text style={[styles.subtitle, { color: secondaryText }]}>{t('taskShareLink.openingSubtitle')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (preview === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.title, { color: colors.text }]}>{t('taskShareLink.invalidTitle')}</Text>
          <Text style={[styles.subtitle, { color: secondaryText }]}>{t('taskShareLink.invalidSubtitle')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: surfaceColor, borderColor }]}> 
          <Text style={[styles.eyebrow, { color: primaryColor }]}>{t('taskShareLink.eyebrow')}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{preview.title}</Text>
          {!!preview.description && (
            <Text style={[styles.subtitle, { color: secondaryText }]}>{preview.description}</Text>
          )}

          <View style={styles.metaGrid}>
            {preview.workspaceName && (
              <View style={[styles.metaCard, { borderColor }]}> 
                <Text style={[styles.metaLabel, { color: tertiaryText }]}>{t('taskShareLink.workspaceLabel')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{preview.workspaceName}</Text>
              </View>
            )}
            {preview.statusName && (
              <View style={[styles.metaCard, { borderColor }]}> 
                <Text style={[styles.metaLabel, { color: tertiaryText }]}>{t('taskShareLink.statusLabel')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{preview.statusName}</Text>
              </View>
            )}
            {preview.priorityName && (
              <View style={[styles.metaCard, { borderColor }]}> 
                <Text style={[styles.metaLabel, { color: tertiaryText }]}>{t('taskShareLink.priorityLabel')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{preview.priorityName}</Text>
              </View>
            )}
            {preview.dueDate && (
              <View style={[styles.metaCard, { borderColor }]}> 
                <Text style={[styles.metaLabel, { color: tertiaryText }]}>{t('taskShareLink.dueLabel')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{formatDate(preview.dueDate)}</Text>
              </View>
            )}
          </View>

          {handoffError ? (
            <Text style={[styles.errorText, { color: '#EF4444' }]}>{handoffError}</Text>
          ) : null}

          {authToken ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={() => void openTask()}>
              <Text style={styles.buttonText}>{t('taskShareLink.openTaskButton')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor }]}
              onPress={() => navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }))}
            >
              <Text style={styles.buttonText}>{t('taskShareLink.goToLoginButton')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: fontFamilies.bodySemibold,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaCard: {
    flexGrow: 1,
    minWidth: '46%',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fontFamilies.bodySemibold,
  },
  metaValue: {
    fontSize: 15,
    fontFamily: fontFamilies.bodySemibold,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
  },
  button: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: fontFamilies.bodySemibold,
  },
});
