import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useLanguage } from '../context/LanguageContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConvexUpload } from '../hooks/useConvexUpload';
import { AttachmentPickerSheet } from './AttachmentPickerSheet';
import { UserPickerSheet, type UserPickerItem } from './UserPickerSheet';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { resolveDefaultFindingTargetTeamId } from '../utils/findingActionDefaults';
import type { ThemeColors } from '../models/types';

function getRowId(row: any): string {
  return String(row?._id ?? row?.id ?? '');
}

function isFindingResolved(finding: any): boolean {
  if (finding?.resolved === true) return true;
  const linkedTask = finding?.linkedTask;
  if (!linkedTask) return false;
  if (linkedTask.completed === true || linkedTask.completedAt) return true;
  const action = String(linkedTask.statusAction ?? '').toUpperCase();
  return action === 'FINISHED' || action === 'DONE' || action === 'COMPLETED';
}

function getCorrectiveTaskCreateErrorMessage(error: any, t: (key: string, options?: Record<string, any>) => string) {
  const message = String(error?.message ?? error ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('no pending findings are available for an action plan')) {
    return t('taskDetail.findingsActionPlanNoPending');
  }
  if (normalized.includes('a template is required')) {
    return t('taskDetail.findingsTemplateRequired');
  }
  if (normalized.includes('not authorized to create tasks')) {
    return t('taskDetail.findingsCreateNotAuthorized');
  }
  return message || t('taskDetail.findingsTaskCreateFailed');
}

function toDateInputValue(value: any): string {
  if (!value) return '';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

interface SelectorItem {
  id: string;
  name: string;
  color?: string | null;
}

interface TaskFindingsTabProps {
  taskId: string;
  taskName: string;
  readOnly?: boolean;
  colors: ThemeColors;
  primaryColor: string;
  isDarkMode: boolean;
  onOpenLinkedTask?: (linkedTaskId: string) => void;
}

export const TaskFindingsTab: React.FC<TaskFindingsTabProps> = ({
  taskId,
  taskName,
  readOnly = false,
  colors,
  primaryColor,
  isDarkMode,
  onOpenLinkedTask,
}) => {
  const { tenantId } = useTenant();
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const { data } = useData();
  const { pickAndUpload, uploading, attachmentPickerProps } = useConvexUpload();
  const insets = useSafeAreaInsets();
  const detailTopInset = Math.max(insets.top, spacing.lg);
  const detailBottomInset = Math.max(insets.bottom, spacing.lg);

  const [draft, setDraft] = useState('');
  const [addingFinding, setAddingFinding] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [creatingTaskFindingId, setCreatingTaskFindingId] = useState<string | null>(null);
  const [uploadingFindingId, setUploadingFindingId] = useState<string | null>(null);
  const [selectedTargetTeamByFindingId, setSelectedTargetTeamByFindingId] = useState<Record<string, string>>({});
  const [spotPickerVisible, setSpotPickerVisible] = useState(false);
  const [priorityPickerVisible, setPriorityPickerVisible] = useState(false);
  const [teamPickerVisible, setTeamPickerVisible] = useState(false);
  const [tagPickerVisible, setTagPickerVisible] = useState(false);
  const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);

  const cardBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const surfaceMuted = isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7';

  const findings = useQuery(
    api.taskFindings.list,
    tenantId && taskId ? { tenantId, taskId: taskId as any } : 'skip',
  ) as any[] | undefined;

  const sourceTask = useQuery(
    api.tasks.get,
    tenantId && taskId ? { tenantId, id: taskId as any } : 'skip',
  ) as any | null | undefined;

  const createFinding = useMutation(api.taskFindings.create);
  const updateFinding = useMutation(api.taskFindings.update);
  const removeFinding = useMutation(api.taskFindings.remove);
  const createLinkedTask = useMutation(api.taskFindings.createLinkedTask);
  const createFindingNote = useMutation(api.taskFindings.createNote);

  const rows = useMemo(() => (Array.isArray(findings) ? findings : []), [findings]);
  const selectedFinding = useMemo(
    () => rows.find((row) => String(row._id) === selectedFindingId) ?? null,
    [rows, selectedFindingId],
  );

  const findingNotes = useQuery(
    api.taskFindings.listNotes,
    tenantId && selectedFindingId
      ? { tenantId, findingId: selectedFindingId as any }
      : 'skip',
  ) as any[] | undefined;

  const resolvedCount = rows.filter((row) => isFindingResolved(row)).length;
  const progressPercent = rows.length > 0 ? Math.round((resolvedCount / rows.length) * 100) : 0;

  const sourceTemplate = useMemo(() => {
    const templateId = sourceTask?.templateId ?? sourceTask?.template_id;
    if (!templateId) return null;
    return data.templates.find((template: any) =>
      String(template._id) === String(templateId) ||
      String(template.id) === String(templateId) ||
      String(template.pgId) === String(templateId),
    ) ?? null;
  }, [data.templates, sourceTask]);

  const findingActionDefaults = useMemo(() => {
    const value = sourceTemplate?.findingActionDefaults ?? sourceTemplate?.finding_action_defaults;
    return value && typeof value === 'object' ? value : {};
  }, [sourceTemplate]);

  const selectableTargetTeams = useMemo(() =>
    data.teams
      .filter((team: any) => !team?.deletedAt && !team?.deleted_at && getRowId(team))
      .sort((a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })),
  [data.teams]);

  const defaultTargetTeamId = useMemo(() => {
    const configured = resolveDefaultFindingTargetTeamId(findingActionDefaults, sourceTask, {
      teams: data.teams,
      workspaces: data.workspaces,
      categories: data.categories,
    });
    return selectableTargetTeams.some((team: any) => getRowId(team) === configured) ? configured : '';
  }, [findingActionDefaults, sourceTask, data.teams, data.workspaces, data.categories, selectableTargetTeams]);

  const spotItems = useMemo((): SelectorItem[] => [
    { id: '__none__', name: t('taskDetail.findingsNoSpot') },
    ...data.spots
      .filter((spot: any) => !spot?.deletedAt)
      .map((spot: any) => ({ id: getRowId(spot), name: String(spot.name ?? spot.label ?? 'Spot') }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  ], [data.spots, t]);

  const priorityItems = useMemo((): SelectorItem[] => [
    { id: '__none__', name: t('taskDetail.findingsNoPriority') },
    ...data.priorities
      .map((priority: any) => ({
        id: getRowId(priority),
        name: String(priority.name ?? 'Priority'),
        color: priority.color ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  ], [data.priorities, t]);

  const teamItems = useMemo((): SelectorItem[] =>
    selectableTargetTeams.map((team: any) => ({
      id: getRowId(team),
      name: String(team.name ?? `Team ${team.id ?? team._id}`),
    })),
  [selectableTargetTeams]);

  const tagItems = useMemo((): SelectorItem[] => {
    const sourceCategoryId = sourceTask?.categoryId ?? sourceTask?.category_id ?? null;
    return data.tags
      .filter((tag: any) => {
        if (tag?.deletedAt) return false;
        const tagCategoryId = tag.categoryId ?? tag.category_id;
        if (tagCategoryId == null || tagCategoryId === '') return true;
        if (sourceCategoryId != null) return String(tagCategoryId) === String(sourceCategoryId);
        return true;
      })
      .map((tag: any) => ({
        id: getRowId(tag),
        name: String(tag.name ?? 'Tag'),
        color: tag.color ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [data.tags, sourceTask]);

  const assigneePickerUsers = useMemo<UserPickerItem[]>(() =>
    data.users.reduce<UserPickerItem[]>((acc, rawUser: any) => {
      const resolvedId = rawUser?._id ?? rawUser?.id;
      const resolvedName = typeof rawUser?.name === 'string' ? rawUser.name.trim() : '';
      if (resolvedId == null || !resolvedName) return acc;

      const avatarCandidate =
        rawUser?.url_picture
        ?? rawUser?.urlPicture
        ?? rawUser?.avatar
        ?? rawUser?.photo_url
        ?? null;

      acc.push({
        id: String(resolvedId),
        name: resolvedName,
        email: typeof rawUser?.email === 'string' ? rawUser.email : undefined,
        avatarUrl: typeof avatarCandidate === 'string' ? avatarCandidate : null,
      });
      return acc;
    }, []),
  [data.users]);

  useEffect(() => {
    if (!selectedFinding) {
      setAssigneePickerVisible(false);
      setSpotPickerVisible(false);
      setPriorityPickerVisible(false);
      setTeamPickerVisible(false);
      setTagPickerVisible(false);
    }
  }, [selectedFinding]);

  useEffect(() => {
    if (!selectedFinding) return;
    setDescriptionDraft(String(selectedFinding.notes ?? ''));
    setDueDateDraft(toDateInputValue(selectedFinding.dueDate ?? selectedFinding.due_date));
    setNoteDraft('');
  }, [selectedFinding?._id, selectedFinding?.notes, selectedFinding?.dueDate, selectedFinding?.due_date]);

  const handleAddFinding = useCallback(async () => {
    if (!tenantId || readOnly) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setAddingFinding(true);
    try {
      await createFinding({ tenantId, taskId: taskId as any, text: trimmed });
      setDraft('');
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsAddFailed'));
    } finally {
      setAddingFinding(false);
    }
  }, [createFinding, draft, readOnly, t, taskId, tenantId]);

  const handleToggleResolved = useCallback(async (finding: any) => {
    if (!tenantId || readOnly) return;
    try {
      await updateFinding({
        tenantId,
        id: finding._id,
        resolved: !isFindingResolved(finding),
      });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsUpdateFailed'));
    }
  }, [readOnly, t, tenantId, updateFinding]);

  const patchFinding = useCallback(async (patch: Record<string, unknown>) => {
    if (!tenantId || !selectedFinding || readOnly) return;
    try {
      await updateFinding({ tenantId, id: selectedFinding._id, ...patch });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsUpdateFailed'));
    }
  }, [readOnly, selectedFinding, t, tenantId, updateFinding]);

  const handleSaveDescription = useCallback(() => {
    if (!selectedFinding) return;
    const next = descriptionDraft.trim();
    const current = String(selectedFinding.notes ?? '').trim();
    if (next === current) return;
    void patchFinding({ notes: next || null });
  }, [descriptionDraft, patchFinding, selectedFinding]);

  const handleSaveDueDate = useCallback(() => {
    if (!selectedFinding) return;
    const parsed = parseDateInput(dueDateDraft);
    const current = selectedFinding.dueDate ?? selectedFinding.due_date ?? null;
    if ((parsed ?? null) === (current ?? null)) return;
    void patchFinding({ dueDate: parsed });
  }, [dueDateDraft, patchFinding, selectedFinding]);

  const handleUploadAttachments = useCallback(async () => {
    if (!tenantId || !selectedFinding || readOnly) return;
    const uploaded = await pickAndUpload();
    if (uploaded.length === 0) return;
    setUploadingFindingId(String(selectedFinding._id));
    try {
      const existing = Array.isArray(selectedFinding.evidenceFiles ?? selectedFinding.evidence_files)
        ? [...(selectedFinding.evidenceFiles ?? selectedFinding.evidence_files)]
        : [];
      await updateFinding({
        tenantId,
        id: selectedFinding._id,
        evidenceFiles: [...existing, ...uploaded],
      });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsUploadFailed'));
    } finally {
      setUploadingFindingId(null);
    }
  }, [pickAndUpload, readOnly, selectedFinding, t, tenantId, updateFinding]);

  const handleRemoveAttachment = useCallback(async (storageId: string) => {
    if (!tenantId || !selectedFinding || readOnly) return;
    const existing = Array.isArray(selectedFinding.evidenceFiles ?? selectedFinding.evidence_files)
      ? (selectedFinding.evidenceFiles ?? selectedFinding.evidence_files)
      : [];
    await patchFinding({
      evidenceFiles: existing.filter((file: any) => String(file.storageId) !== storageId),
    });
  }, [patchFinding, readOnly, selectedFinding, tenantId]);

  const handleCreateCorrectiveTask = useCallback(async () => {
    if (!tenantId || !selectedFinding || readOnly) return;
    const linkedTaskId = String(selectedFinding.linkedTask?._id ?? selectedFinding.linkedTaskId ?? '');
    if (linkedTaskId) {
      onOpenLinkedTask?.(linkedTaskId);
      return;
    }
    const findingId = String(selectedFinding._id);
    const teamId = selectedTargetTeamByFindingId[findingId] ?? defaultTargetTeamId;
    setCreatingTaskFindingId(findingId);
    try {
      const result = await createLinkedTask({
        tenantId,
        id: selectedFinding._id,
        ...(teamId ? { teamId: teamId as any } : {}),
      });
      Alert.alert(
        t('common.success'),
        result?.alreadyLinked
          ? t('taskDetail.findingsTaskAlreadyLinked')
          : t('taskDetail.findingsTaskCreated'),
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), getCorrectiveTaskCreateErrorMessage(error, t));
    } finally {
      setCreatingTaskFindingId(null);
    }
  }, [
    createLinkedTask,
    defaultTargetTeamId,
    onOpenLinkedTask,
    readOnly,
    selectedFinding,
    selectedTargetTeamByFindingId,
    t,
    tenantId,
  ]);

  const handleDeleteFinding = useCallback(() => {
    if (!tenantId || !selectedFinding || readOnly) return;
    Alert.alert(
      t('taskDetail.findingsDeleteTitle'),
      t('taskDetail.findingsDeleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void removeFinding({ tenantId, id: selectedFinding._id })
              .then(() => setSelectedFindingId(null))
              .catch((error: any) => {
                Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsDeleteFailed'));
              });
          },
        },
      ],
    );
  }, [readOnly, removeFinding, selectedFinding, t, tenantId]);

  const handleCreateNote = useCallback(async () => {
    if (!tenantId || !selectedFinding || readOnly) return;
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    setCreatingNote(true);
    try {
      await createFindingNote({
        tenantId,
        findingId: selectedFinding._id,
        note: trimmed,
      });
      setNoteDraft('');
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsNotesAddFailed'));
    } finally {
      setCreatingNote(false);
    }
  }, [createFindingNote, noteDraft, readOnly, selectedFinding, t, tenantId]);

  const selectedSpotId = selectedFinding
    ? String(selectedFinding.spotId ?? selectedFinding.spot_id ?? sourceTask?.spotId ?? sourceTask?.spot_id ?? '')
    : '';
  const selectedPriorityId = selectedFinding
    ? String(selectedFinding.priorityId ?? selectedFinding.priority_id ?? '')
    : '';
  const selectedAssigneeId = selectedFinding
    ? String(selectedFinding.assignedUserId ?? selectedFinding.assigned_user_id ?? '')
    : '';
  const selectedAssigneeLabel = !selectedAssigneeId
    ? t('taskDetail.findingsNoResponsible')
    : assigneePickerUsers.find((user) => user.id === selectedAssigneeId)?.name ?? t('taskDetail.findingsNoResponsible');
  const selectedTagIds: string[] = selectedFinding && Array.isArray(selectedFinding.tagIds ?? selectedFinding.tag_ids)
    ? (selectedFinding.tagIds ?? selectedFinding.tag_ids).map((id: any) => String(id))
    : [];
  const selectedTargetTeamId = selectedFinding
    ? (selectedTargetTeamByFindingId[String(selectedFinding._id)] ?? defaultTargetTeamId)
    : '';
  const handleAssigneeToggle = useCallback((userId: string) => {
    const nextId = selectedAssigneeId === userId ? null : userId;
    void patchFinding({ assignedUserId: nextId as any });
    setAssigneePickerVisible(false);
  }, [patchFinding, selectedAssigneeId]);

  const handleClearAssignee = useCallback(() => {
    void patchFinding({ assignedUserId: null });
    setAssigneePickerVisible(false);
  }, [patchFinding]);

  const selectedHasLinkedTask = Boolean(
    selectedFinding?.linkedTaskId ??
    selectedFinding?.linked_task_id ??
    selectedFinding?.linkedTask?._id,
  );
  const selectedCanCreateCorrectiveTask = selectedFinding?.correctiveTaskCreationEnabled !== false;

  const renderSelectorModal = (
    visible: boolean,
    title: string,
    items: SelectorItem[],
    selectedId: string | null,
    onSelect: (item: SelectorItem) => void,
    onClose: () => void,
    multiSelect = false,
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.selectorSheet, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Text style={[styles.selectorTitle, { color: colors.text }]}>{title}</Text>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            style={styles.selectorList}
            renderItem={({ item }) => {
              const isSelected = multiSelect
                ? selectedTagIds.includes(item.id)
                : item.id === selectedId || (item.id === '__none__' && !selectedId);
              return (
                <TouchableOpacity
                  style={[
                    styles.selectorItem,
                    { borderColor: cardBorder },
                    isSelected && { backgroundColor: surfaceMuted },
                  ]}
                  onPress={() => onSelect(item)}
                >
                  {item.color ? <View style={[styles.selectorDot, { backgroundColor: item.color }]} /> : null}
                  <Text style={[styles.selectorItemText, { color: colors.text }]}>{item.name}</Text>
                  {isSelected ? <MaterialIcons name="check" size={20} color={primaryColor} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  if (findings === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
          {t('taskDetail.findingsLoading')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.progressCard, { backgroundColor: surfaceMuted, borderColor: cardBorder }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>{t('taskDetail.findingsTitle')}</Text>
            <Text style={[styles.progressBadge, { color: colors.textSecondary }]}>{progressPercent}%</Text>
          </View>
          <Text style={[styles.progressSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {taskName} · {rows.length === 0
              ? t('taskDetail.findingsEmptyCounter')
              : `${resolvedCount}/${rows.length} ${t('taskDetail.findingsResolved')}`}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E5E5EA' }]}>
            <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: primaryColor }]} />
          </View>
        </View>

        {!readOnly && (
          <View style={[styles.addRow, { borderColor: cardBorder, backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.addInput, { color: colors.text }]}
              placeholder={t('taskDetail.findingsPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void handleAddFinding()}
              returnKeyType="done"
              editable={!addingFinding}
            />
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: primaryColor, opacity: addingFinding ? 0.6 : 1 }]}
              onPress={() => void handleAddFinding()}
              disabled={addingFinding || !draft.trim()}
            >
              {addingFinding
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.addButtonText}>{t('taskDetail.findingsAdd')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {rows.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: cardBorder }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('taskDetail.findingsEmpty')}
            </Text>
          </View>
        ) : rows.map((finding) => {
          const resolved = isFindingResolved(finding);
          const linkedTask = finding.linkedTask;
          return (
            <TouchableOpacity
              key={String(finding._id)}
              style={[
                styles.findingRow,
                {
                  borderColor: resolved ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.25)',
                  backgroundColor: resolved
                    ? (isDarkMode ? 'rgba(34,197,94,0.08)' : '#F0FDF4')
                    : (isDarkMode ? 'rgba(239,68,68,0.08)' : '#FEF2F2'),
                },
              ]}
              onPress={() => setSelectedFindingId(String(finding._id))}
              activeOpacity={0.75}
            >
              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation?.();
                  void handleToggleResolved(finding);
                }}
                disabled={readOnly}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name={resolved ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={resolved ? '#16A34A' : colors.textSecondary}
                />
              </TouchableOpacity>
              <View style={styles.findingTextWrap}>
                <Text
                  style={[
                    styles.findingText,
                    { color: resolved ? colors.textSecondary : colors.text },
                    resolved && styles.findingTextResolved,
                  ]}
                  numberOfLines={2}
                >
                  {finding.text}
                </Text>
                {linkedTask?.statusName ? (
                  <Text style={[styles.linkedTaskMeta, { color: linkedTask.statusColor || primaryColor }]} numberOfLines={1}>
                    {linkedTask.statusName}
                  </Text>
                ) : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={selectedFinding != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedFindingId(null)}
      >
        {selectedFinding ? (
          <View style={[styles.detailContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.detailHeader, { borderBottomColor: cardBorder, paddingTop: detailTopInset }]}>
              <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={2}>
                {selectedFinding.text}
              </Text>
              <TouchableOpacity onPress={() => setSelectedFindingId(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={[styles.detailContent, { paddingBottom: spacing.xl + detailBottomInset }]}
              keyboardShouldPersistTaps="handled"
            >
              <FieldLabel icon="notes" label={t('taskDetail.findingsDescription')} colors={colors} />
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.surface }]}
                placeholder={t('taskDetail.findingsDescriptionPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                onBlur={handleSaveDescription}
                multiline
                editable={!readOnly}
              />

              <FieldRow
                icon="place"
                label={t('taskDetail.findingsSpot')}
                value={spotItems.find((item) => item.id === selectedSpotId)?.name ?? t('taskDetail.findingsNoSpot')}
                onPress={() => !readOnly && setSpotPickerVisible(true)}
                colors={colors}
                disabled={readOnly}
              />

              <FieldLabel icon="event" label={t('taskDetail.findingsDueDate')} colors={colors} />
              <TextInput
                style={[styles.fieldInput, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.surface }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={dueDateDraft}
                onChangeText={setDueDateDraft}
                onBlur={handleSaveDueDate}
                editable={!readOnly}
                autoCapitalize="none"
              />

              <FieldRow
                icon="flag"
                label={t('taskDetail.findingsPriority')}
                value={priorityItems.find((item) => item.id === selectedPriorityId)?.name ?? t('taskDetail.findingsNoPriority')}
                onPress={() => !readOnly && setPriorityPickerVisible(true)}
                colors={colors}
                disabled={readOnly}
              />

              <FieldRow
                icon="person"
                label={t('taskDetail.findingsResponsible')}
                value={selectedAssigneeLabel}
                onPress={() => !readOnly && setAssigneePickerVisible(true)}
                colors={colors}
                disabled={readOnly}
              />

              <FieldRow
                icon="label"
                label={t('taskDetail.findingsTags')}
                value={selectedTagIds.length > 0
                  ? selectedTagIds
                    .map((id) => tagItems.find((tag) => tag.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')
                  : t('taskDetail.findingsAddTag')}
                onPress={() => !readOnly && setTagPickerVisible(true)}
                colors={colors}
                disabled={readOnly}
              />

              <View style={styles.attachmentsHeader}>
                <FieldLabel icon="attach-file" label={t('taskDetail.findingsAttachments')} colors={colors} />
                {!readOnly ? (
                  <TouchableOpacity
                    style={[styles.smallButton, { borderColor: cardBorder }]}
                    onPress={() => void handleUploadAttachments()}
                    disabled={uploadingFindingId === String(selectedFinding._id) || uploading}
                  >
                    <Text style={[styles.smallButtonText, { color: primaryColor }]}>
                      {uploadingFindingId === String(selectedFinding._id) || uploading
                        ? t('taskDetail.findingsUploading')
                        : t('taskDetail.findingsAddAttachment')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {(selectedFinding.evidenceFiles ?? selectedFinding.evidence_files ?? []).length === 0 ? (
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  {t('taskDetail.findingsNoAttachments')}
                </Text>
              ) : (
                (selectedFinding.evidenceFiles ?? selectedFinding.evidence_files).map((file: any, index: number) => (
                  <View key={`${file.storageId}-${index}`} style={[styles.attachmentRow, { borderColor: cardBorder }]}>
                    <MaterialIcons name="attach-file" size={16} color={colors.textSecondary} />
                    <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
                      {file.fileName || t('taskDetail.findingsAttachment')}
                    </Text>
                    {!readOnly ? (
                      <TouchableOpacity onPress={() => void handleRemoveAttachment(String(file.storageId))}>
                        <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}

              <FieldLabel icon="chat-bubble-outline" label={t('taskDetail.findingsNotesSection')} colors={colors} />
              {findingNotes === undefined ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (findingNotes ?? []).length === 0 ? (
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  {t('taskDetail.findingsNotesEmpty')}
                </Text>
              ) : (
                (findingNotes ?? []).map((note: any) => (
                  <View key={String(note._id)} style={[styles.noteCard, { backgroundColor: surfaceMuted, borderColor: cardBorder }]}>
                    <Text style={[styles.noteAuthor, { color: colors.textSecondary }]}>
                      {note.authorName || t('common.unknown')}
                    </Text>
                    {!!note.note && <Text style={[styles.noteText, { color: colors.text }]}>{note.note}</Text>}
                  </View>
                ))
              )}
              {!readOnly ? (
                <View style={styles.noteComposer}>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.surface }]}
                    placeholder={t('taskDetail.findingsNotesPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    multiline
                    editable={!creatingNote}
                  />
                  <TouchableOpacity
                    style={[styles.noteAddButton, { backgroundColor: primaryColor, opacity: creatingNote ? 0.6 : 1 }]}
                    onPress={() => void handleCreateNote()}
                    disabled={creatingNote || !noteDraft.trim()}
                  >
                    <Text style={styles.addButtonText}>{t('taskDetail.findingsNotesAdd')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.detailFooter, { borderTopColor: cardBorder, backgroundColor: colors.surface, paddingBottom: detailBottomInset }]}>
              {!selectedHasLinkedTask && selectedCanCreateCorrectiveTask ? (
                <FieldRow
                  icon="groups"
                  label={t('taskDetail.findingsTargetTeam')}
                  value={teamItems.find((item) => item.id === selectedTargetTeamId)?.name ?? t('taskDetail.findingsSelectTargetTeam')}
                  onPress={() => !readOnly && setTeamPickerVisible(true)}
                  colors={colors}
                  disabled={readOnly}
                />
              ) : null}
              <View style={styles.footerActions}>
                {(selectedHasLinkedTask || selectedCanCreateCorrectiveTask) ? (
                  <TouchableOpacity
                    style={[
                      styles.primaryAction,
                      {
                        backgroundColor: selectedHasLinkedTask ? colors.surface : '#DC2626',
                        borderColor: selectedHasLinkedTask ? cardBorder : '#DC2626',
                        borderWidth: selectedHasLinkedTask ? 1 : 0,
                      },
                    ]}
                    onPress={() => void handleCreateCorrectiveTask()}
                    disabled={creatingTaskFindingId === String(selectedFinding._id)}
                  >
                    {creatingTaskFindingId === String(selectedFinding._id) ? (
                      <ActivityIndicator size="small" color={selectedHasLinkedTask ? primaryColor : '#FFFFFF'} />
                    ) : (
                      <>
                        <MaterialIcons
                          name={selectedHasLinkedTask ? 'open-in-new' : 'add'}
                          size={18}
                          color={selectedHasLinkedTask ? primaryColor : '#FFFFFF'}
                        />
                        <Text style={[styles.primaryActionText, { color: selectedHasLinkedTask ? primaryColor : '#FFFFFF' }]}>
                          {selectedHasLinkedTask
                            ? t('taskDetail.findingsOpenLinkedTask')
                            : t('taskDetail.findingsCreateTask')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
                {!readOnly ? (
                  <TouchableOpacity style={styles.deleteAction} onPress={handleDeleteFinding}>
                    <Text style={styles.deleteActionText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </Modal>

      {renderSelectorModal(
        spotPickerVisible,
        t('taskDetail.findingsSpot'),
        spotItems,
        selectedSpotId || '__none__',
        (item) => {
          setSpotPickerVisible(false);
          void patchFinding({ spotId: item.id === '__none__' ? null : (item.id as any) });
        },
        () => setSpotPickerVisible(false),
      )}

      {renderSelectorModal(
        priorityPickerVisible,
        t('taskDetail.findingsPriority'),
        priorityItems,
        selectedPriorityId || '__none__',
        (item) => {
          setPriorityPickerVisible(false);
          void patchFinding({ priorityId: item.id === '__none__' ? null : (item.id as any) });
        },
        () => setPriorityPickerVisible(false),
      )}

      {renderSelectorModal(
        teamPickerVisible,
        t('taskDetail.findingsTargetTeam'),
        teamItems,
        selectedTargetTeamId,
        (item) => {
          setTeamPickerVisible(false);
          if (!selectedFinding) return;
          setSelectedTargetTeamByFindingId((prev) => ({ ...prev, [String(selectedFinding._id)]: item.id }));
        },
        () => setTeamPickerVisible(false),
      )}

      {renderSelectorModal(
        tagPickerVisible,
        t('taskDetail.findingsTags'),
        tagItems,
        null,
        (item) => {
          const next = selectedTagIds.includes(item.id)
            ? selectedTagIds.filter((id) => id !== item.id)
            : [...selectedTagIds, item.id];
          void patchFinding({ tagIds: next as any });
        },
        () => setTagPickerVisible(false),
        true,
      )}

      <Modal
        visible={assigneePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssigneePickerVisible(false)}
      >
        <UserPickerSheet
          visible
          title={t('createTask.selectAssigneesModalTitle')}
          users={assigneePickerUsers}
          selectedIds={new Set(selectedAssigneeId ? [selectedAssigneeId] : [])}
          onToggleUser={handleAssigneeToggle}
          onClose={() => setAssigneePickerVisible(false)}
          colors={colors}
          primaryColor={primaryColor}
          isDarkMode={isDarkMode}
          currentUserId={authUser?.id ?? null}
          currentUserName={authUser?.name ?? null}
          searchPlaceholder={t('common.searchUsers')}
          emptyText={t('common.noItemsFound')}
          youLabel={t('common.you')}
          footer={(
            <TouchableOpacity
              style={[styles.clearAssigneeButton, { borderTopColor: cardBorder }]}
              onPress={handleClearAssignee}
            >
              <Text style={[styles.clearAssigneeText, { color: colors.textSecondary }]}>
                {t('taskDetail.findingsNoResponsible')}
              </Text>
            </TouchableOpacity>
          )}
        />
      </Modal>

      <AttachmentPickerSheet {...attachmentPickerProps} />
    </View>
  );
};

function FieldLabel({
  icon,
  label,
  colors,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <MaterialIcons name={icon} size={16} color={colors.textSecondary} />
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function FieldRow({
  icon,
  label,
  value,
  onPress,
  colors,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  onPress: () => void;
  colors: ThemeColors;
  disabled?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <FieldLabel icon={icon} label={label} colors={colors} />
      <TouchableOpacity
        style={[styles.fieldRowButton, { borderColor: 'rgba(0,0,0,0.08)' }]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={[styles.fieldRowValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
        {!disabled ? <MaterialIcons name="expand-more" size={20} color={colors.textSecondary} /> : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  centeredText: { marginTop: spacing.sm, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  progressCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.displaySemibold },
  progressBadge: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  progressSubtitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 8,
  },
  addInput: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular, paddingHorizontal: 8, paddingVertical: 8 },
  addButton: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, minWidth: 84, alignItems: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  emptyCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular, textAlign: 'center' },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  findingTextWrap: { flex: 1, gap: 2 },
  findingText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  findingTextResolved: { textDecorationLine: 'line-through' },
  linkedTaskMeta: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold },
  detailContainer: { flex: 1 },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  detailTitle: { flex: 1, fontSize: fontSizes.lg, fontFamily: fontFamilies.displaySemibold },
  detailContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  detailFooter: { borderTopWidth: 1, padding: spacing.md, gap: spacing.sm },
  fieldBlock: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  fieldLabel: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold, textTransform: 'uppercase' },
  fieldInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  fieldTextArea: { minHeight: 88, textAlignVertical: 'top' },
  fieldRowButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldRowValue: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  attachmentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallButton: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold },
  helperText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachmentName: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  noteCard: { borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 4 },
  noteAuthor: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold },
  noteText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  noteComposer: { gap: 8, marginTop: 4 },
  noteAddButton: { alignSelf: 'flex-end', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  primaryActionText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  deleteAction: { paddingVertical: 10, paddingHorizontal: 8 },
  deleteActionText: { color: '#DC2626', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  clearAssigneeButton: {
    borderTopWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearAssigneeText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  selectorSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 24,
  },
  selectorTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    paddingHorizontal: spacing.md,
    marginBottom: 8,
  },
  selectorList: { paddingHorizontal: spacing.md },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  selectorDot: { width: 10, height: 10, borderRadius: 5 },
  selectorItemText: { flex: 1, fontSize: fontSizes.md, fontFamily: fontFamilies.bodyRegular },
});
