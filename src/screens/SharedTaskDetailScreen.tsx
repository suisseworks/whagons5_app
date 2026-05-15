import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../hooks/useTenant';
import { RootStackParamList, TaskItem } from '../models/types';
import { fontFamilies, radius, shadows } from '../config/designTokens';
import {
  computeApprovalStatusForTask,
  buildApproverDetails,
  type ApproverDetail,
} from '../utils/approvalStatus';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { SignatureModal } from '../components/SignatureModal';
import { RejectCommentModal } from '../components/RejectCommentModal';
import { Toast, ToastRef } from '../components/Toast';
import type { Id } from '../../../convex/_generated/dataModel';

type SharedTaskDetailRoute = RouteProp<RootStackParamList, 'SharedTaskDetail'>;

export const SharedTaskDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<SharedTaskDetailRoute>();
  const { task } = route.params;
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { tenantId } = useTenant();
  const { user: authUser } = useAuth();
  const {
    data, rawSharedToMe, approvals: approvalsList,
    approvalApprovers, taskApprovalInstances, userTeams, roles,
  } = useData();

  const [signatureVisible, setSignatureVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [optimisticApprovalStatus, setOptimisticApprovalStatus] = useState<'approved' | 'rejected' | null>(null);
  const [optimisticAcknowledgedShareIds, setOptimisticAcknowledgedShareIds] = useState<Set<string>>(() => new Set());
  const toastRef = useRef<ToastRef>(null);

  const decideMutation = useOfflineMutation(api.approvals.decideByTask, 'approvals.decideByTask');
  const acknowledgeMutation = useOfflineMutation(api.taskResources.acknowledgeTaskShare, 'taskResources.acknowledgeTaskShare');

  const taskConvexId = task.taskConvexId ?? task.convexId;
  const taskSharesArgs = tenantId && taskConvexId
    ? { tenantId, taskId: taskConvexId as Id<'tasks'> }
    : 'skip' as const;
  const taskShares = useQuery(api.taskResources.listTaskShares, taskSharesArgs);

  // Build lookup maps
  const { userMap, approvalMap, roleMap, teamMap } = useMemo(() => {
    const buildMap = (items: any[]): Record<string, any> => {
      const m: Record<string, any> = {};
      for (const item of items) {
        if (item._id) m[String(item._id)] = item;
        if (item.id != null) m[String(item.id)] = item;
      }
      return m;
    };
    return {
      userMap: buildMap(data.users),
      approvalMap: buildMap(approvalsList),
      roleMap: buildMap(roles),
      teamMap: buildMap(data.teams),
    };
  }, [data.users, approvalsList, roles, data.teams]);

  // Approval logic
  const approvalId = task.approvalId;
  const approval = approvalId ? approvalMap[String(approvalId)] : null;
  const taskStatusResolved = useMemo(() => {
    const action = String((task as any).statusAction ?? '').toUpperCase();
    const statusName = String(task.status ?? '').toLowerCase();
    return action === 'FINISHED'
      || action === 'DONE'
      || action === 'COMPLETED'
      || statusName.includes('approved')
      || statusName.includes('aprobado')
      || statusName.includes('completed')
      || statusName.includes('completado')
      || statusName.includes('done');
  }, [task]);

  useEffect(() => {
    setOptimisticApprovalStatus(null);
  }, [task.id, taskConvexId]);

  const derived = useMemo(() => {
    if (optimisticApprovalStatus) return optimisticApprovalStatus;
    if (!approvalId) return task.approvalStatus ?? null;
    if (taskStatusResolved) return null;
    return computeApprovalStatusForTask({
      taskId: String(task.id),
      taskConvexId: taskConvexId ?? undefined,
      approvalId,
      approval,
      taskApprovalInstances: taskApprovalInstances as any[],
    });
  }, [optimisticApprovalStatus, approvalId, task.id, taskConvexId, approval, taskApprovalInstances, task.approvalStatus, taskStatusResolved]);

  const approvalPending = derived === 'pending';
  const hasApproval = derived != null;

  const approverDetails: ApproverDetail[] = useMemo(() => {
    if (!hasApproval || !approvalId) return [];
    return buildApproverDetails(
      approvalId,
      task.id ?? '',
      taskApprovalInstances as any[],
      approvalApprovers as any[],
      userMap,
      roleMap,
      teamMap,
      taskConvexId ?? undefined,
    );
  }, [hasApproval, approvalId, task.id, taskApprovalInstances, approvalApprovers, userMap, roleMap, teamMap, taskConvexId]);

  // canAct: can the current user approve/reject?
  const canAct = useMemo(() => {
    if (taskStatusResolved || !approvalPending || !authUser) return false;
    const currentUserIds = new Set<string>();
    if (authUser.id) currentUserIds.add(String(authUser.id));

    // Find the user doc to get all IDs
    const userDoc = data.users.find((u: any) =>
      String(u.id) === String(authUser.id) || String(u._id) === String(authUser.id)
    );
    if (userDoc) {
      if ((userDoc as any)._id) currentUserIds.add(String((userDoc as any)._id));
      if (userDoc.id) currentUserIds.add(String(userDoc.id));
    }

    const hasDirectPendingInstance = (taskApprovalInstances as any[]).some((instance: any) => {
      const instanceTaskId = instance.taskId ?? instance.task_id;
      if (instanceTaskId == null) return false;
      const matchesTask = String(instanceTaskId) === String(task.id) || (taskConvexId && String(instanceTaskId) === String(taskConvexId));
      if (!matchesTask) return false;
      const approverUserId = instance.approverUserId ?? instance.approver_user_id;
      const pendingLike = !instance.status || instance.status === 'pending' || instance.status === 'not started';
      return pendingLike && approverUserId != null && currentUserIds.has(String(approverUserId));
    });
    return hasDirectPendingInstance;
  }, [taskStatusResolved, approvalPending, authUser, data.users, taskApprovalInstances, task.id, taskConvexId]);

  const requireSignature = !!(approval?.require_signature ?? approval?.requireSignature);

  const currentUserAccess = useMemo(() => {
    const currentUserIds = new Set<string>();
    if (authUser?.id) currentUserIds.add(String(authUser.id));

    const userDoc = authUser ? data.users.find((u: any) =>
      String(u.id) === String(authUser.id) || String(u._id) === String(authUser.id)
    ) : null;

    if (userDoc) {
      if ((userDoc as any)._id) currentUserIds.add(String((userDoc as any)._id));
      if (userDoc.id) currentUserIds.add(String(userDoc.id));
    }

    const currentUserTeamIds = new Set<string>();
    for (const ut of userTeams) {
      const utUserId = String((ut as any).userId ?? (ut as any).user_id ?? '');
      if (currentUserIds.has(utUserId)) {
        const tid = (ut as any).teamId ?? (ut as any).team_id;
        if (tid) currentUserTeamIds.add(String(tid));
      }
    }

    return { currentUserIds, currentUserTeamIds };
  }, [authUser, data.users, userTeams]);

  // Ack progress from shares query
  const ackData = useMemo(() => {
    if (!taskShares) return { total: task.ackTotal ?? 0, done: task.ackDone ?? 0, shares: [] as any[] };
    const withStatus = taskShares.filter((s: any) => s.status != null && !s.revokedAt);
    let total = 0;
    let done = 0;

    const shares = withStatus.map((share: any) => {
      const shareId = String(share._id);
      const optimisticAcked = optimisticAcknowledgedShareIds.has(shareId);
      const rawRecipients = Array.isArray(share.ackRecipients) ? share.ackRecipients : [];
      const recipients = rawRecipients.map((recipient: any) => {
        const isCurrentUser = currentUserAccess.currentUserIds.has(String(recipient.userId));
        return optimisticAcked && isCurrentUser
          ? { ...recipient, acknowledged: true, acknowledgedAt: recipient.acknowledgedAt ?? Date.now() }
          : recipient;
      });

      const shareTotal = share.ackTotal ?? recipients.length ?? 0;
      const serverDone = share.ackDone ?? recipients.filter((recipient: any) => recipient.acknowledged).length ?? 0;
      const alreadyCountedCurrentUser = rawRecipients.some((recipient: any) => (
        currentUserAccess.currentUserIds.has(String(recipient.userId)) && recipient.acknowledged
      ));
      const shareDone = Math.min(
        shareTotal,
        serverDone + (optimisticAcked && !alreadyCountedCurrentUser ? 1 : 0),
      );

      total += shareTotal;
      done += shareDone;
      const currentUserAcknowledged = recipients.some((recipient: any) => (
        currentUserAccess.currentUserIds.has(String(recipient.userId)) && recipient.acknowledged
      ));

      return {
        ...share,
        ackTotal: shareTotal,
        ackDone: shareDone,
        ackRecipients: recipients,
        currentUserAcknowledged,
        status: shareTotal > 0 && shareDone >= shareTotal ? 'acknowledged' : share.status,
      };
    });

    return { total, done, shares };
  }, [taskShares, task.ackTotal, task.ackDone, optimisticAcknowledgedShareIds, currentUserAccess]);

  // Can current user acknowledge?
  const myPendingShareId = useMemo(() => {
    if (!taskShares || !authUser) return null;
    for (const share of taskShares) {
      if (share.status == null || share.revokedAt) continue;
      const shareId = String(share._id);
      if (optimisticAcknowledgedShareIds.has(shareId)) continue;

      const recipients = Array.isArray(share.ackRecipients) ? share.ackRecipients : [];
      const currentRecipient = recipients.find((recipient: any) => currentUserAccess.currentUserIds.has(String(recipient.userId)));
      if (currentRecipient?.acknowledged) continue;

      const sharedToUser = share.sharedToUserId ?? share.shared_to_user_id;
      const sharedToTeam = share.sharedToTeamId ?? share.shared_to_team_id;
      if (sharedToUser && currentUserAccess.currentUserIds.has(String(sharedToUser))) return share._id;
      if (sharedToTeam && currentUserAccess.currentUserTeamIds.has(String(sharedToTeam))) return share._id;
    }
    return null;
  }, [taskShares, authUser, optimisticAcknowledgedShareIds, currentUserAccess]);

  const handleApprove = useCallback(() => {
    if (requireSignature) {
      setSignatureVisible(true);
    } else {
      submitDecision('approved');
    }
  }, [requireSignature]);

  const handleReject = useCallback(() => {
    setRejectVisible(true);
  }, []);

  const submitDecision = useCallback(async (
    decision: 'approved' | 'rejected',
    signatureStorageId?: string,
    responseComment?: string,
  ) => {
    if (!tenantId || !taskConvexId) return;
    setDeciding(true);
    try {
      const result = await decideMutation({
        tenantId,
        taskId: taskConvexId as Id<'tasks'>,
        decision,
        ...(responseComment ? { responseComment } : {}),
        ...(signatureStorageId ? { signatureStorageId: signatureStorageId as Id<'_storage'> } : {}),
      });
      if (!(result as any)?._offlineQueued) {
        setOptimisticApprovalStatus(decision);
      }
      toastRef.current?.show({
        type: 'success',
        title: decision === 'approved' ? t('sharedTask.approvedSuccessfully') : t('sharedTask.rejectedSuccessfully'),
        body: decision === 'approved'
          ? t('sharedTask.approvalDecisionSaved')
          : t('sharedTask.rejectionDecisionSaved'),
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('sharedTask.failedToRecordDecision'));
    } finally {
      setDeciding(false);
    }
  }, [tenantId, taskConvexId, decideMutation]);

  const handleAcknowledge = useCallback(async () => {
    if (!tenantId || !myPendingShareId) return;
    setAcknowledging(true);
    try {
      await acknowledgeMutation({ tenantId, shareId: myPendingShareId as Id<'taskShares'> });
      setOptimisticAcknowledgedShareIds((prev) => {
        const next = new Set(prev);
        next.add(String(myPendingShareId));
        return next;
      });
      toastRef.current?.show({
        type: 'success',
        title: t('sharedTask.acknowledgedSuccessfully'),
        body: t('sharedTask.acknowledgmentSaved'),
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), t('sharedTask.failedToAcknowledge'));
    } finally {
      setAcknowledging(false);
    }
  }, [tenantId, myPendingShareId, acknowledgeMutation, t]);

  const tertiaryText = isDarkMode ? 'rgba(255,255,255,0.45)' : '#9CA3AF';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const statusPillColor = derived === 'approved' ? '#16A34A' : derived === 'rejected' ? '#DC2626' : '#EA580C';
  const statusPillBg = derived === 'approved' ? '#F0FDF4' : derived === 'rejected' ? '#FEF2F2' : '#FFF7ED';
  const statusPillLabel = derived === 'approved' ? t('sharedTask.statusApproved') : derived === 'rejected' ? t('sharedTask.statusRejected') : t('sharedTask.statusPendingApproval');
  const showTaskStatusMeta = !approvalPending && derived !== 'rejected';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {task.title}
          </Text>
          {task.id && (
            <Text style={[styles.headerSubtitle, { color: tertiaryText }]}>#{task.id}</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Approval Status Banner */}
        {hasApproval && (
          <View style={[styles.statusBanner, { backgroundColor: statusPillBg }]}>
            <MaterialCommunityIcons
              name={derived === 'approved' ? 'check-circle' : derived === 'rejected' ? 'close-circle' : 'clock-outline'}
              size={20}
              color={statusPillColor}
            />
            <Text style={[styles.statusBannerText, { color: statusPillColor }]}>
              {statusPillLabel}
            </Text>
          </View>
        )}

        {/* Metadata Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor }]}> 
          <View style={styles.metaGrid}>
            {showTaskStatusMeta ? (
              <MetaItem label={t('sharedTask.metaLabelStatus')} value={task.status} color={task.statusColor} isDark={isDarkMode} textColor={colors.text} />
            ) : null}
            <MetaItem label={t('sharedTask.metaLabelPriority')} value={task.priority} isDark={isDarkMode} textColor={colors.text} />
            {task.spot ? <MetaItem label={t('sharedTask.metaLabelLocation')} value={task.spot} isDark={isDarkMode} textColor={colors.text} /> : null}
            {task.createdAt ? <MetaItem label={t('sharedTask.metaLabelCreated')} value={task.createdAt} isDark={isDarkMode} textColor={colors.text} /> : null}
          </View>
        </View>

        {/* Description */}
        {task.description && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('sharedTask.sectionDescription')}</Text>
            <RenderHtml
              contentWidth={screenWidth - 64}
              source={{ html: task.description }}
              baseStyle={{ color: colors.text, fontSize: 13, fontFamily: fontFamilies.bodyRegular }}
            />
          </View>
        )}

        {/* Approvers Section */}
        {approverDetails.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('sharedTask.sectionApprovers')}</Text>
            {approverDetails.map((d) => (
              <ApproverRow
                key={d.id}
                detail={d}
                colors={colors}
                isDark={isDarkMode}
                tertiaryText={tertiaryText}
                t={t}
              />
            ))}
          </View>
        )}

        {/* Acknowledgment Section */}
        {ackData.total > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{t('sharedTask.sectionAcknowledgments')}</Text>
              <View style={[styles.ackProgressBadge, {
                backgroundColor: ackData.done === ackData.total ? '#F0FDF4' : '#FFF7ED',
              }]}>
                <Text style={[styles.ackProgressText, {
                  color: ackData.done === ackData.total ? '#16A34A' : '#EA580C',
                }]}>
                  {ackData.done}/{ackData.total}
                </Text>
              </View>
            </View>
            {ackData.shares.map((share: any) => {
              const teamName = share.sharedToTeamId
                ? (teamMap[String(share.sharedToTeamId)]?.name || t('sharedTask.fallbackTeam'))
                : null;
              const userName = share.sharedToUserId
                ? (userMap[String(share.sharedToUserId)]?.name || t('sharedTask.fallbackUser'))
                : null;
              const label = teamName || userName || t('sharedTask.fallbackUnknown');
              const recipients = Array.isArray(share.ackRecipients) ? share.ackRecipients : [];
              const allRecipientsAcked = (share.ackTotal ?? 0) > 0 && share.ackDone >= share.ackTotal;
              const currentUserAcked = !!share.currentUserAcknowledged;
              const showGreenCheck = allRecipientsAcked || currentUserAcked;
              return (
                <View key={share._id} style={styles.ackGroup}>
                  <View style={styles.ackRow}>
                    <MaterialCommunityIcons
                      name={showGreenCheck ? 'check-circle' : 'clock-outline'}
                      size={18}
                      color={showGreenCheck ? '#16A34A' : '#EA580C'}
                    />
                    <Text style={[styles.ackLabel, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.ackStatus, { color: showGreenCheck ? '#16A34A' : tertiaryText }]}> 
                      {share.ackDone ?? 0}/{share.ackTotal ?? recipients.length}
                    </Text>
                  </View>
                  {recipients.map((recipient: any) => (
                    <View key={String(recipient.userId)} style={styles.ackRecipientRow}>
                      <Text style={[styles.ackRecipientName, { color: colors.text }]} numberOfLines={1}>
                        {recipient.userName || t('sharedTask.fallbackUser')}
                      </Text>
                      <Text style={[styles.ackRecipientStatus, { color: recipient.acknowledged ? '#16A34A' : tertiaryText }]}>
                        {recipient.acknowledged ? t('sharedTask.ackStatusAcknowledged') : t('sharedTask.ackStatusPending')}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}

            {myPendingShareId && (
              <TouchableOpacity
                style={styles.ackButton}
                onPress={handleAcknowledge}
                disabled={acknowledging}
              >
                {acknowledging ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="visibility" size={16} color="#FFFFFF" />
                    <Text style={styles.ackButtonText}>{t('sharedTask.acknowledgeButton')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bottom padding for footer */}
        {canAct && <View style={{ height: 112 + insets.bottom }} />}
      </ScrollView>

      {/* Sticky Footer: Approve/Reject */}
      {canAct && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: borderColor, paddingBottom: 28 + insets.bottom }]}> 
          <TouchableOpacity
            style={[styles.rejectFooterBtn, { borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]}
            onPress={handleReject}
            disabled={deciding}
          >
            <MaterialIcons name="close" size={18} color="#DC2626" />
            <Text style={styles.rejectFooterText}>{t('sharedTask.rejectButton')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveFooterBtn, { opacity: deciding ? 0.7 : 1 }]}
            onPress={handleApprove}
            disabled={deciding}
          >
            {deciding ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name={requireSignature ? 'edit' : 'check'} size={18} color="#FFFFFF" />
                <Text style={styles.approveFooterText}>
                  {requireSignature ? t('sharedTask.approveAndSignButton') : t('sharedTask.approveButton')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <SignatureModal
        visible={signatureVisible}
        onClose={() => setSignatureVisible(false)}
        onSigned={({ storageId }) => {
          setSignatureVisible(false);
          submitDecision('approved', storageId);
        }}
      />

      <RejectCommentModal
        visible={rejectVisible}
        onClose={() => setRejectVisible(false)}
        onSubmit={(comment) => {
          setRejectVisible(false);
          submitDecision('rejected', undefined, comment);
        }}
      />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const MetaItem: React.FC<{
  label: string;
  value: string;
  color?: string | null;
  isDark: boolean;
  textColor: string;
}> = ({ label, value, color, isDark, textColor }) => (
  <View style={metaStyles.item}>
    <Text style={[metaStyles.label, { color: isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF' }]}>{label}</Text>
    <View style={metaStyles.valueRow}>
      {color && <View style={[metaStyles.dot, { backgroundColor: color }]} />}
      <Text style={[metaStyles.value, { color: textColor }]}>{value}</Text>
    </View>
  </View>
);

const metaStyles = StyleSheet.create({
  item: { flex: 1, minWidth: '45%', marginBottom: 12 },
  label: { fontSize: 11, fontFamily: fontFamilies.bodyRegular, marginBottom: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { fontSize: 13, fontFamily: fontFamilies.bodySemibold },
});

const ApproverRow: React.FC<{
  detail: ApproverDetail;
  colors: any;
  isDark: boolean;
  tertiaryText: string;
  t: (key: string) => string;
}> = ({ detail, colors, isDark, tertiaryText, t }) => {
  const statusIcon = detail.status === 'approved' ? 'check-circle' as const
    : detail.status === 'rejected' ? 'close-circle' as const
    : 'clock-outline' as const;

  const statusLabel = detail.status === 'approved' ? t('sharedTask.statusApproved')
    : detail.status === 'rejected' ? t('sharedTask.statusRejected')
    : detail.status === 'not started' ? t('sharedTask.approverStatusNotStarted')
    : t('sharedTask.ackStatusPending');

  return (
    <View style={approverStyles.row}>
      <View style={[approverStyles.stepBadge, {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
      }]}>
        <Text style={[approverStyles.stepText, { color: tertiaryText }]}>{detail.step}</Text>
      </View>
      <View style={approverStyles.info}>
        <Text style={[approverStyles.name, { color: colors.text }]}>{detail.name}</Text>
        <View style={approverStyles.statusRow}>
          <MaterialCommunityIcons name={statusIcon} size={14} color={detail.statusColor} />
          <Text style={[approverStyles.statusText, { color: detail.statusColor }]}>{statusLabel}</Text>
        </View>
        {detail.comment && (
          <Text style={[approverStyles.comment, { color: tertiaryText }]} numberOfLines={2}>
            "{detail.comment}"
          </Text>
        )}
      </View>
      {detail.signatureStorageId && (
        <MaterialCommunityIcons name="signature-freehand" size={18} color={tertiaryText} />
      )}
    </View>
  );
};

const approverStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: { fontSize: 11, fontFamily: fontFamilies.bodySemibold },
  info: { flex: 1 },
  name: { fontSize: 13, fontFamily: fontFamilies.bodySemibold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusText: { fontSize: 12, fontFamily: fontFamilies.bodyMedium },
  comment: { fontSize: 12, fontFamily: fontFamilies.bodyRegular, fontStyle: 'italic', marginTop: 4 },
});

// ---------------------------------------------------------------------------
// Main styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: fontFamilies.bodySemibold },
  headerSubtitle: { fontSize: 12, fontFamily: fontFamilies.bodyRegular, marginTop: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  statusBannerText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    ...shadows.subtle,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 10,
  },
  ackProgressBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ackProgressText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },
  ackGroup: {
    paddingVertical: 4,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  ackLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamilies.bodyMedium,
  },
  ackStatus: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  ackRecipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 26,
    paddingVertical: 3,
  },
  ackRecipientName: {
    flex: 1,
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  ackRecipientStatus: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
  },
  ackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: '#4F46E5',
  },
  ackButtonText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rejectFooterBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectFooterText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#DC2626',
  },
  approveFooterBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approveFooterText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});
