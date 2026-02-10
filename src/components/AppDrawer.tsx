import React from 'react';
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
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../models/types';
import { quotes, inspirationalImages, getDailyIndex } from '../utils/helpers';
import { clearAllData } from '../store/database';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type DrawerNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AppDrawerProps {
  onClose: () => void;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({ onClose }) => {
  const navigation = useNavigation<DrawerNavigationProp>();
  const { isDarkMode, toggleDarkMode, primaryColor, colors } = useTheme();
  const { compactCards, toggleCompactCards, notificationCount } = useTasks();
  const { logout, user } = useAuth();

  const quoteIndex = getDailyIndex(quotes.length);
  const imageIndex = getDailyIndex(inspirationalImages.length);
  const selectedQuote = quotes[quoteIndex];
  const selectedImage = inspirationalImages[imageIndex];

  const handleNotifications = () => {
    onClose();
    navigation.navigate('Notifications');
  };

  const handleSettings = () => {
    onClose();
    navigation.navigate('Settings');
  };

  const handleThemes = () => {
    onClose();
    navigation.navigate('Themes');
  };

  const handleLogout = async () => {
    onClose();
    await clearAllData();
    await logout();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      }),
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        {/* Header */}
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.logoBadge}>
              <Image source={require('../../assets/whagons-check.png')} style={styles.logoImage} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Whagons</Text>
              <Text style={styles.headerSubtitle}>Field operations</Text>
            </View>
          </View>
          {user && (
            <Text style={styles.headerUser}>{user.name ?? user.email}</Text>
          )}
        </LinearGradient>

        {/* Menu Items */}
        <TouchableOpacity
          style={[
            styles.menuItem,
            styles.menuItemElevated,
            { backgroundColor: isDarkMode ? 'rgba(31, 36, 34, 0.9)' : 'rgba(255, 255, 255, 0.9)' },
          ]}
          onPress={handleNotifications}
        >
          <View style={styles.menuIconContainer}>
            <MaterialIcons name="notifications-none" size={22} color={colors.textSecondary} />
            {notificationCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.menuText, { color: colors.text }]}>Notifications</Text>
          {notificationCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
          <MaterialIcons name="person-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.menuText, { color: colors.text }]}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleThemes}>
          <MaterialIcons name="palette" size={22} color={colors.textSecondary} />
          <Text style={[styles.menuText, { color: colors.text }]}>Themes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
          <MaterialIcons name="settings" size={22} color={colors.textSecondary} />
          <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Switches */}
        <View style={styles.switchItem}>
          <MaterialIcons
            name={isDarkMode ? 'dark-mode' : 'light-mode'}
            size={22}
            color={colors.textSecondary}
          />
          <Text style={[styles.menuText, { color: colors.text }]}>Dark Mode</Text>
          <Switch
            value={isDarkMode}
            onValueChange={toggleDarkMode}
            trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
            thumbColor={isDarkMode ? primaryColor : '#FAFAFA'}
          />
        </View>

        <View style={styles.switchItem}>
          <MaterialIcons
            name={compactCards ? 'view-agenda' : 'view-day'}
            size={22}
            color={colors.textSecondary}
          />
          <Text style={[styles.menuText, { color: colors.text }]}>Compact Cards</Text>
          <Switch
            value={compactCards}
            onValueChange={toggleCompactCards}
            trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
            thumbColor={compactCards ? primaryColor : '#FAFAFA'}
          />
        </View>

        <View style={styles.divider} />

        {/* Logout */}
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color="#F44336" />
          <Text style={[styles.menuText, { color: '#F44336' }]}>Log out</Text>
        </TouchableOpacity>

        {/* Inspirational Section */}
        <View style={styles.inspirationalSection}>
          <View style={styles.imageContainer}>
            <Image source={{ uri: selectedImage }} style={styles.inspirationalImage} />
            <View style={styles.imageGradient} />
          </View>
          <Text style={[styles.quoteText, { color: colors.textSecondary }]}>
            "{selectedQuote.text}"
          </Text>
          <Text style={[styles.authorText, { color: colors.textSecondary }]}>— {selectedQuote.author}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoImage: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 0.3,
  },
  headerUser: {
    marginTop: 10,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
    color: 'rgba(255, 255, 255, 0.78)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuItemElevated: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    ...shadows.subtle,
  },
  menuIconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: -6,
    top: -6,
    backgroundColor: '#F44336',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: fontFamilies.bodyBold,
  },
  menuText: {
    flex: 1,
    marginLeft: 16,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
  },
  countBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginVertical: 8,
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  inspirationalSection: {
    margin: 16,
  },
  imageContainer: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    height: 160,
  },
  inspirationalImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  quoteText: {
    marginTop: 12,
    fontSize: fontSizes.sm,
    fontStyle: 'italic',
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  authorText: {
    marginTop: 6,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
});
