import React, { useState, useMemo, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
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
import { SignatureModal } from '../components/SignatureModal';
import { RejectCommentModal } from '../components/RejectCommentModal';
import type { Id } from '../../../convex/_generated/dataModel';

type SharedTaskDetailRoute = RouteProp<RootStackParamList, 'SharedTaskDetail'>;

export const SharedTaskDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<SharedTaskDetailRoute>();
  const { task } = route.params;
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
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

  const decideMutation = useMutation(api.approvals.decideByTask);
  const acknowledgeMutation = useMutation(api.taskResources.acknowledgeTaskShare);

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

  const derived = useMemo(() => {
    if (!approvalId) return task.approvalStatus ?? null;
    return computeApprovalStatusForTask({
      taskId: String(task.id),
      taskConvexId: taskConvexId ?? undefined,
      approvalId,
      approval,
      taskApprovalInstances: taskApprovalInstances as any[],
    });
  }, [approvalId, task.id, taskConvexId, approval, taskApprovalInstances, task.approvalStatus]);

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
    if (!approvalPending || !authUser) return false;
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

    const currentUserRoleIds: any[] = (authUser as any).global_roles ?? (authUser as any).globalRoles ?? [];

    const currentUserTeamIds = new Set<string>();
    for (const ut of userTeams) {
      const utUserId = String((ut as any).userId ?? (ut as any).user_id ?? '');
      if (currentUserIds.has(utUserId)) {
        const tid = (ut as any).teamId ?? (ut as any).team_id;
        if (tid) currentUserTeamIds.add(String(tid));
      }
    }

    return approverDetails.some((d) => {
      const pendingLike = !d.status || d.status === 'pending' || d.status === 'not started';
      if (!pendingLike) return false;
      if (d.approverUserId != null && currentUserIds.has(String(d.approverUserId))) return true;
      if (d.approverRoleId && currentUserRoleIds.includes(d.approverRoleId)) return true;
      if (d.memberUserIds && d.memberUserIds.some((uid) => currentUserIds.has(String(uid)))) return true;
      if (d.approverTeamId && currentUserTeamIds.has(String(d.approverTeamId))) return true;
      return false;
    });
  }, [approvalPending, authUser, data.users, userTeams, approverDetails]);

  const requireSignature = !!(approval?.require_signature ?? approval?.requireSignature);

  // Ack progress from shares query
  const ackData = useMemo(() => {
    if (!taskShares) return { total: task.ackTotal ?? 0, done: task.ackDone ?? 0, shares: [] as any[] };
    const withStatus = taskShares.filter((s: any) => s.status != null && !s.revokedAt);
    const done = withStatus.filter((s: any) => s.status === 'acknowledged').length;
    return { total: withStatus.length, done, shares: withStatus };
  }, [taskShares, task.ackTotal, task.ackDone]);

  // Can current user acknowledge?
  const myPendingShareId = useMemo(() => {
    if (!taskShares || !authUser) return null;
    const currentUserIds = new Set<string>();
    if (authUser.id) currentUserIds.add(String(authUser.id));
    const userDoc = data.users.find((u: any) =>
      String(u.id) === String(authUser.id) || String(u._id) === String(authUser.id)
    );
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

    for (const share of taskShares) {
      if (share.status !== 'pending' || share.revokedAt) continue;
      const sharedToUser = share.sharedToUserId ?? share.shared_to_user_id;
      const sharedToTeam = share.sharedToTeamId ?? share.shared_to_team_id;
      if (sharedToUser && currentUserIds.has(String(sharedToUser))) return share._id;
      if (sharedToTeam && currentUserTeamIds.has(String(sharedToTeam))) return share._id;
    }
    return null;
  }, [taskShares, authUser, data.users, userTeams]);

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
      await decideMutation({
        tenantId,
        taskId: taskConvexId as Id<'tasks'>,
        decision,
        ...(responseComment ? { responseComment } : {}),
        ...(signatureStorageId ? { signatureStorageId: signatureStorageId as Id<'_storage'> } : {}),
      });
      Alert.alert(t('common.success'), decision === 'approved' ? t('sharedTask.approvedSuccessfully') : t('sharedTask.rejectedSuccessfully'));
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
    } catch (err: any) {
      Alert.alert(t('common.error'), t('sharedTask.failedToAcknowledge'));
    } finally {
      setAcknowledging(false);
    }
  }, [tenantId, myPendingShareId, acknowledgeMutation]);

  const tertiaryText = isDarkMode ? 'rgba(255,255,255,0.45)' : '#9CA3AF';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const statusPillColor = derived === 'approved' ? '#16A34A' : derived === 'rejected' ? '#DC2626' : '#EA580C';
  const statusPillBg = derived === 'approved' ? '#F0FDF4' : derived === 'rejected' ? '#FEF2F2' : '#FFF7ED';
  const statusPillLabel = derived === 'approved' ? t('sharedTask.statusApproved') : derived === 'rejected' ? t('sharedTask.statusRejected') : t('sharedTask.statusPendingApproval');

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
            <MetaItem label={t('sharedTask.metaLabelStatus')} value={task.status} color={task.statusColor} isDark={isDarkMode} textColor={colors.text} />
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
              const isAcked = share.status === 'acknowledged';
              return (
                <View key={share._id} style={styles.ackRow}>
                  <MaterialCommunityIcons
                    name={isAcked ? 'check-circle' : 'clock-outline'}
                    size={18}
                    color={isAcked ? '#16A34A' : '#EA580C'}
                  />
                  <Text style={[styles.ackLabel, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.ackStatus, { color: isAcked ? '#16A34A' : tertiaryText }]}>
                    {isAcked ? t('sharedTask.ackStatusAcknowledged') : t('sharedTask.ackStatusPending')}
                  </Text>
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
        {canAct && <View style={{ height: 80 }} />}
      </ScrollView>

      {/* Sticky Footer: Approve/Reject */}
      {canAct && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: borderColor }]}>
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
        onSigned={(storageId) => {
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
