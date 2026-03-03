import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useData, SyncedUser, SyncedWorkspace } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { getInitials } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColabMessage {
  id: string;
  author: string;
  authorId: number;
  text: string;
  time: string;
}

interface GroupChat {
  id: string;
  name: string;
  members: SyncedUser[];
  color: string;
  createdAt: string;
}

type ColabTab = 'spaces' | 'chats';
type ChatView =
  | { type: 'list' }
  | { type: 'space'; spaceId: number }
  | { type: 'dm'; user: SyncedUser }
  | { type: 'group'; group: GroupChat };

// Preset colors for group chats
const GROUP_COLORS = [
  '#E2573C', '#2196F3', '#4CAF50', '#9C27B0',
  '#FF9800', '#00BCD4', '#E91E63', '#607D8B',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ColabScreenProps {
  onChatViewChange?: (isInChat: boolean) => void;
}

export const ColabScreen: React.FC<ColabScreenProps> = ({ onChatViewChange }) => {
  const insets = useSafeAreaInsets();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { data, isSyncing, refresh } = useData();
  const { user: authUser } = useAuth();

  // -- State --
  const [activeTab, setActiveTab] = useState<ColabTab>('spaces');
  const [chatView, setChatView] = useState<ChatView>({ type: 'list' });

  // Messages keyed by a composite key: "space-{id}", "dm-{userId}", "group-{groupId}"
  const [messages, setMessages] = useState<Map<string, ColabMessage[]>>(new Map());
  const [inputText, setInputText] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  // Group chats
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedGroupColor, setSelectedGroupColor] = useState(GROUP_COLORS[0]);

  // Search
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Helpers
  const currentUserId = authUser?.id ?? 0;
  const currentUserName = authUser?.name ?? 'You';

  const getChatKey = (): string | null => {
    switch (chatView.type) {
      case 'space': return `space-${chatView.spaceId}`;
      case 'dm': return `dm-${chatView.user.id}`;
      case 'group': return `group-${chatView.group.id}`;
      default: return null;
    }
  };

  const getChatMessages = (): ColabMessage[] => {
    const key = getChatKey();
    if (!key) return [];
    return messages.get(key) ?? [];
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const key = getChatKey();
    if (!key) return;

    const messageText = inputText.trim();

    const msg: ColabMessage = {
      id: String(Date.now()),
      author: currentUserName,
      authorId: currentUserId,
      text: messageText,
      time: 'Just now',
    };

    setMessages(prev => {
      const next = new Map(prev);
      const existing = next.get(key) ?? [];
      next.set(key, [...existing, msg]);
      return next;
    });
    setInputText('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

    // Send push notification to recipients (fire-and-forget)
    try {
      if (chatView.type === 'dm') {
        apiClient.sendMessageNotification({
          recipient_user_id: chatView.user.id,
          message: messageText,
          chat_type: 'dm',
          chat_id: key,
        }).catch(() => {});
      } else if (chatView.type === 'group') {
        const recipientIds = chatView.group.members
          .map(m => m.id)
          .filter(id => id !== currentUserId);
        if (recipientIds.length > 0) {
          apiClient.sendMessageNotification({
            recipient_user_ids: recipientIds,
            message: messageText,
            chat_type: 'group',
            chat_id: key,
          }).catch(() => {});
        }
      } else if (chatView.type === 'space') {
        apiClient.sendMessageNotification({
          workspace_id: chatView.spaceId,
          message: messageText,
          chat_type: 'space',
          chat_id: key,
        }).catch(() => {});
      }
    } catch {
      // Non-critical: notification sending failure should not block chat
    }
  };

  const handleBack = () => {
    setChatView({ type: 'list' });
    setInputText('');
  };

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;

    const members = data.users.filter(u => selectedMembers.includes(u.id));
    const group: GroupChat = {
      id: String(Date.now()),
      name: newGroupName.trim(),
      members,
      color: selectedGroupColor,
      createdAt: new Date().toISOString(),
    };

    setGroupChats(prev => [group, ...prev]);
    setNewGroupName('');
    setSelectedMembers([]);
    setSelectedGroupColor(GROUP_COLORS[0]);
    setShowNewGroupModal(false);
  };

  const toggleMember = (userId: number) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Determine if bottom bar should be hidden (when in a chat)
  const isInChat = chatView.type !== 'list';

  // Notify parent when chat view changes
  useEffect(() => {
    onChatViewChange?.(isInChat);
  }, [isInChat, onChatViewChange]);

  // ---------------------------------------------------------------------------
  // Shared chat UI
  // ---------------------------------------------------------------------------

  const renderChatHeader = (
    title: string,
    subtitle: string,
    icon: keyof typeof MaterialIcons.glyphMap,
    iconColor: string,
  ) => (
    <View style={[styles.chatHeader, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' }]}>
      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <MaterialIcons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <View style={[styles.chatHeaderIcon, { backgroundColor: `${iconColor}20` }]}>
        <MaterialIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.chatHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.chatHeaderSub, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );

  const renderMessagesList = () => {
    const chatMessages = getChatMessages();
    const cardBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7';

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 140 : 0}
      >
        <ScrollView
          ref={chatScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.messagesList,
            chatMessages.length === 0 && { flex: 1, justifyContent: 'center', alignItems: 'center' },
          ]}
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
        >
          {chatMessages.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <MaterialIcons
                name="chat-bubble-outline"
                size={48}
                color={isDarkMode ? 'rgba(255,255,255,0.12)' : '#D5CFC6'}
              />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                No messages yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Start the conversation
              </Text>
            </View>
          ) : (
            chatMessages.map(msg => {
              const isYou = msg.authorId === currentUserId;
              return (
                <View key={msg.id} style={styles.messageItem}>
                  <View style={[styles.avatar, isYou && { backgroundColor: primaryColor }]}>
                    <Text style={styles.avatarText}>{getInitials(msg.author)}</Text>
                  </View>
                  <View style={styles.messageContent}>
                    <View style={styles.messageHeader}>
                      <Text style={[styles.messageAuthor, { color: colors.text }]}>
                        {msg.author}
                      </Text>
                      <Text style={[styles.messageTime, { color: colors.textSecondary }]}>
                        {msg.time}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.messageBubble,
                        { backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#FFFFFF' },
                      ]}
                    >
                      <Text style={[styles.messageText, { color: colors.text }]}>{msg.text}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Input */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: colors.surface,
              borderTopColor: cardBorder,
              paddingBottom: 16 + insets.bottom,
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
            onSubmitEditing={handleSendMessage}
            returnKeyType="send"
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
            onPress={handleSendMessage}
            disabled={!inputText.trim()}
          >
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  // ---------------------------------------------------------------------------
  // Space chat view
  // ---------------------------------------------------------------------------

  const renderSpaceChat = () => {
    if (chatView.type !== 'space') return null;
    const space = data.workspaces.find(w => w.id === chatView.spaceId);
    if (!space) return null;

    return (
      <View style={{ flex: 1 }}>
        {renderChatHeader(
          space.name,
          'Space chat',
          'forum',
          space.color || primaryColor,
        )}
        {renderMessagesList()}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // DM chat view
  // ---------------------------------------------------------------------------

  const renderDMChat = () => {
    if (chatView.type !== 'dm') return null;
    const dmUser = chatView.user;

    return (
      <View style={{ flex: 1 }}>
        {renderChatHeader(
          dmUser.name,
          dmUser.email || 'Direct message',
          'person',
          primaryColor,
        )}
        {renderMessagesList()}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Group chat view
  // ---------------------------------------------------------------------------

  const renderGroupChat = () => {
    if (chatView.type !== 'group') return null;
    const group = chatView.group;

    return (
      <View style={{ flex: 1 }}>
        {renderChatHeader(
          group.name,
          `${group.members.length} member${group.members.length !== 1 ? 's' : ''}`,
          'group',
          group.color,
        )}
        {renderMessagesList()}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Spaces list
  // ---------------------------------------------------------------------------

  const renderSpacesList = () => {
    const spaceWorkspaces = data.workspaces;

    return (
      <FlatList
        data={spaceWorkspaces}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: colors.text }]}>Spaces</Text>
            <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>
              {spaceWorkspaces.length} {spaceWorkspaces.length === 1 ? 'space' : 'spaces'}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.listItem,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
              },
            ]}
            activeOpacity={0.7}
            onPress={() => setChatView({ type: 'space', spaceId: item.id })}
          >
            <View style={[styles.listItemIcon, { backgroundColor: `${item.color || primaryColor}18` }]}>
              <MaterialIcons name="forum" size={22} color={item.color || primaryColor} />
            </View>
            <View style={styles.listItemInfo}>
              <Text style={[styles.listItemName, { color: colors.text }]}>{item.name}</Text>
              {item.description ? (
                <Text
                  style={[styles.listItemDesc, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons
              name="forum"
              size={56}
              color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
            />
            <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
              No spaces yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Spaces will appear here once workspaces are created
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
    );
  };

  // ---------------------------------------------------------------------------
  // Chats list (DMs + Group Chats)
  // ---------------------------------------------------------------------------

  const renderChatsList = () => {
    // Filter out current user from DM list
    const otherUsers = data.users.filter(u => u.id !== currentUserId);
    const filteredUsers = chatSearchQuery
      ? otherUsers.filter(u =>
          u.name.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
          (u.email && u.email.toLowerCase().includes(chatSearchQuery.toLowerCase()))
        )
      : otherUsers;

    const filteredGroups = chatSearchQuery
      ? groupChats.filter(g =>
          g.name.toLowerCase().includes(chatSearchQuery.toLowerCase())
        )
      : groupChats;

    return (
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
      >
        {/* Search bar */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
            },
          ]}
        >
          <MaterialIcons
            name="search"
            size={20}
            color={colors.textSecondary}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search chats..."
            placeholderTextColor={colors.textSecondary}
            value={chatSearchQuery}
            onChangeText={setChatSearchQuery}
          />
          {chatSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setChatSearchQuery('')}>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Group Chats section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Group Chats</Text>
          <TouchableOpacity
            style={[styles.newGroupButton, { backgroundColor: `${primaryColor}18` }]}
            onPress={() => setShowNewGroupModal(true)}
          >
            <MaterialIcons name="add" size={16} color={primaryColor} />
            <Text style={[styles.newGroupButtonText, { color: primaryColor }]}>New</Text>
          </TouchableOpacity>
        </View>

        {filteredGroups.length === 0 && !chatSearchQuery ? (
          <View
            style={[
              styles.emptySection,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E6E0D7',
              },
            ]}
          >
            <MaterialIcons name="group-add" size={28} color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'} />
            <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
              Create a group to chat with multiple people
            </Text>
          </View>
        ) : filteredGroups.length === 0 && chatSearchQuery ? (
          <Text style={[styles.noResults, { color: colors.textSecondary }]}>
            No groups matching "{chatSearchQuery}"
          </Text>
        ) : (
          filteredGroups.map((group, index) => (
            <React.Fragment key={group.id}>
              {index > 0 && <View style={{ height: 8 }} />}
              <TouchableOpacity
                style={[
                  styles.listItem,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => setChatView({ type: 'group', group })}
              >
                <View style={[styles.listItemIcon, { backgroundColor: `${group.color}18` }]}>
                  <MaterialIcons name="group" size={22} color={group.color} />
                </View>
                <View style={styles.listItemInfo}>
                  <Text style={[styles.listItemName, { color: colors.text }]}>{group.name}</Text>
                  <Text
                    style={[styles.listItemDesc, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </React.Fragment>
          ))
        )}

        {/* Direct Messages section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Direct Messages</Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
            {filteredUsers.length}
          </Text>
        </View>

        {filteredUsers.length === 0 ? (
          chatSearchQuery ? (
            <Text style={[styles.noResults, { color: colors.textSecondary }]}>
              No people matching "{chatSearchQuery}"
            </Text>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialIcons
                name="person-outline"
                size={48}
                color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
              />
              <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                No team members yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                People will appear here once they join
              </Text>
            </View>
          )
        ) : (
          filteredUsers.map((user, index) => {
            // Get last message preview for this DM
            const dmMessages = messages.get(`dm-${user.id}`) ?? [];
            const lastMsg = dmMessages.length > 0 ? dmMessages[dmMessages.length - 1] : null;

            return (
              <React.Fragment key={user.id}>
                {index > 0 && <View style={{ height: 8 }} />}
                <TouchableOpacity
                  style={[
                    styles.listItem,
                    {
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setChatView({ type: 'dm', user })}
                >
                  <View style={[styles.personAvatar, { backgroundColor: `${primaryColor}28` }]}>
                    <Text style={[styles.personAvatarText, { color: primaryColor }]}>
                      {getInitials(user.name)}
                    </Text>
                  </View>
                  <View style={styles.listItemInfo}>
                    <Text style={[styles.listItemName, { color: colors.text }]}>{user.name}</Text>
                    <Text
                      style={[styles.listItemDesc, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {lastMsg ? lastMsg.text : (user.email || 'Tap to start a conversation')}
                    </Text>
                  </View>
                  {lastMsg && (
                    <Text style={[styles.dmTime, { color: colors.textSecondary }]}>
                      {lastMsg.time}
                    </Text>
                  )}
                  {!lastMsg && (
                    <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    );
  };

  // ---------------------------------------------------------------------------
  // New Group Chat Modal
  // ---------------------------------------------------------------------------

  const renderNewGroupModal = () => {
    const availableUsers = data.users.filter(u => u.id !== currentUserId);

    return (
      <Modal
        visible={showNewGroupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewGroupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' }]}>
              <TouchableOpacity
                onPress={() => {
                  setShowNewGroupModal(false);
                  setNewGroupName('');
                  setSelectedMembers([]);
                }}
              >
                <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Group</Text>
              <TouchableOpacity
                onPress={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedMembers.length === 0}
              >
                <Text
                  style={[
                    styles.modalCreate,
                    {
                      color: newGroupName.trim() && selectedMembers.length > 0
                        ? primaryColor
                        : colors.textSecondary,
                    },
                  ]}
                >
                  Create
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
              {/* Group Name */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Group Name</Text>
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
                value={newGroupName}
                onChangeText={setNewGroupName}
              />

              {/* Color picker */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 20 }]}>
                Color
              </Text>
              <View style={styles.colorPicker}>
                {GROUP_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedGroupColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedGroupColor(color)}
                  >
                    {selectedGroupColor === color && (
                      <MaterialIcons name="check" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Members */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 20 }]}>
                Members ({selectedMembers.length} selected)
              </Text>

              {availableUsers.length === 0 ? (
                <Text style={[styles.noResults, { color: colors.textSecondary, marginTop: 12 }]}>
                  No team members available
                </Text>
              ) : (
                availableUsers.map(user => {
                  const isSelected = selectedMembers.includes(user.id);
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[
                        styles.memberRow,
                        {
                          backgroundColor: isSelected
                            ? `${primaryColor}12`
                            : isDarkMode
                              ? 'rgba(255,255,255,0.03)'
                              : 'rgba(255,255,255,0.5)',
                          borderColor: isSelected
                            ? `${primaryColor}40`
                            : isDarkMode
                              ? 'rgba(255,255,255,0.06)'
                              : '#E6E0D7',
                        },
                      ]}
                      onPress={() => toggleMember(user.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.personAvatar, { backgroundColor: `${primaryColor}28`, width: 36, height: 36, borderRadius: 18 }]}>
                        <Text style={[styles.personAvatarText, { color: primaryColor, fontSize: fontSizes.sm }]}>
                          {getInitials(user.name)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.listItemName, { color: colors.text, fontSize: fontSizes.sm }]}>
                          {user.name}
                        </Text>
                        {user.email ? (
                          <Text
                            style={[styles.listItemDesc, { color: colors.textSecondary, fontSize: fontSizes.xs }]}
                            numberOfLines={1}
                          >
                            {user.email}
                          </Text>
                        ) : null}
                      </View>
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
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ---------------------------------------------------------------------------
  // Tab bar
  // ---------------------------------------------------------------------------

  const renderTabBar = () => (
    <View style={[styles.tabBar, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' }]}>
      {(['spaces', 'chats'] as ColabTab[]).map(tab => {
        const isActive = activeTab === tab;
        const label = tab === 'spaces' ? 'Spaces' : 'Chats';
        const icon: keyof typeof MaterialIcons.glyphMap = tab === 'spaces' ? 'workspaces' : 'chat';

        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, isActive && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => {
              setActiveTab(tab);
              setChatView({ type: 'list' });
              setInputText('');
              setChatSearchQuery('');
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={icon}
              size={20}
              color={isActive ? primaryColor : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isActive ? primaryColor : colors.textSecondary,
                  fontFamily: isActive ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  // If we're in a specific chat, render that
  if (chatView.type !== 'list') {
    return (
      <View style={{ flex: 1 }}>
        {chatView.type === 'space' && renderSpaceChat()}
        {chatView.type === 'dm' && renderDMChat()}
        {chatView.type === 'group' && renderGroupChat()}
      </View>
    );
  }

  // Otherwise render the tab view with Spaces/Chats tabs
  return (
    <View style={{ flex: 1 }}>
      {renderTabBar()}
      {activeTab === 'spaces' ? renderSpacesList() : renderChatsList()}
      {renderNewGroupModal()}
    </View>
  );
};

// Expose whether the colab screen is in a chat (for hiding bottom bar)
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
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: fontSizes.sm,
  },

  // List shared
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    marginBottom: spacing.sm,
  },
  listTitle: {
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  listSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  listItemIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  listItemDesc: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 2,
  },

  // Person avatar
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  personAvatarText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },

  // DM time
  dmTime: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 8,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    padding: 0,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  sectionCount: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  newGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  newGroupButtonText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    marginLeft: 4,
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  emptySection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  emptySectionText: {
    flex: 1,
    marginLeft: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  noResults: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    paddingVertical: 8,
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
  },
  messageItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  messageContent: {
    flex: 1,
    marginLeft: 12,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageAuthor: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  messageTime: {
    marginLeft: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  messageBubble: {
    marginTop: 4,
    borderRadius: radius.md,
    padding: 12,
  },
  messageText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    ...shadows.subtle,
  },
  textInput: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Group form
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
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
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
