import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTenant } from '../hooks/useTenant';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { useConvexUpload, ConvexAttachment } from '../hooks/useConvexUpload';
import { AttachmentPickerSheet } from './AttachmentPickerSheet';
import { NoteAttachmentView, NoteAttachmentData } from './NoteAttachmentView';
import { isVisibleTaskNote } from '../utils/taskNotes';
import { parseApprovalDecisionNote } from '../utils/approvalNotes';
import { getInitials } from '../utils/helpers';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import { fontFamilies, radius } from '../config/designTokens';

interface TaskCommentNote {
  _id?: string;
  id?: string;
  uuid?: string;
  note?: string;
  source?: string;
  userId?: string;
  user_id?: number;
  _creationTime?: number;
  created_at?: string;
  attachments?: NoteAttachmentData[];
}

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, any>) => string): string {
  const date = new Date(
    dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z',
  );
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return t('taskDetail.timeJustNow');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('taskDetail.timeMinutesAgo', { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('taskDetail.timeHoursAgo', { count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return t('taskDetail.timeDaysAgo', { count: diffDay });
  return date.toLocaleDateString();
}

/**
 * Inline comments list + composer for a task, designed to sit inside a parent
 * ScrollView (renders a plain View list, no nested scrolling). Used by the
 * shared-task detail screen where recipients have view & comment access.
 */
export const TaskCommentsSection: React.FC<{
  taskConvexId: string | null;
  onImagePress?: (uri: string) => void;
}> = ({ taskConvexId, onImagePress }) => {
  const { colors, isDarkMode, primaryColor } = useTheme();
  const { t } = useLanguage();
  const { tenantId } = useTenant();
  const { user: authUser } = useAuth();
  const { data } = useData();

  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ConvexAttachment[]>([]);
  const [pendingNotes, setPendingNotes] = useState<TaskCommentNote[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const createNoteMutation = useOfflineMutation(api.taskResources.createNote, 'taskResources.createNote');
  const { pickAndUpload, uploading: uploadingAttachment, attachmentPickerProps } = useConvexUpload();

  const rawNotes = useQuery(
    api.taskResources.listTaskNotes,
    tenantId && taskConvexId ? { tenantId, taskId: taskConvexId as any } : 'skip',
  ) as TaskCommentNote[] | undefined;

  const currentUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (authUser?.id != null) ids.add(String(authUser.id));
    if ((authUser as any)?._id != null) ids.add(String((authUser as any)._id));
    const matched = data.users.find((user: any) => (
      (authUser?.id != null && (String(user.id) === String(authUser.id) || String(user.pgId) === String(authUser.id)))
      || ((authUser as any)?._id != null && String(user._id) === String((authUser as any)._id))
    ));
    if (matched) {
      if ((matched as any)._id) ids.add(String((matched as any)._id));
      if (matched.id != null) ids.add(String(matched.id));
    }
    return ids;
  }, [authUser, data.users]);

  const { userNameMap, userPictureMap } = useMemo(() => {
    const names = new Map<string, string>();
    const pictures = new Map<string, string>();
    for (const user of data.users as any[]) {
      const label = user.name || user.email || '';
      const picture = user.url_picture || user.urlPicture || '';
      for (const key of [user._id, user.id, user.pgId]) {
        if (key == null) continue;
        if (label) names.set(String(key), label);
        if (picture) pictures.set(String(key), picture);
      }
    }
    return { userNameMap: names, userPictureMap: pictures };
  }, [data.users]);

  const displayNotes = useMemo(() => {
    const synced = (rawNotes ?? [])
      .filter(isVisibleTaskNote)
      .map((note) => ({
        ...note,
        created_at: note.created_at
          ?? (note._creationTime ? new Date(note._creationTime).toISOString() : ''),
      }))
      .sort((a, b) => (a._creationTime ?? 0) - (b._creationTime ?? 0));
    const syncedUuids = new Set(
      synced.map((note) => (note.uuid ? String(note.uuid) : '')).filter(Boolean),
    );
    const stillPending = pendingNotes.filter(
      (note) => !(note.uuid && syncedUuids.has(String(note.uuid))),
    );
    return [...synced, ...stillPending];
  }, [rawNotes, pendingNotes]);

  const notesLoading = rawNotes === undefined && !!taskConvexId;

  const handleAttach = useCallback(async () => {
    const attachments = await pickAndUpload();
    if (attachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...attachments]);
    }
  }, [pickAndUpload]);

  const handleAddComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!tenantId || !taskConvexId) {
      setSendError(t('taskDetail.errorCannotAddComment'));
      return;
    }

    const queuedAttachments: NoteAttachmentData[] = pendingAttachments.map((a) => ({
      storageId: a.storageId,
      fileName: a.fileName,
      fileSize: a.fileSize,
      fileType: a.fileType,
    }));

    const pendingNoteId = `pending_note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const pendingNote: TaskCommentNote = {
      id: pendingNoteId,
      uuid: pendingNoteId,
      note: text || undefined,
      source: 'comment',
      userId: [...currentUserIds][0],
      created_at: nowIso,
      attachments: queuedAttachments,
    };

    setSendingComment(true);
    setSendError(null);
    setCommentText('');
    setPendingAttachments([]);
    setPendingNotes((prev) => [...prev, pendingNote]);

    try {
      await createNoteMutation({
        tenantId,
        taskId: taskConvexId as any,
        note: text || undefined,
        source: 'comment',
        uuid: pendingNoteId,
        attachments: queuedAttachments.length > 0
          ? queuedAttachments.map((a) => ({
              storageId: a.storageId as any,
              fileName: a.fileName,
              fileSize: a.fileSize,
              fileType: a.fileType,
            }))
          : undefined,
      });
    } catch (err: any) {
      setPendingNotes((prev) => prev.filter((note) => String(note.id ?? note.uuid ?? '') !== pendingNoteId));
      setCommentText(text);
      setPendingAttachments(pendingAttachments);
      setSendError(err?.message || t('taskDetail.errorFailedToPostComment'));
    } finally {
      setSendingComment(false);
    }
  }, [commentText, pendingAttachments, tenantId, taskConvexId, currentUserIds, createNoteMutation, t]);

  const canSend = (!!commentText.trim() || pendingAttachments.length > 0) && !sendingComment;

  return (
    <View>
      {notesLoading && displayNotes.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={primaryColor} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            {t('taskDetail.loadingComments')}
          </Text>
        </View>
      ) : displayNotes.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="chat-bubble-outline" size={36} color={isDarkMode ? 'rgba(255,255,255,0.2)' : '#E0E0E0'} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            {t('taskDetail.noCommentsYet')}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {displayNotes.map((note) => {
            const noteUid = note.userId != null ? String(note.userId) : (note.user_id != null ? String(note.user_id) : null);
            const isMe = noteUid != null && currentUserIds.has(noteUid);
            const authorPicture = noteUid != null ? userPictureMap.get(noteUid) ?? null : null;
            const authorName = isMe
              ? t('taskDetail.commentAuthorYou')
              : (noteUid != null
                  ? userNameMap.get(noteUid) || t('sharedTask.fallbackUser')
                  : t('sharedTask.fallbackUser'));
            const approvalDecisionNote = parseApprovalDecisionNote(note.note);
            const approvalRejected = approvalDecisionNote?.decision === 'rejected';
            const approvalAccent = approvalRejected ? '#DC2626' : '#16A34A';
            const approvalSurface = approvalRejected
              ? (isDarkMode ? 'rgba(220, 38, 38, 0.16)' : '#FEF2F2')
              : (isDarkMode ? 'rgba(22, 163, 74, 0.16)' : '#F0FDF4');
            const approvalBorder = approvalRejected
              ? (isDarkMode ? 'rgba(248, 113, 113, 0.32)' : '#FECACA')
              : (isDarkMode ? 'rgba(52, 211, 153, 0.32)' : '#BBF7D0');
            return (
              <View key={note.uuid || note._id || note.id} style={styles.commentItem}>
                {authorPicture ? (
                  <Image
                    source={{ uri: getOptimizedImageUrl(authorPicture, { width: 44, height: 44, mode: 'fill' }) || authorPicture }}
                    style={styles.commentAvatarImage}
                  />
                ) : (
                  <View style={[styles.commentAvatar, isMe && { backgroundColor: primaryColor }]}>
                    <Text style={styles.commentAvatarText}>{getInitials(authorName)}</Text>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: colors.text }]} numberOfLines={1}>
                      {authorName}
                    </Text>
                    {!!note.created_at && (
                      <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
                        {timeAgo(note.created_at, t)}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.commentBubble,
                      approvalDecisionNote && styles.approvalCommentBubble,
                      {
                        backgroundColor: approvalDecisionNote
                          ? approvalSurface
                          : isDarkMode
                            ? 'rgba(255,255,255,0.06)'
                            : '#F5F5F7',
                        borderColor: approvalDecisionNote ? approvalBorder : 'transparent',
                      },
                    ]}
                  >
                    {approvalDecisionNote ? (
                      <View style={styles.approvalCommentCard}>
                        <View style={styles.approvalCommentHeader}>
                          <View style={[styles.approvalCommentIcon, { backgroundColor: approvalAccent }]}>
                            <MaterialCommunityIcons
                              name={approvalRejected ? 'close' : 'shield-check-outline'}
                              size={15}
                              color="#FFFFFF"
                            />
                          </View>
                          <Text style={[styles.approvalCommentTitle, { color: approvalAccent }]}>
                            {approvalRejected ? t('component.taskCard.approvalRejected') : t('component.taskCard.approvalApproved')}
                          </Text>
                        </View>
                        {!!approvalDecisionNote.comment && (
                          <Text style={[styles.commentText, { color: colors.text }]}>
                            {approvalDecisionNote.comment}
                          </Text>
                        )}
                      </View>
                    ) : !!note.note && (
                      <Text style={[styles.commentText, { color: colors.text }]}>
                        {note.note}
                      </Text>
                    )}
                    {note.attachments && note.attachments.length > 0 && (
                      <View style={note.note ? styles.commentAttachments : undefined}>
                        {note.attachments.map((att, idx) => (
                          <NoteAttachmentView
                            key={att.storageId || idx}
                            attachment={att}
                            taskId={taskConvexId}
                            colors={colors}
                            isDarkMode={isDarkMode}
                            isMe={isMe}
                            onImagePress={onImagePress}
                            primaryColor={primaryColor}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {pendingAttachments.length > 0 && (
        <View style={styles.attachmentPreview}>
          {pendingAttachments.map((a) => (
            <View
              key={a.storageId}
              style={[styles.attachmentChip, {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }]}
            >
              <MaterialIcons
                name={a.fileType.startsWith('image/') ? 'image' : 'attach-file'}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.attachmentChipText, { color: colors.text }]} numberOfLines={1}>
                {a.fileName}
              </Text>
              <TouchableOpacity onPress={() => setPendingAttachments((prev) => prev.filter((item) => item.storageId !== a.storageId))}>
                <MaterialIcons name="close" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {!!sendError && (
        <Text style={styles.sendError}>{sendError}</Text>
      )}

      <View style={styles.composerRow}>
        <View
          style={[styles.composerShell, {
            backgroundColor: isDarkMode ? '#343438' : '#F3F2EF',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.06)',
          }]}
        >
          <TextInput
            style={[
              styles.commentInput,
              Platform.OS === 'android' && styles.commentInputAndroid,
              { color: colors.text },
            ]}
            placeholder={t('taskDetail.addCommentPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleAddComment}
            returnKeyType="send"
            editable={!sendingComment}
            multiline
            blurOnSubmit={false}
            underlineColorAndroid="transparent"
          />
          <TouchableOpacity
            style={styles.attachButton}
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
          style={[styles.sendButton, {
            backgroundColor: canSend ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
          }]}
          onPress={handleAddComment}
          disabled={!canSend}
        >
          {sendingComment ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <AttachmentPickerSheet {...attachmentPickerProps} />
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  centerText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
  },
  list: {
    gap: 12,
    marginBottom: 12,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  commentAuthor: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
    flexShrink: 1,
  },
  commentTime: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  commentBubble: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  approvalCommentBubble: {
    borderWidth: 1,
  },
  approvalCommentCard: {
    gap: 6,
  },
  approvalCommentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  approvalCommentIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalCommentTitle: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fontFamilies.bodyRegular,
  },
  commentAttachments: {
    marginTop: 6,
  },
  attachmentPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  attachmentChipText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
    maxWidth: 180,
  },
  sendError: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    color: '#DC2626',
    marginBottom: 6,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composerShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    maxHeight: 110,
    paddingVertical: 8,
  },
  commentInputAndroid: {
    paddingVertical: 6,
  },
  attachButton: {
    padding: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
