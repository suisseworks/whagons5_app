import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';
import { getInitials } from '../utils/helpers';
import { getOptimizedImageUrl } from '../utils/imgproxy';

export interface UserPickerItem {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

interface UserPickerSheetProps {
  visible: boolean;
  title: string;
  users: UserPickerItem[];
  selectedIds: Set<string>;
  onToggleUser: (userId: string) => void;
  onClose: () => void;
  colors: {
    surface: string;
    text: string;
    textSecondary: string;
  };
  primaryColor: string;
  isDarkMode: boolean;
  searchPlaceholder: string;
  emptyText: string;
  youLabel: string;
  subtitle?: string;
  currentUserId?: string | number | null;
  currentUserName?: string | null;
  footer?: React.ReactNode;
  listMaxHeight?: number;
}

function normalizeForSearch(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const UserPickerSheet: React.FC<UserPickerSheetProps> = ({
  visible,
  title,
  users,
  selectedIds,
  onToggleUser,
  onClose,
  colors,
  primaryColor,
  isDarkMode,
  searchPlaceholder,
  emptyText,
  youLabel,
  subtitle,
  currentUserId,
  currentUserName,
  footer,
  listMaxHeight = 300,
}) => {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) return;
    setSearch('');
    setFailedAvatarIds(new Set());
  }, [visible]);

  const normalizedCurrentUserId = useMemo(
    () => (currentUserId != null ? String(currentUserId) : null),
    [currentUserId],
  );

  const normalizedCurrentUserName = useMemo(
    () => normalizeForSearch(currentUserName ?? ''),
    [currentUserName],
  );

  const filteredUsers = useMemo(() => {
    const query = normalizeForSearch(search.trim());
    let list = users;

    if (query) {
      list = users.filter((user) => {
        const name = normalizeForSearch(user.name);
        const email = normalizeForSearch(user.email ?? '');
        return name.includes(query) || email.includes(query);
      });
    }

    const isCurrent = (item: UserPickerItem): boolean => {
      if (normalizedCurrentUserId && item.id === normalizedCurrentUserId) {
        return true;
      }
      if (
        normalizedCurrentUserName &&
        normalizeForSearch(item.name) === normalizedCurrentUserName
      ) {
        return true;
      }
      return false;
    };

    return [...list].sort((a, b) => {
      const aIsCurrent = isCurrent(a);
      const bIsCurrent = isCurrent(b);
      if (aIsCurrent && !bIsCurrent) return -1;
      if (bIsCurrent && !aIsCurrent) return 1;

      const nameA = String(a.name || a.email || '');
      const nameB = String(b.name || b.email || '');
      return nameA.localeCompare(nameB);
    });
  }, [users, search, normalizedCurrentUserId, normalizedCurrentUserName]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.bottom}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                paddingBottom: Math.max(20, insets.bottom + 12),
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.handle} />
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}

            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                  borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
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
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 ? (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              style={[styles.list, { maxHeight: listMaxHeight }]}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedIds.has(item.id);
                const isCurrentUser =
                  (normalizedCurrentUserId != null && item.id === normalizedCurrentUserId)
                  || (
                    !!normalizedCurrentUserName
                    && normalizeForSearch(item.name) === normalizedCurrentUserName
                  );

                const rawAvatar = typeof item.avatarUrl === 'string' ? item.avatarUrl.trim() : '';
                const optimizedAvatar = rawAvatar
                  ? getOptimizedImageUrl(rawAvatar, { width: 40, height: 40, mode: 'fill' }) || rawAvatar
                  : '';
                const hasValidAvatarUrl =
                  optimizedAvatar.startsWith('http://') || optimizedAvatar.startsWith('https://');
                const showAvatarImage = hasValidAvatarUrl && !failedAvatarIds.has(item.id);

                return (
                  <TouchableOpacity
                    style={[
                      styles.item,
                      {
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      },
                      isSelected && {
                        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : '#F5F5F7',
                      },
                    ]}
                    onPress={() => onToggleUser(item.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: showAvatarImage ? 'transparent' : primaryColor },
                      ]}
                    >
                      {showAvatarImage ? (
                        <Image
                          source={{ uri: optimizedAvatar }}
                          style={styles.avatarImage}
                          onError={() => {
                            setFailedAvatarIds((prev) => {
                              const next = new Set(prev);
                              next.add(item.id);
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <Text style={styles.avatarInitial}>{getInitials(item.name)}</Text>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.itemText,
                        { color: colors.text },
                        isSelected && { fontFamily: fontFamilies.bodySemibold },
                      ]}
                    >
                      {item.name}
                      {isCurrentUser ? ` (${youLabel})` : ''}
                    </Text>

                    {isSelected ? <MaterialIcons name="check" size={20} color={primaryColor} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
              }
            />

            {footer}
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    flexShrink: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...shadows.subtle,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 16,
  },
  subtitle: {
    marginTop: -10,
    marginBottom: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyRegular,
    padding: 0,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 0.5,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },
  itemText: {
    flex: 1,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
