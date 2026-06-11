import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { useTasks } from '../context/TaskContext';
import { fontFamilies, radius } from '../config/designTokens';
import { RootStackParamList, TaskItem } from '../models/types';

type NfcTapRoute = RouteProp<RootStackParamList, 'NfcTap'>;
type FeedbackState = 'idle' | 'running' | 'success' | 'warning' | 'error';
type SuccessTarget = { kind: 'task'; task: TaskItem } | { kind: 'external_url'; url: string } | null;

function makeClientTapId() {
  return `mobile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(timestamp?: number | null) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function buildTaskItemFromNfcSummary(summary: any): TaskItem {
  return {
    id: summary?.pgId != null ? String(summary.pgId) : undefined,
    convexId: summary?.id ?? undefined,
    taskConvexId: summary?.id ?? null,
    title: summary?.name ?? 'Untitled',
    description: summary?.description ?? null,
    spot: summary?.spotName ?? '',
    spotId: summary?.spotPgId ?? summary?.spotId ?? null,
    priority: summary?.priorityName ?? 'Medium',
    priorityColor: summary?.priorityColor ?? null,
    priorityId: summary?.priorityId ?? null,
    status: summary?.currentStatusName ?? '',
    statusColor: summary?.currentStatusColor ?? null,
    statusId: summary?.currentStatusId ?? null,
    workspaceId: summary?.workspacePgId ?? summary?.workspaceId ?? null,
    assignees: [],
    createdAt: formatDate(summary?.createdAt),
    tags: [],
  };
}

export const NfcTapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<NfcTapRoute>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { token, isLoading: authLoading, subdomain, selectTenant } = useAuth();
  const { isAuthenticated: convexAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const { isOnline } = useNetwork();
  const { unfilteredTasks } = useTasks();
  const executeTap = useMutation(api.nfc.executeTap);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [message, setMessage] = useState('Preparing NFC action...');
  const [detail, setDetail] = useState<string | null>(null);
  const [successTarget, setSuccessTarget] = useState<SuccessTarget>(null);
  const startedRef = useRef(false);
  const tenantSelectionRef = useRef(false);
  const authRetryCountRef = useRef(0);
  const authWaitStartedAtRef = useRef<number | null>(null);
  const { uuid, tenantId: tenantFromLink } = route.params;

  const targetTenantId = tenantFromLink || subdomain;
  const secondaryText = isDarkMode ? 'rgba(255,255,255,0.66)' : '#667085';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const surfaceColor = isDarkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const accentColor = feedback === 'error' ? '#DC2626'
    : feedback === 'warning' ? '#D97706'
    : feedback === 'success' ? '#16A34A'
      : primaryColor;

  const deviceData = useMemo(
    () => ({
      source: 'mobile_deep_link',
      platform: Platform.OS,
      tenantFromLink,
    }),
    [tenantFromLink],
  );

  const openMain = useCallback(() => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  }, [navigation]);

  const openTask = useCallback((task: TaskItem) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'TaskDetail', params: { task } },
        ],
      }),
    );
  }, [navigation]);

  const openSuccessTarget = useCallback(() => {
    if (successTarget?.kind === 'task') {
      openTask(successTarget.task);
      return;
    }
    if (successTarget?.kind === 'external_url') {
      Linking.openURL(successTarget.url).catch(() => undefined);
      return;
    }
    openMain();
  }, [openMain, openTask, successTarget]);

  const runTap = useCallback(async () => {
    if (!uuid) {
      setFeedback('error');
      setMessage('This NFC link is missing its tag id.');
      return;
    }

    if (!isOnline) {
      setFeedback('error');
      setMessage('NFC actions need a connection.');
      setDetail('Try again when Whagons is back online.');
      Vibration.vibrate([0, 80, 60, 80]);
      return;
    }

    if (!token || !convexAuthenticated) {
      const now = Date.now();
      authWaitStartedAtRef.current ??= now;
      if (now - authWaitStartedAtRef.current < 10000) {
        setFeedback('running');
        setMessage('Finishing sign-in...');
        setDetail('Whagons is restoring your app session, then it will run the NFC action.');
        setTimeout(() => {
          startedRef.current = false;
          void runTap();
        }, 700);
        return;
      }

      setFeedback('error');
      setMessage('Sign in to run this NFC action.');
      setDetail('Whagons needs to verify your tenant and permissions first.');
      return;
    }

    authWaitStartedAtRef.current = null;

    if (!targetTenantId) {
      setFeedback('error');
      setMessage('Select a tenant before running this NFC action.');
      return;
    }

    setFeedback('running');
    setMessage('Running NFC action...');
    setDetail(null);
    setSuccessTarget(null);

    try {
      const result = await executeTap({
        tenantId: targetTenantId,
        uuid,
        clientTapId: makeClientTapId(),
        deviceData,
      });

      if (!result?.ok) {
        setFeedback('error');
        setMessage(result?.message || 'Unable to run NFC action.');
        setDetail('The tag may be disabled, blocked by workflow rules, or unavailable to your role.');
        Vibration.vibrate([0, 80, 60, 80]);
        return;
      }

      setFeedback(result.result === 'blocked' ? 'warning' : 'success');
      setMessage(result.message || 'NFC action completed.');
      setDetail(result.detail ?? (result.result === 'blocked' ? 'Open the task to review the pending approval.'
        : result.result === 'created' ? 'Task created.'
        : result.action === 'finished' || result.result === 'finished' ? 'Task session finished.'
          : result.action === 'started' || result.result === 'started' ? 'Task session started.'
            : null));
      Vibration.vibrate(60);

      const resultTaskId = result.taskId ? String(result.taskId) : null;
      const matchedTask = resultTaskId
        ? unfilteredTasks.find((candidate) => (
            candidate.convexId === resultTaskId
            || candidate.taskConvexId === resultTaskId
            || String(candidate.id) === resultTaskId
          ))
        : null;
      const taskTarget = matchedTask ?? (result.task ? buildTaskItemFromNfcSummary(result.task) : null);
      if (taskTarget) {
        setSuccessTarget({ kind: 'task', task: taskTarget });
        setTimeout(() => openTask(taskTarget), 650);
        return;
      }

      if (result.externalUrl) {
        setSuccessTarget({ kind: 'external_url', url: result.externalUrl });
        setTimeout(() => {
          Linking.openURL(result.externalUrl).catch(() => undefined);
        }, 450);
      }
    } catch (error: any) {
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Not authenticated') && authRetryCountRef.current < 2) {
        authRetryCountRef.current += 1;
        setMessage('Finishing sign-in...');
        setDetail('Whagons is restoring your app session, then it will retry the tap.');
        setTimeout(() => {
          startedRef.current = false;
          void runTap();
        }, 700);
        return;
      }

      setFeedback('error');
      setMessage(errorMessage || 'Unable to run NFC action.');
      setDetail('Whagons could not complete this tap.');
      Vibration.vibrate([0, 80, 60, 80]);
    }
  }, [convexAuthenticated, deviceData, executeTap, isOnline, openTask, targetTenantId, token, unfilteredTasks, uuid]);

  useEffect(() => {
    if (authLoading || convexAuthLoading || startedRef.current) return;

    if (tenantFromLink && subdomain !== tenantFromLink) {
      if (tenantSelectionRef.current) return;
      tenantSelectionRef.current = true;
      setFeedback('running');
      setMessage('Opening tenant...');
      setDetail('Whagons is switching to the tenant stored on this NFC tag.');
      selectTenant(tenantFromLink)
        .catch((error: any) => {
          startedRef.current = true;
          setFeedback('error');
          setMessage(error?.message || 'Unable to open this tenant.');
          setDetail('Select the tenant in Whagons, then scan the tag again.');
          Vibration.vibrate([0, 80, 60, 80]);
        })
        .finally(() => {
          tenantSelectionRef.current = false;
        });
      return;
    }

    startedRef.current = true;
    void runTap();
  }, [authLoading, convexAuthLoading, runTap, selectTenant, subdomain, tenantFromLink]);

  const showSpinner = feedback === 'idle' || feedback === 'running';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: surfaceColor, borderColor }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${accentColor}1A` }]}>
            {showSpinner ? (
              <ActivityIndicator color={accentColor} />
            ) : (
              <Text style={[styles.statusGlyph, { color: accentColor }]}>
                {feedback === 'success' ? '✓' : '!'}
              </Text>
            )}
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{message}</Text>
          {detail ? <Text style={[styles.subtitle, { color: secondaryText }]}>{detail}</Text> : null}

          {feedback === 'error' && !token ? (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: primaryColor }]}
              onPress={() => navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }))}
            >
              <Text style={styles.buttonText}>Sign in</Text>
            </TouchableOpacity>
          ) : null}

          {feedback === 'error' && token ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={() => void runTap()}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          ) : null}

          {feedback === 'success' || feedback === 'warning' ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={openSuccessTarget}>
              <Text style={styles.buttonText}>
                {successTarget?.kind === 'task' ? 'Open task' : successTarget?.kind === 'external_url' ? 'Open link' : 'Open Whagons'}
              </Text>
            </TouchableOpacity>
          ) : null}
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
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 16,
    padding: 24,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  statusGlyph: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    fontFamily: fontFamilies.displaySemibold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.md,
    minWidth: 160,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 15,
  },
});
