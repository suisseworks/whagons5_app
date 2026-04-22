import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Dimensions,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Share,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import RenderHtml from 'react-native-render-html';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FaIcon } from '../components/FaIcon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTasks, StatusOption } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTenant } from '../hooks/useTenant';
import { AttachmentPickerSheet } from '../components/AttachmentPickerSheet';
import { RootStackParamList, TaskItem } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import TaskNavigationMap from '../components/TaskNavigationMap';
import { FormFiller } from '../components/FormFiller';
import { SignatureModal } from '../components/SignatureModal';

/** Error-safe wrapper so a MapView crash never takes down TaskDetail */
class TaskNavigationMapSafe extends React.Component<
  React.ComponentProps<typeof TaskNavigationMap> & {
    sectionLabelStyle: any;
    sectionLabelText: string;
    primaryColor: string;
    actionText: string;
  },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    const { sectionLabelStyle, sectionLabelText, primaryColor, actionText,
            taskLatitude, taskLongitude, ...mapProps } = this.props;
    if (this.state.hasError) {
      return (
        <>
          <Text style={sectionLabelStyle}>{sectionLabelText}</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
            onPress={() => {
              const url = Platform.select({
                ios: `maps:${taskLatitude},${taskLongitude}?q=${taskLatitude},${taskLongitude}`,
                android: `geo:${taskLatitude},${taskLongitude}?q=${taskLatitude},${taskLongitude}`,
              });
              if (url) Linking.openURL(url).catch(() => {});
            }}
          >
            <MaterialIcons name="directions" size={18} color={primaryColor} />
            <Text style={{ color: primaryColor, fontSize: 13 }}>{actionText}</Text>
          </TouchableOpacity>
        </>
      );
    }
    return (
      <>
        <Text style={sectionLabelStyle}>{sectionLabelText}</Text>
        <TaskNavigationMap
          taskLatitude={taskLatitude}
          taskLongitude={taskLongitude}
          {...mapProps}
        />
      </>
    );
  }
}
import { priorityColor, statusColor, getInitials, parseWorkspaceIcon, contrastTextColor } from '../utils/helpers';
import { useConvexUpload, ConvexAttachment } from '../hooks/useConvexUpload';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { Toast, ToastRef } from '../components/Toast';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { UserPickerSheet, type UserPickerItem } from '../components/UserPickerSheet';

/** Parse markdown checklist items from a description string */
function parseChecklistItems(desc: string): { label: string; checked: boolean }[] | null {
  const lines = desc.split(/\n/);
  const items: { label: string; checked: boolean }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const checkedMatch = line.match(/^-\s*\[x\]\s*(.*)/i);
    const uncheckedMatch = line.match(/^-\s*\[ ?\]\s*(.*)/);
    if (checkedMatch) {
      items.push({ label: checkedMatch[1].trim(), checked: true });
    } else if (uncheckedMatch) {
      items.push({ label: uncheckedMatch[1].trim(), checked: false });
    }
  }
  return items.length > 0 ? items : null;
}

function getAttachmentDisplayName(
  document: { title?: string; fileName?: string; fileExtension?: string },
  index: number,
): string {
  const rawName = document.fileName || document.title || '';
  const extension = document.fileExtension?.toLowerCase() ?? rawName.split('.').pop()?.toLowerCase() ?? '';
  const baseName = rawName.replace(/\.[^/.]+$/, '');
  const looksGenerated = /^[a-f0-9-]{24,}$/i.test(baseName);
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(extension);

  if (rawName && !(looksGenerated && isImage)) {
    return rawName;
  }

  if (isImage) {
    return `Photo ${index + 1}`;
  }

  return rawName || `Attachment ${index + 1}`;
}

const FLAG_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
};

interface NoteAttachmentData {
  storageId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface TaskNoteResponse {
  _id?: string;
  id?: string | number;
  uuid?: string;
  taskId?: string;
  task_id?: number;
  note?: string;
  userId?: string;
  user_id?: number;
  _creationTime?: number;
  created_at?: string;
  updated_at?: string;
  attachments?: NoteAttachmentData[];
}

interface TaskDocumentAssociation {
  _id: string;
  document: {
    _id: string;
    title?: string;
    fileName?: string;
    fileSize?: number;
    fileExtension?: string;
    fileUrl?: string | null;
  };
}

interface TaskSignatureRecord {
  _id: string;
  _creationTime?: number;
  userId?: string;
  signerName?: string;
  comment?: string;
  signaturePath?: string;
  signatureUrl?: string | null;
  signedAt?: number;
}

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

const NoteAttachmentView: React.FC<{
  attachment: NoteAttachmentData;
  colors: any;
  isDarkMode: boolean;
  onImagePress?: (uri: string) => void;
}> = ({ attachment, colors, isDarkMode, onImagePress }) => {
  const { tenantId } = useTenant();
  const rawUrl = useQuery(
    api.files.getFileUrl,
    tenantId
      ? { tenantId, storageId: attachment.storageId as any }
      : 'skip'
  );
  const url = rawUrl ? fixConvexStorageUrl(rawUrl) : null;
  const isImage = attachment.fileType.startsWith('image/');
  const isVideo = attachment.fileType.startsWith('video/');

  const handleFilePress = useCallback(() => {
    if (!url) return;
    if (isImage && onImagePress) {
      onImagePress(url);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, [url, isImage, onImagePress]);

  // Loading state for images and videos
  if ((isImage || isVideo) && !url) {
    return (
      <View style={[noteAttachStyles.filePlaceholder, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' }]}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    );
  }

  if (isVideo && url) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleFilePress}
        style={[
          noteAttachStyles.videoFallback,
          { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' },
        ]}
      >
        <MaterialIcons name="play-circle-outline" size={28} color={colors.textSecondary} />
        <Text style={[noteAttachStyles.videoFileName, { color: colors.text }]} numberOfLines={1}>
          {attachment.fileName}
        </Text>
        <Text style={[noteAttachStyles.videoHint, { color: colors.textSecondary }]}>
          Open video
        </Text>
      </TouchableOpacity>
    );
  }

  if (isImage && url) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={handleFilePress}>
        <ProgressiveImage
          uri={url}
          width={720}
          height={360}
          mode="fill"
          style={noteAttachStyles.image}
          contentFit="cover"
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleFilePress}
      disabled={!url}
      style={[noteAttachStyles.fileChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' }]}
    >
      <MaterialIcons name="attach-file" size={14} color={colors.textSecondary} />
      <Text style={[noteAttachStyles.fileName, { color: colors.text }]} numberOfLines={1}>
        {attachment.fileName}
      </Text>
      <MaterialIcons
        name="download"
        size={16}
        color={colors.textSecondary}
        style={{ marginLeft: 'auto' }}
      />
    </TouchableOpacity>
  );
};

const noteAttachStyles = StyleSheet.create({
  image: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginTop: 6,
  },
  videoFallback: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  videoFileName: {
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
  },
  videoHint: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
  },
  filePlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  fileName: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    flex: 1,
  },
});

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function timeAgo(dateStr: string, t?: (key: string, opts?: Record<string, any>) => string): string {
  const date = new Date(
    dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z',
  );
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return t ? t('taskDetail.timeJustNow') : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t ? t('taskDetail.timeMinutesAgo', { count: diffMin }) : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t ? t('taskDetail.timeHoursAgo', { count: diffHr }) : `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return t ? t('taskDetail.timeDaysAgo', { count: diffDay }) : `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatViewedAt(dateStr: string): string {
  const date = new Date(
    dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z',
  );
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function buildTaskShareUrl(token: string, tenantSubdomain?: string | null): string | null {
  const shareBaseUrl = process.env.EXPO_PUBLIC_TASK_SHARE_BASE_URL?.trim() || null;
  const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim() || null;

  const tenant = tenantSubdomain
    ?.trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '') || null;

  const candidates = [shareBaseUrl, convexSiteUrl].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    try {
      let resolvedBase = candidate;
      if (resolvedBase.includes('{tenant}')) {
        if (!tenant) continue;
        resolvedBase = resolvedBase.replaceAll('{tenant}', tenant);
      }

      const normalized = resolvedBase.endsWith('/') ? resolvedBase.slice(0, -1) : resolvedBase;
      const url = new URL('/share/task', normalized);

      const host = url.hostname.toLowerCase();
      const isConvexHosted = host.endsWith('.convex.site') || host.endsWith('.convex.cloud');
      const shouldInjectTenantSubdomain =
        candidate !== shareBaseUrl &&
        !candidate.includes('{tenant}') &&
        !isConvexHosted;
      if (tenant && shouldInjectTenantSubdomain && host !== tenant && !host.startsWith(`${tenant}.`)) {
        url.hostname = `${tenant}.${url.hostname}`;
      }

      url.searchParams.set('token', token);
      return url.toString();
    } catch {
      continue;
    }
  }

  return null;
}

type TaskDetailRouteProp = RouteProp<RootStackParamList, 'TaskDetail'>;

export const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<TaskDetailRouteProp>();
  const task = useMemo<TaskItem>(() => {
    const rawTask = route.params.task;
    return {
      ...rawTask,
      title: rawTask.title ?? 'Untitled',
      spot: rawTask.spot ?? '',
      priority: rawTask.priority ?? 'Medium',
      status: rawTask.status ?? '',
      createdAt: rawTask.createdAt ?? '',
      assignees: Array.isArray(rawTask.assignees) ? rawTask.assignees : [],
      tags: Array.isArray(rawTask.tags) ? rawTask.tags : [],
    };
  }, [route.params.task]);
  const { colors, primaryColor, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const toastRef = useRef<ToastRef>(null);
  const {
    getAllowedStatuses,
    changeTaskStatus,
    changeTaskPriority,
    getFormSchema,
    getTaskFormSubmission,
    getFormVersionId,
    tagInfoMap,
    unfilteredTasks,
  } = useTasks();
  const { user: authUser, subdomain: authSubdomain } = useAuth();
  const { tenantId } = useTenant();
  const { data } = useData();
  const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const secondarySurface = isDarkMode ? '#242424' : '#F5F5F7';
  const tertiaryText = isDarkMode ? 'rgba(255,255,255,0.45)' : '#73726C';

  const userMap = useMemo(() => {
    const map = new Map<number | string, string>();
    for (const u of data.users) {
      const numId = Number(u.id);
      if (!isNaN(numId)) map.set(numId, u.name);
      map.set(String(u.id), u.name);
      const convexId = (u as any)._id;
      if (convexId) map.set(convexId, u.name);
    }
    return map;
  }, [data.users]);

  const userPictureMap = useMemo(() => {
    const map = new Map<number | string, string>();
    for (const u of data.users) {
      if (!u.url_picture) continue;
      const numId = Number(u.id);
      if (!isNaN(numId)) map.set(numId, u.url_picture);
      map.set(String(u.id), u.url_picture);
      const convexId = (u as any)._id;
      if (convexId) map.set(convexId, u.url_picture);
    }
    return map;
  }, [data.users]);

  const taskCreator = useMemo(() => {
    if (task.createdBy == null) return null;

    const creatorId = String(task.createdBy);
    const matchedUser = data.users.find((user: any) => (
      String(user.id) === creatorId ||
      String(user.pgId ?? '') === creatorId ||
      String(user._id ?? '') === creatorId
    ));

    const isSelf = (
      (authUser?.id != null && String(authUser.id) === creatorId) ||
      ((authUser as any)?._id != null && String((authUser as any)._id) === creatorId)
    );
    const name = matchedUser?.name
      ? String(matchedUser.name)
      : isSelf
        ? t('common.you')
        : t('common.unknown');

    return {
      name,
      picture: matchedUser?.url_picture ?? null,
      isSelf,
    };
  }, [task.createdBy, data.users, authUser, t]);

  // Resolve workspace for this task
  const taskWorkspace = useMemo(() => {
    if (!task.workspaceId) return null;
    return data.workspaces.find(
      (w: any) => String(w.id) === String(task.workspaceId),
    ) ?? null;
  }, [task.workspaceId, data.workspaces]);

  const taskSpot = useMemo(() => {
    if (!task.spotId) return null;
    return data.spots.find(
      (spot: any) =>
        String(spot.id) === String(task.spotId) ||
        String((spot as any)._id ?? '') === String(task.spotId),
    ) ?? null;
  }, [task.spotId, data.spots]);

  const spotLatitude = typeof taskSpot?.latitude === 'number' ? taskSpot.latitude : null;
  const spotLongitude = typeof taskSpot?.longitude === 'number' ? taskSpot.longitude : null;
  const hasSpotCoordinates = spotLatitude != null && spotLongitude != null;
  const hasCreationCoordinates = task.latitude != null && task.longitude != null;
  const showWorkLocationCard = hasSpotCoordinates;
  const showCreatedFromCard = hasCreationCoordinates;

  const formSchema = useMemo(() => getFormSchema(task), [task, getFormSchema]);
  const existingSubmission = useMemo(() => getTaskFormSubmission(task.id || ''), [task.id, getTaskFormSubmission]);
  const hasForm = !!formSchema && formSchema.fields.length > 0;

  type TabKey = 'details' | 'form' | 'comments';
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(task.status);
  const [currentStatusColor, setCurrentStatusColor] = useState(task.statusColor);
  const [currentStatusId, setCurrentStatusId] = useState(task.statusId);
  const [currentStatusIcon, setCurrentStatusIcon] = useState(task.statusIcon ?? null);
  const [currentStatusAction, setCurrentStatusAction] = useState(task.statusAction ?? null);

  // Priority picker state
  const [priorityPickerVisible, setPriorityPickerVisible] = useState(false);
  const [currentPriority, setCurrentPriority] = useState(task.priority);
  const [currentPriorityColor, setCurrentPriorityColor] = useState(task.priorityColor ?? null);
  const [currentPriorityId, setCurrentPriorityId] = useState(task.priorityId ?? null);
  const [taskActionsVisible, setTaskActionsVisible] = useState(false);
  const [signatureVisible, setSignatureVisible] = useState(false);
  const [pendingStatusAfterSignature, setPendingStatusAfterSignature] = useState<StatusOption | null>(null);

  // Assignee picker state
  const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);
  const [selectedViewerKey, setSelectedViewerKey] = useState<string | null>(null);
  const [draftAssigneeIds, setDraftAssigneeIds] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);

  const sortedPriorities = useMemo(() => {
    const normalizeName = (value: unknown): string => String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const severityRank = (name: string): number => {
      if (name.includes('vida o muerte') || name.includes('critical') || name.includes('critica') || name.includes('urgente') || name.includes('urgent')) return 0;
      if (name.includes('alta') || name.includes('high')) return 1;
      if (name.includes('media') || name.includes('medium') || name.includes('normal')) return 2;
      if (name.includes('baja') || name.includes('low')) return 3;
      return 99;
    };

    return [...data.priorities].sort((a: any, b: any) => {
      const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.isFinite(Number(a?.position)) ? Number(a.position) : null;
      const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.isFinite(Number(b?.position)) ? Number(b.position) : null;

      if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;

      const aName = normalizeName(a?.name);
      const bName = normalizeName(b?.name);
      const rankDiff = severityRank(aName) - severityRank(bName);
      if (rankDiff !== 0) return rankDiff;
      return aName.localeCompare(bName, 'es');
    });
  }, [data.priorities]);

  const assigneePickerUsers = useMemo<UserPickerItem[]>(() => {
    return data.users.reduce<UserPickerItem[]>((acc, rawUser: any) => {
      const resolvedId = rawUser?.id;
      const resolvedName = typeof rawUser?.name === 'string' ? rawUser.name.trim() : '';
      if (resolvedId == null || !resolvedName) {
        return acc;
      }

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
    }, []);
  }, [data.users]);

  const displayAssignees = useMemo(() => {
    const liveTask = unfilteredTasks.find((candidate) => String(candidate.id) === String(task.id))
      ?? data.tasks.find((candidate) => String(candidate.id) === String(task.id))
      ?? task;

    return Array.isArray(liveTask.assignees) ? liveTask.assignees : [];
  }, [unfilteredTasks, data.tasks, task]);

  const currentTask = useMemo(
    () => ({ ...task, status: currentStatus, statusColor: currentStatusColor, statusId: currentStatusId }),
    [task, currentStatus, currentStatusColor, currentStatusId],
  );
  const [commentText, setCommentText] = useState('');

  const [formValues, setFormValues] = useState<Record<string, unknown>>(
    existingSubmission?.data ?? {},
  );
  const [formSaveStatus, setFormSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [formTaskFormId, setFormTaskFormId] = useState<any>(existingSubmission?.id ?? null);
  const formSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formLatestValuesRef = useRef<Record<string, unknown>>(existingSubmission?.data ?? {});
  const formIsSavingRef = useRef(false);
  const formHasMountedRef = useRef(false);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);

  const convexTaskId = task.convexId ?? task.taskConvexId ?? null;
  const requiresTaskSignature = task.requiresSignature === true;
  const assignUserMutation = useMutation(api.taskResources.assignUser);
  const unassignUserMutation = useMutation(api.taskResources.unassignUser);
  const createSignatureMutation = useMutation(api.taskResources.createSignature);
  const taskDocumentAssociableId = task.id ? String(task.id) : (task.convexId ?? task.taskConvexId ?? '');
  // Only query if convexTaskId looks like a valid Convex ID (not a number)
  const hasValidConvexId = convexTaskId && typeof convexTaskId === 'string' && isNaN(Number(convexTaskId));
  const taskDocumentAssociations = useQuery(
    api.documents.listAssociationsByEntity,
    tenantId && taskDocumentAssociableId
      ? { tenantId, associableType: 'task', associableId: taskDocumentAssociableId }
      : 'skip'
  ) as TaskDocumentAssociation[] | undefined;
  const rawNotes = useQuery(
    api.taskResources.listTaskNotes,
    tenantId && hasValidConvexId ? { tenantId, taskId: convexTaskId as any } : 'skip',
  );
  const taskSignatures = useQuery(
    api.taskResources.listTaskSignatures,
    tenantId && hasValidConvexId
      ? { tenantId, taskId: convexTaskId as any }
      : 'skip'
  ) as TaskSignatureRecord[] | undefined;
  const hasTaskSignature = (taskSignatures?.length ?? 0) > 0;
  const createNoteMutation = useMutation(api.taskResources.createNote);
  const updateNoteMutation = useMutation(api.taskResources.updateNote);
  const removeNoteMutation = useMutation(api.taskResources.removeNote);
  const createPublicShareMutation = useMutation(api.taskPublicShares.createOrGet);

  const notes: TaskNoteResponse[] = useMemo(() => {
    if (!rawNotes) return [];
    return rawNotes.map((n: any) => ({
      ...n,
      id: n._id,
      task_id: n.taskId,
      user_id: n.userId,
      created_at: n._creationTime ? new Date(n._creationTime).toISOString() : '',
      updated_at: n._creationTime ? new Date(n._creationTime).toISOString() : '',
    }));
  }, [rawNotes]);

  const notesLoading = tenantId && hasValidConvexId ? rawNotes === undefined : false;
  const notesError: string | null = null;
  const handleShareTask = useCallback(async () => {
    if (!tenantId || !hasValidConvexId) {
      Alert.alert(t('common.error'), t('taskDetail.shareUnavailable'));
      return;
    }

    try {
      const result = await createPublicShareMutation({
        tenantId,
        taskId: convexTaskId as any,
      });
      const tenantForShareUrl = authSubdomain || tenantId || null;
      const shareUrl = buildTaskShareUrl(result.token, tenantForShareUrl);

      if (!shareUrl) {
        Alert.alert(t('common.error'), t('taskDetail.shareMissingBaseUrl'));
        return;
      }

      await Share.share(
        Platform.OS === 'ios'
          ? { url: shareUrl }
          : { message: shareUrl }
      );
    } catch (error) {
      console.error('[TaskDetail] Failed to share task', error);
      Alert.alert(t('common.error'), t('taskDetail.shareFailed'));
    }
  }, [authSubdomain, convexTaskId, createPublicShareMutation, hasValidConvexId, t, tenantId]);

  const handleOpenTaskActions = useCallback(() => {
    setTaskActionsVisible(true);
  }, []);
  const taskDocuments = useMemo(
    () => (taskDocumentAssociations ?? []).map((association) => association.document).filter(Boolean),
    [taskDocumentAssociations]
  );
  const latestTaskSignature = useMemo(() => {
    if (!taskSignatures || taskSignatures.length === 0) return null;
    const sorted = [...taskSignatures].sort((a, b) => {
      const aTime = a.signedAt ?? a._creationTime ?? 0;
      const bTime = b.signedAt ?? b._creationTime ?? 0;
      return bTime - aTime;
    });
    return sorted[0] ?? null;
  }, [taskSignatures]);

  const latestSignatureImageUrl = useMemo(() => {
    const rawUrl = latestTaskSignature?.signatureUrl;
    if (!rawUrl) return null;
    return fixConvexStorageUrl(rawUrl);
  }, [latestTaskSignature?.signatureUrl]);

  const latestSignatureSigner = useMemo(() => {
    if (!latestTaskSignature) return null;
    if (latestTaskSignature.signerName?.trim()) return latestTaskSignature.signerName.trim();
    const uid = latestTaskSignature.userId;
    if (!uid) return null;
    return userMap.get(uid) ?? userMap.get(String(uid)) ?? null;
  }, [latestTaskSignature, userMap]);

  const latestSignatureSignedAt = useMemo(() => {
    const timestamp = latestTaskSignature?.signedAt ?? latestTaskSignature?._creationTime;
    if (!timestamp) return null;
    const dt = new Date(timestamp);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }, [latestTaskSignature]);
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [commentActionId, setCommentActionId] = useState<string | null>(null);
  const [commentActionNote, setCommentActionNote] = useState<TaskNoteResponse | null>(null);
  const commentsScrollRef = useRef<ScrollView>(null);
  const commentEditInputRef = useRef<TextInput>(null);

  const { pickAndUpload, takePhotoAndUpload, uploading: uploadingAttachment, attachmentPickerProps } = useConvexUpload();
  const [pendingAttachments, setPendingAttachments] = useState<ConvexAttachment[]>([]);

  // ─── Task views ("Seen by") — Convex taskViews table ───────────────────────
  const recordTaskView = useMutation(api.taskResources.recordTaskViewByTaskPgId);
  const taskPgId = Number(task.id);
  const viewsQueryArgs =
    tenantId && Number.isFinite(taskPgId) && taskPgId > 0
      ? { tenantId, taskPgId }
      : ('skip' as const);
  const taskViewsRaw = useQuery(
    api.taskResources.listTaskViewsByTaskPgId,
    viewsQueryArgs,
  );
  const taskViewsLoading = viewsQueryArgs !== 'skip' && taskViewsRaw === undefined;
  const taskViews = viewsQueryArgs === 'skip' ? [] : (taskViewsRaw ?? []);

  const taskIdentityKeys = useMemo(() => {
    const keys = new Set<string>();
    if (task.id != null) keys.add(String(task.id));
    if ((task as any).convexId != null) keys.add(String((task as any).convexId));
    if ((task as any).taskConvexId != null) keys.add(String((task as any).taskConvexId));
    return keys;
  }, [task]);

  const taskAssignmentRows = useMemo(() => {
    if (taskIdentityKeys.size === 0) return [];
    return data.taskUsers.filter((assignment: any) => {
      const assignmentTaskId = assignment.task_id ?? assignment.taskId;
      if (assignmentTaskId == null) return false;
      return taskIdentityKeys.has(String(assignmentTaskId));
    });
  }, [data.taskUsers, taskIdentityKeys]);

  const assignedUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const assignment of taskAssignmentRows) {
      const rawUserId = assignment.user_id ?? assignment.userId;
      if (rawUserId == null) continue;

      ids.add(String(rawUserId));

      const matchedUser = data.users.find((user: any) => (
        String(user.id) === String(rawUserId) ||
        String(user.pgId ?? '') === String(rawUserId) ||
        String(user._id ?? '') === String(rawUserId)
      ));

      if (matchedUser?.id != null) ids.add(String(matchedUser.id));
      if (matchedUser?.pgId != null) ids.add(String(matchedUser.pgId));
      if (matchedUser?._id != null) ids.add(String(matchedUser._id));
    }
    return ids;
  }, [taskAssignmentRows, data.users]);

  const assignmentRowsByUserId = useMemo(() => {
    const rows = new Map<string, any>();
    for (const assignment of taskAssignmentRows) {
      const rawUserId = assignment.user_id ?? assignment.userId;
      if (rawUserId != null) rows.set(String(rawUserId), assignment);
    }
    return rows;
  }, [taskAssignmentRows]);

  const hasAssigneeChanges = useMemo(() => {
    if (draftAssigneeIds.length !== assignedUserIds.size) return true;
    return draftAssigneeIds.some((id) => !assignedUserIds.has(id));
  }, [draftAssigneeIds, assignedUserIds]);

  const currentUserId = authUser?.id != null ? Number(authUser.id) : null;

  const currentUserConvexId = useMemo(() => {
    const authId = authUser?.id;
    const authConvexId = (authUser as any)?._id;
    const matchedUser = data.users.find((user: any) => {
      if (authId != null && (String(user.id) === String(authId) || String(user.pgId) === String(authId))) {
        return true;
      }
      if (authConvexId != null && String(user._id) === String(authConvexId)) {
        return true;
      }
      return false;
    });

    return matchedUser?._id ? String(matchedUser._id) : (authConvexId ? String(authConvexId) : null);
  }, [authUser, data.users]);

  const liveTaskForPermissions = useMemo(() => {
    const fromUnfiltered = unfilteredTasks.find((candidate) => (
      (task.id != null && String(candidate.id) === String(task.id)) ||
      ((task as any).convexId != null && String((candidate as any).convexId ?? '') === String((task as any).convexId)) ||
      ((task as any).taskConvexId != null && String((candidate as any).taskConvexId ?? '') === String((task as any).taskConvexId))
    ));
    if (fromUnfiltered) return fromUnfiltered;
    return data.tasks.find((candidate) => (
      (task.id != null && String(candidate.id) === String(task.id)) ||
      ((task as any).convexId != null && String((candidate as any).convexId ?? '') === String((task as any).convexId)) ||
      ((task as any).taskConvexId != null && String((candidate as any).taskConvexId ?? '') === String((task as any).taskConvexId))
    )) ?? null;
  }, [unfilteredTasks, data.tasks, task]);

  const canFillForm = useMemo(() => {
    const action = String((liveTaskForPermissions as any)?.statusAction ?? currentStatusAction ?? task.statusAction ?? '').toUpperCase();
    const isInProgress = action === 'WORKING' || action === 'PAUSED';

    const currentUserKeys = new Set<string>();
    if (currentUserId != null) currentUserKeys.add(String(currentUserId));
    if (currentUserConvexId) currentUserKeys.add(String(currentUserConvexId));

    const isAssignedToMe = Array.from(currentUserKeys).some((key) => assignedUserIds.has(key));
    return isInProgress && isAssignedToMe;
  }, [liveTaskForPermissions, currentStatusAction, task.statusAction, currentUserId, currentUserConvexId, assignedUserIds]);

  type TaskViewer = {
    key: string;
    id: number;
    name: string;
    picture: string | null;
    viewedAt: string;
    isSelf: boolean;
  };

  const viewersForDisplay = useMemo<TaskViewer[]>(() => {
    if (!taskViews.length) return [];
    return taskViews
      .map((v: any) => {
        const id = v.user_id ? Number(v.user_id) : 0;
        const localName = userMap.get(id) || userMap.get(String(id)) || userMap.get(v.convex_user_id);
        const name = localName ? String(localName) : (v.name || `User #${id}`);
        const localPic = data.users.find((u) => Number(u.id) === id)?.url_picture ?? null;
        const picture = localPic || v.url_picture || null;
        const isSelf = currentUserId !== null && (
          id === currentUserId ||
          (v.convex_user_id && v.convex_user_id === (authUser as any)?._id)
        );
        return {
          key: `${id}-${v.viewed_at}`,
          id,
          name,
          picture,
          viewedAt: v.viewed_at,
          isSelf,
        } satisfies TaskViewer;
      })
      .sort((a: TaskViewer, b: TaskViewer) => {
        if (a.isSelf && !b.isSelf) return -1;
        if (!a.isSelf && b.isSelf) return 1;
        return new Date(a.viewedAt).getTime() - new Date(b.viewedAt).getTime();
      });
  }, [taskViews, userMap, currentUserId, data.users, authUser]);

  const selectedViewer = useMemo<TaskViewer | null>(
    () => viewersForDisplay.find((viewer: TaskViewer) => viewer.key === selectedViewerKey) ?? viewersForDisplay[0] ?? null,
    [viewersForDisplay, selectedViewerKey],
  );

  useEffect(() => {
    if (!viewersForDisplay.length) {
      if (selectedViewerKey !== null) setSelectedViewerKey(null);
      return;
    }

    if (!selectedViewerKey || !viewersForDisplay.some((viewer: TaskViewer) => viewer.key === selectedViewerKey)) {
      setSelectedViewerKey(viewersForDisplay[0].key);
    }
  }, [viewersForDisplay, selectedViewerKey]);

  const canManageNote = useCallback((note: TaskNoteResponse) => {
    const noteUserId = note.userId ?? note.user_id;
    if (noteUserId == null) return false;

    return [authUser?.id, (authUser as any)?._id, currentUserConvexId].some(
      (candidate) => candidate != null && String(candidate) === String(noteUserId),
    );
  }, [authUser, currentUserConvexId]);

  useEffect(() => {
    if (!editingCommentId) return;
    const timer = setTimeout(() => commentEditInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [editingCommentId]);

  useEffect(() => {
    if (!assigneePickerVisible) return;
    setDraftAssigneeIds(Array.from(assignedUserIds));
  }, [assigneePickerVisible, assignedUserIds]);

  const seenTaskIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!tenantId || !Number.isFinite(taskPgId) || taskPgId <= 0) return;
    if (seenTaskIdRef.current === taskPgId) return;
    seenTaskIdRef.current = taskPgId;
    recordTaskView({ tenantId, taskPgId }).catch((err) => {
      console.warn('[TaskDetail] Failed to record task view:', err);
    });
  }, [tenantId, taskPgId, recordTaskView]);

  const isCompletionStatus = useCallback((status: StatusOption) => {
    if (status.final === true) return true;
    const action = String(status.action ?? '').toUpperCase();
    return action === 'FINISHED' || action === 'DONE';
  }, []);

  const applyStatusChange = useCallback((status: StatusOption) => {
    changeTaskStatus(task.id || '', status);
    setCurrentStatus(status.name);
    setCurrentStatusColor(status.color);
    setCurrentStatusId(status.id);
    setCurrentStatusIcon(status.icon ?? null);
    setCurrentStatusAction(status.action ?? null);
    setStatusPickerVisible(false);
  }, [changeTaskStatus, task.id]);

  const handleStatusChange = useCallback((status: StatusOption) => {
    if (requiresTaskSignature && isCompletionStatus(status) && !hasTaskSignature) {
      if (!hasValidConvexId) {
        toastRef.current?.show({ type: 'error', title: t('common.error'), body: t('taskDetail.errorCannotSignTask') });
        return;
      }
      setPendingStatusAfterSignature(status);
      setStatusPickerVisible(false);
      setSignatureVisible(true);
      return;
    }
    applyStatusChange(status);
  }, [requiresTaskSignature, isCompletionStatus, hasTaskSignature, hasValidConvexId, t, applyStatusChange]);

  const handleTaskSigned = useCallback(async ({ storageId, signerName, comment }: { storageId: string; signerName: string; comment?: string }) => {
    if (!tenantId || !hasValidConvexId) {
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: t('taskDetail.errorCannotSignTask') });
      return;
    }

    try {
      await createSignatureMutation({
        tenantId,
        taskId: convexTaskId as any,
        signaturePath: storageId,
        signerName,
        comment,
      });

      setSignatureVisible(false);
      const pendingStatus = pendingStatusAfterSignature;
      setPendingStatusAfterSignature(null);

      if (pendingStatus) {
        applyStatusChange(pendingStatus);
      } else {
        toastRef.current?.show({ type: 'success', title: t('common.success'), body: t('taskDetail.signatureSaved') });
      }
    } catch (error: any) {
      toastRef.current?.show({
        type: 'error',
        title: t('common.error'),
        body: error?.message || t('taskDetail.errorCannotSignTask'),
      });
    }
  }, [tenantId, hasValidConvexId, t, createSignatureMutation, convexTaskId, pendingStatusAfterSignature, applyStatusChange]);

  const handlePriorityChange = (priority: { id: any; name: string; color?: string | null }) => {
    changeTaskPriority(task.id || '', priority.id);
    setCurrentPriority(priority.name);
    setCurrentPriorityColor(priority.color ?? null);
    setCurrentPriorityId(priority.id);
    setPriorityPickerVisible(false);
  };

  const closeAssigneePicker = useCallback(() => {
    if (savingAssignees) return;
    setAssigneePickerVisible(false);
  }, [savingAssignees]);

  const handleAssigneeToggle = useCallback((userId: number | string) => {
    const nextId = String(userId);
    setDraftAssigneeIds((prev) => (
      prev.includes(nextId)
        ? prev.filter((id) => id !== nextId)
        : [...prev, nextId]
    ));
  }, []);

  const handleSaveAssignees = useCallback(async () => {
    if (!tenantId || !convexTaskId) {
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: t('taskDetail.errorCannotUpdateAssignees') });
      return;
    }

    const nextIds = new Set(draftAssigneeIds);
    const idsToAdd = draftAssigneeIds.filter((id) => !assignedUserIds.has(id));
    const idsToRemove = Array.from(assignedUserIds).filter((id) => !nextIds.has(id));

    if (idsToAdd.length === 0 && idsToRemove.length === 0) {
      closeAssigneePicker();
      return;
    }

    setSavingAssignees(true);
    try {
      for (const userId of idsToAdd) {
        const user = data.users.find((candidate: any) => String(candidate.id) === userId);
        const userConvexId = (user as any)?._id;
        if (!userConvexId) continue;
        await assignUserMutation({
          tenantId,
          taskId: convexTaskId as any,
          userId: userConvexId as any,
        });
      }

      for (const userId of idsToRemove) {
        const assignment = assignmentRowsByUserId.get(userId);
        const assignmentId = assignment?._id ?? assignment?.id;
        if (!assignmentId) continue;
        await unassignUserMutation({
          tenantId,
          id: assignmentId as any,
        });
      }

      closeAssigneePicker();
    } catch (err: any) {
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: err?.message || t('taskDetail.errorCannotUpdateAssignees') });
    } finally {
      setSavingAssignees(false);
    }
  }, [tenantId, convexTaskId, draftAssigneeIds, assignedUserIds, data.users, assignUserMutation, assignmentRowsByUserId, unassignUserMutation, closeAssigneePicker, t]);

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!task.id || !tenantId) {
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: t('taskDetail.errorCannotAddComment') });
      return;
    }

    setSendingComment(true);
    setCommentText('');

    try {
      await createNoteMutation({
        tenantId,
        taskId: convexTaskId as any,
        note: text || undefined,
        attachments: pendingAttachments.length > 0
          ? pendingAttachments.map(a => ({
              storageId: a.storageId as any,
              fileName: a.fileName,
              fileSize: a.fileSize,
              fileType: a.fileType,
            }))
          : undefined,
      });
      setPendingAttachments([]);
      setTimeout(() => commentsScrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (err: any) {
      toastRef.current?.show({ type: 'error', title: t('common.error'), body: err?.message || t('taskDetail.errorFailedToPostComment') });
    } finally {
      setSendingComment(false);
    }
  };

  const handleAttach = async () => {
    const attachments = await pickAndUpload();
    if (attachments.length > 0) {
      setPendingAttachments(prev => [...prev, ...attachments]);
    }
  };

  const handleStartEditComment = useCallback((note: TaskNoteResponse) => {
    const noteId = String(note._id || note.id || '');
    setCommentActionNote(null);
    setEditingCommentId(noteId || null);
    setEditingCommentText(note.note || '');
  }, []);

  const handleCancelEditComment = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentText('');
  }, []);

  const handleSaveEditComment = useCallback(async () => {
    if (!tenantId || !editingCommentId) return;

    setCommentActionId(editingCommentId);
    try {
      await updateNoteMutation({
        tenantId,
        id: editingCommentId as any,
        note: editingCommentText.trim(),
      });
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (err: any) {
      toastRef.current?.show({
        type: 'error',
        title: t('common.error'),
        body: err?.message || 'Failed to update comment',
      });
    } finally {
      setCommentActionId(null);
    }
  }, [editingCommentId, editingCommentText, tenantId, updateNoteMutation, t]);

  const handleDeleteComment = useCallback(async (noteId: string) => {
    if (!tenantId) return;

    setCommentActionNote(null);
    setCommentActionId(noteId);
    try {
      await removeNoteMutation({ tenantId, id: noteId as any });
      if (editingCommentId === noteId) {
        setEditingCommentId(null);
        setEditingCommentText('');
      }
    } catch (err: any) {
      toastRef.current?.show({
        type: 'error',
        title: t('common.error'),
        body: err?.message || 'Failed to delete comment',
      });
    } finally {
      setCommentActionId(null);
    }
  }, [editingCommentId, removeNoteMutation, tenantId, t]);

  const handleCommentActions = useCallback((note: TaskNoteResponse) => {
    setCommentActionNote(note);
  }, []);

  // Tab swipe – smooth spring animation (matches ColabScreen)
  const tabs: TabKey[] = hasForm ? ['details', 'form', 'comments'] : ['details', 'comments'];
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const tabTranslateX = useSharedValue(0);
  const dragStartX = useRef(0);

  useEffect(() => {
    const idx = tabs.indexOf(activeTab);
    tabTranslateX.value = withSpring(-idx * screenWidth, {
      damping: 100,
      stiffness: 800,
    });
  }, [activeTab, screenWidth, tabs.length]);

  const tabSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabTranslateX.value }],
  }));

  const tabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) =>
          Math.abs(gs.dx) > 15 && Math.abs(gs.dy) < 20,
        onPanResponderGrant: () => {
          const idx = tabs.indexOf(activeTab);
          dragStartX.current = -idx * screenWidth;
        },
        onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          const maxX = 0;
          const minX = -(tabs.length - 1) * screenWidth;
          const newX = Math.min(maxX, Math.max(minX, dragStartX.current + gs.dx));
          tabTranslateX.value = newX;
        },
        onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          const currentX = dragStartX.current + gs.dx;
          const velocityThreshold = 0.5;
          const idx = tabs.indexOf(activeTab);
          let newIdx = idx;

          if (gs.vx < -velocityThreshold && idx < tabs.length - 1) {
            newIdx = idx + 1;
          } else if (gs.vx > velocityThreshold && idx > 0) {
            newIdx = idx - 1;
          } else {
            // Snap to nearest tab
            newIdx = Math.round(-currentX / screenWidth);
            newIdx = Math.max(0, Math.min(tabs.length - 1, newIdx));
          }

          const target = -newIdx * screenWidth;
          tabTranslateX.value = withSpring(target, { damping: 100, stiffness: 800 });

          if (tabs[newIdx] !== activeTab) {
            setActiveTab(tabs[newIdx]);
          }
        },
      }),
    [activeTab, tabs, screenWidth],
  );

  const createTaskFormMutation = useMutation(api.forms.submitTaskForm);
  const updateTaskFormMutation = useMutation(api.forms.updateTaskForm);
  const updateTaskMutation = useMutation(api.tasks.update);

  // --- Checklist state (local copy of description for instant UI) ---
  const [localDescription, setLocalDescription] = useState(task.description ?? '');

  const handleChecklistToggle = useCallback(async (index: number) => {
    const lines = localDescription.split('\n');
    let checkIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^-\s*\[[ x?]\]/i.test(line)) {
        if (checkIdx === index) {
          // Toggle
          if (/^-\s*\[x\]/i.test(line)) {
            lines[i] = lines[i].replace(/\[x\]/i, '[ ]');
          } else {
            lines[i] = lines[i].replace(/\[ ?\]/, '[x]');
          }
          break;
        }
        checkIdx++;
      }
    }
    const newDesc = lines.join('\n');
    setLocalDescription(newDesc);

    // Persist to backend
    if (convexTaskId && tenantId) {
      try {
        await updateTaskMutation({ tenantId, id: convexTaskId as any, description: newDesc });
      } catch (e) {
        console.error('Failed to update checklist:', e);
        setLocalDescription(localDescription); // revert on error
      }
    }
  }, [localDescription, convexTaskId, tenantId, updateTaskMutation]);

  // Auto-save form data
  const doFormSave = useCallback(async (data: Record<string, unknown>) => {
    if (!tenantId || !convexTaskId || formIsSavingRef.current || !canFillForm) return;
    formIsSavingRef.current = true;
    setFormSaveStatus('saving');

    const formVersionId = existingSubmission?.formVersionId ?? (task.formId ? getFormVersionId(task.formId) : null);
    if (!formVersionId) {
      setFormSaveStatus('error');
      formIsSavingRef.current = false;
      return;
    }

    try {
      if (formTaskFormId) {
        await updateTaskFormMutation({ tenantId, id: formTaskFormId as any, data });
      } else {
        const newId = await createTaskFormMutation({
          tenantId,
          taskId: convexTaskId as any,
          formVersionId: formVersionId as any,
          data,
        });
        setFormTaskFormId(newId);
      }
      setFormSaveStatus('saved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FORM] Auto-save failed:', message);
      setFormSaveStatus('error');
    } finally {
      formIsSavingRef.current = false;
    }
  }, [tenantId, convexTaskId, formTaskFormId, existingSubmission, task.formId, getFormVersionId, createTaskFormMutation, updateTaskFormMutation, canFillForm]);

  const handleFormChange = useCallback((newValues: Record<string, unknown>) => {
    setFormValues(newValues);
    formLatestValuesRef.current = newValues;
    if (!formHasMountedRef.current || !canFillForm) return;

    if (formSaveTimerRef.current) clearTimeout(formSaveTimerRef.current);
    setFormSaveStatus('saving');
    formSaveTimerRef.current = setTimeout(() => {
      formSaveTimerRef.current = null;
      doFormSave(formLatestValuesRef.current);
    }, 800);
  }, [doFormSave, canFillForm]);

  useEffect(() => {
    if (canFillForm) return;
    if (formSaveTimerRef.current) {
      clearTimeout(formSaveTimerRef.current);
      formSaveTimerRef.current = null;
    }
    formIsSavingRef.current = false;
    setFormSaveStatus('idle');
  }, [canFillForm]);

  // Mark form as mounted after first render
  useEffect(() => {
    if (hasForm) {
      const timer = setTimeout(() => { formHasMountedRef.current = true; }, 300);
      return () => clearTimeout(timer);
    }
  }, [hasForm]);

  // Live sync: update form values when remote data changes (from another device)
  const existingSubmissionJson = useMemo(() => JSON.stringify(existingSubmission?.data ?? {}), [existingSubmission]);
  useEffect(() => {
    // Skip during active local edits
    if (formIsSavingRef.current || formSaveTimerRef.current) return;
    const remoteData = existingSubmission?.data ?? {};
    const localJson = JSON.stringify(formLatestValuesRef.current);
    if (existingSubmissionJson !== localJson) {
      setFormValues(remoteData);
      formLatestValuesRef.current = remoteData;
      if (existingSubmission?.id) setFormTaskFormId(existingSubmission.id);
    }
  }, [existingSubmissionJson, existingSubmission]);

  const { width: windowWidth } = useWindowDimensions();
  const descriptionContentWidth = windowWidth - spacing.md * 2;

  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      {/* Title row: task name + flag + #id inline */}
      <View style={styles.titleRow}>
        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={3}>{task.title}</Text>
        {requiresTaskSignature && <Text style={styles.taskSignatureEmoji}>✍️</Text>}
        {task.flagColor && (
          <MaterialCommunityIcons
            name="bookmark"
            size={20}
            color={FLAG_HEX[task.flagColor] ?? task.flagColor}
            style={{ marginTop: 2 }}
          />
        )}
        {task.id && (
          <Text style={[styles.taskIdInline, { color: tertiaryText }]}>#{task.id}</Text>
        )}
      </View>

      {/* Workspace badge */}
      {taskWorkspace && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {taskWorkspace.color && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: taskWorkspace.color }} />
          )}
          <Text style={{ fontSize: 12, color: tertiaryText, fontFamily: fontFamilies.bodyMedium }}>
            {taskWorkspace.name}
          </Text>
        </View>
      )}

      {/* Description / Checklist */}
      {!!localDescription && (() => {
        const checklistItems = parseChecklistItems(localDescription);
        if (checklistItems) {
          const checked = checklistItems.filter((i) => i.checked).length;
          const total = checklistItems.length;
          const progress = total > 0 ? checked / total : 0;
          return (
            <View style={styles.checklistContainer}>
              {checklistItems.map((item, idx) => (
                <TouchableOpacity key={idx} style={styles.checklistItem} onPress={() => handleChecklistToggle(idx)} activeOpacity={0.6}>
                  <MaterialCommunityIcons
                    name={item.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={item.checked ? '#22C55E' : (isDarkMode ? 'rgba(255,255,255,0.35)' : '#D1D5DB')}
                  />
                  <Text
                    style={[
                      styles.checklistLabel,
                      { color: item.checked ? colors.textSecondary : colors.text },
                      item.checked && styles.checklistLabelChecked,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* Progress bar */}
              <View style={styles.checklistProgressRow}>
                <View style={[styles.checklistProgressTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F0F0F0' }]}>
                  <View style={[styles.checklistProgressFill, { width: `${progress * 100}%`, backgroundColor: progress === 1 ? '#22C55E' : '#EF4444' }]} />
                </View>
                <Text style={[styles.checklistCount, { color: colors.textSecondary }]}>{checked}/{total}</Text>
              </View>
            </View>
          );
        }
        return (
          <View style={styles.descriptionContainer}>
            <RenderHtml
              contentWidth={descriptionContentWidth}
              source={{ html: localDescription }}
              baseStyle={{
                color: colors.textSecondary,
                fontSize: 13,
                fontFamily: fontFamilies.bodyRegular,
                lineHeight: 20,
              }}
              tagsStyles={{
                h1: { fontSize: fontSizes.md, fontFamily: fontFamilies.bodySemibold, lineHeight: 24, margin: 0 },
                h2: { fontSize: fontSizes.sm + 1, fontFamily: fontFamilies.bodySemibold, lineHeight: 22, margin: 0 },
                h3: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemibold, lineHeight: 20, margin: 0 },
                p: { margin: 0 },
              }}
            />
          </View>
        );
      })()}

      {/* Badge row: status + priority as tinted pills */}
      <View style={styles.badgeRow}>
        {currentStatus !== '' && (() => {
          const isWorking = currentStatusAction?.toUpperCase() === 'WORKING';
          const chipColor = statusColor(currentStatus, currentStatusColor);
          return (
            <TouchableOpacity onPress={() => setStatusPickerVisible(true)} activeOpacity={0.7}>
              <CustomChip
                label={currentStatus}
                color={chipColor}
                animated={isWorking}
              />
            </TouchableOpacity>
          );
        })()}
        <TouchableOpacity onPress={() => setPriorityPickerVisible(true)} activeOpacity={0.7}>
          <CustomChip label={currentPriority} color={currentPriorityColor || priorityColor(currentPriority)} />
        </TouchableOpacity>
        {task.approval && (
          <CustomChip label={task.approval} color="#BBDEFB" textColor="#0D47A1" compact />
        )}
        {task.sla && (
          <CustomChip
            label={task.sla}
            color={task.sla.toLowerCase().includes('breached') ? '#FFCDD2' : '#B2DFDB'}
            textColor={task.sla.toLowerCase().includes('breached') ? '#B71C1C' : '#004D40'}
            compact
          />
        )}
      </View>

      {/* Metadata grid — 2 columns */}
      <View style={styles.metaGrid}>
        <View style={[styles.metaCell, { backgroundColor: secondarySurface }]}>
          <Text style={[styles.metaCellLabel, { color: tertiaryText }]}>{t('taskDetail.locationLabel')}</Text>
          <Text style={[styles.metaCellValue, { color: colors.text }]} numberOfLines={2}>
            {task.spot || '—'}
          </Text>
        </View>
        <View style={[styles.metaCell, { backgroundColor: secondarySurface }]}>
          <Text style={[styles.metaCellLabel, { color: tertiaryText }]}>{t('taskDetail.createdLabel')}</Text>
          <Text style={[styles.metaCellValue, { color: colors.text }]}>
            {task.createdAt || '—'}
          </Text>
        </View>
      </View>

      {latestTaskSignature && (
        <>
          <Text style={[styles.sectionLabel, { color: tertiaryText }]}>{t('taskDetail.signatureSectionTitle', 'Signature')}</Text>
          <View style={[styles.signatureCard, { backgroundColor: secondarySurface }]}> 
            {latestSignatureImageUrl ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setImageViewerUri(latestSignatureImageUrl)}>
                <ProgressiveImage
                  uri={latestSignatureImageUrl}
                  width={1200}
                  height={420}
                  mode="fill"
                  style={styles.signatureImage}
                  contentFit="contain"
                />
              </TouchableOpacity>
            ) : (
              <View style={[styles.signatureImagePlaceholder, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#EBEDF0' }]}>
                <MaterialCommunityIcons name="signature-freehand" size={22} color={tertiaryText} />
                <Text style={[styles.signaturePlaceholderText, { color: tertiaryText }]}>
                  {t('taskDetail.signatureImageUnavailable', 'Signature image unavailable')}
                </Text>
              </View>
            )}

            {(latestSignatureSigner || latestSignatureSignedAt || latestTaskSignature.comment) && (
              <View style={styles.signatureMetaWrap}>
                <View style={styles.signatureMetaRow}>
                  {latestSignatureSigner ? (
                    <Text style={[styles.signatureMetaText, { color: colors.text }]}> 
                      {t('taskDetail.signatureSignedBy', 'Signed by')}: {latestSignatureSigner}
                    </Text>
                  ) : null}
                  {latestSignatureSignedAt ? (
                    <Text style={[styles.signatureMetaText, { color: tertiaryText }]}> 
                      {latestSignatureSignedAt}
                    </Text>
                  ) : null}
                </View>
                {!!latestTaskSignature.comment && (
                  <Text style={[styles.signatureComment, { color: tertiaryText }]} numberOfLines={3}>
                    "{latestTaskSignature.comment}"
                  </Text>
                )}
              </View>
            )}
          </View>
        </>
      )}

      {/* Work location */}
      {showWorkLocationCard && (
        <TaskNavigationMapSafe
          taskLatitude={spotLatitude!}
          taskLongitude={spotLongitude!}
          taskTitle={task.title}
          spotName={task.spot}
          helperText={t('taskDetail.spotSavedLocationHelper')}
          isDarkMode={isDarkMode}
          secondarySurface={secondarySurface}
          tertiaryText={tertiaryText}
          sectionLabelStyle={[styles.sectionLabel, { color: tertiaryText }]}
          sectionLabelText={t('taskDetail.workLocationLabel')}
          primaryColor={primaryColor}
          actionText={t('taskDetail.navigateToTask')}
        />
      )}

      {/* Assignees section */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[styles.sectionLabel, { color: tertiaryText }]}>{t('taskDetail.assigneesLabel')}</Text>
        <TouchableOpacity
          onPress={() => setAssigneePickerVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="person-add" size={20} color={primaryColor} />
        </TouchableOpacity>
      </View>
      {displayAssignees.length > 0 ? (
        <View style={styles.assigneeList}>
          {displayAssignees.map((assignee, index) => (
            <View key={index} style={[styles.assigneeRow, { backgroundColor: secondarySurface }]}> 
              {assignee.picture ? (
                <Image source={{ uri: getOptimizedImageUrl(assignee.picture, { width: 48, height: 48, mode: 'fill' }) || assignee.picture }} style={styles.assigneeAvatarImg} />
              ) : (
                <View style={[styles.assigneeAvatarCircle, { backgroundColor: isDarkMode ? '#374151' : '#DCEEFB' }]}>
                  <Text style={[styles.assigneeAvatarInitial, { color: isDarkMode ? '#90C2FF' : '#185FA5' }]}>
                    {getInitials(assignee.name)}
                  </Text>
                </View>
              )}
              <Text style={[styles.assigneeNameText, { color: colors.text }]}>{assignee.name}</Text>
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity onPress={() => setAssigneePickerVisible(true)} activeOpacity={0.7}>
          <View style={[styles.assigneeEmpty, { borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
            <Text style={[styles.assigneeEmptyText, { color: tertiaryText }]}>{t('taskDetail.tapToAssign')}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Created-from GPS */}
      {showCreatedFromCard && (
        <TaskNavigationMapSafe
          taskLatitude={task.latitude!}
          taskLongitude={task.longitude!}
          taskTitle={task.title}
          spotName={!hasSpotCoordinates && task.spot ? task.spot : undefined}
          helperText={t('taskDetail.creationLocationHelper')}
          warningText={!hasSpotCoordinates && task.spot ? t('taskDetail.spotLocationFallbackHelper') : undefined}
          isDarkMode={isDarkMode}
          secondarySurface={secondarySurface}
          tertiaryText={tertiaryText}
          sectionLabelStyle={[styles.sectionLabel, { color: tertiaryText }]}
          sectionLabelText={!hasSpotCoordinates && task.spot ? t('taskDetail.reportedFromLabel') : t('taskDetail.createdFromLabel')}
          primaryColor={primaryColor}
          actionText={t('taskDetail.navigateToTask')}
        />
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: tertiaryText }]}>{t('taskDetail.tagsLabel')}</Text>
          <View style={styles.tagsWrap}>
            {task.tags.map((tag, index) => {
              const info = tagInfoMap.get(tag);
              const bgColor = info?.color || '#6B7280';
              const txtColor = contrastTextColor(bgColor);
              const iconClass = info?.icon;
              const { name: iconName, solid, brand } = iconClass
                ? parseWorkspaceIcon(iconClass)
                : { name: 'tag', solid: true, brand: false };
              return (
                <View key={index} style={[styles.tagPill, { backgroundColor: bgColor }]}>
                  <FaIcon name={iconName} size={10} color={txtColor} solid={solid} brand={brand} />
                  <Text style={[styles.tagPillText, { color: txtColor }]}>{tag}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {taskDocuments.length > 0 && (
        <View style={styles.descriptionAttachmentsSection}>
          <Text style={[styles.sectionLabel, { color: tertiaryText }]}>Attachments</Text>
          <View style={styles.descriptionAttachmentsList}>
            {taskDocuments.map((document, index) => {
              const fileUrl = document.fileUrl ? fixConvexStorageUrl(document.fileUrl) : null;
              const fileName = getAttachmentDisplayName(document, index);
              const extension = document.fileExtension?.toLowerCase() ?? '';
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(extension);

              return (
                <TouchableOpacity
                  key={document._id || `${fileName}-${index}`}
                  style={[
                    styles.descriptionAttachmentItem,
                    { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (!fileUrl) return;
                    if (isImage) {
                      setImageViewerUri(fileUrl);
                    } else {
                      Linking.openURL(fileUrl).catch(() => {});
                    }
                  }}
                >
                  <MaterialIcons name="insert-drive-file" size={18} color={colors.textSecondary} />
                  <View style={styles.descriptionAttachmentTextWrap}>
                    <Text style={[styles.descriptionAttachmentName, { color: colors.text }]} numberOfLines={1}>
                      {fileName}
                    </Text>
                    {!!document.fileSize && (
                      <Text style={[styles.descriptionAttachmentMeta, { color: colors.textSecondary }]}>
                        {(document.fileSize / (1024 * 1024)).toFixed(document.fileSize >= 1024 * 1024 ? 1 : 2)} MB
                      </Text>
                    )}
                  </View>
                  <MaterialIcons name="open-in-new" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Seen by */}
      <Text style={[styles.sectionLabel, { color: tertiaryText }]}>{t('taskDetail.seenByLabel')}</Text>
      {taskViewsLoading ? (
        <View style={styles.seenLoadingRow}>
          <ActivityIndicator size="small" color={tertiaryText} />
          <Text style={[styles.seenLoadingText, { color: tertiaryText }]}>{t('taskDetail.seenByLoading')}</Text>
        </View>
      ) : viewersForDisplay.length > 0 ? (
        <View style={styles.seenList}>
          {viewersForDisplay.map((viewer: TaskViewer) => (
            <TouchableOpacity
              key={viewer.key}
              activeOpacity={0.8}
              onPress={() => setSelectedViewerKey(viewer.key)}
              style={[
                styles.seenAvatarButton,
                { backgroundColor: secondarySurface },
                selectedViewer?.key === viewer.key && [styles.seenAvatarButtonActive, { borderColor: primaryColor }],
              ]}
            >
              {viewer.picture ? (
                <Image source={{ uri: getOptimizedImageUrl(viewer.picture, { width: 48, height: 48, mode: 'fill' }) || viewer.picture }} style={styles.seenAvatarImg} />
              ) : (
                <View style={[styles.seenAvatarCircle, { backgroundColor: isDarkMode ? '#374151' : '#DCEEFB' }]}>
                  <Text style={[styles.seenAvatarInitial, { color: isDarkMode ? '#90C2FF' : '#185FA5' }]}>
                    {getInitials(viewer.isSelf ? t('common.you') : viewer.name)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          {selectedViewer ? (
            <View style={[styles.seenSelectedCard, { backgroundColor: secondarySurface }]}>
              <View style={styles.seenSelectedHeader}>
                <MaterialIcons name="visibility" size={14} color={primaryColor} />
                <Text style={[styles.seenName, { color: colors.text }]}>
                  {selectedViewer.isSelf ? t('common.you') : selectedViewer.name}
                </Text>
              </View>
              <Text style={[styles.seenTime, { color: tertiaryText }]}>
                {timeAgo(selectedViewer.viewedAt, t)}
              </Text>
              <Text style={[styles.seenExactTime, { color: tertiaryText }]}>
                {formatViewedAt(selectedViewer.viewedAt)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.seenEmptyRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}> 
          <MaterialIcons name="visibility-off" size={16} color={tertiaryText} />
          <Text style={[styles.seenEmptyText, { color: tertiaryText }]}>{t('taskDetail.noOneViewed')}</Text>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: tertiaryText }]}>{t('taskDetail.createdByLabel')}</Text>
      {taskCreator ? (
        <View style={[styles.assigneeRow, { backgroundColor: secondarySurface }]}> 
          {taskCreator.picture ? (
            <Image source={{ uri: getOptimizedImageUrl(taskCreator.picture, { width: 48, height: 48, mode: 'fill' }) || taskCreator.picture }} style={styles.assigneeAvatarImg} />
          ) : (
            <View style={[styles.assigneeAvatarCircle, { backgroundColor: isDarkMode ? '#374151' : '#DCEEFB' }]}> 
              <Text style={[styles.assigneeAvatarInitial, { color: isDarkMode ? '#90C2FF' : '#185FA5' }]}> 
                {getInitials(taskCreator.name)}
              </Text>
            </View>
          )}
          <Text style={[styles.assigneeNameText, { color: colors.text }]}> 
            {taskCreator.isSelf ? t('common.you') : taskCreator.name}
          </Text>
        </View>
      ) : (
        <View style={[styles.seenEmptyRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}> 
          <MaterialIcons name="person-outline" size={16} color={tertiaryText} />
          <Text style={[styles.seenEmptyText, { color: tertiaryText }]}>{t('common.unknown')}</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderFormTab = () => {
    if (!formSchema) return null;
    return (
      <View style={styles.tabContent}>
        {canFillForm ? (
          <View style={[styles.formSaveStatusBar, { borderBottomColor: cardBorder }]}> 
            {formSaveStatus === 'saving' && (
              <View style={styles.formSaveRow}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={[styles.formSaveText, { color: colors.textSecondary }]}>{t('taskDetail.formSaving')}</Text>
              </View>
            )}
            {formSaveStatus === 'saved' && (
              <View style={styles.formSaveRow}>
                <MaterialIcons name="cloud-done" size={14} color="#22C55E" />
                <Text style={[styles.formSaveText, { color: '#22C55E' }]}>{t('taskDetail.formSaved')}</Text>
              </View>
            )}
            {formSaveStatus === 'error' && (
              <View style={styles.formSaveRow}>
                <MaterialIcons name="cloud-off" size={14} color="#EF4444" />
                <Text style={[styles.formSaveText, { color: '#EF4444' }]}>{t('taskDetail.formSaveFailed')}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.formReadOnlyBannerWrap}>
            <View
              style={[
                styles.formReadOnlyBanner,
                {
                  borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.35)',
                  backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                },
              ]}
            >
              <MaterialIcons name="lock-outline" size={14} color={isDarkMode ? '#FDE68A' : '#92400E'} />
              <Text style={[styles.formReadOnlyText, { color: isDarkMode ? '#FEF3C7' : '#92400E' }]}>
                {t('taskDetail.formReadOnlyMustStartAndAssign', 'Task must be started and assigned to you before filling this form.')}
              </Text>
            </View>
          </View>
        )}

        <ScrollView style={styles.flex} contentContainerStyle={styles.tabContentContainer}>
          <FormFiller
            schema={formSchema}
            values={formValues}
            onChange={handleFormChange}
            readOnly={!canFillForm}
            showValidation={false}
            colors={colors}
            primaryColor={primaryColor}
            isDarkMode={isDarkMode}
          />
        </ScrollView>
      </View>
    );
  };

  const renderCommentsTab = () => (
    <View style={styles.tabContent}>
      {notesLoading && notes.length === 0 ? (
        <View style={styles.commentsCenter}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.commentsCenterText, { color: colors.textSecondary }]}>
            {t('taskDetail.loadingComments')}
          </Text>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.commentsCenter}>
          <MaterialIcons name="chat-bubble-outline" size={48} color="#E0E0E0" />
          <Text style={[styles.commentsCenterText, { color: colors.textSecondary }]}>
            {t('taskDetail.noCommentsYet')}
          </Text>
          <Text style={[styles.commentsCenterHint, { color: colors.textSecondary }]}>
            {t('taskDetail.beFirstToComment')}
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={commentsScrollRef}
          style={styles.flex}
          contentContainerStyle={styles.commentsList}
          onContentSizeChange={() => {
            if (!editingCommentId) {
              commentsScrollRef.current?.scrollToEnd({ animated: false });
            }
          }}
        >
          {notes.map((note) => {
            const noteUid = note.user_id;
            const noteId = String(note._id || note.id || '');
            const isMe = canManageNote(note);
            const isEditingThisNote = editingCommentId === noteId;
            const isCommentBusy = commentActionId === noteId;
            const authorPicture = noteUid != null
              ? userPictureMap.get(noteUid) || userPictureMap.get(String(noteUid)) || null
              : null;
            const authorName = isMe
              ? 'You'
              : (noteUid != null
                  ? userMap.get(noteUid) || userMap.get(String(noteUid)) || userMap.get(Number(noteUid)) || `User #${noteUid}`
                  : 'Unknown user');
            return (
              <View key={note.uuid || note.id} style={styles.commentItem}>
                {authorPicture ? (
                  <Image source={{ uri: getOptimizedImageUrl(authorPicture, { width: 44, height: 44, mode: 'fill' }) || authorPicture }} style={styles.commentAvatarImage} />
                ) : (
                  <View style={[styles.commentAvatar, isMe && { backgroundColor: primaryColor }]}> 
                    <Text style={styles.commentAvatarText}>
                      {getInitials(authorName)}
                    </Text>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <View style={styles.commentHeaderMeta}>
                      <Text style={[styles.commentAuthor, { color: colors.text }]}> 
                        {authorName}
                      </Text>
                      <Text style={[styles.commentTime, { color: colors.textSecondary }]}> 
                        {timeAgo(note.created_at!, t)}
                      </Text>
                    </View>
                    {isMe && (
                      <TouchableOpacity
                        style={styles.commentMenuButton}
                        onPress={() => handleCommentActions(note)}
                        disabled={isCommentBusy}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {isCommentBusy ? (
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                          <MaterialIcons name="more-vert" size={18} color={colors.textSecondary} />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  <View
                    style={[
                      styles.commentBubble,
                      {
                        backgroundColor: isDarkMode
                          ? 'rgba(255,255,255,0.06)'
                          : '#F5F5F7',
                      },
                    ]}
                  >
                    {isEditingThisNote ? (
                      <View style={styles.commentEditContainer}>
                        <TextInput
                          ref={commentEditInputRef}
                          style={[
                            styles.commentEditInput,
                            {
                              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                              color: colors.text,
                              borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                          value={editingCommentText}
                          onChangeText={setEditingCommentText}
                          multiline
                          editable={!isCommentBusy}
                          onSubmitEditing={handleSaveEditComment}
                        />
                        <View style={styles.commentEditActions}>
                          <TouchableOpacity
                            style={[styles.commentEditActionButton, { backgroundColor: primaryColor, opacity: isCommentBusy ? 0.6 : 1 }]}
                            onPress={handleSaveEditComment}
                            disabled={isCommentBusy}
                          >
                            <MaterialIcons name="check" size={18} color="#FFFFFF" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.commentEditActionButton,
                              { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' },
                            ]}
                            onPress={handleCancelEditComment}
                            disabled={isCommentBusy}
                          >
                            <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : !!note.note && (
                      <Text style={[styles.commentText, { color: colors.text }]}> 
                        {note.note}
                      </Text>
                    )}
                    {note.attachments && note.attachments.length > 0 && (
                      <View style={note.note || isEditingThisNote ? styles.commentAttachments : undefined}>
                        {note.attachments.map((att, idx) => (
                          <NoteAttachmentView
                            key={att.storageId || idx}
                            attachment={att}
                            colors={colors}
                            isDarkMode={isDarkMode}
                            onImagePress={setImageViewerUri}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {pendingAttachments.length > 0 && (
        <View style={[styles.attachmentPreview, { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder }]}> 
          {pendingAttachments.map((a, i) => (
            <View key={i} style={[styles.attachmentChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7', borderColor: cardBorder }]}>
              <MaterialIcons
                name={a.fileType.startsWith('image/') ? 'image' : 'attach-file'}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.attachmentChipText, { color: colors.text }]} numberOfLines={1}>
                {a.fileName}
              </Text>
              <TouchableOpacity onPress={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}>
                <MaterialIcons name="close" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <View
        style={[
          styles.commentInputContainer,
          { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
        ]}
      >
        <View
          style={[
            styles.commentComposerShell,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7',
              borderColor: cardBorder,
            },
          ]}
        >
          <TextInput
            style={[
              styles.commentInput,
              {
                color: colors.text,
              },
            ]}
            placeholder={t('taskDetail.addCommentPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleAddComment}
            editable={!sendingComment}
          />
          <TouchableOpacity
            style={[
              styles.attachButton,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                borderColor: cardBorder,
              },
            ]}
            onPress={handleAttach}
            disabled={uploadingAttachment}
          >
            {uploadingAttachment ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <MaterialIcons name="attach-file" size={20} color={primaryColor} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor:
                commentText.trim() || pendingAttachments.length > 0
                  ? primaryColor
                  : isDarkMode
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(0,0,0,0.08)',
              opacity: sendingComment ? 0.6 : 1,
            },
          ]}
          onPress={handleAddComment}
          disabled={sendingComment || (!commentText.trim() && pendingAttachments.length === 0)}
        >
          {sendingComment ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
      <AttachmentPickerSheet {...attachmentPickerProps} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { backgroundColor: colors.background }]}> 
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('taskDetail.headerTitle')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => void handleShareTask()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.headerActionButton}
            >
              <MaterialIcons name="share" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionButton} onPress={handleOpenTaskActions}>
              <MaterialIcons name="more-vert" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tabBar, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          {(hasForm
            ? (['details', 'form', 'comments'] as TabKey[])
            : (['details', 'comments'] as TabKey[])
          ).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && { borderBottomColor: primaryColor }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isDarkMode ? 'rgba(255,255,255,0.45)' : '#73726C' },
                  activeTab === tab && { color: primaryColor },
                ]}
              >
                {tab === 'form'
                  ? t('taskDetail.tabForm')
                  : tab === 'comments' && notes.length > 0
                    ? t('taskDetail.tabCommentsWithCount', { count: notes.length })
                    : tab === 'comments'
                      ? t('taskDetail.tabComments')
                      : t('taskDetail.tabDetails')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View
          {...tabPanResponder.panHandlers}
          style={[{ flexDirection: 'row', flex: 1, width: screenWidth * tabs.length }, tabSlideStyle]}
        >
          <View style={{ width: screenWidth, flex: 1 }}>
            {renderDetailsTab()}
          </View>
          {hasForm && (
            <View style={{ width: screenWidth, flex: 1 }}>
              {renderFormTab()}
            </View>
          )}
          <View style={{ width: screenWidth, flex: 1 }}>
            {renderCommentsTab()}
          </View>
        </Animated.View>

        {activeTab === 'details' && (getAllowedStatuses(currentTask).length > 0 || (requiresTaskSignature && !hasTaskSignature && hasValidConvexId)) && (
          <View style={styles.actionButtonsContainer}>
            {getAllowedStatuses(currentTask).length > 0 && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: isDarkMode ? '#F0F0F0' : '#1A1A1A' },
                  requiresTaskSignature && !hasTaskSignature && hasValidConvexId ? styles.actionButtonHalf : null,
                ]}
                onPress={() => setStatusPickerVisible(true)}
              >
                <MaterialIcons name="swap-horiz" size={16} color={isDarkMode ? '#1A1A1A' : '#FFFFFF'} />
                <Text style={[styles.actionButtonText, { color: isDarkMode ? '#1A1A1A' : '#FFFFFF' }]}>{t('taskDetail.changeStatus')}</Text>
              </TouchableOpacity>
            )}

            {requiresTaskSignature && !hasTaskSignature && hasValidConvexId && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.actionButtonHalf,
                  { backgroundColor: '#D97706' },
                ]}
                onPress={() => {
                  setPendingStatusAfterSignature(null);
                  setSignatureVisible(true);
                }}
              >
                <MaterialCommunityIcons name="signature-freehand" size={16} color="#FFFFFF" />
                <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>{t('taskDetail.signTask')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={taskActionsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTaskActionsVisible(false)}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => setTaskActionsVisible(false)}
        >
          <View
            style={[
              styles.taskActionsSheet,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.taskActionsTitle, { color: colors.text }]}> 
              {t('taskDetail.taskActionsTitle', 'Task actions')}
            </Text>
            <Text style={[styles.taskActionsSubtitle, { color: colors.textSecondary }]}> 
              {t('taskDetail.taskActionsSubtitle', 'Choose what you want to do with this task.')}
            </Text>

            <View style={styles.taskActionsList}>
              <TouchableOpacity
                style={[styles.taskActionRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                onPress={() => {
                  setTaskActionsVisible(false);
                  void handleShareTask();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.taskActionIconWrap, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F5F5F7' }]}> 
                  <MaterialIcons name="share" size={17} color={colors.text} />
                </View>
                <Text style={[styles.taskActionText, { color: colors.text }]}> 
                  {t('taskDetail.actionShareTask', 'Share task')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.taskActionRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                onPress={() => {
                  setTaskActionsVisible(false);
                  setStatusPickerVisible(true);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.taskActionIconWrap, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F5F5F7' }]}> 
                  <MaterialIcons name="swap-horiz" size={17} color={colors.text} />
                </View>
                <Text style={[styles.taskActionText, { color: colors.text }]}> 
                  {t('taskDetail.actionChangeStatus', 'Change status')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.taskActionRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                onPress={() => {
                  setTaskActionsVisible(false);
                  setActiveTab('comments');
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.taskActionIconWrap, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F5F5F7' }]}> 
                  <MaterialIcons name="chat-bubble-outline" size={17} color={colors.text} />
                </View>
                <Text style={[styles.taskActionText, { color: colors.text }]}> 
                  {t('taskDetail.actionOpenComments', 'Open comments')}
                </Text>
              </TouchableOpacity>

              {requiresTaskSignature && !hasTaskSignature && hasValidConvexId && (
                <TouchableOpacity
                  style={[styles.taskActionRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                  onPress={() => {
                    setTaskActionsVisible(false);
                    setPendingStatusAfterSignature(null);
                    setSignatureVisible(true);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.taskActionIconWrap, { backgroundColor: 'rgba(217,119,6,0.15)' }]}> 
                    <MaterialCommunityIcons name="signature-freehand" size={17} color="#D97706" />
                  </View>
                  <Text style={[styles.taskActionText, { color: colors.text }]}> 
                    {t('taskDetail.signTask', 'Sign task')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.taskActionsCancel,
                { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F5F5F7' },
              ]}
              onPress={() => setTaskActionsVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.taskActionsCancelText, { color: colors.textSecondary }]}> 
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={statusPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatusPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => setStatusPickerVisible(false)}
        >
          <View
            style={[
              styles.statusPickerSheet,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.statusPickerTitle, { color: colors.text }]}>
              {t('taskDetail.changeStatus')}
            </Text>
            <View style={styles.statusPickerList}>
              {getAllowedStatuses(currentTask).map((s) => {
                const isCurrentStatus = currentStatus === s.name;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.statusPickerItem,
                      {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0,0,0,0.04)',
                      },
                      isCurrentStatus && {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                      },
                    ]}
                    onPress={() => handleStatusChange(s)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.statusPickerDot,
                        { backgroundColor: s.color || '#9E9E9E' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPickerItemText,
                        { color: colors.text },
                        isCurrentStatus && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {s.name}
                    </Text>
                    {isCurrentStatus && (
                      <MaterialIcons name="check" size={20} color={primaryColor} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Priority Picker Modal */}
      <Modal
        visible={priorityPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPriorityPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => setPriorityPickerVisible(false)}
        >
          <View
            style={[
              styles.statusPickerSheet,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.statusPickerTitle, { color: colors.text }]}>
              {t('taskDetail.changePriority')}
            </Text>
            <View style={styles.statusPickerList}>
              {sortedPriorities.map((p) => {
                const isCurrentPriority = String(p.id) === String(currentPriorityId);
                const pColor = p.color || priorityColor(p.name as any) || '#9E9E9E';
                return (
                  <TouchableOpacity
                    key={String(p.id)}
                    style={[
                      styles.statusPickerItem,
                      {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0,0,0,0.04)',
                      },
                      isCurrentPriority && {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                      },
                    ]}
                    onPress={() => handlePriorityChange({ id: p.id, name: p.name, color: p.color ?? null })}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.statusPickerDot,
                        { backgroundColor: pColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPickerItemText,
                        { color: colors.text },
                        isCurrentPriority && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {p.name}
                    </Text>
                    {isCurrentPriority && (
                      <MaterialIcons name="check" size={20} color={primaryColor} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Assignee Picker Modal */}
      <UserPickerSheet
        visible={assigneePickerVisible}
        title={t('common.assignTo')}
        users={assigneePickerUsers}
        selectedIds={new Set(draftAssigneeIds)}
        onToggleUser={handleAssigneeToggle}
        onClose={closeAssigneePicker}
        colors={colors}
        primaryColor={primaryColor}
        isDarkMode={isDarkMode}
        currentUserId={authUser?.id ?? null}
        currentUserName={authUser?.name ?? null}
        searchPlaceholder={t('common.searchUsers')}
        emptyText={t('common.noItemsFound')}
        youLabel={t('common.you')}
        footer={(
          <View style={[styles.assigneePickerFooter, { borderTopColor: cardBorder }]}> 
            <TouchableOpacity
              style={[
                styles.assigneePickerSaveButton,
                {
                  backgroundColor: hasAssigneeChanges ? primaryColor : colors.textSecondary,
                  opacity: savingAssignees ? 0.7 : 1,
                },
              ]}
              onPress={handleSaveAssignees}
              disabled={savingAssignees}
              activeOpacity={0.8}
            >
              {savingAssignees ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.assigneePickerSaveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Full-screen image viewer */}
      <Modal
        visible={!!imageViewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerUri(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setImageViewerUri(null)}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {imageViewerUri && (
            <ProgressiveImage
              uri={imageViewerUri}
              width={Math.round(screenWidth * 0.95)}
              height={Math.round(screenHeight * 0.8)}
              mode="fit"
              style={styles.imageViewerImage}
              contentFit="contain"
            />
          )}
          <TouchableOpacity
            style={styles.imageViewerDownload}
            onPress={() => {
              if (imageViewerUri) {
                Linking.openURL(imageViewerUri).catch(() =>
                  toastRef.current?.show({ type: 'error', title: t('common.error'), body: t('taskDetail.errorCouldNotOpenFile') })
                );
              }
            }}
          >
            <MaterialIcons name="download" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      <SignatureModal
        visible={signatureVisible}
        title={t('taskDetail.signTask')}
        subtitle={t('component.signatureModal.signTaskSubtitle')}
        taskLabel={`#${task.id ?? ''} - ${task.title}`}
        onClose={() => {
          setSignatureVisible(false);
          setPendingStatusAfterSignature(null);
        }}
        onSigned={(payload) => {
          void handleTaskSigned(payload);
        }}
      />

      <Modal
        visible={!!commentActionNote}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!commentActionId) setCommentActionNote(null);
        }}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => {
            if (!commentActionId) setCommentActionNote(null);
          }}
        >
          <View
            style={[
              styles.commentActionSheet,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorder,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusPickerHandle} />
            <Text style={[styles.commentActionTitle, { color: colors.text }]}>
              {t('taskDetail.commentActionsTitle')}
            </Text>
            <Text style={[styles.commentActionSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {commentActionNote?.note?.trim() || t('taskDetail.commentActionsSubtitle')}
            </Text>

            {!!commentActionNote?.note && (
              <TouchableOpacity
                style={[
                  styles.commentActionRow,
                  { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                ]}
                onPress={() => commentActionNote && handleStartEditComment(commentActionNote)}
                disabled={!!commentActionId}
              >
                <View style={[styles.commentActionIcon, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#F5F5F7' }]}>
                  <MaterialIcons name="edit" size={18} color={colors.text} />
                </View>
                <Text style={[styles.commentActionText, { color: colors.text }]}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.commentActionRow,
                { borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
              ]}
              onPress={() => commentActionNote && handleDeleteComment(String(commentActionNote._id || commentActionNote.id || ''))}
              disabled={!!commentActionId}
            >
              <View style={[styles.commentActionIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                {commentActionId ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <MaterialIcons name="delete-outline" size={18} color="#DC2626" />
                )}
              </View>
              <Text style={[styles.commentActionText, { color: '#DC2626' }]}>{t('common.delete')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.commentActionCancel,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7',
                },
              ]}
              onPress={() => setCommentActionNote(null)}
              disabled={!!commentActionId}
            >
              <Text style={[styles.commentActionCancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    margin: -8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionButton: {
    padding: 8,
    margin: -8,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyMedium,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: spacing.md,
    paddingBottom: 32,
  },

  /* ── Title row ── */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: fontFamilies.bodySemibold,
  },
  taskSignatureEmoji: {
    fontSize: 16,
    marginTop: 2,
  },
  taskIdInline: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
    marginTop: 4,
  },

  /* ── Description ── */
  descriptionContainer: {
    marginTop: 6,
    marginBottom: 0,
  },
  descriptionAttachmentsSection: {
    marginTop: 12,
    marginBottom: 2,
  },
  descriptionAttachmentsList: {
    marginTop: 6,
    gap: 8,
  },
  descriptionAttachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  descriptionAttachmentTextWrap: {
    flex: 1,
  },
  descriptionAttachmentName: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  descriptionAttachmentMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fontFamilies.bodyRegular,
  },

  /* ── Checklist ── */
  checklistContainer: {
    marginTop: 6,
    marginBottom: 4,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  checklistLabel: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    flex: 1,
  },
  checklistLabelChecked: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  checklistProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  checklistProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  checklistProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  checklistCount: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },

  /* ── Badge row ── */
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 14,
  },

  /* ── Metadata grid ── */
  metaGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  metaCell: {
    flex: 1,
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  metaCellLabel: {
    fontSize: 10.5,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  metaCellValue: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.4,
    marginTop: 18,
    marginBottom: 8,
  },

  /* ── Assignees ── */
  assigneeList: {
    gap: 6,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  assigneeAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  assigneeAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeAvatarInitial: {
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
  },
  assigneeNameText: {
    marginLeft: 10,
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  assigneeEmpty: {
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  assigneeEmptyText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    fontStyle: 'italic',
  },
  assigneePickerFooter: {
    borderTopWidth: 1,
    padding: 12,
  },
  assigneePickerSaveButton: {
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneePickerSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
  },

  /* ── Tags ── */
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  tagPillText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },

  /* ── Seen by ── */
  seenLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  seenLoadingText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  seenList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  seenAvatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  seenAvatarButtonActive: {
    borderWidth: 2,
  },
  seenAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  seenAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seenAvatarInitial: {
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
  },
  seenSelectedCard: {
    width: '100%',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  seenSelectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seenName: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  seenTime: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 4,
  },
  seenExactTime: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 2,
  },
  seenEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  seenEmptyText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    fontStyle: 'italic',
  },

  /* ── Signature ── */
  signatureCard: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  signatureImage: {
    width: '100%',
    height: 170,
  },
  signatureImagePlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  signaturePlaceholderText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  signatureMetaWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  signatureMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  signatureMetaText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
    flexShrink: 1,
  },
  signatureComment: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    fontStyle: 'italic',
    lineHeight: 17,
  },

  /* ── Action bar ── */
  formSaveStatusBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  formSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  formSaveText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
  },
  formReadOnlyBannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  formReadOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  formReadOnlyText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.bodyMedium,
  },
  actionButtonsContainer: {
    padding: 16,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
  },
  actionButtonHalf: {
    flex: 1,
  },
  actionButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
  },

  /* ── Comments ── */
  commentsCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  commentsCenterText: {
    marginTop: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
  },
  commentsCenterHint: {
    marginTop: 4,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
  commentsList: {
    padding: 16,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentAvatarText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  commentContent: {
    flex: 1,
    marginLeft: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  commentAuthor: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  commentTime: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  commentBubble: {
    marginTop: 4,
    borderRadius: radius.md,
    padding: 12,
  },
  commentMenuButton: {
    marginLeft: 8,
    padding: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  commentAttachments: {
    marginTop: 8,
  },
  commentEditContainer: {
    gap: 8,
  },
  commentEditInput: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlignVertical: 'top',
  },
  commentEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  commentEditActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentActionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  commentActionTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  commentActionSubtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  commentActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  commentActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentActionText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  commentActionCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: 6,
  },
  commentActionCancelText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
  },
  commentComposerShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    ...shadows.subtle,
  },
  commentInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  attachButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  attachmentPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
    maxWidth: 220,
  },
  attachmentChipText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    flex: 1,
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalKeyboardAvoidingView: {
    flex: 1,
  },
  statusPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end' as const,
  },
  statusPickerSheet: {
    maxHeight: '78%',
    flexShrink: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  statusPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D1',
    alignSelf: 'center' as const,
    marginBottom: 16,
  },
  statusPickerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 16,
  },
  statusPickerList: {
    gap: 2,
  },
  taskActionsSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  taskActionsTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  taskActionsSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  taskActionsList: {
    gap: 8,
  },
  taskActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  taskActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  taskActionText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  taskActionsCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: 14,
  },
  taskActionsCancelText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  statusPickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 0.5,
  },
  statusPickerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusPickerItemText: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },
  imageViewerDownload: {
    position: 'absolute',
    bottom: 50,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
  },
});
