import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION, BUILD_NUMBER, GIT_HASH, VERSION_DISPLAY } from '../config/version';
import { BUNDLED_RELEASE_NOTES } from '../config/releaseNotes';
import { useData } from '../context/DataContext';
import { useTasks } from '../context/TaskContext';
import { useLanguage, SupportedLanguage } from '../context/LanguageContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';
import { themeMetadata } from '../config/themes';
import { HIDE_SHARED_WITH_ME_STORAGE_KEY } from '../config/storageKeys';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import { sendPasswordReset } from '../firebase/authService';

export const GPS_CAPTURE_STORAGE_KEY = '@whagons/gps_capture_enabled';
const PRIVACY_POLICY_URL = 'https://whagons.com/en/privacy';
const TERMS_OF_SERVICE_URL = 'https://whagons.com/en/terms';

type AppReleaseNote = {
  version?: string;
  tagName?: string;
  title?: string;
  body?: string;
  bodyByLanguage?: Record<string, string>;
  buildNumber?: number;
  gitHash?: string;
  githubUrl?: string;
};

const bundledReleaseNotes: AppReleaseNote = BUNDLED_RELEASE_NOTES;

function getReleaseNotesBodyForLanguage(releaseNote: AppReleaseNote, language: string): string | undefined {
  const bodyByLanguage = releaseNote.bodyByLanguage;
  if (!bodyByLanguage) return releaseNote.body;

  const normalizedLanguage = language.toLowerCase();
  const baseLanguage = normalizedLanguage.split(/[-_]/)[0];
  const localizedBody =
    bodyByLanguage[language] ||
    bodyByLanguage[normalizedLanguage] ||
    bodyByLanguage[baseLanguage] ||
    Object.entries(bodyByLanguage).find(([key, body]) => {
      if (!body?.trim()) return false;
      const normalizedKey = key.toLowerCase();
      return normalizedKey === normalizedLanguage || normalizedKey.split(/[-_]/)[0] === baseLanguage;
    })?.[1] ||
    bodyByLanguage.en;

  return localizedBody?.trim() ? localizedBody : releaseNote.body;
}

/** Avoid Fabric crash on Android: reset() from Alert onPress races dialog teardown ("child already has a parent"). */
function runAfterAlertNavigationWork(fn: () => void) {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(fn);
    });
  });
}

type SettingsNavProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsNavProp>();
  const { colors, primaryColor, isDarkMode, toggleDarkMode, themeName } = useTheme();
  const { preferences, updatePreferences, hasPermission } = useNotifications();
  const { user, logout, subdomain, switchTenant } = useAuth();
  const { forceResync } = useData();
  const { showFinishedTasks, setShowFinishedTasks } = useTasks();
  const { pendingCount, failedCount } = useMutationQueue();
  const { language, timeFormat, setLanguage, setTimeFormat, t } = useLanguage();
  const submitBugReport = useMutation(api.bugReports.submit);
  const releaseNotesBody = getReleaseNotesBodyForLanguage(bundledReleaseNotes, language);
  const releaseNotesMarkdown = releaseNotesBody?.trim() || t('settings.releaseNotesEmpty');
  const currentThemeLabel = themeMetadata.find((theme) => theme.id === themeName)?.name || t('settings.theme');
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchTenantModalVisible, setSwitchTenantModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [bugReportModalVisible, setBugReportModalVisible] = useState(false);
  const [bugReportText, setBugReportText] = useState('');
  const [bugReportSubmitting, setBugReportSubmitting] = useState(false);
  const [passwordResetModalVisible, setPasswordResetModalVisible] = useState(false);
  const [passwordResetSubmitting, setPasswordResetSubmitting] = useState(false);
  const [appDetailsModalVisible, setAppDetailsModalVisible] = useState(false);
  const [releaseNotesModalVisible, setReleaseNotesModalVisible] = useState(false);
  const [gpsCaptureEnabled, setGpsCaptureEnabled] = useState(false);
  const [hideSharedWithMe, setHideSharedWithMe] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([GPS_CAPTURE_STORAGE_KEY, HIDE_SHARED_WITH_ME_STORAGE_KEY]).then((entries) => {
      const gpsCaptureValue = entries.find(([key]) => key === GPS_CAPTURE_STORAGE_KEY)?.[1];
      const hideSharedValue = entries.find(([key]) => key === HIDE_SHARED_WITH_ME_STORAGE_KEY)?.[1];

      if (gpsCaptureValue !== null && gpsCaptureValue !== undefined) setGpsCaptureEnabled(gpsCaptureValue === 'true');
      if (hideSharedValue !== null && hideSharedValue !== undefined) setHideSharedWithMe(hideSharedValue === 'true');
    });
  }, []);

  const handleGpsToggle = (val: boolean) => {
    setGpsCaptureEnabled(val);
    AsyncStorage.setItem(GPS_CAPTURE_STORAGE_KEY, String(val));
  };

  const handleHideSharedWithMeToggle = (val: boolean) => {
    setHideSharedWithMe(val);
    AsyncStorage.setItem(HIDE_SHARED_WITH_ME_STORAGE_KEY, String(val));
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' },
  ];

  const showLanguageDialog = () => {
    setLanguageModalVisible(true);
  };

  const openExternalUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('settings.openLinkFailed'));
    });
  };

  const handleSubmitBugReport = async () => {
    const message = bugReportText.trim();

    if (!message) {
      Alert.alert(t('settings.bugReportRequiredTitle'), t('settings.bugReportRequiredMessage'));
      return;
    }

    if (!subdomain) {
      Alert.alert(t('common.error'), t('settings.bugReportNoTenant'));
      return;
    }

    setBugReportSubmitting(true);
    try {
      await submitBugReport({
        tenantId: subdomain,
        message,
        source: 'settings',
        appVersion: APP_VERSION,
        buildNumber: BUILD_NUMBER,
        gitHash: GIT_HASH,
        platform: Platform.OS,
        metadata: {
          appVersionDisplay: VERSION_DISPLAY,
        },
      });
      setBugReportText('');
      setBugReportModalVisible(false);
      Alert.alert(t('settings.bugReportSentTitle'), t('settings.bugReportSentMessage'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('settings.bugReportFailed'));
    } finally {
      setBugReportSubmitting(false);
    }
  };

  const handleShowReleaseNotes = () => {
    setReleaseNotesModalVisible(true);
  };

  const handleChangePassword = () => {
    if (!user?.email) {
      Alert.alert(t('common.error'), t('settings.passwordResetNoEmail'));
      return;
    }

    setPasswordResetModalVisible(true);
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;

    setPasswordResetSubmitting(true);
    try {
      await sendPasswordReset(user.email);
      setPasswordResetModalVisible(false);
      Alert.alert(t('settings.passwordResetSentTitle'), t('settings.passwordResetSentMessage'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('settings.passwordResetFailed'));
    } finally {
      setPasswordResetSubmitting(false);
    }
  };

  const languageOptions: { label: string; code: SupportedLanguage; description: string }[] = [
    {
      label: t('settings.languageEnglish'),
      code: 'en',
      description: 'English',
    },
    {
      label: t('settings.languageSpanish'),
      code: 'es',
      description: 'Español',
    },
  ];

  const showClearCacheDialog = () => {
    Alert.alert(
      t('settings.forceResyncTitle'),
      t('settings.forceResyncMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.resyncButton'),
          onPress: async () => {
            try {
              await forceResync();
              Alert.alert(t('settings.resyncDoneTitle'), t('settings.resyncDoneMessage'));
            } catch (err: any) {
              Alert.alert(t('common.error'), err?.message || t('settings.resyncFailed'));
            }
          },
        },
      ]
    );
  };

  const performSwitchTenant = async () => {
    setIsSwitching(true);
    try {
      const { tenants, firebaseIdToken } = await switchTenant();
      setSwitchTenantModalVisible(false);
      runAfterAlertNavigationWork(() => {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'TenantSelect', params: { tenants, firebaseIdToken } }],
          }),
        );
        setIsSwitching(false);
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('settings.switchTenantError'));
      setIsSwitching(false);
    }
  };

  const handleSwitchTenant = () => {
    setSwitchTenantModalVisible(true);
  };

  const showLogoutDialog = () => {
    Alert.alert(
      t('settings.logoutAlertTitle'),
      t('settings.logoutAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{title}</Text>
  );

  const ListTile = ({
    icon,
    title,
    subtitle,
    trailing,
    onPress,
    titleColor,
    iconColor,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap;
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
    onPress?: () => void;
    titleColor?: string;
    iconColor?: string;
  }) => (
    <TouchableOpacity style={styles.listTile} onPress={onPress}>
      <MaterialIcons name={icon} size={24} color={iconColor || colors.textSecondary} />
      <View style={styles.listTileContent}>
        <Text
          style={[
            styles.listTileTitle,
            { color: titleColor || colors.text },
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.listTileSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      {trailing}
    </TouchableOpacity>
  );

  const renderSwitchTile = ({
    icon,
    title,
    subtitle,
    value,
    onValueChange,
    enabled = true,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap;
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    enabled?: boolean;
  }) => (
    <View style={[styles.listTile, !enabled && styles.listTileDisabled]}>
      <MaterialIcons name={icon} size={24} color={enabled ? colors.textSecondary : '#BDBDBD'} />
      <View style={styles.listTileContent}>
        <Text style={[styles.listTileTitle, { color: colors.text }, !enabled && styles.textDisabled]}>{title}</Text>
        {subtitle && (
          <Text
            style={[
              styles.listTileSubtitle,
              { color: colors.textSecondary },
              !enabled && styles.textDisabled,
            ]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={!enabled}
        trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
        thumbColor={value ? primaryColor : '#FAFAFA'}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Account Section */}
        <SectionHeader title={t('settings.sectionAccount')} />
        <View style={cardStyle}>
          <TouchableOpacity style={styles.profileTile} onPress={() => navigation.navigate('Profile')}>
            {user?.photo_url ? (
              <Image
                source={{ uri: getOptimizedImageUrl(user.photo_url as string, { width: 56, height: 56, mode: 'fill' }) || (user.photo_url as string) }}
                style={styles.profileAvatarImage}
              />
            ) : (
              <View style={[styles.profileAvatar, { backgroundColor: primaryColor }]}>
                <Text style={styles.profileInitials}>
                  {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                </Text>
              </View>
            )}
            <View style={styles.profileContent}>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'User'}</Text>
              <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>
                {t('settings.viewAndEditProfile')}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <ListTile
            icon="email"
            title={t('settings.email')}
            subtitle={user?.email || t('common.unknown')}
          />
        </View>

        {/* Tenant Section */}
        <SectionHeader title={t('settings.sectionTenant')} />
        <View style={cardStyle}>
          <View style={styles.listTile}>
            <MaterialIcons name="business" size={24} color={primaryColor} />
            <View style={styles.listTileContent}>
              <Text style={[styles.listTileTitle, { color: colors.text }]}>
                {subdomain ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1) : t('settings.noTenant')}
              </Text>
              <Text style={[styles.listTileSubtitle, { color: colors.textSecondary }]}>
                {t('settings.currentTenant')}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <ListTile
            icon="swap-horiz"
            title={t('settings.switchTenant')}
            subtitle={t('settings.switchTenantSubtitle')}
            trailing={
              isSwitching ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />
              )
            }
            onPress={handleSwitchTenant}
          />
        </View>

        {/* Notifications Section */}
        <SectionHeader title={t('settings.sectionNotifications')} />
        <View style={cardStyle}>
          {renderSwitchTile({
            icon: 'notifications',
            title: t('settings.enableNotifications'),
            subtitle: hasPermission ? t('settings.receiveAllNotifications') : t('settings.permissionNotGranted'),
            value: preferences.enabled,
            onValueChange: (val) => updatePreferences({ enabled: val }),
          })}
          <View style={styles.divider} />
          {renderSwitchTile({
            icon: 'notifications-active',
            title: t('settings.pushNotifications'),
            subtitle: t('settings.pushNotificationsSubtitle'),
            value: preferences.pushEnabled,
            onValueChange: (val) => updatePreferences({ pushEnabled: val }),
            enabled: preferences.enabled,
          })}
          <View style={styles.divider} />
          {renderSwitchTile({
            icon: 'volume-up',
            title: t('settings.sound'),
            subtitle: t('settings.soundSubtitle'),
            value: preferences.soundEnabled,
            onValueChange: (val) => updatePreferences({ soundEnabled: val }),
            enabled: preferences.enabled,
          })}
          <View style={styles.divider} />
          {renderSwitchTile({
            icon: 'vibration',
            title: t('settings.vibration'),
            subtitle: t('settings.vibrationSubtitle'),
            value: preferences.vibrationEnabled,
            onValueChange: (val) => updatePreferences({ vibrationEnabled: val }),
            enabled: preferences.enabled,
          })}
        </View>

        {/* Task Creation Section */}
        <SectionHeader title={t('settings.sectionTaskCreation')} />
        <View style={cardStyle}>
          {renderSwitchTile({
            icon: 'gps-fixed',
            title: t('settings.captureGpsLocation'),
            subtitle: t('settings.captureGpsLocationSubtitle'),
            value: gpsCaptureEnabled,
            onValueChange: handleGpsToggle,
          })}
        </View>

        {/* Task Lists Section */}
        <SectionHeader title={t('settings.sectionTaskLists')} />
        <View style={cardStyle}>
          {renderSwitchTile({
            icon: 'done-all',
            title: t('settings.showFinishedTasks'),
            subtitle: t('settings.showFinishedTasksSubtitle'),
            value: showFinishedTasks,
            onValueChange: setShowFinishedTasks,
          })}
        </View>

        {/* Workspaces Section */}
        <SectionHeader title={t('settings.sectionWorkspaces')} />
        <View style={cardStyle}>
          {renderSwitchTile({
            icon: 'inbox',
            title: t('settings.hideSharedWithMe'),
            subtitle: t('settings.hideSharedWithMeSubtitle'),
            value: hideSharedWithMe,
            onValueChange: handleHideSharedWithMeToggle,
          })}
        </View>

        {/* Appearance Section */}
        <SectionHeader title={t('settings.sectionAppearance')} />
        <View style={cardStyle}>
          {renderSwitchTile({
            icon: isDarkMode ? 'dark-mode' : 'light-mode',
            title: t('settings.darkMode'),
            subtitle: t('settings.darkModeSubtitle'),
            value: isDarkMode,
            onValueChange: toggleDarkMode,
          })}
          <View style={styles.divider} />
          <ListTile
            icon="palette"
            title={t('settings.theme')}
            subtitle={currentThemeLabel}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => navigation.navigate('Themes')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="language"
            title={t('settings.language')}
            subtitle={language === 'es' ? 'Español' : 'English'}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={showLanguageDialog}
          />
          <View style={styles.divider} />
          {renderSwitchTile({
            icon: 'schedule',
            title: t('settings.use24HourTime'),
            subtitle: timeFormat === '24h' ? t('settings.timeFormat24Hour') : t('settings.timeFormat12Hour'),
            value: timeFormat === '24h',
            onValueChange: (value) => setTimeFormat(value ? '24h' : '12h'),
          })}
        </View>

        {/* Privacy & Security Section */}
        <SectionHeader title={t('settings.sectionPrivacySecurity')} />
        <View style={cardStyle}>
          <ListTile
            icon="lock"
            title={t('settings.changePassword')}
            subtitle={t('settings.changePasswordSubtitle')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={handleChangePassword}
          />
          <View style={styles.divider} />
          <ListTile
            icon="shield"
            title={t('settings.privacyPolicy')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => openExternalUrl(PRIVACY_POLICY_URL)}
          />
          <View style={styles.divider} />
          <ListTile
            icon="description"
            title={t('settings.termsOfService')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => openExternalUrl(TERMS_OF_SERVICE_URL)}
          />
        </View>

        {/* Data & Storage Section */}
        <SectionHeader title={t('settings.sectionDataStorage')} />
        <View style={cardStyle}>
          <ListTile
            icon="sync"
            title={t('settings.offlineQueue')}
            subtitle={
              failedCount > 0
                ? t('settings.offlineQueueSubtitleWithFailed', { count: pendingCount, failed: failedCount })
                : t('settings.offlineQueueSubtitle', { count: pendingCount })
            }
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => navigation.navigate('OfflineQueue')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="storage"
            title={t('settings.clearCache')}
            subtitle={t('settings.clearCacheSubtitle')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={showClearCacheDialog}
          />
        </View>

        {/* Support Section */}
        <SectionHeader title={t('settings.sectionSupport')} />
        <View style={cardStyle}>
          <ListTile
            icon="bug-report"
            title={t('settings.reportBug')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => setBugReportModalVisible(true)}
          />
        </View>

        {/* About Section */}
        <SectionHeader title={t('settings.sectionAbout')} />
        <View style={cardStyle}>
          <ListTile
            icon="info-outline"
            title={t('settings.appVersion')}
            subtitle={VERSION_DISPLAY}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => setAppDetailsModalVisible(true)}
          />
          <View style={styles.divider} />
          <ListTile
            icon="article"
            title={t('settings.releaseNotes')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={handleShowReleaseNotes}
          />
        </View>

        {/* Logout Button */}
        <View style={[cardStyle, { marginTop: 20 }]}>
          <ListTile
            icon="logout"
            title={t('settings.logout')}
            titleColor="#F44336"
            iconColor="#F44336"
            onPress={showLogoutDialog}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={languageModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => setLanguageModalVisible(false)} />
          <View
            style={[
              styles.languageSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <Text style={[styles.languageTitle, { color: colors.text }]}>{t('settings.selectLanguageTitle')}</Text>
            <Text style={[styles.languageSubtitle, { color: colors.textSecondary }]}>{t('settings.selectLanguageMessage')}</Text>

            {languageOptions.map((option) => {
              const selected = language === option.code;

              return (
                <TouchableOpacity
                  key={option.code}
                  style={[
                    styles.languageOption,
                    {
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5EF',
                      borderColor: selected ? primaryColor : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setLanguage(option.code);
                    setLanguageModalVisible(false);
                  }}
                >
                  <View style={styles.languageOptionContent}>
                    <Text style={[styles.languageOptionTitle, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.languageOptionDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                  </View>
                  {selected && (
                    <View style={[styles.languageCheck, { backgroundColor: primaryColor }]}>
                      <MaterialIcons name="check" size={16} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.languageCancel,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                },
              ]}
              activeOpacity={0.85}
              onPress={() => setLanguageModalVisible(false)}
            >
              <Text style={[styles.languageCancelText, { color: colors.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={switchTenantModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isSwitching && setSwitchTenantModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => !isSwitching && setSwitchTenantModalVisible(false)} />
          <View
            style={[
              styles.languageSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <View style={[styles.passwordResetIcon, { backgroundColor: `${primaryColor}18` }]}>
              <MaterialIcons name="swap-horiz" size={26} color={primaryColor} />
            </View>
            <Text style={[styles.languageTitle, styles.centeredModalTitle, { color: colors.text }]}>{t('settings.switchTenantAlertTitle')}</Text>
            <Text style={[styles.passwordResetMessage, { color: colors.textSecondary }]}>{t('settings.switchTenantAlertMessage')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalSecondaryButton,
                  {
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
                disabled={isSwitching}
                onPress={() => setSwitchTenantModalVisible(false)}
              >
                <Text style={[styles.modalSecondaryButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, { backgroundColor: primaryColor }, isSwitching && styles.modalButtonDisabled]}
                disabled={isSwitching}
                onPress={performSwitchTenant}
              >
                {isSwitching ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>{t('settings.switchTenantButton')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={bugReportModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setBugReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => !bugReportSubmitting && setBugReportModalVisible(false)} />
          <View
            style={[
              styles.languageSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <Text style={[styles.languageTitle, { color: colors.text }]}>{t('settings.reportBug')}</Text>
            <Text style={[styles.languageSubtitle, { color: colors.textSecondary }]}>{t('settings.bugReportPrompt')}</Text>
            <TextInput
              style={[
                styles.bugReportInput,
                {
                  color: colors.text,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5EF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                },
              ]}
              value={bugReportText}
              onChangeText={setBugReportText}
              placeholder={t('settings.bugReportPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={4000}
              textAlignVertical="top"
              editable={!bugReportSubmitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalSecondaryButton,
                  {
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
                disabled={bugReportSubmitting}
                onPress={() => setBugReportModalVisible(false)}
              >
                <Text style={[styles.modalSecondaryButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, { backgroundColor: primaryColor }, bugReportSubmitting && styles.modalButtonDisabled]}
                disabled={bugReportSubmitting}
                onPress={handleSubmitBugReport}
              >
                {bugReportSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>{t('settings.submitBugReport')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordResetModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !passwordResetSubmitting && setPasswordResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => !passwordResetSubmitting && setPasswordResetModalVisible(false)} />
          <View
            style={[
              styles.languageSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <View style={[styles.passwordResetIcon, { backgroundColor: `${primaryColor}18` }]}>
              <MaterialIcons name="lock-reset" size={26} color={primaryColor} />
            </View>
            <Text style={[styles.languageTitle, styles.centeredModalTitle, { color: colors.text }]}>{t('settings.changePassword')}</Text>
            <Text style={[styles.passwordResetMessage, { color: colors.textSecondary }]}>
              {t('settings.passwordResetConfirmMessage', { email: user?.email || '' })}
            </Text>
            <View
              style={[
                styles.passwordResetEmailPill,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F8F5EF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
                },
              ]}
            >
              <MaterialIcons name="mail-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.passwordResetEmailText, { color: colors.text }]} numberOfLines={1}>{user?.email}</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalSecondaryButton,
                  {
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
                disabled={passwordResetSubmitting}
                onPress={() => setPasswordResetModalVisible(false)}
              >
                <Text style={[styles.modalSecondaryButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, { backgroundColor: primaryColor }, passwordResetSubmitting && styles.modalButtonDisabled]}
                disabled={passwordResetSubmitting}
                onPress={handleSendPasswordReset}
              >
                {passwordResetSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>{t('settings.sendResetEmail')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={appDetailsModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAppDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => setAppDetailsModalVisible(false)} />
          <View
            style={[
              styles.releaseNotesSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <Text style={[styles.languageTitle, { color: colors.text }]}>{t('settings.appDetails')}</Text>
            <View style={styles.appDetailsList}>
              <View style={styles.appDetailsRow}>
                <Text style={[styles.appDetailsLabel, { color: colors.textSecondary }]}>{t('settings.appVersion')}</Text>
                <Text style={[styles.appDetailsValue, { color: colors.text }]}>{APP_VERSION}</Text>
              </View>
              <View style={styles.appDetailsRow}>
                <Text style={[styles.appDetailsLabel, { color: colors.textSecondary }]}>{t('settings.buildNumber')}</Text>
                <Text style={[styles.appDetailsValue, { color: colors.text }]}>{BUILD_NUMBER}</Text>
              </View>
              <View style={styles.appDetailsRow}>
                <Text style={[styles.appDetailsLabel, { color: colors.textSecondary }]}>{t('settings.gitHash')}</Text>
                <Text style={[styles.appDetailsValue, { color: colors.text }]}>{GIT_HASH}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.languageCancel, { backgroundColor: primaryColor, borderColor: primaryColor }]}
              activeOpacity={0.85}
              onPress={() => setAppDetailsModalVisible(false)}
            >
              <Text style={[styles.languageCancelText, { color: '#FFFFFF' }]}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={releaseNotesModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setReleaseNotesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalScrim} onPress={() => setReleaseNotesModalVisible(false)} />
          <View
            style={[
              styles.releaseNotesSheet,
              {
                backgroundColor: colors.surface,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
              },
            ]}
          >
            <View style={[styles.languageHandle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />
            <Text style={[styles.languageTitle, { color: colors.text }]}>{bundledReleaseNotes.title || bundledReleaseNotes.tagName || t('settings.releaseNotes')}</Text>
            <ScrollView style={styles.releaseNotesBody}>
              <Markdown
                onLinkPress={(url) => {
                  openExternalUrl(url);
                  return false;
                }}
                style={{
                  body: {
                    color: colors.textSecondary,
                    fontSize: fontSizes.sm,
                    lineHeight: 21,
                    fontFamily: fontFamilies.bodyRegular,
                  },
                  heading1: {
                    color: colors.text,
                    fontSize: fontSizes.lg,
                    lineHeight: 26,
                    fontFamily: fontFamilies.displaySemibold,
                    marginTop: 4,
                    marginBottom: 10,
                  },
                  heading2: {
                    color: colors.text,
                    fontSize: fontSizes.md,
                    lineHeight: 24,
                    fontFamily: fontFamilies.bodySemibold,
                    marginTop: 14,
                    marginBottom: 8,
                  },
                  heading3: {
                    color: colors.text,
                    fontSize: fontSizes.sm,
                    lineHeight: 21,
                    fontFamily: fontFamilies.bodySemibold,
                    marginTop: 12,
                    marginBottom: 6,
                  },
                  paragraph: {
                    marginTop: 0,
                    marginBottom: 8,
                  },
                  bullet_list: {
                    marginBottom: 8,
                  },
                  ordered_list: {
                    marginBottom: 8,
                  },
                  list_item: {
                    marginBottom: 5,
                  },
                  bullet_list_icon: {
                    color: colors.textSecondary,
                  },
                  ordered_list_icon: {
                    color: colors.textSecondary,
                  },
                  strong: {
                    color: colors.text,
                    fontFamily: fontFamilies.bodySemibold,
                  },
                  code_inline: {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(30,35,33,0.08)',
                    color: colors.text,
                    borderRadius: 4,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    fontFamily: fontFamilies.bodyMedium,
                  },
                  code_block: {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(30,35,33,0.06)',
                    color: colors.text,
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(30,35,33,0.10)',
                    borderRadius: radius.md,
                    fontFamily: fontFamilies.bodyRegular,
                  },
                  fence: {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(30,35,33,0.06)',
                    color: colors.text,
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(30,35,33,0.10)',
                    borderRadius: radius.md,
                    fontFamily: fontFamilies.bodyRegular,
                  },
                  link: {
                    color: primaryColor,
                  },
                }}
              >
                {releaseNotesMarkdown}
              </Markdown>
            </ScrollView>
            <TouchableOpacity
              style={[styles.languageCancel, { backgroundColor: primaryColor, borderColor: primaryColor }]}
              activeOpacity={0.85}
              onPress={() => setReleaseNotesModalVisible(false)}
            >
              <Text style={[styles.languageCancelText, { color: '#FFFFFF' }]}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
    color: '#616161',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6E1D7',
    ...shadows.subtle,
  },
  profileTile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#14B7A3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileInitials: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyBold,
    color: '#FFFFFF',
  },
  profileContent: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
    color: '#1E2321',
  },
  profileSubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    color: '#6C746F',
    marginTop: 2,
  },
  listTile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  listTileDisabled: {
    opacity: 0.5,
  },
  listTileContent: {
    flex: 1,
    marginLeft: 16,
  },
  listTileTitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#1E2321',
  },
  listTileSubtitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    color: '#6C746F',
    marginTop: 2,
  },
  textDisabled: {
    color: '#BDBDBD',
  },
  divider: {
    height: 1,
    backgroundColor: '#F5F5F5',
    marginLeft: 56,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  languageSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    ...shadows.lifted,
  },
  languageHandle: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: 16,
  },
  languageTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  centeredModalTitle: {
    textAlign: 'center',
  },
  languageSubtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  languageOptionContent: {
    flex: 1,
  },
  languageOptionTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  languageOptionDescription: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  languageCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  languageCancel: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  languageCancelText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  bugReportInput: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalSecondaryButton: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  modalPrimaryButton: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  modalButtonDisabled: {
    opacity: 0.65,
  },
  passwordResetIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  passwordResetMessage: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
  },
  passwordResetEmailPill: {
    minHeight: 44,
    marginTop: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passwordResetEmailText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  releaseNotesSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    ...shadows.lifted,
  },
  releaseNotesLoading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  releaseNotesBody: {
    maxHeight: 420,
    marginTop: 12,
    marginBottom: 12,
  },
  releaseNotesText: {
    fontSize: fontSizes.sm,
    lineHeight: 21,
    fontFamily: fontFamilies.bodyRegular,
  },
  appDetailsList: {
    marginTop: 14,
    marginBottom: 14,
    gap: 12,
  },
  appDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  appDetailsLabel: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  appDetailsValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
});
