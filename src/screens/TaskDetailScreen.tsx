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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useTasks, StatusOption } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { RootStackParamList } from '../models/types';
import { CustomChip } from '../components/CustomChip';
import { DetailRow } from '../components/DetailRow';
import { FormFiller } from '../components/FormFiller';
import { apiClient, TaskNoteResponse } from '../services/apiClient';
import { priorityColor, statusColor, getInitials } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

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
  const { setActiveTask, getAllowedStatuses, changeTaskStatus, getFormSchema, getTaskFormSubmission, getFormVersionId } = useTasks();
  const { subdomain, token, user: authUser } = useAuth();
  const { data } = useData();
  const cardBorder = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7';

  // Build a user lookup map from synced data
  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of data.users) {
      map.set(Number(u.id), u.name);
    }
    return map;
  }, [data.users]);

  // Determine if this task has a form
  const formSchema = useMemo(() => getFormSchema(task), [task, getFormSchema]);
  const existingSubmission = useMemo(() => getTaskFormSubmission(task.id || ''), [task.id, getTaskFormSubmission]);
  const hasForm = !!formSchema && formSchema.fields.length > 0;

  type TabKey = 'details' | 'form' | 'comments';
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  // Track local status so changes reflect immediately on this screen
  const [currentStatus, setCurrentStatus] = useState(task.status);
  const [currentStatusColor, setCurrentStatusColor] = useState(task.statusColor);
  const [currentStatusId, setCurrentStatusId] = useState(task.statusId);

  // Build a task object with the current local status so getAllowedStatuses
  // computes valid transitions from the *current* status, not the original one.
  const currentTask = useMemo(
    () => ({ ...task, status: currentStatus, statusColor: currentStatusColor, statusId: currentStatusId }),
    [task, currentStatus, currentStatusColor, currentStatusId],
  );
  const [commentText, setCommentText] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  // Form state
  const [formValues, setFormValues] = useState<Record<string, unknown>>(
    existingSubmission?.data ?? {},
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formShowValidation, setFormShowValidation] = useState(false);

  // Real comments from API
  const [notes, setNotes] = useState<TaskNoteResponse[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const notesFetched = useRef(false);
  const commentsScrollRef = useRef<ScrollView>(null);

  // Fetch task notes from API
  const fetchNotes = useCallback(async () => {
    if (!task.id) return;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const result = await apiClient.getTaskNotes(task.id);
      // Sort oldest first
      result.sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return ta - tb;
      });
      setNotes(result);
    } catch (err: any) {
      console.warn('[TaskDetail] Failed to fetch notes:', err?.message);
      setNotesError(err?.message || 'Failed to load comments');
    } finally {
      setNotesLoading(false);
    }
  }, [task.id]);

  // Fetch notes on mount (so count is ready even before switching to comments tab)
  useEffect(() => {
    if (!notesFetched.current && task.id) {
      notesFetched.current = true;
      fetchNotes();
    }
  }, [fetchNotes]);

  const handleStartWorking = () => {
    setActiveTask(task);
    navigation.goBack();
    Alert.alert('Started', `Now working on "${task.title}"`);
  };

  const handleStatusChange = (status: StatusOption) => {
    changeTaskStatus(task.id || '', status);
    setCurrentStatus(status.name);
    setCurrentStatusColor(status.color);
    setCurrentStatusId(status.id);
    setStatusPickerVisible(false);
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || !task.id || !authUser?.id) return;

    setSendingComment(true);
    const optimistic: TaskNoteResponse = {
      id: 0,
      uuid: generateUUID(),
      task_id: Number(task.id),
      note: text,
      user_id: authUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic update
    setNotes(prev => [...prev, optimistic]);
    setCommentText('');

    // Scroll to bottom after optimistic insert
    setTimeout(() => commentsScrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const created = await apiClient.createTaskNote({
        uuid: optimistic.uuid,
        task_id: Number(task.id),
        note: text,
        user_id: authUser.id,
      });
      // Replace optimistic entry with real server response
      setNotes(prev => prev.map(n => (n.uuid === optimistic.uuid ? created : n)));
    } catch (err: any) {
      // Remove optimistic entry on failure
      setNotes(prev => prev.filter(n => n.uuid !== optimistic.uuid));
      Alert.alert('Error', err?.message || 'Failed to post comment');
    } finally {
      setSendingComment(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachedImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachedImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Form submission
  const handleFormSubmit = useCallback(async () => {
    if (!formSchema || !task.formId || !task.id) return;

    // Validate required fields
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
        await apiClient.updateTaskForm(existingSubmission.id, { data: formValues });
      } else {
        await apiClient.createTaskForm({
          task_id: Number(task.id),
          form_version_id: formVersionId,
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
  }, [formSchema, formValues, task, existingSubmission, subdomain, token]);

  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <Text style={[styles.taskTitle, { color: colors.text }]}>{task.title}</Text>
      {task.id && (
        <Text style={[styles.taskId, { color: colors.textSecondary }]}>#{task.id}</Text>
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

      {/* Details Card */}
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

      {/* Assignees Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <View style={styles.cardHeader}>
          <MaterialIcons name="people-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Assignees</Text>
        </View>
        <View style={styles.chipsRow}>
          {task.assignees.map((name, index) => (
            <View key={index} style={styles.assigneeChip}>
              <View style={styles.assigneeAvatar}>
                <Text style={styles.assigneeInitial}>{getInitials(name)}</Text>
              </View>
              <Text style={[styles.assigneeName, { color: colors.text }]}>{name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tags Card */}
        {task.tags.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
        >
          <View style={styles.cardHeader}>
            <MaterialIcons name="label-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tags</Text>
          </View>
          <View style={styles.chipsRow}>
            {task.tags.map((tag, index) => (
              <View key={index} style={{ marginRight: 6, marginBottom: 6 }}>
                <CustomChip label={tag} color="#F5F5F5" textColor="#212121" />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Attachments Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="photo-library" size={20} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Attachments</Text>
            {attachedImages.length > 0 && (
              <View style={[styles.attachmentCount, { backgroundColor: `${primaryColor}1A` }]}
              >
                <Text style={[styles.attachmentCountText, { color: primaryColor }]}>
                  {attachedImages.length}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={showImageOptions}>
            <MaterialIcons name="add-photo-alternate" size={24} color={primaryColor} />
          </TouchableOpacity>
        </View>

        {attachedImages.length === 0 ? (
          <View style={styles.emptyAttachments}>
            <MaterialIcons name="add-a-photo" size={48} color="#E0E0E0" />
            <Text style={styles.emptyText}>No attachments yet</Text>
            <TouchableOpacity style={[styles.addPhotoButton, { borderColor: primaryColor }]} onPress={showImageOptions}>
              <MaterialIcons name="add" size={20} color={primaryColor} />
              <Text style={[styles.addPhotoText, { color: primaryColor }]}>Add Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.imagesGrid}>
            {attachedImages.map((uri, index) => (
              <TouchableOpacity key={index} style={styles.imageContainer}>
                <Image source={{ uri }} style={styles.attachedImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setAttachedImages(prev => prev.filter((_, i) => i !== index))}
                >
                  <MaterialIcons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

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
      ) : notesError && notes.length === 0 ? (
        <View style={styles.commentsCenter}>
          <MaterialIcons name="error-outline" size={40} color="#BDBDBD" />
          <Text style={[styles.commentsCenterText, { color: colors.textSecondary }]}>
            {notesError}
          </Text>
          <TouchableOpacity onPress={fetchNotes} style={styles.retryButton}>
            <Text style={[styles.retryText, { color: primaryColor }]}>Retry</Text>
          </TouchableOpacity>
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
                      {timeAgo(note.created_at)}
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
          disabled={sendingComment || !commentText.trim()}
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
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Task Details</Text>
        <TouchableOpacity>
          <MaterialIcons name="more-vert" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
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

      {/* Tab Content */}
      {activeTab === 'details' && renderDetailsTab()}
      {activeTab === 'form' && hasForm && renderFormTab()}
      {activeTab === 'comments' && renderCommentsTab()}

      {/* Action Buttons - Only show in details tab */}
      {activeTab === 'details' && (
        <View
          style={[
            styles.actionButtonsContainer,
            { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: cardBorder },
          ]}
        >
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton, { backgroundColor: primaryColor }]}
            onPress={handleStartWorking}
          >
            <MaterialIcons name="play-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Start Working</Text>
          </TouchableOpacity>

          {getAllowedStatuses(currentTask).length > 0 && (
            <TouchableOpacity
              style={[styles.actionButton, styles.doneButton, { borderColor: statusColor(currentStatus, currentStatusColor) }]}
              onPress={() => setStatusPickerVisible(true)}
            >
              <MaterialIcons name="swap-horiz" size={20} color={statusColor(currentStatus, currentStatusColor)} />
              <Text style={[styles.actionButtonText, { color: statusColor(currentStatus, currentStatusColor) }]}>
                Status
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Status Picker Modal */}
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
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
