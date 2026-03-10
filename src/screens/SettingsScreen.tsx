import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../models/types';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { clearAllData } from '../store/database';
import { fontFamilies, fontSizes, radius, shadows } from '../config/designTokens';

type SettingsNavProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsNavProp>();
  const { colors, primaryColor, isDarkMode, toggleDarkMode } = useTheme();
  const { preferences, updatePreferences, hasPermission } = useNotifications();
  const { user, logout, subdomain, switchTenant } = useAuth();
  const { forceResync } = useData();
  const [isSwitching, setIsSwitching] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E6E1D7' },
  ];

  const showComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} coming soon`);
  };

  const showLanguageDialog = () => {
    const languages = ['English', 'Spanish', 'French', 'German', 'Portuguese'];
    Alert.alert(
      'Select Language',
      'Choose your preferred language',
      languages.map(lang => ({
        text: lang,
        onPress: () => setSelectedLanguage(lang),
      }))
    );
  };

  const showClearCacheDialog = () => {
    Alert.alert(
      'Force Resync',
      'This will clear all cached data and resync everything from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resync',
          onPress: async () => {
            try {
              await forceResync();
              Alert.alert('Done', 'Data resynced successfully');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Resync failed');
            }
          },
        },
      ]
    );
  };

  const handleSwitchTenant = () => {
    Alert.alert(
      'Switch Workspace',
      'This will clear your current data and let you pick a different workspace.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setIsSwitching(true);
            try {
              await clearAllData();
              const { tenants, firebaseIdToken } = await switchTenant();
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'TenantSelect', params: { tenants, firebaseIdToken } }],
                }),
              );
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to switch workspace');
            } finally {
              setIsSwitching(false);
            }
          },
        },
      ],
    );
  };

  const showLogoutDialog = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You can pick a different workspace when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            await logout();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              }),
            );
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Account Section */}
        <SectionHeader title="Account" />
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
                View and edit profile
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <ListTile
            icon="email"
            title="Email"
            subtitle={user?.email || 'Not set'}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Email settings')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="phone"
            title="Phone"
            subtitle="+1 (555) 123-4567"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Phone settings')}
          />
        </View>

        {/* Workspace Section */}
        <SectionHeader title="Workspace" />
        <View style={cardStyle}>
          <View style={styles.listTile}>
            <MaterialIcons name="business" size={24} color={primaryColor} />
            <View style={styles.listTileContent}>
              <Text style={[styles.listTileTitle, { color: colors.text }]}>
                {subdomain ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1) : 'No workspace'}
              </Text>
              <Text style={[styles.listTileSubtitle, { color: colors.textSecondary }]}>
                Current workspace
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <ListTile
            icon="swap-horiz"
            title="Switch Workspace"
            subtitle="Sign into a different workspace"
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
        <SectionHeader title="Notifications" />
        <View style={cardStyle}>
          <SwitchTile
            icon="notifications"
            title="Enable Notifications"
            subtitle={hasPermission ? 'Receive all notifications' : 'Permission not granted'}
            value={preferences.enabled}
            onValueChange={(val) => updatePreferences({ enabled: val })}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="notifications-active"
            title="Push Notifications"
            subtitle="Alert on new tasks"
            value={preferences.pushEnabled}
            onValueChange={(val) => updatePreferences({ pushEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="email"
            title="Email Notifications"
            subtitle="Daily task summary"
            value={preferences.emailEnabled}
            onValueChange={(val) => updatePreferences({ emailEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="volume-up"
            title="Sound"
            subtitle="Notification sounds"
            value={preferences.soundEnabled}
            onValueChange={(val) => updatePreferences({ soundEnabled: val })}
            enabled={preferences.enabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="vibration"
            title="Vibration"
            subtitle="Vibrate on notifications"
            value={preferences.vibrationEnabled}
            onValueChange={(val) => updatePreferences({ vibrationEnabled: val })}
            enabled={preferences.enabled}
          />
        </View>

        {/* Appearance Section */}
        <SectionHeader title="Appearance" />
        <View style={cardStyle}>
          <SwitchTile
            icon={isDarkMode ? 'dark-mode' : 'light-mode'}
            title="Dark Mode"
            subtitle="Use dark theme"
            value={isDarkMode}
            onValueChange={toggleDarkMode}
          />
          <View style={styles.divider} />
          <ListTile
            icon="palette"
            title="Theme"
            subtitle="Customize app colors"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Theme customization')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="language"
            title="Language"
            subtitle={selectedLanguage}
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={showLanguageDialog}
          />
        </View>

        {/* Privacy & Security Section */}
        <SectionHeader title="Privacy & Security" />
        <View style={cardStyle}>
          <SwitchTile
            icon="fingerprint"
            title="Biometric Login"
            subtitle="Use fingerprint/face ID"
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
          />
          <View style={styles.divider} />
          <ListTile
            icon="lock"
            title="Change Password"
            subtitle="Update your password"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Password change')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="shield"
            title="Privacy Policy"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Privacy policy')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="description"
            title="Terms of Service"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Terms of service')}
          />
        </View>

        {/* Data & Storage Section */}
        <SectionHeader title="Data & Storage" />
        <View style={cardStyle}>
          <SwitchTile
            icon="backup"
            title="Auto Backup"
            subtitle="Backup data automatically"
            value={autoBackup}
            onValueChange={setAutoBackup}
          />
          <View style={styles.divider} />
          <ListTile
            icon="cloud-download"
            title="Download Data"
            subtitle="Export your data"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Data export')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="storage"
            title="Clear Cache"
            subtitle="125 MB"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={showClearCacheDialog}
          />
        </View>

        {/* Support Section */}
        <SectionHeader title="Support" />
        <View style={cardStyle}>
          <ListTile
            icon="help-outline"
            title="Help Center"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Help center')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="chat-bubble-outline"
            title="Contact Support"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Contact support')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="rate-review"
            title="Rate App"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Rate app')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="bug-report"
            title="Report Bug"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Bug report')}
          />
        </View>

        {/* About Section */}
        <SectionHeader title="About" />
        <View style={cardStyle}>
          <ListTile
            icon="info-outline"
            title="App Version"
            subtitle="1.0.0 (Build 1)"
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <ListTile
            icon="update"
            title="Check for Updates"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Check updates')}
          />
          <View style={styles.divider} />
          <ListTile
            icon="article"
            title="What's New"
            trailing={<MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />}
            onPress={() => showComingSoon('Release notes')}
          />
        </View>

        {/* Logout Button */}
        <View style={[cardStyle, { marginTop: 20 }]}>
          <ListTile
            icon="logout"
            title="Logout"
            titleColor="#F44336"
            iconColor="#F44336"
            onPress={showLogoutDialog}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
});
