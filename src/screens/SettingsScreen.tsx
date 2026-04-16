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
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { VERSION_DISPLAY } from '../config/version';
import { useData } from '../context/DataContext';
import { useLanguage, SupportedLanguage } from '../context/LanguageContext';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

export const GPS_CAPTURE_STORAGE_KEY = '@whagons/gps_capture_enabled';

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
  const { colors, primaryColor, isDarkMode, toggleDarkMode } = useTheme();
  const { preferences, updatePreferences, hasPermission } = useNotifications();
  const { user, logout, subdomain, switchTenant } = useAuth();
  const { forceResync } = useData();
  const { language, setLanguage, t } = useLanguage();
  const [isSwitching, setIsSwitching] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [gpsCaptureEnabled, setGpsCaptureEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(GPS_CAPTURE_STORAGE_KEY).then((val) => {
      if (val !== null) setGpsCaptureEnabled(val === 'true');
    });
  }, []);

  const handleGpsToggle = (val: boolean) => {
    setGpsCaptureEnabled(val);
    AsyncStorage.setItem(GPS_CAPTURE_STORAGE_KEY, String(val));
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' },
  ];

  const showComingSoon = (feature: string) => {
    Alert.alert(t('common.comingSoonTitle'), t('common.comingSoonMessage', { feature }));
  };

  const showLanguageDialog = () => {
    setLanguageModalVisible(true);
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

  const handleSwitchTenant = () => {
    Alert.alert(
      t('settings.switchTenantAlertTitle'),
      t('settings.switchTenantAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.switchTenantButton'),
          onPress: async () => {
            setIsSwitching(true);
            try {
              const { tenants, firebaseIdToken } = await switchTenant();
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
          },
        },
      ],
    );
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
            runAfterAlertNavigationWork(() => {
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                }),
              );
            });
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

  const SwitchTile = ({
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
          <TouchableOpacity style={styles.profileTile} onPress={() => showComingSoon('Profile editing')}>
            {user?.photo_url ? (
              <Image
                source={{ uri: user.photo_url as string }}
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
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Email settings')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="phone"
            title={t('settings.phone')}
            subtitle={t('common.unknown')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Phone settings')}
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
          <SwitchTile
            icon="notifications"
            title={t('settings.enableNotifications')}
            subtitle={hasPermission ? t('settings.receiveAllNotifications') : t('settings.permissionNotGranted')}
            value={preferences.enabled}
            onValueChange={(val) => updatePreferences({ enabled: val })}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="notifications-active"
            title={t('settings.pushNotifications')}
            subtitle={t('settings.pushNotificationsSubtitle')}
            value={preferences.pushEnabled}
            onValueChange={(val) => updatePreferences({ pushEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="email"
            title={t('settings.emailNotifications')}
            subtitle={t('settings.emailNotificationsSubtitle')}
            value={preferences.emailEnabled}
            onValueChange={(val) => updatePreferences({ emailEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="volume-up"
            title={t('settings.sound')}
            subtitle={t('settings.soundSubtitle')}
            value={preferences.soundEnabled}
            onValueChange={(val) => updatePreferences({ soundEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="vibration"
            title={t('settings.vibration')}
            subtitle={t('settings.vibrationSubtitle')}
            value={preferences.vibrationEnabled}
            onValueChange={(val) => updatePreferences({ vibrationEnabled: val })}
            enabled={preferences.enabled}
          />
        </View>

        {/* Task Creation Section */}
        <SectionHeader title={t('settings.sectionTaskCreation')} />
        <View style={cardStyle}>
          <SwitchTile
            icon="gps-fixed"
            title={t('settings.captureGpsLocation')}
            subtitle={t('settings.captureGpsLocationSubtitle')}
            value={gpsCaptureEnabled}
            onValueChange={handleGpsToggle}
          />
        </View>

        {/* Appearance Section */}
        <SectionHeader title={t('settings.sectionAppearance')} />
        <View style={cardStyle}>
          <SwitchTile
            icon={isDarkMode ? 'dark-mode' : 'light-mode'}
            title={t('settings.darkMode')}
            subtitle={t('settings.darkModeSubtitle')}
            value={isDarkMode}
            onValueChange={toggleDarkMode}
          />
          <View style={styles.divider} />
          <ListTile
            icon="palette"
            title={t('settings.theme')}
            subtitle={t('settings.themeSubtitle')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Theme customization')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="language"
            title={t('settings.language')}
            subtitle={language === 'es' ? 'Español' : 'English'}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={showLanguageDialog}
          />
        </View>

        {/* Privacy & Security Section */}
        <SectionHeader title={t('settings.sectionPrivacySecurity')} />
        <View style={cardStyle}>
          <SwitchTile
            icon="fingerprint"
            title={t('settings.biometricLogin')}
            subtitle={t('settings.biometricLoginSubtitle')}
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
          />
          <View style={styles.divider} />
          <ListTile
            icon="lock"
            title={t('settings.changePassword')}
            subtitle={t('settings.changePasswordSubtitle')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Password change')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="shield"
            title={t('settings.privacyPolicy')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Privacy policy')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="description"
            title={t('settings.termsOfService')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Terms of service')}
          />
        </View>

        {/* Data & Storage Section */}
        <SectionHeader title={t('settings.sectionDataStorage')} />
        <View style={cardStyle}>
          <SwitchTile
            icon="backup"
            title={t('settings.autoBackup')}
            subtitle={t('settings.autoBackupSubtitle')}
            value={autoBackup}
            onValueChange={setAutoBackup}
          />
          <View style={styles.divider} />
          <ListTile
            icon="cloud-download"
            title={t('settings.downloadData')}
            subtitle={t('settings.downloadDataSubtitle')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Data export')}
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
            icon="help-outline"
            title={t('settings.helpCenter')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Help center')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="chat-bubble-outline"
            title={t('settings.contactSupport')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Contact support')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="rate-review"
            title={t('settings.rateApp')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Rate app')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="bug-report"
            title={t('settings.reportBug')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Bug report')}
          />
        </View>

        {/* About Section */}
        <SectionHeader title={t('settings.sectionAbout')} />
        <View style={cardStyle}>
          <ListTile
            icon="info-outline"
            title={t('settings.appVersion')}
            subtitle={VERSION_DISPLAY}
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <ListTile
            icon="update"
            title={t('settings.checkForUpdates')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Check updates')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="article"
            title={t('settings.whatsNew')}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Release notes')}
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
});
