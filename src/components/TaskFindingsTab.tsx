import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Linking,
  useWindowDimensions,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
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
import {
  applyOptimisticResolvedPatches,
  createOptimisticFindingPending,
  isOptimisticFindingId,
  mergeFindingsWithOptimistic,
  pruneResolvedOptimisticFindings,
  pruneResolvedOptimisticPatches,
  type OptimisticFindingPending,
  type OptimisticFindingResolvedPatch,
} from '../../../convex/_helpers/optimisticFindings';
import type { RootStackParamList, ThemeColors } from '../models/types';

type HallazgoAttributeOption = { key: string; label: string; archived?: boolean };
type HallazgoAttribute = {
  id: string;
  label: string;
  icon: string;
  order: number;
  type: 'select' | 'reference';
  options?: HallazgoAttributeOption[];
  reference?: 'spots' | 'users' | 'teams' | 'assets';
  required: boolean;
  quickCapture: boolean;
  inTitle: boolean;
  showInList: boolean;
};
type HallazgoAttributeValue =
  | { kind: 'select'; key: string; label: string }
  | { kind: 'reference'; refId: string; label: string };
type HallazgoConfig = {
  enabled: boolean;
  attributes: HallazgoAttribute[];
  titleSeparator?: string;
  allowFreeText?: boolean;
  useChipsInTitle?: boolean;
  descriptionOptional?: boolean;
  showDescriptionInQuickCapture?: boolean;
};

const HALLAZGO_FALLBACK_TITLE = 'Hallazgo';
type FindingDetailTab = 'details' | 'notes' | 'history';
type TaskFindingsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FINDING_DETAIL_TABS: FindingDetailTab[] = ['details', 'notes', 'history'];
const TIGHT_TAB_SPRING = {
  damping: 90,
  stiffness: 1600,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
};

function fixConvexStorageUrl(url: string): string {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return url;
  try {
    const expected = new URL(convexUrl);
    const actual = new URL(url);

    const isConvexLikeSource =
      actual.pathname.includes('/api/storage/') ||
      actual.hostname.includes('convex') ||
      actual.hostname.startsWith('cvx-');

    if (!isConvexLikeSource) return url;

    if (actual.hostname !== expected.hostname) {
      actual.hostname = expected.hostname;
      return actual.toString();
    }
  } catch {}
  return url;
}

function getReferenceRowLabel(row: any): string {
  return row?.name || row?.full_name || row?.fullName || row?.email || `#${String(row?._id ?? row?.id ?? '').slice(0, 8)}`;
}

function composeClientTitle(
  attributes: HallazgoAttribute[],
  values: Record<string, HallazgoAttributeValue>,
  separator = ' - ',
): string {
  const parts = [...attributes]
    .sort((a, b) => a.order - b.order)
    .filter((attr) => attr.inTitle && values[attr.id])
    .map((attr) => values[attr.id]?.label)
    .filter(Boolean);
  return parts.length > 0 ? parts.join(separator) : HALLAZGO_FALLBACK_TITLE;
}

const FINDINGS_DRAG_ANIMATION_CONFIG = {
  damping: 22,
  stiffness: 220,
  mass: 0.2,
  overshootClamping: true,
} as const;

const FINDINGS_REORDER_SAVE_DELAY_MS = 220;

function getRowId(row: any): string {
  return String(row?._id ?? row?.id ?? '');
}

function sortRowsByOrder(rows: any[]): any[] {
  return [...rows].sort(
    (a, b) => (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0),
  );
}

function serializeRowOrder(rows: any[]): string {
  return rows.map((row) => String(row._id)).join('\0');
}

function mergeRowsPreservingOrder(currentOrder: any[], freshRows: any[]): any[] {
  const freshById = new Map(freshRows.map((row) => [String(row._id), row]));
  const merged = currentOrder
    .map((row) => freshById.get(String(row._id)))
    .filter((row): row is any => Boolean(row));
  for (const row of freshRows) {
    if (!merged.some((item) => String(item._id) === String(row._id))) {
      merged.push(row);
    }
  }
  return merged;
}

function rowsMatchOrder(left: any[], right: any[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, index) => String(row._id) === String(right[index]?._id));
}

function rowsAreSameForList(left: any[], right: any[]): boolean {
  if (!rowsMatchOrder(left, right)) return false;
  return left.every((row, index) => {
    const other = right[index];
    return row.resolved === other.resolved
      && row.text === other.text
      && Number(row.noteCount ?? 0) === Number(other.noteCount ?? 0)
      && (row.evidenceFiles ?? row.evidence_files ?? []).length === (other.evidenceFiles ?? other.evidence_files ?? []).length
      && Number(row.linkedTask?.attachmentCount ?? 0) === Number(other.linkedTask?.attachmentCount ?? 0)
      && String(row.linkedTask?.statusName ?? '') === String(other.linkedTask?.statusName ?? '')
      && String(row.linkedTask?.statusColor ?? '') === String(other.linkedTask?.statusColor ?? '');
  });
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

function getFindingCreateErrorMessage(error: any, t: (key: string, options?: Record<string, any>) => string) {
  const message = String(error?.message ?? error ?? '');
  if (message.toLowerCase().includes('task not found')) {
    return t('taskDetail.findingsTaskMissing');
  }
  return message || t('taskDetail.findingsAddFailed');
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

function formatFindingTimestamp(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(numeric));
  } catch {
    return new Date(numeric).toLocaleString();
  }
}

function getFindingHistoryActionLabel(action: string, t: (key: string, options?: Record<string, any>) => string): string {
  switch (action) {
    case 'FINDING_CREATED':
      return t('taskDetail.findingsHistoryCreated');
    case 'FINDING_UPDATED':
      return t('taskDetail.findingsHistoryUpdated');
    case 'FINDING_DELETED':
      return t('taskDetail.findingsHistoryDeleted');
    case 'FINDING_NOTE_ADDED':
      return t('taskDetail.findingsHistoryNoteAdded');
    case 'FINDING_NOTE_UPDATED':
      return t('taskDetail.findingsHistoryNoteUpdated');
    case 'FINDING_NOTE_DELETED':
      return t('taskDetail.findingsHistoryNoteDeleted');
    case 'FINDING_TASK_LINKED':
      return t('taskDetail.findingsHistoryTaskLinked');
    default:
      return t('taskDetail.findingsHistoryUpdated');
  }
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
  detailOnly?: boolean;
  initialFindingId?: string;
  onClose?: () => void;
}

export const TaskFindingsTab: React.FC<TaskFindingsTabProps> = ({
  taskId,
  taskName,
  readOnly = false,
  colors,
  primaryColor,
  isDarkMode,
  onOpenLinkedTask,
  detailOnly = false,
  initialFindingId,
  onClose,
}) => {
  const navigation = useNavigation<TaskFindingsNavigationProp>();
  const { tenantId } = useTenant();
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const { data } = useData();
  const { pickAndUpload, uploading, attachmentPickerProps } = useConvexUpload();
  const insets = useSafeAreaInsets();
  const detailTopInset = Math.max(insets.top, spacing.lg);
  const detailBottomInset = Math.max(insets.bottom, spacing.lg);
  const { width: screenWidth } = useWindowDimensions();

  const [draft, setDraft] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftAttributeValues, setDraftAttributeValues] = useState<Record<string, HallazgoAttributeValue>>({});
  const [attributePicker, setAttributePicker] = useState<{ attr: HallazgoAttribute; target: 'draft' | 'detail' } | null>(null);
  const [captureModalVisible, setCaptureModalVisible] = useState(false);
  const [pendingOptimisticFindings, setPendingOptimisticFindings] = useState<OptimisticFindingPending[]>([]);
  const [optimisticResolvedPatches, setOptimisticResolvedPatches] = useState<OptimisticFindingResolvedPatch[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(initialFindingId ?? null);
  const [titleDraft, setTitleDraft] = useState('');
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
  const [listData, setListData] = useState<any[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<FindingDetailTab>('details');
  const detailTabTranslateX = useSharedValue(0);
  const detailTabDragStartX = useRef(0);
  const isDraggingRef = useRef(false);
  const pendingOrderRef = useRef<string | null>(null);
  const dragSnapshotRef = useRef<any[]>([]);
  const listDataRef = useRef<any[]>([]);
  const queuedOrderRef = useRef<any[] | null>(null);
  const isPersistingOrderRef = useRef(false);
  const reorderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const reorderFindings = useMutation(api.taskFindings.reorder);

  const rows = useMemo(() => applyOptimisticResolvedPatches(
    mergeFindingsWithOptimistic(
      Array.isArray(findings) ? findings : [],
      pendingOptimisticFindings,
      { correctiveTaskCreationEnabled: true },
    ),
    optimisticResolvedPatches,
  ), [findings, optimisticResolvedPatches, pendingOptimisticFindings]);

  const sortedRows = useMemo(() => sortRowsByOrder(rows), [rows]);

  useEffect(() => {
    listDataRef.current = listData;
  }, [listData]);

  useEffect(() => {
    if (!Array.isArray(findings)) return;
    setPendingOptimisticFindings((current) => pruneResolvedOptimisticFindings(current, findings));
    setOptimisticResolvedPatches((current) => pruneResolvedOptimisticPatches(current, findings));
  }, [findings]);

  useEffect(() => {
    isDraggingRef.current = false;
    pendingOrderRef.current = null;
    dragSnapshotRef.current = [];
    queuedOrderRef.current = null;
    isPersistingOrderRef.current = false;
    if (reorderSaveTimerRef.current) {
      clearTimeout(reorderSaveTimerRef.current);
      reorderSaveTimerRef.current = null;
    }
    setListData([]);
    setOptimisticResolvedPatches([]);
    setDraft('');
    setDraftDescription('');
    setDraftAttributeValues({});
    setAttributePicker(null);
    setCaptureModalVisible(false);
    if (!detailOnly) {
      setSelectedFindingId(null);
    }
  }, [detailOnly, taskId]);

  useEffect(() => {
    if (initialFindingId) {
      setSelectedFindingId(initialFindingId);
    }
  }, [initialFindingId]);

  useEffect(() => {
    if (isDraggingRef.current) return;

    if (pendingOrderRef.current) {
      if (serializeRowOrder(sortedRows) !== pendingOrderRef.current) return;
      pendingOrderRef.current = null;
      setListData((prev) => {
        const merged = mergeRowsPreservingOrder(prev, sortedRows);
        return rowsAreSameForList(prev, merged) ? prev : merged;
      });
      return;
    }

    setListData((prev) => {
      if (prev.length === 0) return sortedRows;
      const merged = mergeRowsPreservingOrder(prev, sortedRows);
      return rowsAreSameForList(prev, merged) ? prev : merged;
    });
  }, [sortedRows]);
  const selectedFinding = useMemo(
    () => rows.find((row) => String(row._id) === selectedFindingId) ?? null,
    [rows, selectedFindingId],
  );

  const findingNotes = useQuery(
    api.taskFindings.listNotes,
    tenantId && selectedFinding?._id
      ? { tenantId, findingId: selectedFinding._id as any }
      : 'skip',
  ) as any[] | undefined;
  const findingHistory = useQuery(
    api.taskFindings.listHistory,
    tenantId && taskId && selectedFinding?._id
      ? { tenantId, taskId: taskId as any }
      : 'skip',
  ) as any[] | undefined;
  const selectedFindingHistory = useMemo(() => {
    if (!selectedFinding?._id || !Array.isArray(findingHistory)) return [];
    const findingId = String(selectedFinding._id);
    return findingHistory.filter((entry: any) => {
      const oldFindingId = entry?.oldValues?.findingId;
      const newFindingId = entry?.newValues?.findingId;
      return String(oldFindingId ?? '') === findingId || String(newFindingId ?? '') === findingId;
    });
  }, [findingHistory, selectedFinding?._id]);

  const selectedEvidenceFiles = useMemo(() => {
    const files = selectedFinding?.evidenceFiles ?? selectedFinding?.evidence_files;
    return Array.isArray(files) ? files : [];
  }, [selectedFinding]);

  const evidenceStorageIds = useMemo(
    () => selectedEvidenceFiles.map((file: any) => file?.storageId).filter(Boolean),
    [selectedEvidenceFiles],
  );

  const evidenceUrlMap = useQuery(
    api.files.getFileUrls,
    tenantId && evidenceStorageIds.length > 0
      ? { tenantId, storageIds: evidenceStorageIds as any }
      : 'skip',
  ) as Record<string, string | null> | undefined;

  const openEvidenceFile = useCallback((storageId: string) => {
    const rawUrl = evidenceUrlMap?.[storageId];
    if (!rawUrl) return;
    void Linking.openURL(fixConvexStorageUrl(rawUrl)).catch(() => {
      Alert.alert(t('common.error'), t('taskDetail.findingsAttachmentOpenFailed'));
    });
  }, [evidenceUrlMap, t]);

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

  const hallazgoConfig = useMemo<HallazgoConfig | null>(() => {
    const value = (sourceTemplate as any)?.hallazgoConfig ?? (sourceTemplate as any)?.hallazgo_config;
    if (value?.enabled && Array.isArray(value.attributes)) return value as HallazgoConfig;
    return null;
  }, [sourceTemplate]);

  const hallazgoAttributes = useMemo(
    () => [...(hallazgoConfig?.attributes ?? [])].sort((a, b) => a.order - b.order),
    [hallazgoConfig],
  );
  const quickCaptureAttributes = useMemo(
    () => hallazgoAttributes.filter((attr) => attr.quickCapture),
    [hallazgoAttributes],
  );
  const resolveReferenceOptions = useCallback((reference?: HallazgoAttribute['reference']): SelectorItem[] => {
    const rows = reference === 'spots'
      ? data.spots
      : reference === 'users'
        ? data.users
        : reference === 'teams'
          ? data.teams
          : [];
    return (Array.isArray(rows) ? rows : [])
      .filter((row: any) => !row?.deletedAt && !row?.deleted_at)
      .map((row: any) => ({ id: getRowId(row), name: getReferenceRowLabel(row) }))
      .filter((option) => option.id && option.name)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [data.spots, data.teams, data.users]);

  const getAttributeOptions = useCallback((attr: HallazgoAttribute, currentValue?: HallazgoAttributeValue): SelectorItem[] => {
    if (attr.type === 'select') {
      return (attr.options ?? [])
        .filter((option) => !option.archived || (currentValue?.kind === 'select' && option.key === currentValue.key))
        .map((option) => ({ id: option.key, name: option.label }));
    }
    return resolveReferenceOptions(attr.reference);
  }, [resolveReferenceOptions]);

  const missingRequiredAttributes = useMemo(
    () => quickCaptureAttributes.filter((attr) => attr.required && !draftAttributeValues[attr.id]),
    [draftAttributeValues, quickCaptureAttributes],
  );
  const descriptionRequired = quickCaptureAttributes.length > 0 && hallazgoConfig?.descriptionOptional !== true;
  const genericCanAdd = hallazgoConfig
    ? quickCaptureAttributes.length > 0
      ? missingRequiredAttributes.length === 0 && (
        draft.trim().length > 0
        || (!descriptionRequired && Object.keys(draftAttributeValues).length > 0)
      )
      : draft.trim().length > 0
    : false;

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
    if (!detailOnly) {
      setSelectedFindingId(null);
    }
  }, [detailOnly, taskId]);

  useEffect(() => {
    if (Array.isArray(findings) && selectedFindingId && !selectedFinding) {
      setSelectedFindingId(null);
    }
  }, [findings, selectedFindingId, selectedFinding]);

  useEffect(() => {
    if (!selectedFinding) {
      setAssigneePickerVisible(false);
      setSpotPickerVisible(false);
      setPriorityPickerVisible(false);
      setTeamPickerVisible(false);
      setTagPickerVisible(false);
      setAttributePicker((current) => (current?.target === 'detail' ? null : current));
    }
  }, [selectedFinding]);

  useEffect(() => {
    if (!selectedFinding) return;
    setTitleDraft(String(selectedFinding.text ?? ''));
    setDescriptionDraft(String(selectedFinding.notes ?? ''));
    setDueDateDraft(toDateInputValue(selectedFinding.dueDate ?? selectedFinding.due_date));
    setNoteDraft('');
    setActiveDetailTab('details');
  }, [selectedFinding?._id, selectedFinding?.text, selectedFinding?.notes, selectedFinding?.dueDate, selectedFinding?.due_date]);

  useEffect(() => {
    const idx = FINDING_DETAIL_TABS.indexOf(activeDetailTab);
    detailTabTranslateX.value = withSpring(-idx * screenWidth, { ...TIGHT_TAB_SPRING });
  }, [activeDetailTab, detailTabTranslateX, screenWidth]);

  const detailTabSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: detailTabTranslateX.value }],
  }));

  const finishDetailTabSwipe = useCallback((dx: number, vx: number) => {
    const currentX = detailTabDragStartX.current + dx;
    const velocityThreshold = 0.28;
    const distanceThreshold = screenWidth * 0.16;
    const idx = FINDING_DETAIL_TABS.indexOf(activeDetailTab);
    let newIdx = idx;

    if ((vx < -velocityThreshold || dx < -distanceThreshold) && idx < FINDING_DETAIL_TABS.length - 1) {
      newIdx = idx + 1;
    } else if ((vx > velocityThreshold || dx > distanceThreshold) && idx > 0) {
      newIdx = idx - 1;
    } else {
      newIdx = Math.round(-currentX / screenWidth);
      newIdx = Math.max(0, Math.min(FINDING_DETAIL_TABS.length - 1, newIdx));
    }

    const target = -newIdx * screenWidth;
    detailTabTranslateX.value = withSpring(target, { ...TIGHT_TAB_SPRING, velocity: vx * screenWidth });

    if (FINDING_DETAIL_TABS[newIdx] !== activeDetailTab) {
      setActiveDetailTab(FINDING_DETAIL_TABS[newIdx]);
    }
  }, [activeDetailTab, detailTabTranslateX, screenWidth]);

  const detailTabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) =>
          Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.15,
        onPanResponderGrant: () => {
          const idx = FINDING_DETAIL_TABS.indexOf(activeDetailTab);
          detailTabDragStartX.current = -idx * screenWidth;
        },
        onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          const maxX = 0;
          const minX = -(FINDING_DETAIL_TABS.length - 1) * screenWidth;
          const newX = Math.min(maxX, Math.max(minX, detailTabDragStartX.current + gs.dx));
          detailTabTranslateX.value = newX;
        },
        onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          finishDetailTabSwipe(gs.dx, gs.vx);
        },
        onPanResponderTerminate: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          finishDetailTabSwipe(gs.dx, gs.vx);
        },
      }),
    [activeDetailTab, detailTabTranslateX, finishDetailTabSwipe, screenWidth],
  );

  const handleAddFinding = useCallback(() => {
    if (!tenantId || readOnly) return;

    if (hallazgoConfig) {
      if (!genericCanAdd) return;
      const hasQuickCaptureAttributes = quickCaptureAttributes.length > 0;
      const description = hasQuickCaptureAttributes
        ? draft.trim()
        : '';
      const composedTitle = hasQuickCaptureAttributes && Object.keys(draftAttributeValues).length > 0
        ? composeClientTitle(hallazgoAttributes, draftAttributeValues, hallazgoConfig.titleSeparator)
        : '';
      const title = composedTitle && composedTitle !== HALLAZGO_FALLBACK_TITLE ? composedTitle : draft.trim();
      if (!title) return;

      const pending = createOptimisticFindingPending(title, undefined, undefined, draftAttributeValues, description || undefined);
      setPendingOptimisticFindings((current) => [...current, pending]);
      setDraft('');
      setDraftDescription('');
      setDraftAttributeValues((current) => {
        const next = { ...current };
        const firstAttr = quickCaptureAttributes[0];
        if (firstAttr) delete next[firstAttr.id];
        return next;
      });

      void createFinding({
        tenantId,
        taskId: taskId as any,
        text: title,
        values: draftAttributeValues as any,
        ...(description ? { description } : {}),
      })
        .then((createdId) => {
          setPendingOptimisticFindings((current) => current.map((item) => (
            item.tempId === pending.tempId ? { ...item, resolvedId: String(createdId) } : item
          )));
        })
        .catch((error: any) => {
          setPendingOptimisticFindings((current) => current.filter((item) => item.tempId !== pending.tempId));
          Alert.alert(t('common.error'), getFindingCreateErrorMessage(error, t));
        });
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) return;

    const pending = createOptimisticFindingPending(trimmed);
    setPendingOptimisticFindings((current) => [...current, pending]);
    setDraft('');

    void createFinding({ tenantId, taskId: taskId as any, text: trimmed })
      .then((createdId) => {
        setPendingOptimisticFindings((current) => current.map((item) => (
          item.tempId === pending.tempId ? { ...item, resolvedId: String(createdId) } : item
        )));
      })
      .catch((error: any) => {
        setPendingOptimisticFindings((current) => current.filter((item) => item.tempId !== pending.tempId));
        Alert.alert(t('common.error'), getFindingCreateErrorMessage(error, t));
      });
  }, [
    createFinding,
    draft,
    draftAttributeValues,
    draftDescription,
    genericCanAdd,
    hallazgoAttributes,
    hallazgoConfig,
    quickCaptureAttributes,
    readOnly,
    t,
    taskId,
    tenantId,
  ]);

  const persistManualOrder = useCallback(async (nextRows: any[]) => {
    if (!tenantId) return;
    const findingIds = nextRows
      .filter((finding) => !isOptimisticFindingId(String(finding._id)) && !finding._optimistic)
      .map((finding) => finding._id);
    if (findingIds.length === 0) return;
    await reorderFindings({
      tenantId,
      taskId: taskId as any,
      findingIds,
    });
  }, [reorderFindings, taskId, tenantId]);

  const handleFindingDragBegin = useCallback(() => {
    isDraggingRef.current = true;
    dragSnapshotRef.current = listDataRef.current;
  }, []);

  const flushQueuedOrder = useCallback(() => {
    if (isPersistingOrderRef.current) return;

    const run = async () => {
      isPersistingOrderRef.current = true;
      try {
        while (queuedOrderRef.current) {
          const next = queuedOrderRef.current;
          const order = serializeRowOrder(next);
          queuedOrderRef.current = null;

          try {
            await persistManualOrder(next);
          } catch (error: any) {
            if (!queuedOrderRef.current && pendingOrderRef.current === order) {
              pendingOrderRef.current = null;
              const previous = dragSnapshotRef.current;
              listDataRef.current = previous;
              setListData(previous);
              Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsReorderFailed'));
            }
          }
        }
      } finally {
        isPersistingOrderRef.current = false;
        if (queuedOrderRef.current) {
          void run();
        }
      }
    };

    void run();
  }, [persistManualOrder, t]);

  const handleFindingDragEnd = useCallback(({ data, from, to }: { data: any[]; from: number; to: number }) => {
    isDraggingRef.current = false;

    if (readOnly || from === to) return;

    const next = data;
    pendingOrderRef.current = serializeRowOrder(next);
    listDataRef.current = next;
    setListData((prev) => (rowsMatchOrder(prev, next) ? prev : next));
    queuedOrderRef.current = next;
    if (reorderSaveTimerRef.current) {
      clearTimeout(reorderSaveTimerRef.current);
    }
    reorderSaveTimerRef.current = setTimeout(() => {
      reorderSaveTimerRef.current = null;
      flushQueuedOrder();
    }, FINDINGS_REORDER_SAVE_DELAY_MS);
  }, [flushQueuedOrder, readOnly]);

  const handleToggleResolved = useCallback((finding: any) => {
    if (!tenantId || readOnly || isOptimisticFindingId(String(finding?._id)) || finding?._optimistic) return;
    const findingId = String(finding._id);
    const nextResolved = !isFindingResolved(finding);

    setOptimisticResolvedPatches((current) => [
      ...current.filter((patch) => patch.findingId !== findingId),
      { findingId, resolved: nextResolved },
    ]);

    void updateFinding({
      tenantId,
      id: finding._id,
      resolved: nextResolved,
    }).catch((error: any) => {
      setOptimisticResolvedPatches((current) => current.filter((patch) => patch.findingId !== findingId));
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsUpdateFailed'));
    });
  }, [readOnly, t, tenantId, updateFinding]);

  const patchFinding = useCallback(async (patch: Record<string, unknown>) => {
    if (!tenantId || !selectedFinding || readOnly) return;
    if (isOptimisticFindingId(String(selectedFinding._id)) || selectedFinding._optimistic) return;
    try {
      await updateFinding({ tenantId, id: selectedFinding._id, ...patch });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('taskDetail.findingsUpdateFailed'));
    }
  }, [readOnly, selectedFinding, t, tenantId, updateFinding]);

  const updateSelectedFindingAttribute = useCallback((attrId: string, value: HallazgoAttributeValue | undefined) => {
    if (!selectedFinding) return;
    const nextValues = { ...((selectedFinding.values ?? {}) as Record<string, HallazgoAttributeValue>) };
    if (value) nextValues[attrId] = value;
    else delete nextValues[attrId];
    void patchFinding({ values: nextValues as any });
  }, [patchFinding, selectedFinding]);

  const handleSaveTitle = useCallback(() => {
    if (!selectedFinding) return;
    const next = titleDraft.trim();
    const current = String(selectedFinding.text ?? '').trim();
    if (!next || next === current) return;
    void patchFinding({ text: next });
  }, [patchFinding, selectedFinding, titleDraft]);

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
            const findingId = String(selectedFinding._id);
            setSelectedFindingId(null);
            void removeFinding({ tenantId, id: selectedFinding._id })
              .catch((error: any) => {
                setSelectedFindingId(findingId);
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

  const draggableFindingCount = useMemo(
    () => listData.filter((finding) => !isOptimisticFindingId(String(finding._id)) && !finding._optimistic).length,
    [listData],
  );

  const renderFindingRow = useCallback(({
    item: finding,
    drag,
    isActive,
  }: RenderItemParams<any>) => {
    const resolved = isFindingResolved(finding);
    const linkedTask = finding.linkedTask;
    const isOptimisticFinding = isOptimisticFindingId(String(finding._id)) || finding._optimistic === true;
    const canDrag = !readOnly && !isOptimisticFinding;
    const noteCount = Number(finding.noteCount ?? 0);
    const attachmentCount = linkedTask?._id
      ? Number(linkedTask.attachmentCount ?? 0)
      : (finding.evidenceFiles ?? finding.evidence_files ?? []).length;

    return (
      <View
        style={[
          styles.findingRow,
          { borderColor: cardBorder, backgroundColor: colors.surface },
          isActive && styles.findingRowActive,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.findingRowPressable,
            pressed && !isActive && styles.findingRowPressed,
          ]}
          onPress={() => {
            if (isOptimisticFinding) return;
            const findingId = String(finding._id);
            if (detailOnly) {
              setSelectedFindingId(findingId);
            } else {
              navigation.navigate('TaskFindingDetail', {
                taskId,
                taskName,
                findingId,
                readOnly,
              });
            }
          }}
          onLongPress={canDrag ? drag : undefined}
          delayLongPress={280}
          disabled={isActive}
        >
          {canDrag ? (
            <MaterialIcons name="drag-indicator" size={20} color={colors.textSecondary} />
          ) : null}
          <TouchableOpacity
            onPress={() => void handleToggleResolved(finding)}
            disabled={readOnly || isOptimisticFinding}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name={resolved ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={colors.textSecondary}
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
            {(noteCount > 0 || attachmentCount > 0) ? (
              <View style={styles.findingMetaRow}>
                {noteCount > 0 ? (
                  <View style={[styles.findingMetaPill, { backgroundColor: surfaceMuted }]}>
                    <MaterialIcons name="chat-bubble-outline" size={13} color={colors.textSecondary} />
                    <Text style={[styles.findingMetaText, { color: colors.textSecondary }]}>{noteCount}</Text>
                  </View>
                ) : null}
                {attachmentCount > 0 ? (
                  <View style={[styles.findingMetaPill, { backgroundColor: surfaceMuted }]}>
                    <MaterialIcons name="attach-file" size={13} color={colors.textSecondary} />
                    <Text style={[styles.findingMetaText, { color: colors.textSecondary }]}>{attachmentCount}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  }, [cardBorder, colors.surface, colors.text, colors.textSecondary, detailOnly, handleToggleResolved, navigation, primaryColor, readOnly, surfaceMuted, taskId, taskName]);

  const renderListEmpty = useCallback(() => (
    <View style={[styles.emptyCard, { borderColor: cardBorder }]}>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {t('taskDetail.findingsEmpty')}
      </Text>
    </View>
  ), [cardBorder, colors.textSecondary, t]);

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

  if (findings === undefined && pendingOptimisticFindings.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
          {t('taskDetail.findingsLoading')}
        </Text>
      </View>
    );
  }

  if (sourceTask === null) {
    return (
      <View style={styles.container}>
        <View style={[styles.missingTaskCard, { borderColor: cardBorder }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('taskDetail.findingsTaskMissing')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!detailOnly ? (
        <>
          <View style={styles.topSection}>
            <View style={styles.progressBarWrap}>
              <View style={styles.progressMeta}>
                <Text style={[styles.progressMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {rows.length === 0
                    ? t('taskDetail.findingsEmptyCounter')
                    : `${resolvedCount}/${rows.length} ${t('taskDetail.findingsResolved')}`}
                </Text>
                <Text style={[styles.progressMetaText, { color: colors.textSecondary }]}>{progressPercent}%</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E5E5EA' }]}>
                <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: primaryColor }]} />
              </View>
            </View>

            {!readOnly && hallazgoConfig && quickCaptureAttributes.length > 0 ? (
              <TouchableOpacity
                style={[styles.captureLaunchButton, { backgroundColor: primaryColor }]}
                onPress={() => setCaptureModalVisible(true)}
              >
                <MaterialIcons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.captureLaunchText}>{t('taskDetail.findingsNew')}</Text>
              </TouchableOpacity>
            ) : null}

            {!readOnly && hallazgoConfig && quickCaptureAttributes.length === 0 ? (
              <View style={[styles.captureCard, { borderColor: cardBorder, backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.fieldInput, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.background }]}
                  placeholder={t('taskDetail.findingsPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => void handleAddFinding()}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.addButton, styles.captureAddButton, { backgroundColor: primaryColor, opacity: genericCanAdd ? 1 : 0.6 }]}
                  onPress={() => void handleAddFinding()}
                  disabled={!genericCanAdd}
                >
                  <Text style={styles.addButtonText}>{t('taskDetail.findingsAdd')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!readOnly && !hallazgoConfig ? (
              <View style={[styles.addRow, { borderColor: cardBorder, backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.addInput, { color: colors.text }]}
                  placeholder={t('taskDetail.findingsPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => void handleAddFinding()}
                  returnKeyType="done"
                  editable={!readOnly}
                />
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: primaryColor, opacity: !draft.trim() ? 0.6 : 1 }]}
                  onPress={handleAddFinding}
                  disabled={!draft.trim()}
                >
                  <Text style={styles.addButtonText}>{t('taskDetail.findingsAdd')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

          </View>

          <DraggableFlatList
            data={listData}
            keyExtractor={(finding) => String(finding._id)}
            renderItem={renderFindingRow}
            onDragBegin={handleFindingDragBegin}
            onDragEnd={handleFindingDragEnd}
            activationDistance={12}
            autoscrollThreshold={72}
            autoscrollSpeed={160}
            animationConfig={FINDINGS_DRAG_ANIMATION_CONFIG}
            containerStyle={styles.container}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={renderListEmpty}
          />
        </>
      ) : null}

      {detailOnly && selectedFinding ? (
          <View style={[styles.detailContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.detailHeader, { borderBottomColor: cardBorder, paddingTop: detailTopInset }]}>
              <TouchableOpacity
                style={styles.detailBackButton}
                onPress={() => {
                  if (detailOnly) onClose?.();
                  else setSelectedFindingId(null);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MaterialIcons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={2}>
                {titleDraft.trim() || selectedFinding.text}
              </Text>
              <View style={styles.detailHeaderSpacer} />
            </View>

            <View style={[styles.detailTabs, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              {([
                ['details', t('taskDetail.findingsTabDetails')],
                ['notes', `${t('taskDetail.findingsTabNotes')} (${findingNotes?.length ?? Number(selectedFinding.noteCount ?? 0)})`],
                ['history', `${t('taskDetail.findingsTabHistory')} (${selectedFindingHistory.length})`],
              ] as Array<[FindingDetailTab, string]>).map(([tab, label]) => {
                const active = activeDetailTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.detailTabButton,
                      active && { borderBottomColor: primaryColor },
                    ]}
                    onPress={() => setActiveDetailTab(tab)}
                  >
                    <Text style={[
                      styles.detailTabText,
                      { color: active ? primaryColor : colors.textSecondary },
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.detailSwipeViewport}>
              <Animated.View
                {...detailTabPanResponder.panHandlers}
                style={[
                  styles.detailSwipeRow,
                  { width: screenWidth * FINDING_DETAIL_TABS.length },
                  detailTabSlideStyle,
                ]}
              >
                <View style={[styles.detailPane, { width: screenWidth }]}>
                  <ScrollView
                    style={styles.detailScroll}
                    contentContainerStyle={[styles.detailContent, { paddingBottom: spacing.xl + detailBottomInset }]}
                    keyboardShouldPersistTaps="handled"
                  >
                  <FieldLabel icon="title" label={t('taskDetail.findingsName')} colors={colors} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.surface }]}
                    placeholder={t('taskDetail.findingsPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={titleDraft}
                    onChangeText={setTitleDraft}
                    onBlur={handleSaveTitle}
                    onSubmitEditing={handleSaveTitle}
                    returnKeyType="done"
                    editable={!readOnly}
                  />

                  {hallazgoConfig && hallazgoAttributes.length > 0 ? (
                    <View style={styles.fieldBlock}>
                      <FieldLabel icon="tune" label={t('taskDetail.findingsField')} colors={colors} />
                      {hallazgoAttributes.map((attr) => {
                        const value = ((selectedFinding.values ?? {}) as Record<string, HallazgoAttributeValue>)[attr.id];
                        return (
                          <TouchableOpacity
                            key={attr.id}
                            style={[styles.attributeRowButton, { borderColor: cardBorder }]}
                            onPress={() => !readOnly && setAttributePicker({ attr, target: 'detail' })}
                            disabled={readOnly}
                          >
                            <View style={styles.attributeRowText}>
                              <Text style={[styles.attributeRowLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                                {attr.label}{attr.required ? ' *' : ''}
                              </Text>
                              <Text
                                style={[styles.fieldRowValue, { color: value ? colors.text : colors.textSecondary }]}
                                numberOfLines={1}
                              >
                                {value?.label ?? t('taskDetail.findingsNoValue')}
                              </Text>
                            </View>
                            {!readOnly ? <MaterialIcons name="expand-more" size={20} color={colors.textSecondary} /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

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

                  {!hallazgoConfig ? (
                    <FieldRow
                      icon="place"
                      label={t('taskDetail.findingsSpot')}
                      value={spotItems.find((item) => item.id === selectedSpotId)?.name ?? t('taskDetail.findingsNoSpot')}
                      onPress={() => !readOnly && setSpotPickerVisible(true)}
                      colors={colors}
                      disabled={readOnly}
                    />
                  ) : null}

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

                  {!hallazgoConfig ? (
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
                  ) : null}

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
                    (selectedFinding.evidenceFiles ?? selectedFinding.evidence_files).map((file: any, index: number) => {
                      const storageId = String(file.storageId);
                      const hasUrl = Boolean(evidenceUrlMap?.[storageId]);
                      return (
                        <TouchableOpacity
                          key={`${storageId}-${index}`}
                          style={[styles.attachmentRow, { borderColor: cardBorder }]}
                          activeOpacity={0.7}
                          onPress={() => openEvidenceFile(storageId)}
                          disabled={!hasUrl}
                        >
                          <MaterialIcons name="attach-file" size={16} color={colors.textSecondary} />
                          <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
                            {file.fileName || t('taskDetail.findingsAttachment')}
                          </Text>
                          {hasUrl ? (
                            <MaterialIcons name="open-in-new" size={18} color={primaryColor} />
                          ) : (
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                          )}
                          {!readOnly ? (
                            <TouchableOpacity
                              onPress={() => void handleRemoveAttachment(storageId)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })
                  )}
                  </ScrollView>
                </View>

                <View style={[styles.detailPane, { width: screenWidth }]}>
                  <ScrollView
                    style={styles.detailScroll}
                    contentContainerStyle={[styles.detailContent, { paddingBottom: spacing.xl + detailBottomInset }]}
                    keyboardShouldPersistTaps="handled"
                  >
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
                </View>

                <View style={[styles.detailPane, { width: screenWidth }]}>
                  <ScrollView
                    style={styles.detailScroll}
                    contentContainerStyle={[styles.detailContent, { paddingBottom: spacing.xl + detailBottomInset }]}
                    keyboardShouldPersistTaps="handled"
                  >
                  <FieldLabel icon="history" label={t('taskDetail.findingsTabHistory')} colors={colors} />
                  {findingHistory === undefined ? (
                    <ActivityIndicator size="small" color={primaryColor} />
                  ) : selectedFindingHistory.length === 0 ? (
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                      {t('taskDetail.findingsHistoryEmpty')}
                    </Text>
                  ) : (
                    selectedFindingHistory.map((entry: any) => {
                      const timestampLabel = formatFindingTimestamp(entry.timestamp);
                      const actorName = entry.actorName || t('common.unknown');
                      const detailText = String(
                        entry?.newValues?.notePreview ??
                        entry?.newValues?.text ??
                        entry?.oldValues?.text ??
                        '',
                      ).trim();
                      return (
                        <View key={String(entry._id)} style={[styles.historyCard, { backgroundColor: surfaceMuted, borderColor: cardBorder }]}>
                          <View style={styles.historyHeader}>
                            <View style={styles.historyTitleWrap}>
                              <MaterialIcons name="history" size={16} color={colors.textSecondary} />
                              <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={1}>
                                {getFindingHistoryActionLabel(String(entry.action ?? ''), t)}
                              </Text>
                            </View>
                            {timestampLabel ? (
                              <Text style={[styles.historyTime, { color: colors.textSecondary }]}>{timestampLabel}</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.historyActor, { color: colors.textSecondary }]} numberOfLines={1}>
                            {actorName}
                          </Text>
                          {detailText ? (
                            <Text style={[styles.historyDetail, { color: colors.text }]} numberOfLines={3}>
                              {detailText}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                  </ScrollView>
                </View>
              </Animated.View>
            </View>

            {activeDetailTab === 'details' ? (
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
            ) : null}
          </View>
      ) : null}

      <Modal
        visible={captureModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setCaptureModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={[styles.detailContainer, { backgroundColor: colors.background, paddingTop: detailTopInset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.detailHeader, { borderBottomColor: cardBorder }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>
              {t('taskDetail.findingsNewTitle')}
            </Text>
            <TouchableOpacity onPress={() => setCaptureModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={[styles.detailContent, { paddingBottom: spacing.xl + detailBottomInset }]}
            keyboardShouldPersistTaps="handled"
          >
            {quickCaptureAttributes.map((attr) => {
              const value = draftAttributeValues[attr.id];
              return (
                <View key={attr.id} style={styles.fieldBlock}>
                  <FieldLabel
                    icon="tune"
                    label={`${attr.label}${attr.required ? ' *' : ''}`}
                    colors={colors}
                  />
                  <TouchableOpacity
                    style={[styles.fieldRowButton, { borderColor: cardBorder }]}
                    onPress={() => setAttributePicker({ attr, target: 'draft' })}
                  >
                    <Text
                      style={[styles.fieldRowValue, { color: value ? colors.text : colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {value?.label ?? t('taskDetail.findingsSelectValue')}
                    </Text>
                    <MaterialIcons name="expand-more" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <View style={styles.fieldBlock}>
              <FieldLabel
                icon="notes"
                label={`${t('taskDetail.findingsDescription')}${descriptionRequired ? ' *' : ''}`}
                colors={colors}
              />
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { color: colors.text, borderColor: cardBorder, backgroundColor: colors.surface }]}
                placeholder={descriptionRequired
                  ? t('taskDetail.findingsDescriptionRequired')
                  : t('taskDetail.findingsDescriptionOptional')}
                placeholderTextColor={colors.textSecondary}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryAction, styles.captureModalAddButton, { backgroundColor: primaryColor, opacity: genericCanAdd ? 1 : 0.6 }]}
              onPress={() => {
                if (!genericCanAdd) return;
                void handleAddFinding();
                setCaptureModalVisible(false);
              }}
              disabled={!genericCanAdd}
            >
              <MaterialIcons name="add" size={18} color="#FFFFFF" />
              <Text style={[styles.primaryActionText, { color: '#FFFFFF' }]}>{t('taskDetail.findingsAdd')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
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

      {attributePicker ? (() => {
        const { attr, target } = attributePicker;
        const currentValue = target === 'draft'
          ? draftAttributeValues[attr.id]
          : ((selectedFinding?.values ?? {}) as Record<string, HallazgoAttributeValue>)[attr.id];
        const currentId = currentValue
          ? (currentValue.kind === 'select' ? currentValue.key : currentValue.refId)
          : '__none__';
        const options: SelectorItem[] = [
          ...(attr.required ? [] : [{ id: '__none__', name: t('taskDetail.findingsNoValue') }]),
          ...getAttributeOptions(attr, currentValue),
        ];
        return renderSelectorModal(
          true,
          attr.label,
          options,
          currentId,
          (item) => {
            setAttributePicker(null);
            const value: HallazgoAttributeValue | undefined = item.id === '__none__'
              ? undefined
              : attr.type === 'select'
                ? { kind: 'select', key: item.id, label: item.name }
                : { kind: 'reference', refId: item.id, label: item.name };
            if (target === 'draft') {
              setDraftAttributeValues((current) => {
                const next = { ...current };
                if (value) next[attr.id] = value;
                else delete next[attr.id];
                return next;
              });
            } else {
              updateSelectedFindingAttribute(attr.id, value);
            }
          },
          () => setAttributePicker(null),
        );
      })() : null}

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
  listContent: { padding: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  topSection: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  listHeader: { gap: spacing.sm, marginBottom: spacing.sm },
  captureCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  captureAddButton: { alignSelf: 'stretch' },
  captureLaunchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  captureLaunchText: { color: '#FFFFFF', fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  captureModalAddButton: { flex: 0, marginTop: spacing.lg },
  attributeRowButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  attributeRowText: { flex: 1, gap: 2 },
  attributeRowLabel: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold, textTransform: 'uppercase' },
  dragHint: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular, paddingHorizontal: 4 },
  progressCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { fontSize: fontSizes.md, fontFamily: fontFamilies.displaySemibold },
  progressBadge: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  progressSubtitle: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  progressBarWrap: { gap: 6 },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressMetaText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular },
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
  missingTaskCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    alignItems: 'center',
  },
  emptyCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular, textAlign: 'center' },
  findingRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  findingRowPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  findingRowActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 2,
  },
  findingRowPressed: {
    opacity: 0.92,
  },
  findingTextWrap: { flex: 1, gap: 2 },
  findingText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
  findingTextResolved: { textDecorationLine: 'line-through' },
  linkedTaskMeta: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold },
  findingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  findingMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  findingMetaText: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodySemibold },
  detailContainer: { flex: 1 },
  detailPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailSwipeViewport: { flex: 1, overflow: 'hidden' },
  detailSwipeRow: { flex: 1, flexDirection: 'row' },
  detailPane: { flex: 1 },
  detailScroll: { flex: 1 },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  detailBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderSpacer: { width: 36, height: 36 },
  detailTitle: { flex: 1, fontSize: fontSizes.lg, fontFamily: fontFamilies.displaySemibold },
  detailTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
  },
  detailTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  detailTabText: { fontSize: 13, fontFamily: fontFamilies.bodyMedium },
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
  historyCard: { borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 4 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyTitle: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold },
  historyTime: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular },
  historyActor: { fontSize: fontSizes.xs, fontFamily: fontFamilies.bodyRegular },
  historyDetail: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyRegular },
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
