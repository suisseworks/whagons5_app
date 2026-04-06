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
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Dimensions,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import RenderHtml from 'react-native-render-html';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { RootStackParamList, TaskItem } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import TaskNavigationMap from '../components/TaskNavigationMap';
import { FormFiller } from '../components/FormFiller';

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

function fixConvexStorageUrl(url: string): string {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return url;
  try {
    const expected = new URL(convexUrl);
    const actual = new URL(url);
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
        <Image
          source={{ uri: url }}
          style={noteAttachStyles.image}
          resizeMode="cover"
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
  const { t } = useLanguage();
  const toastRef = useRef<ToastRef>(null);
  const { getAllowedStatuses, changeTaskStatus, changeTaskPriority, assignTaskToUser, getFormSchema, getTaskFormSubmission, getFormVersionId, tagInfoMap } = useTasks();
  const { user: authUser } = useAuth();
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
  const [currentPriorityId, setCurrentPriorityId] = useState(task.priorityId ?? null);

  // Assignee picker state
  const [assigneePickerVisible, setAssigneePickerVisible] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  const sortedUsers = useMemo(() => {
    const currentUserId = authUser?.id ?? 0;
    let users = [...data.users];
    if (assigneeSearch.trim()) {
      const q = assigneeSearch.trim().toLowerCase();
      users = users.filter((u) => u.name.toLowerCase().includes(q));
    }
    return users.sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [data.users, authUser, assigneeSearch]);

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

  const convexTaskId = task.convexId ?? null;
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
  const createNoteMutation = useMutation(api.taskResources.createNote);

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
  const taskDocuments = useMemo(
    () => (taskDocumentAssociations ?? []).map((association) => association.document).filter(Boolean),
    [taskDocumentAssociations]
  );
  const [sendingComment, setSendingComment] = useState(false);
  const commentsScrollRef = useRef<ScrollView>(null);

  const { pickAndUpload, takePhotoAndUpload, uploading: uploadingAttachment } = useConvexUpload();
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

  const currentUserId = authUser?.id != null ? Number(authUser.id) : null;

  type TaskViewer = {
    id: number;
    name: string;
    picture: string | null;
    viewedAt: string;
    isSelf: boolean;
  };

  const viewersForDisplay = useMemo(() => {
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
        return { id, name, picture, viewedAt: v.viewed_at, isSelf } satisfies TaskViewer;
      })
      .sort((a: TaskViewer, b: TaskViewer) => {
        if (a.isSelf && !b.isSelf) return -1;
        if (!a.isSelf && b.isSelf) return 1;
        return new Date(a.viewedAt).getTime() - new Date(b.viewedAt).getTime();
      });
  }, [taskViews, userMap, currentUserId, data.users, authUser]);

  const seenTaskIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!tenantId || !Number.isFinite(taskPgId) || taskPgId <= 0) return;
    if (seenTaskIdRef.current === taskPgId) return;
    seenTaskIdRef.current = taskPgId;
    recordTaskView({ tenantId, taskPgId }).catch((err) => {
      console.warn('[TaskDetail] Failed to record task view:', err);
    });
  }, [tenantId, taskPgId, recordTaskView]);

  const handleStatusChange = (status: StatusOption) => {
    changeTaskStatus(task.id || '', status);
    setCurrentStatus(status.name);
    setCurrentStatusColor(status.color);
    setCurrentStatusId(status.id);
    setCurrentStatusIcon(status.icon ?? null);
    setCurrentStatusAction(status.action ?? null);
    setStatusPickerVisible(false);
  };

  const handlePriorityChange = (priority: { id: any; name: string }) => {
    changeTaskPriority(task.id || '', priority.id);
    setCurrentPriority(priority.name);
    setCurrentPriorityId(priority.id);
    setPriorityPickerVisible(false);
  };

  const handleAssigneeSelect = (user: { id: number; name: string }) => {
    if (task.id) {
      if (task.assignees.some((a) => a.name === user.name)) {
        // Already assigned — just close
      } else {
        assignTaskToUser(task.id, user.id, user.name);
      }
    }
    setAssigneePickerVisible(false);
    setAssigneeSearch('');
  };

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

  // Tab swipe – smooth spring animation (matches ColabScreen)
  const tabs: TabKey[] = hasForm ? ['details', 'form', 'comments'] : ['details', 'comments'];
  const { width: screenWidth } = useWindowDimensions();
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
    if (!tenantId || !convexTaskId || formIsSavingRef.current) return;
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
  }, [tenantId, convexTaskId, formTaskFormId, existingSubmission, task.formId, getFormVersionId, createTaskFormMutation, updateTaskFormMutation]);

  const handleFormChange = useCallback((newValues: Record<string, unknown>) => {
    setFormValues(newValues);
    formLatestValuesRef.current = newValues;
    if (!formHasMountedRef.current) return;

    if (formSaveTimerRef.current) clearTimeout(formSaveTimerRef.current);
    setFormSaveStatus('saving');
    formSaveTimerRef.current = setTimeout(() => {
      formSaveTimerRef.current = null;
      doFormSave(formLatestValuesRef.current);
    }, 800);
  }, [doFormSave]);

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
          <CustomChip label={currentPriority} color={priorityColor(currentPriority)} />
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
      {task.assignees.length > 0 ? (
        <View style={styles.assigneeList}>
          {task.assignees.map((assignee, index) => (
            <View key={index} style={[styles.assigneeRow, { backgroundColor: secondarySurface }]}>
              {assignee.picture ? (
                <Image source={{ uri: assignee.picture }} style={styles.assigneeAvatarImg} />
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
            <View key={`${viewer.id}-${viewer.viewedAt}`} style={[styles.seenRow, { backgroundColor: secondarySurface }]}>
              {viewer.picture ? (
                <Image source={{ uri: viewer.picture }} style={styles.seenAvatarImg} />
              ) : (
                <View style={[styles.seenAvatarCircle, { backgroundColor: isDarkMode ? '#374151' : '#DCEEFB' }]}>
                  <Text style={[styles.seenAvatarInitial, { color: isDarkMode ? '#90C2FF' : '#185FA5' }]}>
                    {getInitials(viewer.isSelf ? 'You' : viewer.name)}
                  </Text>
                </View>
              )}
              <View style={styles.seenInfo}>
                <Text style={[styles.seenName, { color: colors.text }]}>
                  {viewer.isSelf ? 'You' : viewer.name}
                </Text>
                <Text style={[styles.seenTime, { color: tertiaryText }]}>
                  {timeAgo(viewer.viewedAt, t)}
                </Text>
              </View>
              <MaterialIcons name="visibility" size={12} color={isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.seenEmptyRow, { borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <MaterialIcons name="visibility-off" size={16} color={tertiaryText} />
          <Text style={[styles.seenEmptyText, { color: tertiaryText }]}>{t('taskDetail.noOneViewed')}</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderFormTab = () => {
    if (!formSchema) return null;
    return (
      <View style={styles.tabContent}>
        {/* Save status indicator */}
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

        <ScrollView style={styles.flex} contentContainerStyle={styles.tabContentContainer}>
          <FormFiller
            schema={formSchema}
            values={formValues}
            onChange={handleFormChange}
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
          onContentSizeChange={() =>
            commentsScrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {notes.map((note) => {
            const noteUid = note.user_id;
            const isMe = authUser?.id === noteUid
              || String(authUser?.id) === String(noteUid)
              || (authUser as any)?._id === noteUid;
            const authorName = isMe
              ? 'You'
              : (noteUid != null
                ? userMap.get(noteUid) || userMap.get(String(noteUid)) || userMap.get(Number(noteUid)) || `User #${noteUid}`
                : 'Unknown user');
            return (
              <View key={note.uuid || note.id} style={styles.commentItem}>
                <View style={[styles.commentAvatar, isMe && { backgroundColor: primaryColor }]}>
                  <Text style={styles.commentAvatarText}>
                    {getInitials(authorName)}
                  </Text>
                </View>
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: colors.text }]}>
                      {authorName}
                    </Text>
                    <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
                      {timeAgo(note.created_at!, t)}
                    </Text>
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
                    {!!note.note && (
                      <Text style={[styles.commentText, { color: colors.text }]}>
                        {note.note}
                      </Text>
                    )}
                    {note.attachments && note.attachments.length > 0 && (
                      <View>
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
            <View key={i} style={[styles.attachmentChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' }]}>
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
        <TextInput
          style={[
            styles.commentInput,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7',
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
          style={styles.attachButton}
          onPress={handleAttach}
          disabled={uploadingAttachment}
        >
          {uploadingAttachment ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <MaterialIcons name="attach-file" size={22} color={primaryColor} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', opacity: sendingComment ? 0.6 : 1 }]}
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
          <TouchableOpacity>
            <MaterialIcons name="more-vert" size={24} color={colors.text} />
          </TouchableOpacity>
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

        {activeTab === 'details' && getAllowedStatuses(currentTask).length > 0 && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: isDarkMode ? '#F0F0F0' : '#1A1A1A' }]}
              onPress={() => setStatusPickerVisible(true)}
            >
              <MaterialIcons name="swap-horiz" size={16} color={isDarkMode ? '#1A1A1A' : '#FFFFFF'} />
              <Text style={[styles.actionButtonText, { color: isDarkMode ? '#1A1A1A' : '#FFFFFF' }]}>{t('taskDetail.changeStatus')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

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
              {data.priorities.map((p) => {
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
                    onPress={() => handlePriorityChange({ id: p.id, name: p.name })}
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
      <Modal
        visible={assigneePickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setAssigneePickerVisible(false);
          setAssigneeSearch('');
        }}
      >
        <TouchableOpacity
          style={styles.statusPickerOverlay}
          activeOpacity={1}
          onPress={() => {
            setAssigneePickerVisible(false);
            setAssigneeSearch('');
          }}
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
              {t('common.assignTo')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 12,
              }}
            >
              <MaterialIcons
                name="search"
                size={20}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={{ flex: 1, fontSize: fontSizes.md, fontFamily: fontFamilies.bodyRegular, color: colors.text, padding: 0 }}
                placeholder={t('common.searchUsers')}
                placeholderTextColor={colors.textSecondary}
                value={assigneeSearch}
                onChangeText={setAssigneeSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {assigneeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setAssigneeSearch('')}>
                  <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={{ maxHeight: 300 }} bounces={false} keyboardShouldPersistTaps="handled">
              <View style={styles.statusPickerList}>
                {sortedUsers.map((u) => {
                  const isAssigned = task.assignees.some((a) => a.name === u.name);
                  const isCurrentUser = u.id === (authUser?.id ?? 0);
                  return (
                    <TouchableOpacity
                      key={String(u.id)}
                      style={[
                        styles.statusPickerItem,
                        {
                          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                        },
                        isAssigned && {
                          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                        },
                      ]}
                      onPress={() => handleAssigneeSelect({ id: u.id as number, name: u.name })}
                      activeOpacity={0.7}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: primaryColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontFamily: fontFamilies.bodySemibold }}>
                          {u.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.statusPickerItemText,
                          { color: colors.text },
                          isAssigned && { fontFamily: fontFamilies.bodySemibold },
                        ]}
                      >
                        {u.name}{isCurrentUser ? ` (${t('common.you')})` : ''}
                      </Text>
                      {isAssigned && (
                        <MaterialIcons name="check" size={20} color={primaryColor} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
            <Image
              source={{ uri: imageViewerUri }}
              style={styles.imageViewerImage}
              resizeMode="contain"
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
    gap: 4,
  },
  seenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  seenAvatarImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  seenAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seenAvatarInitial: {
    fontSize: 9,
    fontFamily: fontFamilies.bodySemibold,
  },
  seenInfo: {
    flex: 1,
    marginLeft: 8,
  },
  seenName: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
  },
  seenTime: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 0,
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
  actionButtonsContainer: {
    padding: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
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
  commentText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  commentInput: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  attachButton: {
    marginRight: 4,
    padding: 8,
  },
  attachmentPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    maxWidth: 160,
  },
  attachmentChipText: {
    fontSize: 11,
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
  statusPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end' as const,
  },
  statusPickerSheet: {
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
