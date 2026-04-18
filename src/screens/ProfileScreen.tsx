import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';

type ProfileNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileNavigationProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();

  const userInitial = (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('component.appDrawer.menuProfile')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {user?.photo_url ? (
          <Image source={{ uri: user.photo_url }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: primaryColor }]}>
            <Text style={styles.avatarInitials}>{userInitial}</Text>
          </View>
        )}

        <Text style={[styles.userName, { color: colors.text }]}>
          {user?.name ?? user?.email ?? t('component.appDrawer.menuProfile')}
        </Text>
        {!!user?.email && (
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
        )}

        <View
          style={[
            styles.placeholderCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E1D7',
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${primaryColor}14` }]}>
            <MaterialIcons name="person-outline" size={28} color={primaryColor} />
          </View>
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>
            {t('common.comingSoonTitle')}
          </Text>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            {t('common.comingSoonMessage', { feature: t('component.appDrawer.menuProfile') })}
          </Text>
        </View>
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
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: fontFamilies.bodyBold,
  },
  userName: {
    marginTop: spacing.md,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  userEmail: {
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
  },
  placeholderCard: {
    width: '100%',
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  placeholderTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  placeholderText: {
    marginTop: spacing.sm,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
