import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, primaryColor, isDarkMode, toggleDarkMode } = useTheme();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

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
      'Clear Cache',
      'This will clear 125 MB of cached data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: () => Alert.alert('Done', 'Cache cleared successfully'),
        },
      ]
    );
  };

  const showLogoutDialog = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            navigation.goBack();
            Alert.alert('Done', 'Logged out successfully');
          },
        },
      ]
    );
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
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
      <MaterialIcons name={icon} size={24} color={iconColor || '#616161'} />
      <View style={styles.listTileContent}>
        <Text style={[styles.listTileTitle, titleColor && { color: titleColor }]}>{title}</Text>
        {subtitle && <Text style={styles.listTileSubtitle}>{subtitle}</Text>}
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
      <MaterialIcons name={icon} size={24} color={enabled ? '#616161' : '#BDBDBD'} />
      <View style={styles.listTileContent}>
        <Text style={[styles.listTileTitle, !enabled && styles.textDisabled]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.listTileSubtitle, !enabled && styles.textDisabled]}>{subtitle}</Text>
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
        <View style={styles.card}>
          <TouchableOpacity style={styles.profileTile} onPress={() => showComingSoon('Profile editing')}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitials}>JD</Text>
            </View>
            <View style={styles.profileContent}>
              <Text style={styles.profileName}>John Doe</Text>
              <Text style={styles.profileSubtitle}>View and edit profile</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#BDBDBD" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <ListTile
            icon="email"
            title="Email"
            subtitle="user@whagons.com"
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

        {/* Notifications Section */}
        <SectionHeader title="Notifications" />
        <View style={styles.card}>
          <SwitchTile
            icon="notifications"
            title="Enable Notifications"
            subtitle="Receive all notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="notifications-active"
            title="Push Notifications"
            subtitle="Alert on new tasks"
            value={pushNotifications}
            onValueChange={setPushNotifications}
            enabled={notificationsEnabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="email"
            title="Email Notifications"
            subtitle="Daily task summary"
            value={emailNotifications}
            onValueChange={setEmailNotifications}
            enabled={notificationsEnabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="volume-up"
            title="Sound"
            subtitle="Notification sounds"
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            enabled={notificationsEnabled}
          />
          <View style={styles.divider} />
          <SwitchTile
            icon="vibration"
            title="Vibration"
            subtitle="Vibrate on notifications"
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
            enabled={notificationsEnabled}
          />
        </View>

        {/* Appearance Section */}
        <SectionHeader title="Appearance" />
        <View style={styles.card}>
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
        <View style={styles.card}>
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
        <View style={styles.card}>
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
        <View style={styles.card}>
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
        <View style={styles.card}>
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
        <View style={[styles.card, { marginTop: 20 }]}>
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
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
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
  profileInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileContent: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  profileSubtitle: {
    fontSize: 14,
    color: '#757575',
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
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
  },
  listTileSubtitle: {
    fontSize: 13,
    color: '#757575',
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
