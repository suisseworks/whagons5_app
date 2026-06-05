import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  BackHandler,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
  Pressable,
  useWindowDimensions,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
// KeyboardAvoidingView wraps chat views to keep input above keyboard
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import {
  useData,
  SyncedUser,
  SyncedConversation,
  SyncedConversationParticipant,
  SyncedDirectMessage,
  SyncedMessageReaction,
  SyncedLinkPreview,
  SyncedWorkspaceChat,
  SyncedWorkspace,
} from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TaskContext';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useConvexUpload } from '../hooks/useConvexUpload';
import { useVoiceMemoRecorder } from '../hooks/useVoiceMemoRecorder';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { apiClient } from '../services/apiClient';
import * as DB from '../store/database';
import { useCall } from '../context/CallContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { getInitials } from '../utils/helpers';
import { Toast, ToastRef } from '../components/Toast';
import { AttachmentPickerSheet } from '../components/AttachmentPickerSheet';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import { ProgressiveImage } from '../components/ProgressiveImage';
import { VoiceMemoActionButton, VoiceMemoBubble, VoiceMemoDraftPreview, VoiceMemoRecordingBar } from '../components/VoiceMemoControls';

const TIGHT_TAB_SPRING = {
  damping: 90,
  stiffness: 1600,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];
const URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function utcMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const normalized = ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z';
  return new Date(normalized).getTime() || 0;
}

function formatMessageTime(ts: string | null | undefined, _t?: (key: string, opts?: any) => string): string {
  if (!ts) return '';
  const normalized = ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `${_t ? _t('colab.timeYesterday') : 'Yesterday'} ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function formatConversationTime(ts: string | null | undefined, _t?: (key: string, opts?: any) => string): string {
  if (!ts) return '';
  const normalized = ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMins < 1) return _t ? _t('colab.timeNow') : 'now';
  if (diffMins < 60) return _t ? _t('colab.timeMinutes', { count: diffMins }) : `${diffMins}m`;
  if (diffHours < 24) return _t ? _t('colab.timeHours', { count: diffHours }) : `${diffHours}h`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return _t ? _t('colab.timeDays', { count: diffDays }) : `${diffDays}d`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatPreviewMessage(text: string, t: (key: string, opts?: any) => string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, `📷 ${t('colab.photoPreview')}`)
    .replace(/\[([^\]]*)\]\([^)]+\)/g, `📎 ${t('colab.filePreview')}`);
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/** Markdown link pattern: [label](url) */
const MD_LINK_REGEX = /!?\[([^\]]*)\]\(([^)]+)\)/g;

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const VIDEO_EXTS = /\.(mp4|mov|webm|avi|mkv)$/i;
const AUDIO_EXTS = /\.(m4a|mp3|aac|wav|caf|ogg|oga|webm)$/i;

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; label: string; storageId?: string }
  | { type: 'audio'; url: string; label: string; storageId?: string }
  | { type: 'video'; url: string; label: string }
  | { type: 'file'; url: string; label: string; storageId?: string };

type ViewerMediaItem = {
  type: 'image' | 'video';
  url?: string;
  storageId?: string;
  label?: string;
};

type ViewerMediaState = {
  items: ViewerMediaItem[];
  index: number;
};

/** Extract convex-file: storageId or {{convex-file:storageId}} from a URL */
function parseConvexFileUrl(url: string): string | null {
  // convex-file:kg2caqet26wp4qtfgv4z9sn70n837kma
  const m1 = url.match(/^convex-file:(.+)$/);
  if (m1) return m1[1];
  // {{convex-file:kg2caqet26wp4qtfgv4z9sn70n837kma}}
  const m2 = url.match(/^\{\{convex-file:(.+)\}\}$/);
  if (m2) return m2[1];
  return null;
}

/** Parse a message string into parts: plain text, images, videos, files */
function parseMessageContent(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MD_LINK_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    // Add preceding text
    if (match.index > lastIndex) {
      const preceding = text.slice(lastIndex, match.index).trim();
      if (preceding) parts.push({ type: 'text', text: preceding });
    }
    const isImageMd = match[0].startsWith('!');
    const label = match[1];
    const url = match[2];
    const storageId = parseConvexFileUrl(url) ?? undefined;

    if (isImageMd || IMAGE_EXTS.test(url) || IMAGE_EXTS.test(label)) {
      parts.push({ type: 'image', url, label, storageId });
    } else if (AUDIO_EXTS.test(url) || AUDIO_EXTS.test(label) || label.toLowerCase().includes('voice memo')) {
      parts.push({ type: 'audio', url, label, storageId });
    } else if (VIDEO_EXTS.test(url) || VIDEO_EXTS.test(label)) {
      parts.push({ type: 'video', url, label });
    } else if (storageId) {
      parts.push({ type: 'file', url, label, storageId });
    } else {
      parts.push({ type: 'text', text: `${label}: ${url}` });
    }
    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex).trim();
    if (trailing) parts.push({ type: 'text', text: trailing });
  }

  // If nothing was parsed, return the original text
  if (parts.length === 0) parts.push({ type: 'text', text });
  return parts;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColabTab = 'workspaces' | 'chats';

type ChatView =
  | { type: 'list' }
  | { type: 'conversation'; conversationId: number | string }
  | { type: 'spaceChat'; workspaceId: number | string };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** User avatar with real image via expo-image, falling back to initials */
const UserAvatar: React.FC<{
  user?: SyncedUser | null;
  name?: string;
  size?: number;
  primaryColor: string;
}> = React.memo(({ user, name, size = 36, primaryColor }) => {
  const displayName = user?.name || name || '?';
  const imageUrl = user?.url_picture;
  const borderRadius = size / 2;

  if (imageUrl) {
    return (
      <ExpoImage
        source={{ uri: getOptimizedImageUrl(imageUrl, { width: size, height: size, mode: 'fill' }) || imageUrl }}
        style={{
          width: size,
          height: size,
          borderRadius,
        }}
        contentFit="cover"
        placeholder={{ blurhash: 'L5H2EC=PM+yV0g-mq.wG9c010J}I' }}
        transition={200}
        cachePolicy="disk"
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: `${primaryColor}28`,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: primaryColor,
          fontFamily: fontFamilies.bodySemibold,
          fontSize: size * 0.36,
        }}
      >
        {getInitials(displayName)}
      </Text>
    </View>
  );
});

/** Link preview card rendered below a message bubble */
const LinkPreviewCard: React.FC<{
  preview: SyncedLinkPreview;
  isDarkMode: boolean;
  colors: any;
}> = React.memo(({ preview, isDarkMode, colors }) => {
  if (preview.status === 'failed' || (!preview.title && !preview.description && !preview.image_url)) {
    return null;
  }

  const handlePress = () => {
    Linking.openURL(preview.url).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[
        styles.linkPreviewCard,
        {
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      {preview.image_url && (
        <ExpoImage
          source={{ uri: getOptimizedImageUrl(preview.image_url, { width: 720, height: 360, mode: 'fill' }) || preview.image_url }}
          style={styles.linkPreviewImage}
          contentFit="cover"
          cachePolicy="disk"
        />
      )}
      <View style={styles.linkPreviewContent}>
        {preview.site_name && (
          <Text style={[styles.linkPreviewSite, { color: colors.textSecondary }]} numberOfLines={1}>
            {preview.site_name}
          </Text>
        )}
        {preview.title && (
          <Text style={[styles.linkPreviewTitle, { color: colors.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
        {preview.description && (
          <Text style={[styles.linkPreviewDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

/** Emoji reaction bar shown on long-press */
const QuickReactionBar: React.FC<{
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  isDarkMode: boolean;
}> = React.memo(({ visible, onSelect, onClose, isDarkMode }) => {
  if (!visible) return null;
  return (
    <Pressable style={styles.reactionOverlay} onPress={onClose}>
      <View
        style={[
          styles.reactionBar,
          {
            backgroundColor: isDarkMode ? '#2A2F2D' : '#FFFFFF',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0, 0, 0, 0.08)',
          },
        ]}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={styles.reactionOption}
            onPress={() => onSelect(emoji)}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Pressable>
  );
});

function mapWorkspaceChatDoc(
  doc: any,
  workspaceConvexToLegacyId: Map<string, number | string>,
  userConvexToLegacyId: Map<string, number | string>,
): SyncedWorkspaceChat {
  return {
    ...doc,
    id: doc.pgId ?? doc._id,
    workspace_id: workspaceConvexToLegacyId.get(String(doc.workspaceId)) ?? doc.workspaceId,
    user_id: userConvexToLegacyId.get(String(doc.userId)) ?? doc.userId,
    created_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
    updated_at: doc._creationTime ? new Date(doc._creationTime).toISOString() : '',
  };
}

const WorkspaceListItem: React.FC<{
  ws: SyncedWorkspace;
  tenantId: string | null;
  currentUserId: number | string;
  getUser: (id: number | string) => SyncedUser | undefined;
  userConvexToLegacyId: Map<string, number | string>;
  workspaceConvexToLegacyId: Map<string, number | string>;
  cachedMessages: SyncedWorkspaceChat[];
  onMessagesLoaded: (workspaceId: number | string, messages: SyncedWorkspaceChat[]) => void;
  primaryColor: string;
  colors: any;
  isDarkMode: boolean;
  t: (key: string, opts?: any) => string;
  onPress: () => void;
}> = React.memo(({
  ws,
  tenantId,
  currentUserId,
  getUser,
  userConvexToLegacyId,
  workspaceConvexToLegacyId,
  cachedMessages,
  onMessagesLoaded,
  primaryColor,
  colors,
  isDarkMode,
  t,
  onPress,
}) => {
  const wsColor = ws.color || primaryColor;
  const convexWorkspaceId = (ws as any)._id;
  const rawWorkspaceMessages = useQuery(
    api.chat.listWorkspaceChat,
    tenantId && convexWorkspaceId
      ? { tenantId, workspaceId: convexWorkspaceId as any }
      : 'skip',
  );

  const mappedWorkspaceMessages = useMemo(() => {
    if (!rawWorkspaceMessages) return [];
    return rawWorkspaceMessages.map((doc: any) =>
      mapWorkspaceChatDoc(doc, workspaceConvexToLegacyId, userConvexToLegacyId),
    );
  }, [rawWorkspaceMessages, userConvexToLegacyId, workspaceConvexToLegacyId]);

  const workspaceMessages = rawWorkspaceMessages === undefined ? cachedMessages : mappedWorkspaceMessages;
  const isWorkspaceMessagesLoading = rawWorkspaceMessages === undefined && cachedMessages.length === 0;

  useEffect(() => {
    if (rawWorkspaceMessages !== undefined) {
      onMessagesLoaded(ws.id, mappedWorkspaceMessages);
    }
  }, [rawWorkspaceMessages, mappedWorkspaceMessages, onMessagesLoaded, ws.id]);

  const lastMsg = useMemo(() => {
    if (workspaceMessages.length === 0) return null;
    return [...workspaceMessages].sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))[0] ?? null;
  }, [workspaceMessages]);

  const senderId = lastMsg
    ? lastMsg.user_id ?? null
    : null;
  const sender = senderId != null ? getUser(senderId) : null;
  const preview = isWorkspaceMessagesLoading
    ? t('colab.loading')
    : lastMsg
      ? `${String(senderId) === String(currentUserId) ? t('colab.senderYou') : sender?.name?.split(' ')[0] || t('colab.fallbackSomeone')}: ${formatPreviewMessage(lastMsg.message, t)}`
      : t('colab.noMessagesPreview');
  const lastCreatedAt = lastMsg ? lastMsg.created_at : null;

  return (
    <TouchableOpacity
      style={[
        styles.conversationItem,
        {
          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.groupAvatar, { backgroundColor: `${wsColor}20` }]}>
        <MaterialIcons name="forum" size={20} color={wsColor} />
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationTopRow}>
          <Text
            style={[styles.conversationName, { color: colors.text }]}
            numberOfLines={1}
          >
            {ws.name}
          </Text>
          {lastCreatedAt && (
            <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
              {formatConversationTime(lastCreatedAt, t)}
            </Text>
          )}
        </View>
        <View style={styles.conversationBottomRow}>
          <Text
            style={[styles.conversationPreview, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// Fix Convex storage URLs for self-hosted (dashboard domain → backend domain)
// ---------------------------------------------------------------------------
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

// In-memory cache: storageId → resolved serving URL
const storageUrlCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// ConvexFileImage – resolves a Convex storageId to a URL and renders it
// ---------------------------------------------------------------------------

const ConvexFileImage = memo(({
  storageId,
  style,
  onPress,
}: {
  storageId: string;
  style?: any;
  onPress?: (url: string) => void;
}) => {
  const { tenantId } = useTenant();
  const cached = storageUrlCache.get(storageId);
  // Only query Convex if not cached
  const rawUrl = useQuery(
    api.files.getFileUrl,
    cached || !tenantId ? 'skip' : { tenantId, storageId: storageId as any },
  );
  const url = cached ?? (rawUrl ? fixConvexStorageUrl(rawUrl) : null);

  // Cache the resolved URL
  if (url && !cached) storageUrlCache.set(storageId, url);

  if (!url) return <View style={[style, { backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="small" /></View>;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => { onPress?.(url); }}>
      <ProgressiveImage uri={url} width={720} height={720} mode="fill" style={style} contentFit="cover" cachePolicy="disk" transition={200} />
    </TouchableOpacity>
  );
});

const ConvexFileGalleryTile = memo(({
  storageId,
  style,
  children,
  onPress,
}: {
  storageId: string;
  style?: any;
  children?: React.ReactNode;
  onPress?: () => void;
}) => {
  const { tenantId } = useTenant();
  const cached = storageUrlCache.get(storageId);
  const rawUrl = useQuery(
    api.files.getFileUrl,
    cached || !tenantId ? 'skip' : { tenantId, storageId: storageId as any },
  );
  const url = cached ?? (rawUrl ? fixConvexStorageUrl(rawUrl) : null);

  if (url && !cached) storageUrlCache.set(storageId, url);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={style}>
      {url ? (
        <ProgressiveImage uri={url} width={360} height={360} mode="fill" style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.galleryImageLoading]}>
          <ActivityIndicator size="small" />
        </View>
      )}
      {children}
    </TouchableOpacity>
  );
});

const ConvexFileViewerImage = memo(({
  storageId,
  width,
  height,
}: {
  storageId: string;
  width: number;
  height: number;
}) => {
  const { tenantId } = useTenant();
  const cached = storageUrlCache.get(storageId);
  const rawUrl = useQuery(
    api.files.getFileUrl,
    cached || !tenantId ? 'skip' : { tenantId, storageId: storageId as any },
  );
  const url = cached ?? (rawUrl ? fixConvexStorageUrl(rawUrl) : null);

  if (url && !cached) storageUrlCache.set(storageId, url);

  if (!url) {
    return (
      <View style={[styles.viewerImageStage, { width, height }]}>
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <ProgressiveImage
      uri={url}
      width={Math.round(width)}
      height={Math.round(height)}
      mode="fit"
      style={{ width, height }}
      contentFit="contain"
      cachePolicy="disk"
    />
  );
});

const ConvexFileAudio = memo(({
  storageId,
  isMe,
  primaryColor,
  incomingBackgroundColor,
  incomingTextColor,
}: {
  storageId: string;
  isMe: boolean;
  primaryColor: string;
  incomingBackgroundColor: string;
  incomingTextColor: string;
}) => {
  const { tenantId } = useTenant();
  const cached = storageUrlCache.get(storageId);
  const rawUrl = useQuery(
    api.files.getFileUrl,
    cached || !tenantId ? 'skip' : { tenantId, storageId: storageId as any },
  );
  const url = cached ?? (rawUrl ? fixConvexStorageUrl(rawUrl) : null);

  if (url && !cached) storageUrlCache.set(storageId, url);

  if (!url) {
    return (
      <View style={[styles.voiceLoadingBubble, { backgroundColor: isMe ? primaryColor : incomingBackgroundColor }]}> 
        <ActivityIndicator size="small" color={isMe ? '#FFFFFF' : primaryColor} />
      </View>
    );
  }

  return (
    <VoiceMemoBubble
      uri={url}
      outgoing={isMe}
      primaryColor={primaryColor}
      incomingBackgroundColor={incomingBackgroundColor}
      incomingTextColor={incomingTextColor}
      timeLabel=""
    />
  );
});

// ---------------------------------------------------------------------------
// InlineVideoPlayer – wraps useVideoPlayer hook
// ---------------------------------------------------------------------------
const InlineVideoPlayer = ({ url }: { url: string }) => {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '80%' }}
      allowsPictureInPicture
    />
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ColabScreenProps {
  onChatViewChange?: (isInChat: boolean) => void;
  /** If set, automatically open this conversation when the screen mounts */
  initialConversationId?: string | number;
  /** Called after the initial conversation has been consumed */
  onConversationConsumed?: () => void;
}

export const ColabScreen: React.FC<ColabScreenProps> = ({ onChatViewChange, initialConversationId, onConversationConsumed }) => {
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { data, isSyncing, refresh, hasEverSynced, isInitialSync } = useData();
  const { user: authUser } = useAuth();
  const { tenantId } = useTenant();
  const { selectedWorkspace, workspaceObjects } = useTasks();
  const { startConversationCall, isCallActive } = useCall();
  const markAsReadMutation = useOfflineMutation(api.chat.markAsRead, 'chat.markAsRead');
  const cvxSendMessage = useOfflineMutation(api.chat.sendMessage, 'chat.sendMessage');
  const cvxSendWorkspaceChat = useOfflineMutation(api.chat.sendWorkspaceChat, 'chat.sendWorkspaceChat');
  const cvxCreateConversation = useOfflineMutation(api.chat.createConversation, 'chat.createConversation');
  const cvxUpdateMessage = useOfflineMutation(api.chat.updateMessage, 'chat.updateMessage');
  const cvxDeleteMessage = useOfflineMutation(api.chat.deleteMessage, 'chat.deleteMessage');
  const cvxUpdateWsMessage = useOfflineMutation(api.chat.updateWorkspaceChatMessage, 'chat.updateWorkspaceChatMessage');
  const cvxDeleteWsMessage = useOfflineMutation(api.chat.deleteWorkspaceChatMessage, 'chat.deleteWorkspaceChatMessage');
  const cvxAddReaction = useOfflineMutation(api.chat.addReaction, 'chat.addReaction');
  const cvxRemoveReaction = useOfflineMutation(api.chat.removeReaction, 'chat.removeReaction');
  const { pickAndUpload, uploadFile, uploading: uploadingFile, attachmentPickerProps } = useConvexUpload();
  const [viewerMedia, setViewerMedia] = useState<ViewerMediaState | null>(null);
  const toastRef = useRef<ToastRef>(null);

  const availableWorkspaces = useMemo(
    () => (data.workspaces.length > 0 ? data.workspaces : workspaceObjects),
    [data.workspaces, workspaceObjects],
  );
  const showWorkspaceLoadingState = isInitialSync && isSyncing && availableWorkspaces.length === 0 && !hasEverSynced;

  const workspaceConvexToLegacyId = useMemo(() => {
    const map = new Map<string, number | string>();
    for (const workspace of availableWorkspaces) {
      const convexId = (workspace as any)._id;
      if (convexId) map.set(String(convexId), workspace.id);
    }
    return map;
  }, [availableWorkspaces]);

  const userConvexToLegacyId = useMemo(() => {
    const map = new Map<string, number | string>();
    for (const user of data.users) {
      const convexId = (user as any)._id;
      if (convexId) map.set(String(convexId), user.id);
    }
    return map;
  }, [data.users]);

  const [activeTab, setActiveTab] = useState<ColabTab>('workspaces');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Continuous drag between tabs using PanResponder (doesn't steal focus from TextInput)
  const tabTranslateX = useSharedValue(0);
  const dragStartX = useRef(0);

  useEffect(() => {
    tabTranslateX.value = withSpring(activeTab === 'workspaces' ? 0 : -screenWidth, {
      ...TIGHT_TAB_SPRING,
    });
  }, [activeTab, screenWidth]);

  const tabSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabTranslateX.value }],
  }));

  const finishTabSwipe = useCallback((dx: number, vx: number) => {
    const currentX = dragStartX.current + dx;
    const velocityThreshold = 0.28;
    const distanceThreshold = screenWidth * 0.16;
    let snapToChats: boolean;

    if (vx < -velocityThreshold || dx < -distanceThreshold) {
      snapToChats = true;
    } else if (vx > velocityThreshold || dx > distanceThreshold) {
      snapToChats = false;
    } else {
      snapToChats = currentX < -screenWidth / 2;
    }

    const target = snapToChats ? -screenWidth : 0;
    tabTranslateX.value = withSpring(target, { ...TIGHT_TAB_SPRING, velocity: vx * screenWidth });

    const newTab = snapToChats ? 'chats' : 'workspaces';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [activeTab, screenWidth, tabTranslateX]);

  const tabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) =>
          Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.15,
        onPanResponderGrant: () => {
          // Capture current position at drag start
          dragStartX.current = activeTab === 'workspaces' ? 0 : -screenWidth;
        },
        onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          // Follow finger continuously, clamped to [−screenWidth, 0]
          const newX = Math.min(0, Math.max(-screenWidth, dragStartX.current + gs.dx));
          tabTranslateX.value = newX;
        },
        onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          finishTabSwipe(gs.dx, gs.vx);
        },
        onPanResponderTerminate: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          finishTabSwipe(gs.dx, gs.vx);
        },
      }),
    [activeTab, finishTabSwipe, screenWidth, tabTranslateX],
  );

  const [chatView, setChatView] = useState<ChatView>({ type: 'list' });
  const [inputText, setInputText] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<Awaited<ReturnType<typeof pickAndUpload>>>([]);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const chatListRef = useRef<FlatList>(null);
  const [workspaceChatCache, setWorkspaceChatCache] = useState<Record<string, SyncedWorkspaceChat[]>>({});

  const cacheWorkspaceMessages = useCallback((workspaceId: number | string, messages: SyncedWorkspaceChat[]) => {
    const cacheKey = String(workspaceId);
    setWorkspaceChatCache((prev) => {
      const existing = prev[cacheKey] ?? [];
      const sameLength = existing.length === messages.length;
      const sameTail = sameLength
        && existing[0]?.id === messages[0]?.id
        && existing[existing.length - 1]?.id === messages[messages.length - 1]?.id;
      if (sameTail) return prev;
      return { ...prev, [cacheKey]: messages };
    });
  }, []);

  const activeSpaceWorkspace = useMemo(() => {
    if (chatView.type !== 'spaceChat') return null;
    return availableWorkspaces.find((workspace) => String(workspace.id) === String(chatView.workspaceId)) || null;
  }, [chatView, availableWorkspaces]);

  const activeSpaceConvexId = activeSpaceWorkspace ? (activeSpaceWorkspace as any)._id : null;

  const cachedActiveWorkspaceChat = useMemo(() => {
    if (!activeSpaceWorkspace) return [];
    return workspaceChatCache[String(activeSpaceWorkspace.id)] ?? [];
  }, [activeSpaceWorkspace, workspaceChatCache]);

  const rawActiveWorkspaceChat = useQuery(
    api.chat.listWorkspaceChat,
    tenantId && activeSpaceConvexId
      ? { tenantId, workspaceId: activeSpaceConvexId as any }
      : 'skip',
  );

  const activeWorkspaceChat = useMemo<SyncedWorkspaceChat[]>(() => {
    if (rawActiveWorkspaceChat === undefined) return cachedActiveWorkspaceChat;
    return rawActiveWorkspaceChat.map((doc: any) =>
      mapWorkspaceChatDoc(doc, workspaceConvexToLegacyId, userConvexToLegacyId),
    );
  }, [cachedActiveWorkspaceChat, rawActiveWorkspaceChat, userConvexToLegacyId, workspaceConvexToLegacyId]);

  useEffect(() => {
    if (activeSpaceWorkspace && rawActiveWorkspaceChat !== undefined) {
      cacheWorkspaceMessages(activeSpaceWorkspace.id, activeWorkspaceChat);
    }
  }, [activeSpaceWorkspace, activeWorkspaceChat, cacheWorkspaceMessages, rawActiveWorkspaceChat]);

  // Handle deep-link from notification tap: open a specific conversation
  useEffect(() => {
    if (initialConversationId != null) {
      setChatView({ type: 'conversation', conversationId: initialConversationId });
      onConversationConsumed?.();
    }
  }, [initialConversationId]);

  // Locally-created conversations & participants not yet in sync data
  const [localConversations, setLocalConversations] = useState<SyncedConversation[]>([]);
  const [localParticipants, setLocalParticipants] = useState<SyncedConversationParticipant[]>([]);

  // Message actions
  const [reactionMessageId, setReactionMessageId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Optimistic (pending) messages – shown instantly before sync picks them up
  const [pendingDmMessages, setPendingDmMessages] = useState<SyncedDirectMessage[]>([]);
  const [pendingSpaceMessages, setPendingSpaceMessages] = useState<SyncedWorkspaceChat[]>([]);

  // New conversation modal
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'dm' | 'group'>('dm');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const currentUserId = authUser?.id ?? 0;

  const buildPendingDmMessage = useCallback((conversationId: number | string, message: string): SyncedDirectMessage => {
    const nowIso = new Date().toISOString();
    return {
      id: `pending_dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uuid: `pending_dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversation_id: conversationId,
      user_id: currentUserId,
      message,
      status: 'sending',
      created_at: nowIso,
      updated_at: nowIso,
    };
  }, [currentUserId]);

  const buildPendingSpaceMessage = useCallback((workspaceId: number | string, message: string): SyncedWorkspaceChat => {
    const nowIso = new Date().toISOString();
    return {
      id: `pending_ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uuid: `pending_ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspace_id: workspaceId,
      user_id: currentUserId,
      message,
      created_at: nowIso,
      updated_at: nowIso,
    };
  }, [currentUserId]);

  // Clean up pending messages once sync has picked them up
  useEffect(() => {
    if (pendingDmMessages.length > 0) {
      setPendingDmMessages((prev) => prev.filter((pending) => {
        const pendingTs = utcMs(pending.created_at);
        const hasSyncedEquivalent = data.directMessages.some((synced) => {
          if (pending.uuid && synced.uuid && pending.uuid === synced.uuid) return true;
          if (String(synced.conversation_id) !== String(pending.conversation_id)) return false;
          if (String(synced.user_id) !== String(pending.user_id)) return false;
          if ((synced.message ?? '').trim() !== (pending.message ?? '').trim()) return false;
          return Math.abs(utcMs(synced.created_at) - pendingTs) < 2 * 60 * 1000;
        });
        return !hasSyncedEquivalent;
      }));
    }
  }, [data.directMessages, pendingDmMessages.length]);

  useEffect(() => {
    if (pendingSpaceMessages.length > 0) {
      const syncedMessages = Object.values(workspaceChatCache).flat();
      setPendingSpaceMessages((prev) => prev.filter((pending) => {
        const pendingTs = utcMs(pending.created_at);
        const hasSyncedEquivalent = syncedMessages.some((synced) => {
          if (pending.uuid && synced.uuid && pending.uuid === synced.uuid) return true;
          if (String(synced.workspace_id) !== String(pending.workspace_id)) return false;
          if (String(synced.user_id) !== String(pending.user_id)) return false;
          if ((synced.message ?? '').trim() !== (pending.message ?? '').trim()) return false;
          return Math.abs(utcMs(synced.created_at) - pendingTs) < 2 * 60 * 1000;
        });
        return !hasSyncedEquivalent;
      }));
    }
  }, [workspaceChatCache, pendingSpaceMessages.length]);

  // Notify parent when chat view changes (for hiding bottom bar)
  const isInChat = chatView.type !== 'list';
  useEffect(() => {
    onChatViewChange?.(isInChat);
  }, [isInChat, onChatViewChange]);



  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const userMap = useMemo(() => {
    const m = new Map<string, SyncedUser>();
    for (const u of data.users) m.set(String(u.id), u);
    return m;
  }, [data.users]);

  const getUser = useCallback(
    (id: number | string): SyncedUser | undefined => userMap.get(String(id)),
    [userMap],
  );

  // Current workspace object
  const currentWorkspace = useMemo((): SyncedWorkspace | null => {
    if (selectedWorkspace === 'Everything') return null;
    return availableWorkspaces.find((w: SyncedWorkspace) => w.name === selectedWorkspace) || null;
  }, [selectedWorkspace, availableWorkspaces]);

  // ---- Workspace chat data ----

  // Link previews indexed by workspace_chat_id
  const linkPreviewsByWsChatId = useMemo(() => {
    const map = new Map<string, SyncedLinkPreview[]>();
    for (const lp of data.linkPreviews) {
      const chatId = lp.workspace_chat_id ? String(lp.workspace_chat_id) : null;
      if (!chatId) continue;
      if (!map.has(chatId)) map.set(chatId, []);
      map.get(chatId)!.push(lp);
    }
    return map;
  }, [data.linkPreviews]);

  // ---- Chats tab data (DM/group conversations) ----

  // Merge synced conversations with locally-created ones (dedupe by id)
  const allConversations = useMemo(() => {
    const syncedIds = new Set(data.conversations.map((c) => String(c.id)));
    const extras = localConversations.filter((c) => !syncedIds.has(String(c.id)));
    return [...data.conversations, ...extras];
  }, [data.conversations, localConversations]);

  // Merge synced + local participants for lookups
  const allParticipants = useMemo(() => {
    const syncedKeys = new Set(data.conversationParticipants.map((p) => `${String(p.conversation_id)}-${String(p.user_id)}`));
    const extras = localParticipants.filter((p) => !syncedKeys.has(`${String(p.conversation_id)}-${String(p.user_id)}`));
    return [...data.conversationParticipants, ...extras];
  }, [data.conversationParticipants, localParticipants]);

  const myConversations = useMemo(() => {
    const myConvIds = new Set(
      allParticipants
        .filter((p) => String(p.user_id) === String(currentUserId))
        .map((p) => String(p.conversation_id)),
    );
    return allConversations
      .filter((c) => myConvIds.has(String(c.id)))
      .sort((a, b) => {
        const aTime = utcMs(a.last_message_at) || utcMs(a.created_at);
        const bTime = utcMs(b.last_message_at) || utcMs(b.created_at);
        return bTime - aTime;
      });
  }, [allConversations, allParticipants, currentUserId]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return myConversations;
    const q = searchQuery.toLowerCase();
    return myConversations.filter((conv) => {
      if (conv.name && conv.name.toLowerCase().includes(q)) return true;
      const participants = allParticipants.filter(
        (p) => String(p.conversation_id) === String(conv.id),
      );
      return participants.some((p) => {
        const u = getUser(p.user_id);
        return u && u.name.toLowerCase().includes(q);
      });
    });
  }, [myConversations, searchQuery, allParticipants, getUser]);

  // Active conversation messages (DM/group)
  const activeConversationId = chatView.type === 'conversation' ? chatView.conversationId : null;

  const conversationMessages = useMemo(() => {
    if (!activeConversationId) return [];
    const synced = data.directMessages.filter((m) => String(m.conversation_id) === String(activeConversationId));
    // Merge pending messages that aren't yet in synced data
    const syncedIds = new Set(synced.map((m) => m.uuid));
    const pending = pendingDmMessages.filter(
      (m) => String(m.conversation_id) === String(activeConversationId) && !syncedIds.has(m.uuid),
    );
    // Sort newest-first for inverted FlatList
    return [...synced, ...pending].sort((a, b) => {
      const diff = utcMs(b.created_at) - utcMs(a.created_at);
      return diff !== 0 ? diff : String(b.id).localeCompare(String(a.id));
    });
  }, [data.directMessages, activeConversationId, pendingDmMessages]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return allConversations.find((c) => String(c.id) === String(activeConversationId)) || null;
  }, [allConversations, activeConversationId]);

  const activeParticipants = useMemo(() => {
    if (!activeConversationId) return [];
    return allParticipants.filter(
      (p) => String(p.conversation_id) === String(activeConversationId),
    );
  }, [allParticipants, activeConversationId]);

  // Reactions indexed by message_id
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, SyncedMessageReaction[]>();
    for (const r of data.messageReactions) {
      const msgId = String(r.message_id);
      if (!map.has(msgId)) map.set(msgId, []);
      map.get(msgId)!.push(r);
    }
    return map;
  }, [data.messageReactions]);

  // Link previews indexed by message_id (for DM messages)
  const linkPreviewsByMessageId = useMemo(() => {
    const map = new Map<string, SyncedLinkPreview[]>();
    for (const lp of data.linkPreviews) {
      const msgId = lp.message_id ? String(lp.message_id) : null;
      if (!msgId) continue;
      if (!map.has(msgId)) map.set(msgId, []);
      map.get(msgId)!.push(lp);
    }
    return map;
  }, [data.linkPreviews]);

  // Unread counts
  const getUnreadCount = useCallback(
    (conv: SyncedConversation): number => {
      if (!currentUserId) return 0;
      const myParticipant = data.conversationParticipants.find(
        (p) =>
          String(p.conversation_id) === String(conv.id) &&
          String(p.user_id) === String(currentUserId),
      );
      const msgs = data.directMessages.filter(
        (m) =>
          String(m.conversation_id) === String(conv.id) &&
          String(m.user_id) !== String(currentUserId),
      );
      if (!myParticipant || !myParticipant.last_read_at) {
        return msgs.length;
      }
      const lastRead = utcMs(myParticipant.last_read_at);
      return msgs.filter((m) => utcMs(m.created_at) > lastRead).length;
    },
    [data.conversationParticipants, data.directMessages, currentUserId],
  );

  // Total unread for badge
  const totalUnreadCount = useMemo(() => {
    return myConversations.reduce((sum, c) => sum + getUnreadCount(c), 0);
  }, [myConversations, getUnreadCount]);

  const getConversationDisplayName = useCallback(
    (conv: SyncedConversation): string => {
      if (conv.name) return conv.name;
      const participants = allParticipants.filter(
        (p) => String(p.conversation_id) === String(conv.id),
      );
      if (conv.type === 'dm') {
        const other = participants.find((p) => String(p.user_id) !== String(currentUserId));
        if (other) {
          const u = getUser(other.user_id);
          return u?.name || t('colab.fallbackUnknown');
        }
      } else {
        const otherNames = participants
          .filter((p) => String(p.user_id) !== String(currentUserId))
          .map((p) => {
            const u = getUser(p.user_id);
            return u ? u.name.split(' ')[0] : t('colab.fallbackUnknown');
          });
        if (otherNames.length > 0) return otherNames.join(', ');
      }
      return t('colab.fallbackConversation');
    },
    [allParticipants, currentUserId, getUser, t],
  );

  const getLastMessage = useCallback(
    (conv: SyncedConversation): SyncedDirectMessage | undefined => {
      return data.directMessages
        .filter((m) => String(m.conversation_id) === String(conv.id))
        .sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))[0];
    },
    [data.directMessages],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleBack = useCallback(() => {
    setChatView({ type: 'list' });
    setInputText('');
    setDraftAttachments([]);
    setEditingMessageId(null);
    setEditText('');
    setReactionMessageId(null);
  }, []);

  // Android back button/gesture: go back to list when inside a chat
  useEffect(() => {
    if (!isInChat) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [isInChat, handleBack]);

  const openConversation = useCallback((convId: number | string) => {
    setChatView({ type: 'conversation', conversationId: convId });
    setInputText('');
    setDraftAttachments([]);
    // Find the Convex _id for this conversation to call markAsRead
    const conv = data.conversations.find((c) => String(c.id) === String(convId));
    const convexId = (conv as any)?._id;
    if (tenantId && convexId) {
      markAsReadMutation({ tenantId, conversationId: convexId }).catch(() => {});
    }
  }, [data.conversations, tenantId, markAsReadMutation]);

  // Mark as read when messages change while conversation is open
  useEffect(() => {
    if (activeConversationId && conversationMessages.length > 0) {
      const conv = data.conversations.find((c) => String(c.id) === String(activeConversationId));
      const convexId = (conv as any)?._id;
      if (tenantId && convexId) {
        markAsReadMutation({ tenantId, conversationId: convexId }).catch(() => {});
      }
    }
  }, [activeConversationId, conversationMessages.length, data.conversations, tenantId, markAsReadMutation]);

  const sendUploadedAttachments = useCallback(async (attachments: Awaited<ReturnType<typeof pickAndUpload>>) => {
    if (!currentUserId || !tenantId) return;

    const isWorkspaceChat = chatView.type === 'spaceChat';
    const spaceWsId = isWorkspaceChat ? chatView.workspaceId : currentWorkspace?.id;

    if (!isWorkspaceChat && !activeConversationId) return;
    if (isWorkspaceChat && !spaceWsId) return;

    if (attachments.length === 0) return;

    const text = attachments.map((a) => (
      a.fileType.startsWith('image/')
        ? `![${a.fileName}](convex-file:${a.storageId})`
        : `[${a.fileName}](convex-file:${a.storageId})`
    )).join('\n');

    const pendingDm = !isWorkspaceChat && activeConversationId
      ? buildPendingDmMessage(activeConversationId, text)
      : null;
    const pendingWs = isWorkspaceChat && spaceWsId
      ? buildPendingSpaceMessage(spaceWsId, text)
      : null;

    if (pendingDm) {
      setPendingDmMessages((prev) => [pendingDm, ...prev]);
    }
    if (pendingWs) {
      setPendingSpaceMessages((prev) => [pendingWs, ...prev]);
    }

    try {
      if (isWorkspaceChat) {
        const ws = availableWorkspaces.find((w) => String(w.id) === String(spaceWsId));
        const convexWsId = (ws as any)?._id;
        if (!convexWsId) throw new Error('Workspace not found');

        await cvxSendWorkspaceChat({
          tenantId,
          workspaceId: convexWsId as any,
          message: text,
        });
      } else {
        const conv = data.conversations.find((c) => String(c.id) === String(activeConversationId));
        const convexConvId = (conv as any)?._id;
        if (!convexConvId) throw new Error('Conversation not found');

        await cvxSendMessage({ tenantId, conversationId: convexConvId as any, message: text });
      }
    } catch {
      if (pendingDm) {
        setPendingDmMessages((prev) => prev.filter((m) => m.id !== pendingDm.id));
      }
      if (pendingWs) {
        setPendingSpaceMessages((prev) => prev.filter((m) => m.id !== pendingWs.id));
      }
      Alert.alert('Error', t('colab.failedToSendFile', { fileName: attachments[0]?.fileName ?? '' }));
    }
  }, [
    activeConversationId,
    availableWorkspaces,
    chatView,
    currentUserId,
    currentWorkspace,
    cvxSendMessage,
    cvxSendWorkspaceChat,
    data.conversations,
    buildPendingDmMessage,
    buildPendingSpaceMessage,
    setPendingDmMessages,
    setPendingSpaceMessages,
    t,
    tenantId,
  ]);

  const handleVoiceMemoRecorded = useCallback((attachment: Awaited<ReturnType<typeof pickAndUpload>>[number]) => {
    setDraftAttachments((prev) => [...prev, attachment]);
  }, []);

  const voiceMemoRecorder = useVoiceMemoRecorder(uploadFile, handleVoiceMemoRecorded);

  // Attach file to conversation
  const handleAttachFile = useCallback(async () => {
    const attachments = await pickAndUpload();
    await sendUploadedAttachments(attachments);
  }, [pickAndUpload, sendUploadedAttachments]);

  const buildInputMessage = useCallback(() => {
    const parts = [];
    const text = inputText.trim();
    if (text) parts.push(text);
    for (const attachment of draftAttachments) {
      const label = (attachment as any).displayName || (attachment.fileType.startsWith('audio/') ? 'Voice memo' : attachment.fileName);
      parts.push(
        attachment.fileType.startsWith('image/')
          ? `![${label}](convex-file:${attachment.storageId})`
          : `[${label}](convex-file:${attachment.storageId})`,
      );
    }
    return parts.join('\n');
  }, [draftAttachments, inputText]);

  // Send message (DM/group)
  const handleSendConversationMessage = useCallback(async () => {
    const text = buildInputMessage();
    if (!text || !activeConversationId || !currentUserId) return;

    const originalText = inputText.trim();
    const originalAttachments = draftAttachments;
    const pendingMessage = buildPendingDmMessage(activeConversationId, text);
    setPendingDmMessages((prev) => [pendingMessage, ...prev]);
    setInputText('');
    setDraftAttachments([]);
    setIsSending(true);

    try {
      const conv = data.conversations.find((c) => String(c.id) === String(activeConversationId));
      const convexConvId = (conv as any)?._id;
      if (!tenantId || !convexConvId) throw new Error('Conversation not found');

      await cvxSendMessage({
        tenantId,
        conversationId: convexConvId as any,
        message: text,
      });
      // Convex reactive query will show the message automatically
      setTimeout(() => chatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 200);
    } catch (err: any) {
      setPendingDmMessages((prev) => prev.filter((m) => m.id !== pendingMessage.id));
      Alert.alert('Error', err?.message || t('colab.failedToSendMessage'));
      setInputText(originalText);
      setDraftAttachments(originalAttachments);
    } finally {
      setIsSending(false);
    }
  }, [
    buildInputMessage,
    activeConversationId,
    currentUserId,
    tenantId,
    data.conversations,
    cvxSendMessage,
    t,
    buildPendingDmMessage,
    inputText,
    draftAttachments,
  ]);

  // Send workspace chat message
  const handleSendSpaceMessage = useCallback(async () => {
    const text = buildInputMessage();
    const spaceWsId = chatView.type === 'spaceChat' ? chatView.workspaceId : currentWorkspace?.id;
    if (!text || !spaceWsId || !currentUserId) return;

    const originalText = inputText.trim();
    const originalAttachments = draftAttachments;
    const pendingMessage = buildPendingSpaceMessage(spaceWsId, text);
    setPendingSpaceMessages((prev) => [pendingMessage, ...prev]);
    setInputText('');
    setDraftAttachments([]);
    setIsSending(true);

    try {
      const ws = availableWorkspaces.find((w) => String(w.id) === String(spaceWsId));
      const convexWsId = (ws as any)?._id;
      if (!tenantId || !convexWsId) throw new Error('Workspace not found');

      await cvxSendWorkspaceChat({
        tenantId,
        workspaceId: convexWsId as any,
        message: text,
      });
      setTimeout(() => chatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 200);
    } catch (err: any) {
      setPendingSpaceMessages((prev) => prev.filter((m) => m.id !== pendingMessage.id));
      Alert.alert('Error', err?.message || t('colab.failedToSendMessage'));
      setInputText(originalText);
      setDraftAttachments(originalAttachments);
    } finally {
      setIsSending(false);
    }
  }, [
    buildInputMessage,
    chatView,
    currentWorkspace,
    currentUserId,
    tenantId,
    availableWorkspaces,
    cvxSendWorkspaceChat,
    t,
    buildPendingSpaceMessage,
    inputText,
    draftAttachments,
  ]);

  const handleStartConversationCall = useCallback(async (mode: 'audio' | 'video') => {
    if (!activeConversation) return;

    const isGroup = activeConversation.type === 'group';
    const otherParticipant = !isGroup
      ? activeParticipants.find((participant) => String(participant.user_id) !== String(currentUserId))
      : undefined;
    const otherUser = otherParticipant ? getUser(otherParticipant.user_id) : undefined;

    await startConversationCall({
      conversationId: activeConversation.id,
      title: getConversationDisplayName(activeConversation),
      picture: otherUser?.url_picture ?? null,
      mode,
    });
  }, [
    activeConversation,
    activeParticipants,
    currentUserId,
    getConversationDisplayName,
    getUser,
    startConversationCall,
  ]);

  // Edit message
  const handleStartEdit = useCallback((msgId: number, currentText: string) => {
    setEditingMessageId(msgId);
    setEditText(currentText);
    setReactionMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(async (msgType: 'dm' | 'space') => {
    if (!editingMessageId || !editText.trim() || !tenantId) return;
    try {
      // Find Convex _id from the message
      if (msgType === 'dm') {
        const msg = data.directMessages.find((m) => m.id === editingMessageId);
        const convexId = (msg as any)?._id;
        if (convexId) await cvxUpdateMessage({ tenantId, id: convexId as any, message: editText.trim() });
      } else {
        const msg = data.workspaceChat.find((m) => m.id === editingMessageId);
        const convexId = (msg as any)?._id;
        if (convexId) await cvxUpdateWsMessage({ tenantId, id: convexId as any, message: editText.trim() });
      }
    } catch {
      Alert.alert('Error', t('colab.failedToEditMessage'));
    }
    setEditingMessageId(null);
    setEditText('');
  }, [editingMessageId, editText, tenantId, data.directMessages, data.workspaceChat, cvxUpdateMessage, cvxUpdateWsMessage, t]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  // Delete message
  const handleDeleteMessage = useCallback(
    (msgId: number, msgType: 'dm' | 'space') => {
      Alert.alert(t('colab.alertDeleteTitle'), t('colab.alertDeleteMessage'), [
        { text: t('colab.cancelButton'), style: 'cancel' },
        {
          text: t('colab.alertDeleteButton'),
          style: 'destructive',
          onPress: async () => {
            if (!tenantId) return;
            try {
              if (msgType === 'dm') {
                const msg = data.directMessages.find((m) => m.id === msgId);
                const convexId = (msg as any)?._id;
                if (convexId) await cvxDeleteMessage({ tenantId, id: convexId as any });
              } else {
                const msg = data.workspaceChat.find((m) => m.id === msgId);
                const convexId = (msg as any)?._id;
                if (convexId) await cvxDeleteWsMessage({ tenantId, id: convexId as any });
              }
            } catch {
              Alert.alert('Error', t('colab.failedToDeleteMessage'));
            }
          },
        },
      ]);
    },
    [tenantId, data.directMessages, data.workspaceChat, cvxDeleteMessage, cvxDeleteWsMessage, t],
  );

  // Toggle reaction
  const handleToggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      if (!tenantId) return;
      setReactionMessageId(null);
      try {
        // Check if user already reacted with this emoji
        const existing = data.messageReactions.find(
          (r) => r.message_id === String(messageId) && r.emoji === emoji && String(r.user_id) === String(currentUserId),
        );
        if (existing) {
          const convexId = (existing as any)?._id;
          if (convexId) await cvxRemoveReaction({ tenantId, id: convexId as any });
        } else {
          await cvxAddReaction({ tenantId, messageId: String(messageId), emoji });
        }
      } catch {
        // Silently fail
      }
    },
    [tenantId, currentUserId, data.messageReactions, cvxAddReaction, cvxRemoveReaction],
  );

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // New conversation
  // ---------------------------------------------------------------------------

  const handleStartDm = useCallback(
    async (targetUserId: string) => {
      if (!currentUserId) return;
      setIsCreating(true);
      setShowNewChatModal(false);
      setNewChatSearch('');
      try {
        if (!tenantId) throw new Error('Not authenticated');
        // Find Convex _id for target user
        const targetUser = data.users.find((u) => String(u.id) === targetUserId);
        const targetConvexUserId = (targetUser as any)?._id;
        if (!targetConvexUserId) throw new Error('This user is not available for chat yet');

        const result = await cvxCreateConversation({
          tenantId,
          type: 'dm',
          uuid: generateUUID(),
          participantUserIds: [targetConvexUserId as any],
        });
        const convId = result?.conversationId;
        if (!convId) throw new Error('Failed to create conversation');

        // Convex queries will reactively update — just open the conversation
        // Use a short delay to let the reactive query pick up the new data
        setTimeout(() => {
          const newConv = data.conversations.find((c) => (c as any)._id === convId);
          if (newConv) openConversation(newConv.id);
        }, 500);
        setShowNewChatModal(false);
        setNewChatSearch('');
      } catch (err: any) {
        toastRef.current?.show({
          type: 'error',
          title: t('common.error'),
          body: err?.message || t('colab.failedToCreateConversation'),
        });
      } finally {
        setIsCreating(false);
      }
    },
    [currentUserId, tenantId, data.users, data.conversations, openConversation, cvxCreateConversation, t],
  );

  const handleCreateGroup = useCallback(async () => {
    if (!currentUserId || selectedGroupUsers.length < 1) return;
    setIsCreating(true);
    setShowNewChatModal(false);
    setNewChatSearch('');

    const defaultName = selectedGroupUsers
      .map((id) => {
        const u = getUser(id);
        return u ? u.name.split(' ')[0] : t('colab.fallbackUnknown');
      })
      .join(', ');

    try {
      if (!tenantId) throw new Error('Not authenticated');
      const participantUserIds = selectedGroupUsers
        .map((uid) => {
          const u = data.users.find((usr) => String(usr.id) === uid);
          return (u as any)?._id as any;
        })
        .filter(Boolean);
      if (participantUserIds.length !== selectedGroupUsers.length) {
        throw new Error('One or more selected users are not available for group chat yet');
      }
      const result = await cvxCreateConversation({
        tenantId,
        type: 'group',
        name: groupName.trim() || defaultName,
        uuid: generateUUID(),
        participantUserIds,
      });
      const convId = result?.conversationId;
      if (!convId) throw new Error('Failed to create group');
      setTimeout(() => {
        const newConv = data.conversations.find((c) => (c as any)._id === convId);
        if (newConv) openConversation(newConv.id);
      }, 500);
      setShowNewChatModal(false);
      setGroupName('');
      setSelectedGroupUsers([]);
      setNewChatSearch('');
    } catch (err: any) {
      toastRef.current?.show({
        type: 'error',
        title: t('common.error'),
        body: err?.message || t('colab.failedToCreateGroup'),
      });
    } finally {
      setIsCreating(false);
    }
  }, [currentUserId, selectedGroupUsers, groupName, getUser, openConversation, tenantId, data.users, data.conversations, cvxCreateConversation, t]);

  const toggleGroupUser = useCallback((userId: string) => {
    setSelectedGroupUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }, []);

  const availableUsers = useMemo(() => {
    const q = newChatSearch.toLowerCase();
    return data.users
      .filter((u) => Boolean((u as any)._id))
      .filter((u) => String(u.id) !== String(currentUserId))
      .filter((u) => {
        if (!q) return true;
        return (
          u.name.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      });
  }, [data.users, currentUserId, newChatSearch]);

  // ---------------------------------------------------------------------------
  // Shared message bubble renderer
  // ---------------------------------------------------------------------------

  const renderMessageBubble = useCallback(
    ({
      msgId,
      userId,
      message,
      createdAt,
      isMe,
      msgType,
      linkPreviews,
      reactions,
    }: {
      msgId: number;
      userId: number;
      message: string;
      createdAt: string;
      isMe: boolean;
      msgType: 'dm' | 'space';
      linkPreviews?: SyncedLinkPreview[];
      reactions?: SyncedMessageReaction[];
    }) => {
      const sender = getUser(userId);
      const senderName = isMe ? t('colab.senderYou') : sender?.name || t('colab.fallbackUnknown');
      const isEditing = editingMessageId === msgId;
      const messageParts = parseMessageContent(message);
      const isAttachmentOnlyMessage = messageParts.length > 0 && messageParts.every((part) => part.type !== 'text');

      // Group reactions by emoji
      const reactionGroups: { emoji: string; count: number; hasOwn: boolean }[] = [];
      if (reactions && reactions.length > 0) {
        const groups = new Map<string, { emoji: string; count: number; hasOwn: boolean }>();
        for (const r of reactions) {
          const existing = groups.get(r.emoji) || { emoji: r.emoji, count: 0, hasOwn: false };
          existing.count++;
          if (String(r.user_id) === String(currentUserId)) existing.hasOwn = true;
          groups.set(r.emoji, existing);
        }
        reactionGroups.push(...Array.from(groups.values()));
      }

      const readyPreviews = linkPreviews?.filter(
        (lp) => lp.status !== 'failed' && (lp.title || lp.description || lp.image_url),
      );

       return (
        <View
          style={[
            styles.messageRow,
            isMe ? styles.messageRowMe : styles.messageRowOther,
          ]}
        >
          {/* Avatar (left for others only) */}
          {!isMe && (
            <View style={styles.messageAvatarWrap}>
              <UserAvatar user={sender} size={32} primaryColor={primaryColor} />
            </View>
          )}

          <View style={[styles.messageBubbleWrap, !isMe && { flex: 1 }, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
            {/* Sender name + time */}
            <View style={[styles.messageHeader, isMe && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.messageAuthor, { color: colors.text }]}>
                {senderName}
              </Text>
              <Text style={[styles.messageTime, { color: colors.textSecondary }, isMe && { marginRight: 0, marginLeft: 8 }]}>
                {formatMessageTime(createdAt, t)}
              </Text>
            </View>

            {/* Message bubble */}
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
                      color: colors.text,
                      borderColor: primaryColor,
                    },
                  ]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: primaryColor }]}
                    onPress={() => handleSaveEdit(msgType)}
                  >
                    <MaterialIcons name="check" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.08)' }]}
                    onPress={handleCancelEdit}
                  >
                    <MaterialIcons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                {/* Media content rendered outside Pressable so taps work */}
	                {(() => {
	                  const parts = messageParts;
	                  const mediaParts = parts.filter((p) => p.type === 'image' || p.type === 'video' || p.type === 'audio');
	                  const imageParts = mediaParts.filter((p): p is Extract<MessagePart, { type: 'image' }> => p.type === 'image');
	                  const nonImageMediaParts = mediaParts.filter((p) => p.type !== 'image');
	                  if (mediaParts.length === 0) return null;
                    const imageViewerItems = imageParts.map((part) => ({
                      type: 'image' as const,
                      url: part.storageId ? undefined : part.url,
                      storageId: part.storageId,
                      label: part.label,
                    }));
                    const galleryWidth = Math.min(screenWidth * 0.74, 316);
                    const galleryGap = 4;
                    const galleryTileSize = (galleryWidth - galleryGap) / 2;
	                  return (
	                    <View style={[
	                      styles.messageBubble,
	                      { padding: 0, overflow: 'hidden', backgroundColor: 'transparent', borderWidth: 0 },
	                    ]}>
                        {imageParts.length > 1 && (
                          <View style={[styles.imageGalleryGrid, { width: galleryWidth }]}>
                            {imageParts.slice(0, 4).map((part, idx) => {
                              const hiddenCount = imageParts.length - 4;
                              const showOverflow = idx === 3 && hiddenCount > 0;
                              const tileStyle = [
                                styles.imageGalleryTile,
                                { width: galleryTileSize, height: galleryTileSize },
                              ];
                              const overlay = showOverflow ? (
                                <View style={styles.imageGalleryOverflow}>
                                  <Text style={styles.imageGalleryOverflowText}>+{hiddenCount}</Text>
                                </View>
                              ) : null;

                              if (part.storageId) {
                                return (
                                  <ConvexFileGalleryTile
                                    key={`${part.storageId}-${idx}`}
                                    storageId={part.storageId}
                                    style={tileStyle}
                                    onPress={() => setViewerMedia({ items: imageViewerItems, index: idx })}
                                  >
                                    {overlay}
                                  </ConvexFileGalleryTile>
                                );
                              }

                              return (
                                <Pressable
                                  key={`${part.url}-${idx}`}
                                  onPress={() => setViewerMedia({ items: imageViewerItems, index: idx })}
                                  style={tileStyle}
                                >
                                  <ProgressiveImage
                                    uri={part.url}
                                    width={Math.round(galleryTileSize)}
                                    height={Math.round(galleryTileSize)}
                                    mode="fill"
                                    style={StyleSheet.absoluteFill}
                                    contentFit="cover"
                                    cachePolicy="disk"
                                    transition={200}
                                  />
                                  {overlay}
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
	                      {nonImageMediaParts.map((part, idx) => {
	                        if (part.type === 'audio' && part.storageId) {
	                          return (
	                            <ConvexFileAudio
                              key={idx}
                              storageId={part.storageId}
                              isMe={isMe}
                              primaryColor={primaryColor}
                              incomingBackgroundColor={isDarkMode ? 'rgba(31, 36, 34, 0.8)' : '#FFFFFF'}
                              incomingTextColor={colors.textSecondary}
                            />
                          );
                        }
                        if (part.type === 'audio') {
                          return (
                            <VoiceMemoBubble
                              key={idx}
                              uri={part.url}
                              outgoing={isMe}
                              primaryColor={primaryColor}
                              incomingBackgroundColor={isDarkMode ? 'rgba(31, 36, 34, 0.8)' : '#FFFFFF'}
                              incomingTextColor={colors.textSecondary}
                              timeLabel=""
                            />
	                          );
	                        }
                          if (part.type === 'video') {
                            return (
                              <Pressable key={idx} onPress={() => setViewerMedia({ items: [{ type: 'video', url: part.url, label: part.label }], index: 0 })}>
                                <View
                                  style={[
                                    styles.messageVideoThumb,
                                    { width: Math.min(screenWidth * 0.68, 280), height: Math.min(screenWidth * 0.52, 210) },
                                  ]}
                                >
                                  <MaterialIcons name="play-circle-outline" size={40} color="#FFFFFF" />
                                  <Text style={styles.messageVideoLabel} numberOfLines={1}>{part.label || t('colab.videoLabel')}</Text>
                                </View>
                              </Pressable>
                            );
                          }
	                        return null;
	                      })}
                        {imageParts.length === 1 && imageParts.map((part, idx) => {
	                        if (part.storageId) {
	                          return (
	                            <ConvexFileImage
	                              key={idx}
                              storageId={part.storageId}
	                              style={[
	                                styles.messageImage,
	                                { width: Math.min(screenWidth * 0.68, 280), height: Math.min(screenWidth * 0.82, 320) },
	                              ]}
	                              onPress={() => setViewerMedia({ items: imageViewerItems, index: idx })}
	                            />
	                          );
	                        }
	                          const mediaWidth = Math.min(screenWidth * 0.68, 280);
	                          const mediaHeight = Math.min(screenWidth * 0.82, 320);
	                          return (
	                            <Pressable key={idx} onPress={() => setViewerMedia({ items: imageViewerItems, index: idx })}>
	                              <ProgressiveImage
	                                uri={part.url}
	                                width={mediaWidth}
                                height={mediaHeight}
                                mode="fill"
                                style={[
                                  styles.messageImage,
                                  { width: mediaWidth, height: mediaHeight },
                                ]}
                                contentFit="cover"
                                cachePolicy="disk"
                                transition={200}
                              />
	                            </Pressable>
	                          );
	                      })}
	                    </View>
	                  );
                })()}
                {/* Text content wrapped in Pressable for long-press actions */}
                {(() => {
                  const parts = messageParts;
                  const textParts = parts.filter((p) => p.type === 'text' || p.type === 'file');
                  if (textParts.length === 0) return null;
                  return (
                    <Pressable
                      onLongPress={() => {
                        if (msgType === 'dm') {
                          setReactionMessageId(msgId);
                        } else if (isMe) {
                          Alert.alert(t('colab.alertMessageTitle'), undefined, [
                            ...(!isAttachmentOnlyMessage ? [{ text: t('colab.alertEditButton'), onPress: () => handleStartEdit(msgId, message) }] : []),
                            { text: t('colab.alertDeleteButton'), style: 'destructive', onPress: () => handleDeleteMessage(msgId, msgType) },
                            { text: t('colab.cancelButton'), style: 'cancel' },
                          ]);
                        }
                      }}
                    >
                    <View
                      style={[
                        styles.messageBubble,
                        isMe
                          ? {
                              backgroundColor: primaryColor,
                              borderBottomRightRadius: 4,
                            }
                          : {
                              backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.8)' : '#FFFFFF',
                              borderBottomLeftRadius: 4,
                              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
                              borderWidth: 1,
                            },
                      ]}
                    >
                      {textParts.map((part, idx) => (
                        <Text
                          key={idx}
                          style={[
                            styles.messageText,
                            { color: isMe ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {part.type === 'text' ? part.text : part.label || part.url}
                        </Text>
                      ))}
                    </View>
                  </Pressable>
                  );
                })()}
              </View>
            )}

            {/* Link previews */}
            {!isEditing && readyPreviews && readyPreviews.length > 0 && (
              <View style={{ marginTop: 4, maxWidth: '100%' }}>
                {readyPreviews.map((lp) => (
                  <LinkPreviewCard key={lp.id} preview={lp} isDarkMode={isDarkMode} colors={colors} />
                ))}
              </View>
            )}

            {/* Reactions */}
            {!isEditing && reactionGroups.length > 0 && (
              <View style={[styles.reactionsRow, isMe && { justifyContent: 'flex-end' }]}>
                {reactionGroups.map((rg) => (
                  <TouchableOpacity
                    key={rg.emoji}
                    style={[
                      styles.reactionChip,
                      {
                        backgroundColor: rg.hasOwn
                          ? `${primaryColor}25`
                          : isDarkMode
                            ? 'rgba(255,255,255,0.08)'
                            : '#F3EEE4',
                        borderColor: rg.hasOwn ? primaryColor : 'transparent',
                      },
                    ]}
                    onPress={() => handleToggleReaction(msgId, rg.emoji)}
                  >
                    <Text style={styles.reactionChipEmoji}>{rg.emoji}</Text>
                    {rg.count > 1 && (
                      <Text style={[styles.reactionChipCount, { color: colors.textSecondary }]}>
                        {rg.count}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Quick reaction bar on long-press */}
            {reactionMessageId === msgId && (
              <QuickReactionBar
                visible={true}
                onSelect={(emoji) => handleToggleReaction(msgId, emoji)}
                onClose={() => setReactionMessageId(null)}
                isDarkMode={isDarkMode}
              />
            )}

            {/* Long-press actions for own messages */}
            {!isEditing && isMe && msgType === 'dm' && reactionMessageId !== msgId && (
              <View style={[styles.messageActions, { alignSelf: 'flex-end' }]}> 
                {!isAttachmentOnlyMessage && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleStartEdit(msgId, message)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="edit" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteMessage(msgId, msgType)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="delete-outline" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      getUser,
      currentUserId,
      editingMessageId,
      editText,
      reactionMessageId,
      primaryColor,
      isDarkMode,
      colors,
      handleStartEdit,
      handleSaveEdit,
      handleCancelEdit,
      handleDeleteMessage,
      handleToggleReaction,
      t,
    ],
  );

  // ---------------------------------------------------------------------------
  // Chat input component (shared between Spaces and Chats)
  // ---------------------------------------------------------------------------

  const renderChatInput = useCallback(
    (onSend: () => void) => {
      const composerSurfaceColor = isDarkMode ? '#343438' : '#F3F2EF';

      return (
        <View style={{ backgroundColor: colors.surface }}>
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.surface,
                borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            {voiceMemoRecorder.isActive ? (
              <VoiceMemoRecordingBar
                recorder={voiceMemoRecorder}
                primaryColor={primaryColor}
                textColor={colors.text}
                mutedColor={colors.textSecondary}
                surfaceColor={composerSurfaceColor}
              />
            ) : (
              <View
                style={[
                  styles.inputShell,
                  {
                    backgroundColor: composerSurfaceColor,
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.06)',
                  },
                ]}
              >
                <View style={styles.inputDraftColumn}>
                  <VoiceMemoDraftPreview
                    attachments={draftAttachments}
                    onRemove={(index) => setDraftAttachments((prev) => prev.filter((_, i) => i !== index))}
                    recorder={voiceMemoRecorder}
                    primaryColor={primaryColor}
                    textColor={colors.text}
                    mutedColor={colors.textSecondary}
                  />
                  <TextInput
                    style={[
                      styles.textInput,
                      Platform.OS === 'android' && styles.textInputAndroid,
                      {
                        backgroundColor: composerSurfaceColor,
                        color: colors.text,
                      },
                    ]}
                    placeholder={t('colab.messagePlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={inputText}
                    onChangeText={setInputText}
                    onSubmitEditing={onSend}
                    returnKeyType="send"
                    editable={!isSending}
                    multiline
                    blurOnSubmit={false}
                    underlineColorAndroid="transparent"
                  />
                </View>
                {draftAttachments.length === 0 && (
                  <TouchableOpacity
                    style={[
                      styles.attachButton,
                      {
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                      },
                    ]}
                    onPress={handleAttachFile}
                    disabled={uploadingFile}
                  >
                    {uploadingFile ? (
                      <ActivityIndicator size="small" color={primaryColor} />
                    ) : (
                      <MaterialIcons name="attach-file" size={20} color={primaryColor} />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
            <VoiceMemoActionButton
              recorder={voiceMemoRecorder}
              hasContent={!!inputText.trim() || draftAttachments.length > 0}
              showAddRecording={draftAttachments.some((attachment) => attachment.fileType.startsWith('audio/'))}
              isSending={isSending}
              disabled={isSending}
              primaryColor={primaryColor}
              inactiveColor={isDarkMode ? 'rgba(255,255,255,0.08)' : '#D1D5DB'}
              onSend={onSend}
            />
          </View>
          {insets.bottom > 0 && <View style={{ height: insets.bottom }} />}
        </View>
      );
    },
    [draftAttachments, inputText, isSending, primaryColor, isDarkMode, colors, handleAttachFile, uploadingFile, t, voiceMemoRecorder, insets.bottom],
  );

  // ---------------------------------------------------------------------------
  // Render: Tab bar (Spaces / Chats)
  // ---------------------------------------------------------------------------

  const renderTabBar = () => (
    <View
      style={[
        styles.tabBar,
        {
          borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.tabItem,
          activeTab === 'workspaces' && { borderBottomColor: primaryColor, borderBottomWidth: 2 },
        ]}
        onPress={() => setActiveTab('workspaces')}
      >
        <MaterialIcons
          name="workspaces"
          size={18}
          color={activeTab === 'workspaces' ? primaryColor : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: activeTab === 'workspaces' ? primaryColor : colors.textSecondary,
              fontFamily: activeTab === 'workspaces' ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
            },
          ]}
        >
          {t('colab.tabWorkspaces')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.tabItem,
          activeTab === 'chats' && { borderBottomColor: primaryColor, borderBottomWidth: 2 },
        ]}
        onPress={() => setActiveTab('chats')}
      >
        <MaterialIcons
          name="chat"
          size={18}
          color={activeTab === 'chats' ? primaryColor : colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: activeTab === 'chats' ? primaryColor : colors.textSecondary,
              fontFamily: activeTab === 'chats' ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
            },
          ]}
        >
          {t('colab.tabChats')}
        </Text>
        {totalUnreadCount > 0 && (
          <View style={[styles.tabBadge, { backgroundColor: primaryColor }]}>
            <Text style={styles.tabBadgeText}>
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Render: Workspaces tab (list of workspaces)
  // ---------------------------------------------------------------------------

  const renderWorkspacesTab = () => {
    if (showWorkspaceLoadingState) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary, marginTop: 16 }]}>
            {t('colab.loading')}
          </Text>
        </View>
      );
    }

    if (availableWorkspaces.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialIcons
            name="workspaces"
            size={56}
            color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'}
          />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
            {t('colab.noWorkspacesTitle')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {t('colab.noWorkspacesSubtitle')}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={availableWorkspaces}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
        renderItem={({ item: ws }) => {
          return (
            <WorkspaceListItem
              ws={ws}
              tenantId={tenantId}
              currentUserId={currentUserId}
              getUser={getUser}
              userConvexToLegacyId={userConvexToLegacyId}
              workspaceConvexToLegacyId={workspaceConvexToLegacyId}
              cachedMessages={workspaceChatCache[String(ws.id)] ?? []}
              onMessagesLoaded={cacheWorkspaceMessages}
              primaryColor={primaryColor}
              colors={colors}
              isDarkMode={isDarkMode}
              t={t}
              onPress={() => {
                setChatView({ type: 'spaceChat', workspaceId: ws.id });
                setInputText('');
              }}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons
              name="workspaces"
              size={56}
              color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'}
            />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
              {t('colab.noWorkspacesTitle')}
            </Text>
          </View>
        }
      />
    );
  };

  // ---------------------------------------------------------------------------
  // Render: Workspace chat view (entered from workspaces list)
  // ---------------------------------------------------------------------------

  const renderSpaceChatView = () => {
    const spaceWsId = chatView.type === 'spaceChat' ? chatView.workspaceId : null;
    const spaceWs = spaceWsId ? availableWorkspaces.find((w: SyncedWorkspace) => w.id === spaceWsId) : null;
    if (!spaceWs) return null;

    // Messages for this specific workspace (sorted newest-first for inverted list)
    const synced = activeWorkspaceChat.filter((m) => String(m.workspace_id) === String(spaceWs.id));
    const syncedIds = new Set(synced.map((m) => m.uuid));
    const pending = pendingSpaceMessages.filter(
      (m) => String(m.workspace_id) === String(spaceWs.id) && !syncedIds.has(m.uuid),
    );
    const spaceMessages = [...synced, ...pending].sort((a, b) => {
      const diff = utcMs(b.created_at) - utcMs(a.created_at);
      return diff !== 0 ? diff : String(b.id).localeCompare(String(a.id));
    });

    const wsColor = spaceWs.color || primaryColor;

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}
      >
          {/* Header with back arrow */}
          <View
            style={[
              styles.chatHeader,
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          >
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.chatHeaderIcon, { backgroundColor: `${wsColor}20` }]}>
              <MaterialIcons name="forum" size={18} color={wsColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.chatHeaderTitle, { color: colors.text }]} numberOfLines={1}>
                {spaceWs.name}
              </Text>
              <Text style={[styles.chatHeaderSub, { color: colors.textSecondary }]}>
                {t('colab.workspaceChat')}
              </Text>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={chatListRef}
            data={spaceMessages}
            keyExtractor={(item) => String(item.id)}
            inverted
            contentContainerStyle={[
              styles.messagesList,
              spaceMessages.length === 0 && { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 32 }}>
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={48}
                  color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D1D5DB'}
                />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t('colab.noMessagesYet')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('colab.startTheConversation')}</Text>
              </View>
            }
            renderItem={({ item: msg }) => {
              const isMe = String(msg.user_id) === String(currentUserId);
              const previews = linkPreviewsByWsChatId.get(String(msg.id)) || [];
              return renderMessageBubble({
                msgId: msg.id,
                userId: msg.user_id,
                message: msg.message,
                createdAt: msg.created_at,
                isMe,
                msgType: 'space',
                linkPreviews: previews,
              });
            }}
          />

          {/* Input */}
          <KeyboardStickyView enabled={Platform.OS === 'android'} offset={{ opened: insets.bottom }}>
            {renderChatInput(handleSendSpaceMessage)}
          </KeyboardStickyView>
      </KeyboardAvoidingView>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: Chats tab (conversation list)
  // ---------------------------------------------------------------------------

  const renderConversationItem = useCallback(
    ({ item: conv }: { item: SyncedConversation }) => {
      const displayName = getConversationDisplayName(conv);
      const lastMsg = getLastMessage(conv);
      const unread = getUnreadCount(conv);
      const isGroup = conv.type === 'group';

      let otherUser: SyncedUser | undefined;
      if (!isGroup) {
        const other = allParticipants.find(
          (p) =>
            String(p.conversation_id) === String(conv.id) &&
            String(p.user_id) !== String(currentUserId),
        );
        if (other) otherUser = getUser(other.user_id);
      }

      let preview = t('colab.tapToStartConversation');
      if (lastMsg) {
        const sender = getUser(lastMsg.user_id);
        const senderName =
          String(lastMsg.user_id) === String(currentUserId)
            ? t('colab.senderYou')
            : sender?.name.split(' ')[0] || t('colab.fallbackSomeone');
        const msgText = formatPreviewMessage(lastMsg.message, t);
        preview = isGroup ? `${senderName}: ${msgText}` : msgText;
      }

      return (
        <TouchableOpacity
          style={[
            styles.conversationItem,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => openConversation(conv.id)}
        >
          {isGroup ? (
            <View style={[styles.groupAvatar, { backgroundColor: `${primaryColor}20` }]}>
              <MaterialIcons name="group" size={20} color={primaryColor} />
            </View>
          ) : (
            <View style={{ marginRight: 14 }}>
              <UserAvatar user={otherUser} name={displayName} size={44} primaryColor={primaryColor} />
            </View>
          )}

          <View style={styles.conversationInfo}>
            <View style={styles.conversationTopRow}>
              <Text
                style={[
                  styles.conversationName,
                  { color: colors.text },
                  unread > 0 && { fontFamily: fontFamilies.bodyBold },
                ]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {lastMsg && (
                <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
                  {formatConversationTime(lastMsg.created_at, t)}
                </Text>
              )}
            </View>
            <View style={styles.conversationBottomRow}>
              <Text
                style={[
                  styles.conversationPreview,
                  { color: colors.textSecondary },
                  unread > 0 && { color: colors.text, fontFamily: fontFamilies.bodyMedium },
                ]}
                numberOfLines={1}
              >
                {preview}
              </Text>
              {unread > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: primaryColor }]}>
                  <Text style={styles.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [
      getConversationDisplayName, getLastMessage, getUnreadCount, getUser,
      allParticipants, currentUserId, isDarkMode, primaryColor,
      colors, openConversation, t,
    ],
  );

  const renderChatsTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          <MaterialIcons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('colab.searchConversationsPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderConversationItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons
              name="chat-bubble-outline"
              size={56}
              color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'}
            />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
              {t('colab.noConversationsTitle')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('colab.noConversationsSubtitle')}
            </Text>
          </View>
        }
      />

      {/* New chat FAB */}
      <TouchableOpacity
        style={[styles.newChatFab, { backgroundColor: primaryColor }]}
        onPress={() => {
          setShowNewChatModal(true);
          setNewChatMode('dm');
          setNewChatSearch('');
          setSelectedGroupUsers([]);
          setGroupName('');
        }}
      >
        <MaterialIcons name="edit" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Render: Conversation chat view (DM/group)
  // ---------------------------------------------------------------------------

  const renderConversationChatView = () => {
    if (!activeConversation) {
      return (
        <View style={{ flex: 1 }}>
          <View
            style={[
              styles.chatHeader,
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          >
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.chatHeaderTitle, { color: colors.text }]}>{t('colab.loading')}</Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        </View>
      );
    }
    const displayName = getConversationDisplayName(activeConversation);
    const isGroup = activeConversation.type === 'group';
    const participantCount = activeParticipants.length;

    // Get other user for DM header avatar
    let otherUser: SyncedUser | undefined;
    if (!isGroup) {
      const other = activeParticipants.find((p) => String(p.user_id) !== String(currentUserId));
      if (other) otherUser = getUser(other.user_id);
    }

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}
      >
          {/* Chat header */}
          <View
            style={[
              styles.chatHeader,
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          >
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            {isGroup ? (
              <View style={[styles.chatHeaderIcon, { backgroundColor: `${primaryColor}20` }]}>
                <MaterialIcons name="group" size={18} color={primaryColor} />
              </View>
            ) : (
              <View style={{ marginRight: 10 }}>
                <UserAvatar user={otherUser} name={displayName} size={34} primaryColor={primaryColor} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.chatHeaderTitle, { color: colors.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.chatHeaderSub, { color: colors.textSecondary }]}>
                {isGroup
                  ? (participantCount !== 1 ? t('colab.memberCountPlural', { count: participantCount }) : t('colab.memberCount', { count: participantCount }))
                  : t('colab.directMessage')}
              </Text>
            </View>
            <View style={styles.chatHeaderActions}>
              <TouchableOpacity
                style={[
                  styles.chatHeaderActionButton,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : `${primaryColor}12`,
                    opacity: isCallActive ? 0.55 : 1,
                  },
                ]}
                onPress={() => { void handleStartConversationCall('audio'); }}
                disabled={isCallActive}
              >
                <MaterialIcons name="call" size={20} color={primaryColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chatHeaderActionButton,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : `${primaryColor}12`,
                    opacity: isCallActive ? 0.55 : 1,
                  },
                ]}
                onPress={() => { void handleStartConversationCall('video'); }}
                disabled={isCallActive}
              >
                <MaterialIcons name="videocam" size={20} color={primaryColor} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={chatListRef}
            data={conversationMessages}
            keyExtractor={(item) => String(item.id)}
            inverted
            contentContainerStyle={[
              styles.messagesList,
              conversationMessages.length === 0 && { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 32 }}>
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={48}
                  color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D1D5DB'}
                />
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t('colab.noMessagesYet')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('colab.startTheConversation')}</Text>
              </View>
            }
            renderItem={({ item: msg }) => {
              const isMe = String(msg.user_id) === String(currentUserId);
              const reactions = reactionsByMessageId.get(String(msg.id)) || [];
              const previews = linkPreviewsByMessageId.get(String(msg.id)) || [];
              return renderMessageBubble({
                msgId: msg.id,
                userId: msg.user_id,
                message: msg.message,
                createdAt: msg.created_at,
                isMe,
                msgType: 'dm',
                linkPreviews: previews,
                reactions,
              });
            }}
          />

          {/* Input */}
          <KeyboardStickyView enabled={Platform.OS === 'android'} offset={{ opened: insets.bottom }}>
            {renderChatInput(handleSendConversationMessage)}
          </KeyboardStickyView>
      </KeyboardAvoidingView>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: New chat modal
  // ---------------------------------------------------------------------------

  const renderNewChatModal = () => (
    <Modal
      visible={showNewChatModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowNewChatModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                setShowNewChatModal(false);
                setNewChatSearch('');
                setSelectedGroupUsers([]);
                setGroupName('');
              }}
            >
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>{t('colab.cancelButton')}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('colab.newChatTitle')}</Text>
            {newChatMode === 'group' ? (
              <TouchableOpacity
                onPress={handleCreateGroup}
                disabled={selectedGroupUsers.length === 0 || isCreating}
              >
                <Text
                  style={[
                    styles.modalCreate,
                    {
                      color:
                        selectedGroupUsers.length > 0 && !isCreating
                          ? primaryColor
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {isCreating ? t('colab.creatingButton') : t('colab.createButton')}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 50 }} />
            )}
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                newChatMode === 'dm' && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                newChatMode !== 'dm' && { borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)' },
              ]}
              onPress={() => {
                setNewChatMode('dm');
                setSelectedGroupUsers([]);
              }}
            >
              <MaterialIcons
                name="person"
                size={16}
                color={newChatMode === 'dm' ? primaryColor : colors.textSecondary}
              />
              <Text
                style={[
                  styles.modeButtonText,
                  { color: newChatMode === 'dm' ? primaryColor : colors.textSecondary },
                ]}
              >
                {t('colab.directMessageMode')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                newChatMode === 'group' && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                newChatMode !== 'group' && { borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)' },
              ]}
              onPress={() => setNewChatMode('group')}
            >
              <MaterialIcons
                name="group"
                size={16}
                color={newChatMode === 'group' ? primaryColor : colors.textSecondary}
              />
              <Text
                style={[
                  styles.modeButtonText,
                  { color: newChatMode === 'group' ? primaryColor : colors.textSecondary },
                ]}
              >
                {t('colab.groupChatMode')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {newChatMode === 'group' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('colab.groupNameLabel')}</Text>
                <TextInput
                  style={[
                    styles.groupNameInput,
                    {
                      backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
                      color: colors.text,
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                  placeholder={t('colab.groupNamePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={groupName}
                  onChangeText={setGroupName}
                />
                {selectedGroupUsers.length > 0 && (
                  <Text style={[styles.selectedCount, { color: primaryColor }]}>
                    {t('colab.selectedCount', { count: selectedGroupUsers.length })}
                  </Text>
                )}
              </>
            )}

            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.08)',
                  marginTop: newChatMode === 'group' ? 16 : 0,
                },
              ]}
            >
              <MaterialIcons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('colab.searchPeoplePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={newChatSearch}
                onChangeText={setNewChatSearch}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              {availableUsers.map((u) => {
                const userId = String(u.id);
                const isSelected = selectedGroupUsers.includes(userId);
                return (
                  <TouchableOpacity
                    key={String(u.id)}
                    style={[
                      styles.userRow,
                      {
                        backgroundColor:
                          newChatMode === 'group' && isSelected
                            ? `${primaryColor}12`
                            : isDarkMode
                              ? 'rgba(255,255,255,0.03)'
                              : 'rgba(255,255,255,0.5)',
                        borderColor:
                          newChatMode === 'group' && isSelected
                            ? `${primaryColor}40`
                            : isDarkMode
                              ? 'rgba(255,255,255,0.06)'
                              : 'rgba(0, 0, 0, 0.08)',
                      },
                    ]}
                    onPress={() => {
                      if (newChatMode === 'dm') {
                        handleStartDm(userId);
                      } else {
                        toggleGroupUser(userId);
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={isCreating}
                  >
                    <View style={{ marginRight: 12 }}>
                      <UserAvatar user={u} size={36} primaryColor={primaryColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: colors.text }]}>{u.name}</Text>
                      {u.email ? (
                        <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                          {u.email}
                        </Text>
                      ) : null}
                    </View>
                    {newChatMode === 'group' && (
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: isSelected ? primaryColor : colors.textSecondary,
                            backgroundColor: isSelected ? primaryColor : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && <MaterialIcons name="check" size={14} color="#FFFFFF" />}
                      </View>
                    )}
                    {newChatMode === 'dm' && (
                      <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {availableUsers.length === 0 && (
                <Text style={[styles.noResults, { color: colors.textSecondary }]}>
                  {newChatSearch ? t('colab.noMatchingPeople', { query: newChatSearch }) : t('colab.noTeamMembers')}
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  // Determine what to render based on chatView
	  const imageViewerModal = (
	    <Modal
	      visible={!!viewerMedia}
	      transparent
	      animationType="fade"
	      onRequestClose={() => setViewerMedia(null)}
	    >
	      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
	        <TouchableOpacity
	          style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 }}
	          onPress={() => setViewerMedia(null)}
	        >
	          <MaterialIcons name="close" size={28} color="#FFFFFF" />
	        </TouchableOpacity>
          {viewerMedia && viewerMedia.items.length > 1 && (
            <View style={styles.viewerCounter}>
              <Text style={styles.viewerCounterText}>{viewerMedia.index + 1} / {viewerMedia.items.length}</Text>
            </View>
          )}
	        {viewerMedia && (
            <FlatList
              key={`viewer-${viewerMedia.items.length}-${viewerMedia.index}`}
              data={viewerMedia.items}
              horizontal
              pagingEnabled
              initialScrollIndex={viewerMedia.index}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, screenWidth));
                setViewerMedia((current) => current ? { ...current, index: nextIndex } : current);
              }}
              renderItem={({ item }) => (
                <View style={[styles.viewerPage, { width: screenWidth }]}>
                  {item.type === 'image' && item.storageId && (
                    <ConvexFileViewerImage storageId={item.storageId} width={screenWidth * 0.95} height={screenHeight * 0.8} />
                  )}
                  {item.type === 'image' && item.url && (
                    <ProgressiveImage
                      uri={item.url}
                      width={Math.round(screenWidth * 0.95)}
                      height={Math.round(screenHeight * 0.8)}
                      mode="fit"
                      style={{ width: screenWidth * 0.95, height: screenHeight * 0.8 }}
                      contentFit="contain"
                      cachePolicy="disk"
                    />
                  )}
                  {item.type === 'video' && item.url && (
                    <InlineVideoPlayer url={item.url} />
                  )}
                </View>
              )}
            />
	        )}
	      </View>
	    </Modal>
	  );

  if (chatView.type === 'conversation') {
    return (
      <View style={{ flex: 1 }}>
        {renderConversationChatView()}
        {renderNewChatModal()}
        {imageViewerModal}
        <AttachmentPickerSheet {...attachmentPickerProps} />
        <Toast ref={toastRef} />
      </View>
    );
  }

  if (chatView.type === 'spaceChat') {
    return (
      <View style={{ flex: 1 }}>
        {renderSpaceChatView()}
        {imageViewerModal}
        <AttachmentPickerSheet {...attachmentPickerProps} />
        <Toast ref={toastRef} />
      </View>
    );
  }

  // List view with tabs
  return (
    <View style={{ flex: 1 }}>
      {renderTabBar()}
      <Animated.View
        {...tabPanResponder.panHandlers}
        style={[{ flexDirection: 'row', flex: 1, width: screenWidth * 2 }, tabSlideStyle]}
      >
        <View style={{ width: screenWidth, flex: 1 }}>
          {renderWorkspacesTab()}
        </View>
        <View style={{ width: screenWidth, flex: 1 }}>
          {renderChatsTab()}
        </View>
      </Animated.View>
      {renderNewChatModal()}
      {imageViewerModal}
      <AttachmentPickerSheet {...attachmentPickerProps} />
      <Toast ref={toastRef} />
    </View>
  );
};

export { ColabScreen as default };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: fontSizes.sm,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamilies.bodyBold,
  },

  // Conversation list
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl + 80,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationName: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    marginRight: 8,
  },
  conversationTime: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  conversationBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  conversationPreview: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginRight: 8,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: fontFamilies.bodyBold,
  },

  // Avatars
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    padding: 0,
  },

  // FAB
  newChatFab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lifted,
  },

  // Chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  chatHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  chatHeaderTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  chatHeaderSub: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  chatHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  chatHeaderActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Messages
  messagesList: {
    padding: spacing.md,
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  messageRowMe: {
    alignSelf: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  messageAvatarWrap: {
    marginTop: 2,
    marginHorizontal: 6,
  },
  messageBubbleWrap: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  messageAuthor: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  messageTime: {
    marginLeft: 8,
    fontSize: 10,
    fontFamily: fontFamilies.bodyMedium,
  },
  messageBubble: {
    borderRadius: radius.md,
    padding: 10,
    paddingHorizontal: 14,
  },
  messageText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  voiceLoadingBubble: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 230,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageImage: {
    width: 220,
    height: 180,
    borderRadius: radius.md,
    marginVertical: 4,
  },
  imageGalleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 4,
  },
  imageGalleryTile: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  galleryImageLoading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageGalleryOverflow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
    justifyContent: 'center',
  },
  imageGalleryOverflowText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodyBold,
    fontSize: 36,
  },
  viewerPage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImageStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCounter: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'absolute',
    top: 56,
    zIndex: 10,
  },
  viewerCounterText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 13,
  },
  messageVideoThumb: {
    width: 220,
    height: 140,
    borderRadius: radius.md,
    marginVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageVideoLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
    marginTop: 4,
  },

  // Message actions (edit/delete icons below own messages)
  messageActions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
    opacity: 0.6,
  },
  actionBtn: {
    padding: 4,
  },

  // Edit
  editContainer: {
    gap: 6,
  },
  editInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    maxHeight: 80,
  },
  editActions: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  reactionChipEmoji: {
    fontSize: 14,
  },
  reactionChipCount: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 2,
  },

  // Quick reaction bar
  reactionOverlay: {
    position: 'absolute',
    top: -44,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  reactionBar: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...shadows.lifted,
  },
  reactionOption: {
    padding: 4,
    marginHorizontal: 2,
  },
  reactionEmoji: {
    fontSize: 22,
  },

  // Link preview
  linkPreviewCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: 280,
    marginTop: 4,
  },
  linkPreviewImage: {
    width: '100%',
    height: 120,
  },
  linkPreviewContent: {
    padding: 10,
  },
  linkPreviewSite: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  linkPreviewTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    lineHeight: 18,
  },
  linkPreviewDesc: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 16,
    marginTop: 2,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    ...shadows.subtle,
  },
  inputDraftColumn: {
    flex: 1,
  },
  draftAttachment: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 8,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  draftAttachmentText: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    maxHeight: 100,
  },
  textInputAndroid: {
    paddingTop: 0,
    paddingBottom: 0,
    marginVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  attachButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    marginLeft: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
  noResults: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    paddingVertical: 12,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  modalTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  modalCreate: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  modeButtonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Form fields
  fieldLabel: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  groupNameInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  selectedCount: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    marginTop: 8,
  },

  // User rows
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  userName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  userEmail: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
