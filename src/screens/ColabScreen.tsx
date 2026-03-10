import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// KeyboardAvoidingView is handled by the parent navigator
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '../context/ThemeContext';
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
import { apiClient } from '../services/apiClient';
import * as DB from '../store/database';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { getInitials } from '../utils/helpers';

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

function formatMessageTime(ts: string | null | undefined): string {
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
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function formatConversationTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const normalized = ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays}d`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/** Markdown link pattern: [label](url) */
const MD_LINK_REGEX = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const VIDEO_EXTS = /\.(mp4|mov|webm|avi|mkv)$/i;

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; label: string }
  | { type: 'video'; url: string; label: string };

/** Parse a message string into parts: plain text, images, videos */
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
    const label = match[1];
    const url = match[2];
    if (IMAGE_EXTS.test(url) || IMAGE_EXTS.test(label)) {
      parts.push({ type: 'image', url, label });
    } else if (VIDEO_EXTS.test(url) || VIDEO_EXTS.test(label)) {
      parts.push({ type: 'video', url, label });
    } else {
      // Generic file link -- render as text link
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
  | { type: 'conversation'; conversationId: number }
  | { type: 'spaceChat'; workspaceId: number };

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
        source={{ uri: imageUrl }}
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
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7',
        },
      ]}
      activeOpacity={0.7}
      onPress={handlePress}
    >
      {preview.image_url && (
        <ExpoImage
          source={{ uri: preview.image_url }}
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
            borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E6E0D7',
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ColabScreenProps {
  onChatViewChange?: (isInChat: boolean) => void;
}

export const ColabScreen: React.FC<ColabScreenProps> = ({ onChatViewChange }) => {
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { data, isSyncing, refresh } = useData();
  const { user: authUser } = useAuth();
  const { selectedWorkspace, workspaceObjects } = useTasks();

  const [activeTab, setActiveTab] = useState<ColabTab>('workspaces');
  const { width: screenWidth } = useWindowDimensions();

  // Swipe between tabs using PanResponder (doesn't steal focus from TextInput)
  const tabTranslateX = useSharedValue(0);

  useEffect(() => {
    tabTranslateX.value = withTiming(activeTab === 'workspaces' ? 0 : -screenWidth, { duration: 250 });
  }, [activeTab, screenWidth]);

  const tabSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabTranslateX.value }],
  }));

  const tabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gs: PanResponderGestureState) =>
          Math.abs(gs.dx) > 25 && Math.abs(gs.dy) < 20,
        onPanResponderRelease: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
          const THRESHOLD = screenWidth * 0.2;
          if (gs.dx < -THRESHOLD && activeTab === 'workspaces') {
            setActiveTab('chats');
          } else if (gs.dx > THRESHOLD && activeTab === 'chats') {
            setActiveTab('workspaces');
          }
        },
      }),
    [activeTab, screenWidth],
  );

  const [chatView, setChatView] = useState<ChatView>({ type: 'list' });
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const chatListRef = useRef<FlatList>(null);

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
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const currentUserId = authUser?.id ?? 0;

  // Clean up pending messages once sync has picked them up
  useEffect(() => {
    if (pendingDmMessages.length > 0) {
      const syncedUuids = new Set(data.directMessages.map((m) => m.uuid));
      setPendingDmMessages((prev) => prev.filter((m) => !syncedUuids.has(m.uuid)));
    }
  }, [data.directMessages]);

  useEffect(() => {
    if (pendingSpaceMessages.length > 0) {
      const syncedUuids = new Set(data.workspaceChat.map((m) => m.uuid));
      setPendingSpaceMessages((prev) => prev.filter((m) => !syncedUuids.has(m.uuid)));
    }
  }, [data.workspaceChat]);

  // Notify parent when chat view changes (for hiding bottom bar)
  const isInChat = chatView.type !== 'list';
  useEffect(() => {
    onChatViewChange?.(isInChat);
  }, [isInChat, onChatViewChange]);



  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const userMap = useMemo(() => {
    const m = new Map<number, SyncedUser>();
    for (const u of data.users) m.set(Number(u.id), u);
    return m;
  }, [data.users]);

  const getUser = useCallback(
    (id: number | string): SyncedUser | undefined => userMap.get(Number(id)),
    [userMap],
  );

  // Current workspace object
  const currentWorkspace = useMemo((): SyncedWorkspace | null => {
    if (selectedWorkspace === 'Everything') return null;
    return workspaceObjects.find((w: SyncedWorkspace) => w.name === selectedWorkspace) || null;
  }, [selectedWorkspace, workspaceObjects]);

  // ---- Workspace chat data ----

  // Link previews indexed by workspace_chat_id
  const linkPreviewsByWsChatId = useMemo(() => {
    const map = new Map<number, SyncedLinkPreview[]>();
    for (const lp of data.linkPreviews) {
      const chatId = lp.workspace_chat_id ? Number(lp.workspace_chat_id) : null;
      if (!chatId) continue;
      if (!map.has(chatId)) map.set(chatId, []);
      map.get(chatId)!.push(lp);
    }
    return map;
  }, [data.linkPreviews]);

  // ---- Chats tab data (DM/group conversations) ----

  // Merge synced conversations with locally-created ones (dedupe by id)
  const allConversations = useMemo(() => {
    const syncedIds = new Set(data.conversations.map((c) => Number(c.id)));
    const extras = localConversations.filter((c) => !syncedIds.has(Number(c.id)));
    return [...data.conversations, ...extras];
  }, [data.conversations, localConversations]);

  // Merge synced + local participants for lookups
  const allParticipants = useMemo(() => {
    const syncedKeys = new Set(data.conversationParticipants.map((p) => `${p.conversation_id}-${p.user_id}`));
    const extras = localParticipants.filter((p) => !syncedKeys.has(`${p.conversation_id}-${p.user_id}`));
    return [...data.conversationParticipants, ...extras];
  }, [data.conversationParticipants, localParticipants]);

  const myConversations = useMemo(() => {
    const myConvIds = new Set(
      allParticipants
        .filter((p) => Number(p.user_id) === Number(currentUserId))
        .map((p) => Number(p.conversation_id)),
    );
    return allConversations
      .filter((c) => myConvIds.has(Number(c.id)))
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
        (p) => Number(p.conversation_id) === Number(conv.id),
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
    const synced = data.directMessages.filter((m) => Number(m.conversation_id) === activeConversationId);
    // Merge pending messages that aren't yet in synced data
    const syncedIds = new Set(synced.map((m) => m.uuid));
    const pending = pendingDmMessages.filter(
      (m) => Number(m.conversation_id) === activeConversationId && !syncedIds.has(m.uuid),
    );
    // Sort newest-first for inverted FlatList
    return [...synced, ...pending].sort((a, b) => {
      const diff = utcMs(b.created_at) - utcMs(a.created_at);
      return diff !== 0 ? diff : Number(b.id) - Number(a.id);
    });
  }, [data.directMessages, activeConversationId, pendingDmMessages]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return allConversations.find((c) => Number(c.id) === activeConversationId) || null;
  }, [allConversations, activeConversationId]);

  const activeParticipants = useMemo(() => {
    if (!activeConversationId) return [];
    return allParticipants.filter(
      (p) => Number(p.conversation_id) === activeConversationId,
    );
  }, [allParticipants, activeConversationId]);

  // Reactions indexed by message_id
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<number, SyncedMessageReaction[]>();
    for (const r of data.messageReactions) {
      const msgId = Number(r.message_id);
      if (!map.has(msgId)) map.set(msgId, []);
      map.get(msgId)!.push(r);
    }
    return map;
  }, [data.messageReactions]);

  // Link previews indexed by message_id (for DM messages)
  const linkPreviewsByMessageId = useMemo(() => {
    const map = new Map<number, SyncedLinkPreview[]>();
    for (const lp of data.linkPreviews) {
      const msgId = lp.message_id ? Number(lp.message_id) : null;
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
          Number(p.conversation_id) === Number(conv.id) &&
          Number(p.user_id) === Number(currentUserId),
      );
      const msgs = data.directMessages.filter(
        (m) =>
          Number(m.conversation_id) === Number(conv.id) &&
          Number(m.user_id) !== Number(currentUserId),
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
        (p) => Number(p.conversation_id) === Number(conv.id),
      );
      if (conv.type === 'dm') {
        const other = participants.find((p) => Number(p.user_id) !== Number(currentUserId));
        if (other) {
          const u = getUser(other.user_id);
          return u?.name || 'Unknown';
        }
      } else {
        const otherNames = participants
          .filter((p) => Number(p.user_id) !== Number(currentUserId))
          .map((p) => {
            const u = getUser(p.user_id);
            return u ? u.name.split(' ')[0] : 'Unknown';
          });
        if (otherNames.length > 0) return otherNames.join(', ');
      }
      return 'Conversation';
    },
    [allParticipants, currentUserId, getUser],
  );

  const getLastMessage = useCallback(
    (conv: SyncedConversation): SyncedDirectMessage | undefined => {
      return data.directMessages
        .filter((m) => Number(m.conversation_id) === Number(conv.id))
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

  const openConversation = useCallback((convId: number) => {
    setChatView({ type: 'conversation', conversationId: convId });
    setInputText('');
    apiClient.markConversationRead(convId).catch(() => {});
  }, []);

  // Mark as read when messages change while conversation is open
  useEffect(() => {
    if (activeConversationId && conversationMessages.length > 0) {
      apiClient.markConversationRead(activeConversationId).catch(() => {});
    }
  }, [activeConversationId, conversationMessages.length]);

  // Send message (DM/group)
  const handleSendConversationMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !activeConversationId || !currentUserId) return;

    const uuid = generateUUID();
    const now = new Date().toISOString();

    // Optimistic: inject message locally immediately
    const optimisticMsg: SyncedDirectMessage = {
      id: -(Date.now()), // negative temp ID
      uuid,
      conversation_id: activeConversationId,
      user_id: currentUserId,
      message: text,
      status: 'sending',
      created_at: now,
      updated_at: now,
    };
    setPendingDmMessages((prev) => [...prev, optimisticMsg]);

    setInputText('');
    setIsSending(true);

    // Scroll to bottom (index 0 in inverted list)
    setTimeout(() => chatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);

    try {
      await apiClient.sendDirectMessage({
        uuid,
        conversation_id: activeConversationId,
        user_id: currentUserId,
        message: text,
        status: 'sent',
      });

      // Push notifications
      const otherParticipants = activeParticipants.filter(
        (p) => Number(p.user_id) !== Number(currentUserId),
      );
      if (otherParticipants.length > 0) {
        const chatType = activeConversation?.type === 'group' ? 'group' : 'dm';
        if (chatType === 'dm') {
          apiClient
            .sendMessageNotification({
              recipient_user_id: otherParticipants[0].user_id,
              message: text,
              chat_type: 'dm',
              chat_id: String(activeConversationId),
            })
            .catch(() => {});
        } else {
          apiClient
            .sendMessageNotification({
              recipient_user_ids: otherParticipants.map((p) => p.user_id),
              message: text,
              chat_type: 'group',
              chat_id: String(activeConversationId),
            })
            .catch(() => {});
        }
      }

      // Sync in background to confirm the message
      refresh().catch(() => {});
    } catch (err: any) {
      console.warn('[Chat] Failed to send message:', err?.message || err);
      // Remove optimistic message on failure
      setPendingDmMessages((prev) => prev.filter((m) => m.uuid !== uuid));
      Alert.alert('Error', err?.message || 'Failed to send message');
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }, [inputText, activeConversationId, currentUserId, activeParticipants, activeConversation, refresh]);

  // Send workspace chat message
  const handleSendSpaceMessage = useCallback(async () => {
    const text = inputText.trim();
    const spaceWsId = chatView.type === 'spaceChat' ? chatView.workspaceId : currentWorkspace?.id;
    if (!text || !spaceWsId || !currentUserId) return;

    const uuid = generateUUID();
    const now = new Date().toISOString();

    // Optimistic: inject message locally immediately
    const optimisticMsg: SyncedWorkspaceChat = {
      id: -(Date.now()),
      uuid,
      workspace_id: spaceWsId,
      message: text,
      user_id: currentUserId,
      created_at: now,
      updated_at: now,
    };
    setPendingSpaceMessages((prev) => [...prev, optimisticMsg]);

    setInputText('');
    setIsSending(true);

    // Scroll to bottom (index 0 in inverted list)
    setTimeout(() => chatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);

    try {
      await apiClient.sendWorkspaceChatMessage({
        uuid,
        workspace_id: spaceWsId,
        message: text,
        user_id: currentUserId,
      });

      // Sync in background to confirm the message
      refresh().catch(() => {});
    } catch (err: any) {
      console.warn('[SpaceChat] Failed to send message:', err?.message || err);
      setPendingSpaceMessages((prev) => prev.filter((m) => m.uuid !== uuid));
      Alert.alert('Error', err?.message || 'Failed to send message');
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }, [inputText, chatView, currentWorkspace, currentUserId, refresh]);

  // Edit message
  const handleStartEdit = useCallback((msgId: number, currentText: string) => {
    setEditingMessageId(msgId);
    setEditText(currentText);
    setReactionMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(async (msgType: 'dm' | 'space') => {
    if (!editingMessageId || !editText.trim()) return;
    try {
      if (msgType === 'dm') {
        await apiClient.updateDirectMessage(editingMessageId, { message: editText.trim() });
      } else {
        await apiClient.updateWorkspaceChatMessage(editingMessageId, { message: editText.trim() });
      }
      await refresh();
    } catch {
      Alert.alert('Error', 'Failed to edit message');
    }
    setEditingMessageId(null);
    setEditText('');
  }, [editingMessageId, editText, refresh]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  // Delete message
  const handleDeleteMessage = useCallback(
    (msgId: number, msgType: 'dm' | 'space') => {
      Alert.alert('Delete Message', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (msgType === 'dm') {
                await apiClient.deleteDirectMessage(msgId);
              } else {
                await apiClient.deleteWorkspaceChatMessage(msgId);
              }
              await refresh();
            } catch {
              Alert.alert('Error', 'Failed to delete message');
            }
          },
        },
      ]);
    },
    [refresh],
  );

  // Toggle reaction
  const handleToggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      setReactionMessageId(null);
      try {
        await apiClient.toggleMessageReaction({ message_id: messageId, emoji });
        await refresh();
      } catch {
        // Silently fail
      }
    },
    [refresh],
  );

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // New conversation
  // ---------------------------------------------------------------------------

  const handleStartDm = useCallback(
    async (targetUserId: number) => {
      if (!currentUserId) return;
      setIsCreating(true);
      try {
        const result = await apiClient.createConversation({
          uuid: generateUUID(),
          type: 'dm',
          created_by: currentUserId,
          participant_user_ids: [targetUserId],
        });
        if (result?.id) {
          const conv = result as SyncedConversation;
          // Persist to SQLite so DataContext picks it up on next hydrate
          const now = new Date().toISOString();
          const participantIds = [currentUserId, targetUserId];
          await DB.upsertRow('wh_conversations', result.id, conv);
          for (let i = 0; i < participantIds.length; i++) {
            const pid = `${result.id}_${participantIds[i]}`;
            await DB.upsertRow('wh_conversation_participants', pid, {
              id: pid, conversation_id: result.id, user_id: participantIds[i],
              last_read_at: now, is_muted: false, updated_at: now,
            });
          }
          // Also keep in local state for immediate use
          setLocalConversations((prev) => [...prev.filter((c) => c.id !== result.id), conv]);
          setLocalParticipants((prev) => [
            ...prev.filter((p) => Number(p.conversation_id) !== result.id),
            ...participantIds.map((uid, i) => ({
              id: -(result.id * 100 + i),
              conversation_id: result.id,
              user_id: uid,
              last_read_at: now,
              is_muted: false,
              updated_at: now,
            } as SyncedConversationParticipant)),
          ]);
          openConversation(result.id);
        }
        setShowNewChatModal(false);
        setNewChatSearch('');
      } catch {
        Alert.alert('Error', 'Failed to create conversation');
      } finally {
        setIsCreating(false);
      }
    },
    [currentUserId, openConversation],
  );

  const handleCreateGroup = useCallback(async () => {
    if (!currentUserId || selectedGroupUsers.length < 1) return;
    setIsCreating(true);

    const defaultName = selectedGroupUsers
      .map((id) => {
        const u = getUser(id);
        return u ? u.name.split(' ')[0] : 'Unknown';
      })
      .join(', ');

    try {
      const result = await apiClient.createConversation({
        uuid: generateUUID(),
        type: 'group',
        name: groupName.trim() || defaultName,
        created_by: currentUserId,
        participant_user_ids: selectedGroupUsers,
      });
      if (result?.id) {
        const conv = result as SyncedConversation;
        const now = new Date().toISOString();
        const participantIds = [currentUserId, ...selectedGroupUsers];
        await DB.upsertRow('wh_conversations', result.id, conv);
        for (let i = 0; i < participantIds.length; i++) {
          const pid = `${result.id}_${participantIds[i]}`;
          await DB.upsertRow('wh_conversation_participants', pid, {
            id: pid, conversation_id: result.id, user_id: participantIds[i],
            last_read_at: now, is_muted: false, updated_at: now,
          });
        }
        setLocalConversations((prev) => [...prev.filter((c) => c.id !== result.id), conv]);
        setLocalParticipants((prev) => [
          ...prev.filter((p) => Number(p.conversation_id) !== result.id),
          ...participantIds.map((uid, i) => ({
            id: -(result.id * 100 + i),
            conversation_id: result.id,
            user_id: uid,
            last_read_at: now,
            is_muted: false,
            updated_at: now,
          } as SyncedConversationParticipant)),
        ]);
        openConversation(result.id);
      }
      setShowNewChatModal(false);
      setGroupName('');
      setSelectedGroupUsers([]);
      setNewChatSearch('');
    } catch {
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setIsCreating(false);
    }
  }, [currentUserId, selectedGroupUsers, groupName, getUser, openConversation]);

  const toggleGroupUser = useCallback((userId: number) => {
    setSelectedGroupUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }, []);

  const availableUsers = useMemo(() => {
    const q = newChatSearch.toLowerCase();
    return data.users
      .filter((u) => Number(u.id) !== Number(currentUserId))
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
      const senderName = isMe ? 'You' : sender?.name || 'Unknown';
      const isEditing = editingMessageId === msgId;

      // Group reactions by emoji
      const reactionGroups: { emoji: string; count: number; hasOwn: boolean }[] = [];
      if (reactions && reactions.length > 0) {
        const groups = new Map<string, { emoji: string; count: number; hasOwn: boolean }>();
        for (const r of reactions) {
          const existing = groups.get(r.emoji) || { emoji: r.emoji, count: 0, hasOwn: false };
          existing.count++;
          if (Number(r.user_id) === Number(currentUserId)) existing.hasOwn = true;
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
                {formatMessageTime(createdAt)}
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
                    style={[styles.editBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7' }]}
                    onPress={handleCancelEdit}
                  >
                    <MaterialIcons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Pressable
                onLongPress={() => {
                  if (msgType === 'dm') {
                    setReactionMessageId(msgId);
                  } else if (isMe) {
                    // For workspace chat, show edit/delete options
                    Alert.alert('Message', undefined, [
                      { text: 'Edit', onPress: () => handleStartEdit(msgId, message) },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteMessage(msgId, msgType) },
                      { text: 'Cancel', style: 'cancel' },
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
                          borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                          borderWidth: 1,
                        },
                  ]}
                >
                  {(() => {
                    const parts = parseMessageContent(message);
                    const hasMedia = parts.some((p) => p.type === 'image' || p.type === 'video');
                    if (!hasMedia) {
                      return (
                        <Text
                          style={[
                            styles.messageText,
                            { color: isMe ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {message}
                        </Text>
                      );
                    }
                    return parts.map((part, idx) => {
                      if (part.type === 'image') {
                        return (
                          <TouchableOpacity
                            key={idx}
                            activeOpacity={0.9}
                            onPress={() => Linking.openURL(part.url).catch(() => {})}
                          >
                            <ExpoImage
                              source={{ uri: part.url }}
                              style={styles.messageImage}
                              contentFit="cover"
                              cachePolicy="disk"
                              transition={200}
                            />
                          </TouchableOpacity>
                        );
                      }
                      if (part.type === 'video') {
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={styles.messageVideoThumb}
                            activeOpacity={0.8}
                            onPress={() => Linking.openURL(part.url).catch(() => {})}
                          >
                            <MaterialIcons name="play-circle-outline" size={40} color="#FFFFFF" />
                            <Text style={styles.messageVideoLabel} numberOfLines={1}>
                              {part.label || 'Video'}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <Text
                          key={idx}
                          style={[
                            styles.messageText,
                            { color: isMe ? '#FFFFFF' : colors.text },
                          ]}
                        >
                          {part.text}
                        </Text>
                      );
                    });
                  })()}
                </View>
              </Pressable>
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
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleStartEdit(msgId, message)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="edit" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
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
    ],
  );

  // ---------------------------------------------------------------------------
  // Chat input component (shared between Spaces and Chats)
  // ---------------------------------------------------------------------------

  const renderChatInput = useCallback(
    (onSend: () => void) => (
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
            paddingBottom: Math.max(8, insets.bottom),
          },
        ]}
      >
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
              color: colors.text,
            },
          ]}
          placeholder="Message..."
          placeholderTextColor={colors.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={onSend}
          returnKeyType="send"
          editable={!isSending}
          multiline
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim()
                ? primaryColor
                : isDarkMode
                  ? 'rgba(255,255,255,0.08)'
                  : '#D5CFC6',
            },
          ]}
          onPress={onSend}
          disabled={!inputText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    ),
    [inputText, isSending, primaryColor, isDarkMode, colors, insets.bottom],
  );

  // ---------------------------------------------------------------------------
  // Render: Tab bar (Spaces / Chats)
  // ---------------------------------------------------------------------------

  const renderTabBar = () => (
    <View
      style={[
        styles.tabBar,
        {
          borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6',
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
          Workspaces
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
          Chats
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
    if (workspaceObjects.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialIcons
            name="workspaces"
            size={56}
            color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
          />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
            No workspaces
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            You don't have any workspaces yet
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={workspaceObjects}
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
          const wsColor = ws.color || primaryColor;
          const wsMessages = data.workspaceChat.filter((m) => Number(m.workspace_id) === ws.id);
          const lastMsg = wsMessages.sort((a, b) => utcMs(b.created_at) - utcMs(a.created_at))[0];
          const sender = lastMsg ? getUser(lastMsg.user_id) : null;
          const preview = lastMsg
            ? `${Number(lastMsg.user_id) === Number(currentUserId) ? 'You' : sender?.name?.split(' ')[0] || 'Someone'}: ${lastMsg.message}`
            : 'No messages yet';

          return (
            <TouchableOpacity
              style={[
                styles.conversationItem,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                setChatView({ type: 'spaceChat', workspaceId: ws.id });
                setInputText('');
              }}
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
                  {lastMsg && (
                    <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
                      {formatConversationTime(lastMsg.created_at)}
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
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons
              name="workspaces"
              size={56}
              color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
            />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
              No workspaces
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
    const spaceWs = spaceWsId ? workspaceObjects.find((w: SyncedWorkspace) => w.id === spaceWsId) : null;
    if (!spaceWs) return null;

    // Messages for this specific workspace (sorted newest-first for inverted list)
    const synced = data.workspaceChat.filter((m) => Number(m.workspace_id) === spaceWs.id);
    const syncedIds = new Set(synced.map((m) => m.uuid));
    const pending = pendingSpaceMessages.filter(
      (m) => Number(m.workspace_id) === spaceWs.id && !syncedIds.has(m.uuid),
    );
    const spaceMessages = [...synced, ...pending].sort((a, b) => {
      const diff = utcMs(b.created_at) - utcMs(a.created_at);
      return diff !== 0 ? diff : Number(b.id) - Number(a.id);
    });

    const wsColor = spaceWs.color || primaryColor;

    return (
      <View style={{ flex: 1 }}>
        {/* Header with back arrow */}
        <View
          style={[
            styles.chatHeader,
            { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' },
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
              Workspace chat
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
                color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D5CFC6'}
              />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Start the conversation</Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const isMe = Number(msg.user_id) === Number(currentUserId);
            const previews = linkPreviewsByWsChatId.get(msg.id) || [];
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
        {renderChatInput(handleSendSpaceMessage)}
      </View>
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
            Number(p.conversation_id) === Number(conv.id) &&
            Number(p.user_id) !== Number(currentUserId),
        );
        if (other) otherUser = getUser(other.user_id);
      }

      let preview = 'Tap to start a conversation';
      if (lastMsg) {
        const sender = getUser(lastMsg.user_id);
        const senderName =
          Number(lastMsg.user_id) === Number(currentUserId)
            ? 'You'
            : sender?.name.split(' ')[0] || 'Someone';
        preview = isGroup ? `${senderName}: ${lastMsg.message}` : lastMsg.message;
      }

      return (
        <TouchableOpacity
          style={[
            styles.conversationItem,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
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
                  {formatConversationTime(lastMsg.created_at)}
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
      colors, openConversation,
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
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
            },
          ]}
        >
          <MaterialIcons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search conversations..."
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
              color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
            />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
              No conversations yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Start a new chat to get going
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
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' },
            ]}
          >
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.chatHeaderTitle, { color: colors.text }]}>Loading...</Text>
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
      const other = activeParticipants.find((p) => Number(p.user_id) !== Number(currentUserId));
      if (other) otherUser = getUser(other.user_id);
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Chat header */}
        <View
          style={[
            styles.chatHeader,
            { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' },
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
                ? `${participantCount} member${participantCount !== 1 ? 's' : ''}`
                : 'Direct message'}
            </Text>
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
                color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D5CFC6'}
              />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Start the conversation</Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const isMe = Number(msg.user_id) === Number(currentUserId);
            const reactions = reactionsByMessageId.get(msg.id) || [];
            const previews = linkPreviewsByMessageId.get(msg.id) || [];
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
        {renderChatInput(handleSendConversationMessage)}
      </View>
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
              { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' },
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
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Chat</Text>
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
                  {isCreating ? 'Creating...' : 'Create'}
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
                newChatMode !== 'dm' && { borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7' },
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
                Direct Message
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                newChatMode === 'group' && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                newChatMode !== 'group' && { borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7' },
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
                Group Chat
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
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Group Name (optional)</Text>
                <TextInput
                  style={[
                    styles.groupNameInput,
                    {
                      backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4',
                      color: colors.text,
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                    },
                  ]}
                  placeholder="e.g. Design Team, Morning Shift..."
                  placeholderTextColor={colors.textSecondary}
                  value={groupName}
                  onChangeText={setGroupName}
                />
                {selectedGroupUsers.length > 0 && (
                  <Text style={[styles.selectedCount, { color: primaryColor }]}>
                    {selectedGroupUsers.length} selected
                  </Text>
                )}
              </>
            )}

            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                  marginTop: newChatMode === 'group' ? 16 : 0,
                },
              ]}
            >
              <MaterialIcons name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search people..."
                placeholderTextColor={colors.textSecondary}
                value={newChatSearch}
                onChangeText={setNewChatSearch}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              {availableUsers.map((u) => {
                const isSelected = selectedGroupUsers.includes(u.id);
                return (
                  <TouchableOpacity
                    key={u.id}
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
                              : '#E6E0D7',
                      },
                    ]}
                    onPress={() => {
                      if (newChatMode === 'dm') {
                        handleStartDm(u.id);
                      } else {
                        toggleGroupUser(u.id);
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
                  {newChatSearch ? `No people matching "${newChatSearch}"` : 'No team members available'}
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
  if (chatView.type === 'conversation') {
    return (
      <View style={{ flex: 1 }}>
        {renderConversationChatView()}
        {renderNewChatModal()}
      </View>
    );
  }

  if (chatView.type === 'spaceChat') {
    return (
      <View style={{ flex: 1 }}>
        {renderSpaceChatView()}
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
  messageImage: {
    width: 220,
    height: 180,
    borderRadius: radius.md,
    marginVertical: 4,
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
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    maxHeight: 100,
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
