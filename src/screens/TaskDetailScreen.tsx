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
import { useVideoPlayer, VideoView } from 'expo-video';
import RenderHtml from 'react-native-render-html';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FaIcon } from '../components/FaIcon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useTasks, StatusOption } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTenant } from '../hooks/useTenant';
import { RootStackParamList } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import { FormFiller } from '../components/FormFiller';
import { priorityColor, statusColor, getInitials, parseWorkspaceIcon, contrastTextColor } from '../utils/helpers';
import { useConvexUpload, ConvexAttachment } from '../hooks/useConvexUpload';
import { apiClient } from '../services/apiClient';
import { getCurrentUser } from '../firebase/authService';
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

/** Inline video player for note attachments */
const NoteVideoPlayer: React.FC<{ url: string }> = ({ url }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={noteAttachStyles.videoContainer}>
      <VideoView
        player={player}
        style={noteAttachStyles.video}
        allowsPictureInPicture
        allowsFullscreen
      />
    </View>
  );
};

const NoteAttachmentView: React.FC<{
  attachment: NoteAttachmentData;
  colors: any;
  isDarkMode: boolean;
  onImagePress?: (uri: string) => void;
}> = ({ attachment, colors, isDarkMode, onImagePress }) => {
  const rawUrl = useQuery(api.taskResources.getFileUrl, {
    storageId: attachment.storageId as any,
  });
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
    return <NoteVideoPlayer url={url} />;
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
  videoContainer: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
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

function timeAgo(dateStr: string): string {
  const date = new Date(
    dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z',
  );
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

type TaskDetailRouteProp = RouteProp<RootStackParamList, 'TaskDetail'>;

export const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<TaskDetailRouteProp>();
  const { task } = route.params;
  const { colors, primaryColor, isDarkMode } = useTheme();
  const toastRef = useRef<ToastRef>(null);
  const { getAllowedStatuses, changeTaskStatus, getFormSchema, getTaskFormSubmission, getFormVersionId, tagInfoMap } = useTasks();
  const { subdomain, token, user: authUser } = useAuth();
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
  // Only query if convexTaskId looks like a valid Convex ID (not a number)
  const hasValidConvexId = convexTaskId && typeof convexTaskId === 'string' && isNaN(Number(convexTaskId));
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
  const [sendingComment, setSendingComment] = useState(false);
  const commentsScrollRef = useRef<ScrollView>(null);

  const { pickAndUpload, takePhotoAndUpload, uploading: uploadingAttachment } = useConvexUpload();
  const [pendingAttachments, setPendingAttachments] = useState<ConvexAttachment[]>([]);

  const restSeenForTaskRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const taskIdStr = task.id;
    if (!taskIdStr || !subdomain) return;
    const pgId = Number(taskIdStr);
    if (!Number.isFinite(pgId) || pgId <= 0) return;
    if (restSeenForTaskRef.current === taskIdStr) return;
    restSeenForTaskRef.current = taskIdStr;

    const fbUser = getCurrentUser();
    if (!fbUser) return;

    void (async () => {
      try {
        const idToken = await fbUser.getIdToken();
        apiClient.configure(subdomain, idToken);
        await apiClient.markTaskAsSeen(taskIdStr);
      } catch {
        // Fire-and-forget; backend may use Sanctum instead of Firebase JWT
      }
    })();
  }, [task.id, subdomain]);

  const handleStatusChange = (status: StatusOption) => {
    changeTaskStatus(task.id || '', status);
    setCurrentStatus(status.name);
    setCurrentStatusColor(status.color);
    setCurrentStatusId(status.id);
    setCurrentStatusIcon(status.icon ?? null);
    setCurrentStatusAction(status.action ?? null);
    setStatusPickerVisible(false);
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!task.id || !tenantId) {
      toastRef.current?.show({ type: 'error', title: 'Error', body: 'Cannot add comment: task ID or tenant is missing.' });
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
      toastRef.current?.show({ type: 'error', title: 'Error', body: err?.message || 'Failed to post comment' });
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

  // Tab swipe
  const tabs: TabKey[] = hasForm ? ['details', 'form', 'comments'] : ['details', 'comments'];
  const tabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) =>
          Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < 20,
        onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          const THRESHOLD = Dimensions.get('window').width * 0.2;
          const idx = tabs.indexOf(activeTab);
          if (gs.dx < -THRESHOLD && idx < tabs.length - 1) {
            setActiveTab(tabs[idx + 1]);
          } else if (gs.dx > THRESHOLD && idx > 0) {
            setActiveTab(tabs[idx - 1]);
          }
        },
      }),
    [activeTab, tabs],
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
          const parsedIcon = currentStatusIcon ? parseWorkspaceIcon(currentStatusIcon) : null;
          const chipColor = statusColor(currentStatus, currentStatusColor);
          return (
            <TouchableOpacity onPress={() => setStatusPickerVisible(true)} activeOpacity={0.7}>
              <CustomChip
                label={currentStatus.toUpperCase()}
                color={chipColor}
                animated={isWorking}
                icon={parsedIcon ? (
                  <FaIcon name={parsedIcon.name} size={11} color="#FFFFFF" solid={parsedIcon.solid} brand={parsedIcon.brand} />
                ) : undefined}
              />
            </TouchableOpacity>
          );
        })()}
        <CustomChip label={task.priority} color={priorityColor(task.priority)} />
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
          <Text style={[styles.metaCellLabel, { color: tertiaryText }]}>LOCATION</Text>
          <Text style={[styles.metaCellValue, { color: colors.text }]} numberOfLines={2}>
            {task.spot || '—'}
          </Text>
        </View>
        <View style={[styles.metaCell, { backgroundColor: secondarySurface }]}>
          <Text style={[styles.metaCellLabel, { color: tertiaryText }]}>CREATED</Text>
          <Text style={[styles.metaCellValue, { color: colors.text }]}>
            {task.createdAt || '—'}
          </Text>
        </View>
      </View>

      {/* Assignees section */}
      <Text style={[styles.sectionLabel, { color: tertiaryText }]}>ASSIGNEES</Text>
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
        <View style={[styles.assigneeEmpty, { borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <Text style={[styles.assigneeEmptyText, { color: tertiaryText }]}>Tap to assign</Text>
        </View>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: tertiaryText }]}>TAGS</Text>
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
              <Text style={[styles.formSaveText, { color: colors.textSecondary }]}>Saving…</Text>
            </View>
          )}
          {formSaveStatus === 'saved' && (
            <View style={styles.formSaveRow}>
              <MaterialIcons name="cloud-done" size={14} color="#22C55E" />
              <Text style={[styles.formSaveText, { color: '#22C55E' }]}>Saved</Text>
            </View>
          )}
          {formSaveStatus === 'error' && (
            <View style={styles.formSaveRow}>
              <MaterialIcons name="cloud-off" size={14} color="#EF4444" />
              <Text style={[styles.formSaveText, { color: '#EF4444' }]}>Save failed</Text>
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
            Loading comments...
          </Text>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.commentsCenter}>
          <MaterialIcons name="chat-bubble-outline" size={48} color="#E0E0E0" />
          <Text style={[styles.commentsCenterText, { color: colors.textSecondary }]}>
            No comments yet
          </Text>
          <Text style={[styles.commentsCenterHint, { color: colors.textSecondary }]}>
            Be the first to add a comment
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
              : userMap.get(noteUid) || userMap.get(String(noteUid)) || userMap.get(Number(noteUid)) || `User #${noteUid}`;
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
                      {timeAgo(note.created_at!)}
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
          placeholder="Add a comment..."
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
          style={[styles.sendButton, { backgroundColor: primaryColor, opacity: sendingComment ? 0.6 : 1 }]}
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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Task Details</Text>
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
                  ? 'Form'
                  : tab === 'comments' && notes.length > 0
                    ? `Comments (${notes.length})`
                    : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.flex} {...tabPanResponder.panHandlers}>
          {activeTab === 'details' && renderDetailsTab()}
          {activeTab === 'form' && hasForm && renderFormTab()}
          {activeTab === 'comments' && renderCommentsTab()}
        </View>

        {activeTab === 'details' && getAllowedStatuses(currentTask).length > 0 && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: isDarkMode ? '#F0F0F0' : '#1A1A1A' }]}
              onPress={() => setStatusPickerVisible(true)}
            >
              <MaterialIcons name="swap-horiz" size={16} color={isDarkMode ? '#1A1A1A' : '#FFFFFF'} />
              <Text style={[styles.actionButtonText, { color: isDarkMode ? '#1A1A1A' : '#FFFFFF' }]}>Change Status</Text>
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
              Change Status
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
                  toastRef.current?.show({ type: 'error', title: 'Error', body: 'Could not open this file.' })
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
