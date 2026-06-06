import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNotifications } from '../context/NotificationContext';
import { RootStackParamList, CardDensity } from '../models/types';
import { DEFAULT_WORKSPACE_COLOR } from '../utils/helpers';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';

type DrawerNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AppDrawerProps {
  onClose: () => void;
  onWorkspaceSelect?: (workspaceName: string) => void;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({ onClose, onWorkspaceSelect }) => {
  const navigation = useNavigation<DrawerNavigationProp>();
  const { isDarkMode, toggleDarkMode, primaryColor, colors } = useTheme();
  const { t } = useLanguage();
  const { cardDensity, setCardDensity, selectedWorkspace, setSelectedWorkspace, workspaceObjects, totalTaskCount } = useTasks();
  const { logout, user, subdomain } = useAuth();
  const { data } = useData();
  const { unreadCount: notificationCount } = useNotifications();
  const { tenantId } = useTenant();
  const taskSummaryCounts = useQuery(
    api.bulk.taskSummaryCounts,
    tenantId ? { tenantId } : 'skip',
  );

  const surfaceSecondary = isDarkMode ? '#2A2A2A' : '#F5F5F7';
  const borderTertiary = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textTertiary = isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const infoColor = '#2563EB';

  const taskCountsByWorkspace = useMemo(() => {
    const counts = new Map<string | number, number>();

    if (taskSummaryCounts?.byWorkspace) {
      for (const ws of workspaceObjects) {
        const convexId = (ws as any)._id;
        const count = convexId ? taskSummaryCounts.byWorkspace[String(convexId)] : undefined;
        if (typeof count === 'number') {
          counts.set(ws.id, count);
          if (convexId) counts.set(String(convexId), count);
        }
      }
      return counts;
    }

    for (const task of data.tasks) {
      const wsId = (task as any).workspace_id;
      if (wsId != null) {
        counts.set(wsId, (counts.get(wsId) || 0) + 1);
      }
    }
    return counts;
  }, [data.tasks, taskSummaryCounts, workspaceObjects]);

  const aggregateTotalTaskCount = useMemo<number>(() => {
    return taskSummaryCounts?.total ?? data.tasks.length ?? totalTaskCount;
  }, [data.tasks.length, taskSummaryCounts?.total, totalTaskCount]);

  const handleNavigate = (screen: keyof RootStackParamList) => {
    onClose();
    navigation.navigate(screen as any);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const handleWorkspaceSelect = (name: string) => {
    if (onWorkspaceSelect) {
      onWorkspaceSelect(name);
    } else {
      setSelectedWorkspace(name);
    }
    onClose();
  };

  const orgName = subdomain
    ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1)
    : t('component.appDrawer.defaultOrgName');

  const userInitial = user?.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────────── */}
        <View style={[styles.profileCard, { backgroundColor: surfaceSecondary }]}>
          <View style={styles.orgRow}>
            <View style={[styles.orgAvatar, { backgroundColor: `${primaryColor}20` }]}>
              <Image source={require('../../assets/whagons-check.png')} style={styles.orgLogo} />
            </View>
            <View style={styles.orgInfo}>
              <Text style={[styles.orgName, { color: colors.text }]}>{orgName}</Text>
              <Text style={[styles.orgTagline, { color: textTertiary }]}>
                {t('component.appDrawer.operationalIntelligence')}
              </Text>
            </View>
          </View>

          {user && (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => handleNavigate('Profile')}
              activeOpacity={0.7}
            >
              {user.photo_url ? (
                <Image source={{ uri: getOptimizedImageUrl(user.photo_url, { width: 52, height: 52, mode: 'fill' }) || user.photo_url }} style={styles.userAvatarImage} />
              ) : (
                <View style={[styles.userAvatar, { backgroundColor: primaryColor }]}>
                  <Text style={styles.userAvatarText}>{userInitial}</Text>
                </View>
              )}
              <Text style={[styles.userName, { color: colors.textSecondary }]} numberOfLines={1}>
                {user.name ?? user.email}
              </Text>
              <View style={[styles.rolePill, { backgroundColor: `${primaryColor}15` }]}>
                <Text style={[styles.roleText, { color: primaryColor }]}>{t('component.appDrawer.roleMember')}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Workspaces section ───────────────────────────────────── */}
        <Text style={[styles.sectionHeader, { color: textTertiary }]}>{t('component.appDrawer.sectionWorkspaces')}</Text>

        {/* Everything */}
        <TouchableOpacity
          style={[
            styles.workspaceRow,
            selectedWorkspace === 'Everything' && { backgroundColor: surfaceSecondary },
          ]}
          onPress={() => handleWorkspaceSelect('Everything')}
          activeOpacity={0.6}
        >
          <View style={[styles.workspaceDot, { backgroundColor: isDarkMode ? '#6B7280' : '#374151' }]} />
          <Text
            style={[
              styles.workspaceName,
              { color: selectedWorkspace === 'Everything' ? infoColor : colors.text },
              selectedWorkspace === 'Everything' && { fontFamily: fontFamilies.bodySemibold },
            ]}
            numberOfLines={1}
          >
            {t('component.appDrawer.workspaceEverything')}
          </Text>
          <Text style={[styles.workspaceCount, { color: textTertiary }]}>{aggregateTotalTaskCount}</Text>
        </TouchableOpacity>

        {workspaceObjects.map((ws) => {
          const isActive = selectedWorkspace === ws.name;
          const wsColor = ws.color || DEFAULT_WORKSPACE_COLOR;
          const count = taskCountsByWorkspace.get(ws.id) ?? 0;
          return (
            <TouchableOpacity
              key={String(ws.id)}
              style={[
                styles.workspaceRow,
                isActive && { backgroundColor: surfaceSecondary },
              ]}
              onPress={() => handleWorkspaceSelect(ws.name)}
              activeOpacity={0.6}
            >
              <View style={[styles.workspaceDot, { backgroundColor: wsColor }]} />
              <Text
                style={[
                  styles.workspaceName,
                  { color: isActive ? infoColor : colors.text },
                  isActive && { fontFamily: fontFamilies.bodySemibold },
                ]}
                numberOfLines={1}
              >
                {ws.name}
              </Text>
              <Text style={[styles.workspaceCount, { color: textTertiary }]}>{count}</Text>
            </TouchableOpacity>
          );
        })}

        <View style={[styles.sectionDivider, { borderColor: borderTertiary }]} />

        {/* ── General section ──────────────────────────────────────── */}
        <Text style={[styles.sectionHeader, { color: textTertiary }]}>{t('component.appDrawer.sectionGeneral')}</Text>

        {/* NFC cards */}
        <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigate('NfcManager')} activeOpacity={0.6}>
          <MaterialIcons name="nfc" size={20} color={colors.textSecondary} />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuNfcCards')}</Text>
          <MaterialIcons name="chevron-right" size={14} color={textTertiary} />
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigate('Notifications')} activeOpacity={0.6}>
          <MaterialIcons name="notifications-none" size={20} color={colors.textSecondary} />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuNotifications')}</Text>
          {notificationCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {notificationCount > 99 ? t('component.appDrawer.notifBadgeOverflow') : notificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Profile */}
        <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigate('Profile')} activeOpacity={0.6}>
          <MaterialIcons name="person-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuProfile')}</Text>
          <MaterialIcons name="chevron-right" size={14} color={textTertiary} />
        </TouchableOpacity>

        {/* Settings */}
        <TouchableOpacity style={styles.menuRow} onPress={() => handleNavigate('Settings')} activeOpacity={0.6}>
          <MaterialIcons name="settings" size={20} color={colors.textSecondary} />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuSettings')}</Text>
          <MaterialIcons name="chevron-right" size={14} color={textTertiary} />
        </TouchableOpacity>

        <View style={[styles.sectionDivider, { borderColor: borderTertiary }]} />

        {/* ── Preferences section ──────────────────────────────────── */}
        <Text style={[styles.sectionHeader, { color: textTertiary }]}>{t('component.appDrawer.sectionPreferences')}</Text>

        {/* Dark mode */}
        <View style={styles.menuRow}>
          <MaterialIcons
            name={isDarkMode ? 'dark-mode' : 'light-mode'}
            size={20}
            color={colors.textSecondary}
          />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuDarkMode')}</Text>
          <Switch
            value={isDarkMode}
            onValueChange={toggleDarkMode}
            trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
            thumbColor={isDarkMode ? primaryColor : '#FAFAFA'}
            style={styles.switchControl}
          />
        </View>

        {/* Card density */}
        <View style={styles.menuRow}>
          <MaterialIcons
            name={cardDensity === 'detailed' ? 'view-stream' : 'view-day'}
            size={20}
            color={colors.textSecondary}
          />
          <Text style={[styles.menuLabel, { color: colors.text }]}>{t('component.appDrawer.menuCardDensity')}</Text>
        </View>
        <View style={styles.densityPills}>
          {(['normal', 'detailed'] as CardDensity[]).map((d) => {
            const isActive = cardDensity === d;
            return (
              <TouchableOpacity
                key={d}
                style={[
                  styles.densityPill,
                  {
                    backgroundColor: isActive ? (isDarkMode ? `${primaryColor}30` : `${primaryColor}12`) : surfaceSecondary,
                    borderColor: isActive ? `${primaryColor}40` : 'transparent',
                  },
                ]}
                onPress={() => setCardDensity(d)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.densityPillText,
                    {
                      color: isActive ? primaryColor : colors.textSecondary,
                      fontFamily: isActive ? fontFamilies.bodySemibold : fontFamilies.bodyMedium,
                    },
                  ]}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.sectionDivider, { borderColor: borderTertiary }]} />

        {/* ── Log out ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.menuRow} onPress={handleLogout} activeOpacity={0.6}>
          <MaterialIcons name="logout" size={20} color="#DC2626" />
          <Text style={[styles.menuLabel, { color: '#DC2626' }]}>{t('component.appDrawer.menuLogout')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Profile card ────────────────────────────────────────────────────
  profileCard: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 8,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orgAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orgLogo: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
  },
  orgTagline: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  userAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userAvatarImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 8,
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamilies.bodySemibold,
  },
  userName: {
    flex: 1,
    fontSize: 12,
    fontFamily: fontFamilies.bodyMedium,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  roleText: {
    fontSize: 9.5,
    fontFamily: fontFamilies.bodySemibold,
  },

  // ── Section headers & dividers ──────────────────────────────────────
  sectionHeader: {
    fontSize: 10,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionDivider: {
    borderTopWidth: 0.5,
    marginVertical: 4,
    marginHorizontal: 20,
  },

  // ── Workspace rows ──────────────────────────────────────────────────
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 10,
  },
  workspaceDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    marginRight: 10,
  },
  workspaceName: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: fontFamilies.bodyMedium,
  },
  workspaceCount: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    marginLeft: 8,
  },

  // ── Menu rows ───────────────────────────────────────────────────────
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  menuLabel: {
    flex: 1,
    marginLeft: 14,
    fontSize: 13,
    fontFamily: fontFamilies.bodyMedium,
  },

  // ── Notification badge ──────────────────────────────────────────────
  notifBadge: {
    height: 18,
    minWidth: 18,
    borderRadius: 9,
    backgroundColor: '#FCEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  notifBadgeText: {
    fontSize: 10,
    fontFamily: fontFamilies.bodySemibold,
    color: '#A32D2D',
  },

  // ── Dark mode switch ────────────────────────────────────────────────
  switchControl: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },

  // ── Card density pills ──────────────────────────────────────────────
  densityPills: {
    flexDirection: 'row',
    paddingLeft: 54,
    paddingRight: 20,
    gap: 6,
    paddingBottom: 4,
  },
  densityPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  densityPillText: {
    fontSize: 11,
  },
});
