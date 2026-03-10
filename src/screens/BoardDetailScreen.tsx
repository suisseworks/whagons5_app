import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useData, SyncedBoardMessage } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { getInitials } from '../utils/helpers';
import { buildBaseUrl, getTenantHeaders } from '../config/api';

type BoardDetailRouteProp = RouteProp<RootStackParamList, 'BoardDetail'>;
type BoardDetailNavProp = NativeStackNavigationProp<RootStackParamList, 'BoardDetail'>;

export const BoardDetailScreen: React.FC = () => {
  const navigation = useNavigation<BoardDetailNavProp>();
  const route = useRoute<BoardDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { data, isSyncing, refresh } = useData();
  const { token, subdomain } = useAuth();

  const { boardId } = route.params;

  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Find the board
  const board = useMemo(() => {
    return data.boards.find(b => b.id === boardId);
  }, [data.boards, boardId]);

  // Get messages for this board, sorted: pinned first, then newest first
  const messages = useMemo(() => {
    return data.boardMessages
      .filter(m => m.board_id === boardId && !m.deleted_at)
      .sort((a, b) => {
        // Pinned messages first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then sort by created_at descending (newest first)
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
  }, [data.boardMessages, boardId]);

  // Build user lookup
  const userMap = useMemo(() => {
    const map = new Map<number, { name: string; email?: string }>();
    data.users.forEach(u => map.set(u.id, { name: u.name, email: u.email }));
    return map;
  }, [data.users]);

  // Get members count
  const memberCount = useMemo(() => {
    return data.boardMembers.filter(m => m.board_id === boardId).length;
  }, [data.boardMembers, boardId]);

  const formatMessageTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || isSending) return;

    setIsSending(true);
    try {
      const baseUrl = buildBaseUrl(subdomain ?? undefined);
      const response = await fetch(`${baseUrl}/board-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...getTenantHeaders(subdomain ?? undefined),
        },
        body: JSON.stringify({
          board_id: boardId,
          content: messageInput.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Failed to send message (${response.status})`);
      }

      setMessageInput('');
      // Refresh to get the new message from the sync
      await refresh();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [messageInput, isSending, boardId, token, subdomain, refresh]);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const renderMessage = ({ item }: { item: SyncedBoardMessage }) => {
    const author = userMap.get(item.created_by);
    const authorName = author?.name || 'Unknown';
    const cardBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)';
    const cardBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7';

    return (
      <View style={[styles.messageCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Pinned badge */}
        {item.is_pinned && (
          <View style={[styles.pinnedBadge, { backgroundColor: `${primaryColor}18` }]}>
            <MaterialIcons name="push-pin" size={12} color={primaryColor} />
            <Text style={[styles.pinnedText, { color: primaryColor }]}>Pinned</Text>
          </View>
        )}

        {/* Author row */}
        <View style={styles.messageHeader}>
          <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
            <Text style={styles.avatarText}>{getInitials(authorName)}</Text>
          </View>
          <View style={styles.messageHeaderInfo}>
            <Text style={[styles.authorName, { color: colors.text }]}>{authorName}</Text>
            <Text style={[styles.messageTime, { color: colors.textSecondary }]}>
              {formatMessageTime(item.created_at)}
            </Text>
          </View>
        </View>

        {/* Title */}
        {item.title ? (
          <Text style={[styles.messageTitle, { color: colors.text }]}>{item.title}</Text>
        ) : null}

        {/* Content */}
        {item.content ? (
          <Text style={[styles.messageContent, { color: colors.text }]}>{item.content}</Text>
        ) : null}
      </View>
    );
  };

  if (!board) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.placeholderContainer}>
          <MaterialIcons name="error-outline" size={56} color={colors.textSecondary} />
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>Board not found</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: primaryColor }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <LinearGradient
        colors={[colors.background, isDarkMode ? '#121615' : '#EFE8DD']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View
          style={[
            styles.headerIcon,
            { backgroundColor: board.visibility === 'public' ? `${primaryColor}20` : '#8B5CF620' },
          ]}
        >
          <MaterialIcons
            name={board.visibility === 'public' ? 'campaign' : 'lock'}
            size={18}
            color={board.visibility === 'public' ? primaryColor : '#8B5CF6'}
          />
        </View>

        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {board.name}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'} · {messages.length} {messages.length === 1 ? 'post' : 'posts'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.messagesList,
            messages.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center' },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 32 }}>
              <MaterialIcons
                name="chat-bubble-outline"
                size={48}
                color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D5CFC6'}
              />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                No posts yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Be the first to post on this board
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={onRefresh}
              tintColor={primaryColor}
              colors={[primaryColor]}
            />
          }
        />

        {/* Composer */}
        <View
          style={[
            styles.composerContainer,
            {
              backgroundColor: colors.surface,
              borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
              paddingBottom: 12 + insets.bottom,
            },
          ]}
        >
          <TextInput
            style={[
              styles.composerInput,
              {
                backgroundColor: isDarkMode ? 'rgba(31,36,34,0.7)' : '#F3EEE4',
                color: colors.text,
              },
            ]}
            placeholder="Write a post..."
            placeholderTextColor={colors.textSecondary}
            value={messageInput}
            onChangeText={setMessageInput}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: messageInput.trim() && !isSending
                  ? primaryColor
                  : isDarkMode ? 'rgba(255,255,255,0.08)' : '#D5CFC6',
              },
            ]}
            onPress={handleSendMessage}
            disabled={!messageInput.trim() || isSending}
          >
            <MaterialIcons
              name={isSending ? 'hourglass-empty' : 'send'}
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  headerBack: {
    padding: 6,
    marginRight: 8,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  headerSubtitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 8,
  },
  pinnedText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    marginLeft: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  messageHeaderInfo: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  messageTime: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  messageTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 4,
  },
  messageContent: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    borderTopWidth: 1,
    ...shadows.subtle,
  },
  composerInput: {
    flex: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderTitle: {
    marginTop: 16,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
});
