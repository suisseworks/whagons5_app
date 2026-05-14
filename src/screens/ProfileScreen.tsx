import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { getOptimizedImageUrl } from '../utils/imgproxy';

type ProfileNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileNavigationProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { user, subdomain } = useAuth();
  const { t } = useLanguage();
  const updateMe = useMutation(api.users.updateMe);
  const [name, setName] = useState('');
  const [apodo, setApodo] = useState('');
  const [showApodo, setShowApodo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(typeof user?.name === 'string' ? user.name : '');
    setApodo(typeof user?.apodo === 'string' ? user.apodo : '');
    setShowApodo(Boolean(user?.showApodo));
  }, [user]);

  const userInitials = (name || user?.email || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const avatarUrl = typeof user?.photo_url === 'string' ? user.photo_url : null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedApodo = apodo.trim();

    if (!subdomain) {
      Alert.alert(t('common.error'), t('profile.noTenant'));
      return;
    }

    if (!trimmedName) {
      Alert.alert(t('profile.nameRequiredTitle'), t('profile.nameRequiredMessage'));
      return;
    }

    setSaving(true);
    try {
      await updateMe({
        tenantId: subdomain,
        name: trimmedName,
        apodo: trimmedApodo,
        showApodo,
      });
      Alert.alert(t('profile.savedTitle'), t('profile.savedMessage'));
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('profile.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
            },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: getOptimizedImageUrl(avatarUrl, { width: 128, height: 128, mode: 'fill' }) || avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: primaryColor }]}>
              <Text style={styles.avatarInitials}>{userInitials}</Text>
            </View>
          )}
          <Text style={[styles.heroName, { color: colors.text }]}>{name || user?.email || t('profile.title')}</Text>
          {!!user?.email && <Text style={[styles.heroEmail, { color: colors.textSecondary }]}>{user.email}</Text>}
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('profile.basicInfo')}</Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.text }]}>{t('profile.fullName')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5EF',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={t('profile.fullNamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            editable={!saving}
          />

          <Text style={[styles.label, { color: colors.text }]}>{t('profile.email')}</Text>
          <TextInput
            style={[
              styles.input,
              styles.disabledInput,
              {
                color: colors.textSecondary,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F3EEE4',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              },
            ]}
            value={user?.email || ''}
            editable={false}
          />
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{t('profile.emailLocked')}</Text>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('profile.displayName')}</Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.text }]}>{t('profile.nickname')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5EF',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
              },
            ]}
            value={apodo}
            onChangeText={setApodo}
            placeholder={t('profile.nicknamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            editable={!saving}
          />
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{t('profile.nicknameHelper')}</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={[styles.switchTitle, { color: colors.text }]}>{t('profile.showNickname')}</Text>
              <Text style={[styles.switchSubtitle, { color: colors.textSecondary }]}>{t('profile.showNicknameSubtitle')}</Text>
            </View>
            <Switch
              value={showApodo}
              onValueChange={setShowApodo}
              disabled={saving}
              trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
              thumbColor={showApodo ? primaryColor : '#FAFAFA'}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: primaryColor },
            saving && styles.saveButtonDisabled,
          ]}
          activeOpacity={0.86}
          disabled={saving}
          onPress={handleSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="save" size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>{t('profile.saveChanges')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  headerSpacer: {
    width: 24,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...shadows.subtle,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: fontFamilies.bodyBold,
  },
  heroName: {
    marginTop: spacing.md,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  heroEmail: {
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.subtle,
  },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginBottom: spacing.md,
  },
  disabledInput: {
    opacity: 0.8,
    marginBottom: spacing.xs,
  },
  helperText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
  },
  switchTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  switchSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  saveButton: {
    height: 52,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.subtle,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
});
