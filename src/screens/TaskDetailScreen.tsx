import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FaIcon } from '../components/FaIcon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useTasks, StatusOption } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTenant } from '../hooks/useTenant';
import { RootStackParamList } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import { DetailRow } from '../components/DetailRow';
import { FormFiller } from '../components/FormFiller';
import { priorityColor, statusColor, getInitials, parseWorkspaceIcon, contrastTextColor } from '../utils/helpers';
import { useConvexUpload, ConvexAttachment } from '../hooks/useConvexUpload';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

interface TaskNoteResponse {
  _id?: string;
  id?: string | number;
  uuid?: string;
  taskId?: string;
  task_id?: number;
  note: string;
  userId?: string;
  user_id?: number;
  _creationTime?: number;
  created_at?: string;
  updated_at?: string;
}

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
  const { getAllowedStatuses, changeTaskStatus, getFormSchema, getTaskFormSubmission, getFormVersionId, tagInfoMap } = useTasks();
  const { subdomain, token, user: authUser } = useAuth();
  const { tenantId } = useTenant();
  const { data } = useData();
  const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';

  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of data.users) {
      map.set(Number(u.id), u.name);
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

  const currentTask = useMemo(
    () => ({ ...task, status: currentStatus, statusColor: currentStatusColor, statusId: currentStatusId }),
    [task, currentStatus, currentStatusColor, currentStatusId],
  );
  const [commentText, setCommentText] = useState('');

  const [formValues, setFormValues] = useState<Record<string, unknown>>(
    existingSubmission?.data ?? {},
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formShowValidation, setFormShowValidation] = useState(false);

  const convexTaskId = task.convexId ?? null;
  const rawNotes = useQuery(
    api.taskResources.listTaskNotes,
    tenantId && convexTaskId ? { tenantId, taskId: convexTaskId as any } : 'skip',
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

  const notesLoading = tenantId && convexTaskId ? rawNotes === undefined : false;
  const notesError: string | null = null;
  const [sendingComment, setSendingComment] = useState(false);
  const commentsScrollRef = useRef<ScrollView>(null);

  const { pickAndUpload, uploading: uploadingAttachment } = useConvexUpload();
  const [pendingAttachments, setPendingAttachments] = useState<ConvexAttachment[]>([]);

  const handleStatusChange = (status: StatusOption) => {
    changeTaskStatus(task.id || '', status);
    setCurrentStatus(status.name);
    setCurrentStatusColor(status.color);
    setCurrentStatusId(status.id);
    setStatusPickerVisible(false);
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!task.id || !tenantId) {
      Alert.alert('Error', 'Cannot add comment: task ID or tenant is missing.');
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
      Alert.alert('Error', err?.message || 'Failed to post comment');
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

  const handleFormSubmit = useCallback(async () => {
    if (!formSchema || !task.formId || !task.id || !tenantId) return;

    const errors = formSchema.fields.filter(
      (f) => f.required && (formValues[f.id] === undefined || formValues[f.id] === null || formValues[f.id] === '' || (Array.isArray(formValues[f.id]) && (formValues[f.id] as unknown[]).length === 0)),
    );
    if (errors.length > 0) {
      setFormShowValidation(true);
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    setFormSubmitting(true);
    const formVersionId = existingSubmission?.formVersionId ?? (task.formId ? getFormVersionId(task.formId) : null) ?? 0;
    try {
      if (existingSubmission) {
        await updateTaskFormMutation({
          tenantId,
          id: existingSubmission.id as any,
          data: formValues,
        });
      } else {
        await createTaskFormMutation({
          tenantId,
          taskId: convexTaskId as any,
          formVersionId: formVersionId as any,
          data: formValues,
        });
      }
      Alert.alert('Success', existingSubmission ? 'Form updated.' : 'Form submitted.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', `Failed to save form: ${message}`);
    } finally {
      setFormSubmitting(false);
    }
  }, [formSchema, formValues, task, existingSubmission, tenantId]);

  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <Text style={[styles.taskTitle, { color: colors.text }]}>{task.title}</Text>
      {task.id && (
        <Text style={[styles.taskId, { color: colors.textSecondary }]}>#{task.id}</Text>
      )}
      {!!task.description && (
        <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
          {task.description}
        </Text>
      )}

      <View style={styles.statusRow}>
        {currentStatus !== '' && (
          <TouchableOpacity onPress={() => setStatusPickerVisible(true)} activeOpacity={0.7}>
            <CustomChip label={currentStatus} color={statusColor(currentStatus, currentStatusColor)} />
          </TouchableOpacity>
        )}
        {currentStatus !== '' && <View style={{ width: 8 }} />}
        <CustomChip label={task.priority} color={priorityColor(task.priority)} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <DetailRow icon="location-on" label="Location" value={task.spot} />
        <View style={styles.divider} />
        <DetailRow icon="schedule" label="Created" value={task.createdAt} />
        {task.approval && (
          <>
            <View style={styles.divider} />
            <DetailRow icon="approval" label="Approval" value={task.approval} />
          </>
        )}
        {task.sla && (
          <>
            <View style={styles.divider} />
            <DetailRow icon="timer" label="SLA" value={task.sla} />
          </>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <View style={styles.cardHeader}>
          <MaterialIcons name="people-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Assignees</Text>
        </View>
        <View style={styles.chipsRow}>
          {task.assignees.map((assignee, index) => (
            <View key={index} style={styles.assigneeChip}>
              {assignee.picture ? (
                <Image source={{ uri: assignee.picture }} style={styles.assigneeAvatarImage} />
              ) : (
                <View style={styles.assigneeAvatar}>
                  <Text style={styles.assigneeInitial}>{getInitials(assignee.name)}</Text>
                </View>
              )}
              <Text style={[styles.assigneeName, { color: colors.text }]}>{assignee.name}</Text>
            </View>
          ))}
        </View>
      </View>

        {task.tags.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
        >
          <View style={styles.cardHeader}>
            <MaterialIcons name="label-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tags</Text>
          </View>
          <View style={styles.chipsRow}>
            {task.tags.map((tag, index) => {
              const info = tagInfoMap.get(tag);
              const bgColor = info?.color || '#6B7280';
              const textColor = contrastTextColor(bgColor);
              const iconClass = info?.icon;
              const { name: iconName, solid, brand } = iconClass
                ? parseWorkspaceIcon(iconClass)
                : { name: 'tag', solid: true, brand: false };
              return (
                <View key={index} style={{ marginRight: 6, marginBottom: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <View style={{ marginRight: 5 }}>
                    <FaIcon name={iconName} size={11} color={textColor} solid={solid} brand={brand} />
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: 'Montserrat_500Medium', color: textColor }}>{tag}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Timestamps Card */}
      <View style={[styles.card, styles.timestampsCard, { borderColor: cardBorder, backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.6)' : 'rgba(255, 255, 255, 0.6)' }]}
      >
        <View style={styles.timestampRow}>
          <MaterialIcons name="schedule" size={16} color={colors.textSecondary} />
          <Text style={[styles.timestampLabel, { color: colors.textSecondary }]}>Created:</Text>
          <Text style={[styles.timestampValue, { color: colors.text }]}>{task.createdAt}</Text>
        </View>
        <View style={[styles.timestampRow, { marginTop: 8 }]}> 
          <MaterialIcons name="update" size={16} color={colors.textSecondary} />
          <Text style={[styles.timestampLabel, { color: colors.textSecondary }]}>Last updated:</Text>
          <Text style={[styles.timestampValue, { color: colors.text }]}>{task.createdAt}</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderFormTab = () => {
    if (!formSchema) return null;
    return (
      <View style={styles.tabContent}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.tabContentContainer}>
          <FormFiller
            schema={formSchema}
            values={formValues}
            onChange={setFormValues}
            readOnly={formSubmitting}
            showValidation={formShowValidation}
            colors={colors}
            primaryColor={primaryColor}
            isDarkMode={isDarkMode}
          />
        </ScrollView>

        <View
          style={[
            styles.actionButtonsContainer,
            { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: primaryColor, opacity: formSubmitting ? 0.6 : 1 }]}
            onPress={handleFormSubmit}
            disabled={formSubmitting}
          >
            {formSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name={existingSubmission ? 'save' : 'send'} size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>
                  {existingSubmission ? 'Update Form' : 'Submit Form'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
            const isMe = authUser?.id === note.user_id;
            const authorName = isMe
              ? 'You'
              : userMap.get(Number(note.user_id)) || `User #${note.user_id}`;
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
                          ? 'rgba(31, 36, 34, 0.7)'
                          : '#FFFFFF',
                      },
                    ]}
                  >
                    <Text style={[styles.commentText, { color: colors.text }]}>
                      {note.note}
                    </Text>
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
            <View key={i} style={[styles.attachmentChip, { backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4' }]}>
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
        <TextInput
          style={[
            styles.commentInput,
            {
              backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
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
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Task Details</Text>
        <TouchableOpacity>
          <MaterialIcons name="more-vert" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
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
        <View
          style={[
            styles.actionButtonsContainer,
            { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton, { backgroundColor: primaryColor }]}
            onPress={() => setStatusPickerVisible(true)}
          >
            <MaterialIcons name="swap-horiz" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Change Status</Text>
          </TouchableOpacity>
        </View>
      )}

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
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F0EBE1',
                      },
                      isCurrentStatus && {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F7F4EF',
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
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D7',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#7A817C',
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: spacing.md,
  },
  taskTitle: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 4,
  },
  taskId: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  card: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    ...shadows.subtle,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    marginLeft: 8,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  divider: {
    height: 1,
    backgroundColor: '#E6E1D7',
    marginVertical: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EEE4',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  assigneeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  assigneeInitial: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: '#1E2321',
  },
  assigneeName: {
    marginLeft: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  attachmentCount: {
    marginLeft: 8,
    backgroundColor: 'rgba(20, 183, 163, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  attachmentCountText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    color: '#C77B43',
  },
  emptyAttachments: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#8B8E84',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#14B7A3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addPhotoText: {
    marginLeft: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  imageContainer: {
    width: '31%',
    aspectRatio: 1,
    marginRight: '2%',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  attachedImage: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#F44336',
    borderRadius: 12,
    padding: 4,
  },
  timestampsCard: {
    borderWidth: 1,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestampLabel: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  timestampValue: {
    marginLeft: 4,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'transparent',
    ...shadows.subtle,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  startButton: {
    marginRight: 12,
  },
  stopButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  doneButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
  },
  actionButtonText: {
    marginLeft: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
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
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
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
    color: '#1E2321',
  },
  commentTime: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    color: '#8B8E84',
  },
  commentBubble: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: 12,
  },
  commentText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#1E2321',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    ...shadows.subtle,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F3EEE4',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
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
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  statusPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1CBC0',
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
    borderBottomWidth: 1,
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
});
