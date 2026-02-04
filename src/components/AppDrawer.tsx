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
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList } from '../models/types';
import { quotes, inspirationalImages, getDailyIndex } from '../utils/helpers';

type DrawerNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AppDrawerProps {
  onClose: () => void;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({ onClose }) => {
  const navigation = useNavigation<DrawerNavigationProp>();
  const { isDarkMode, toggleDarkMode, primaryColor } = useTheme();
  const { compactCards, toggleCompactCards, notificationCount } = useTasks();

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <MaterialCommunityIcons name="truck-delivery" size={32} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Whagons</Text>
          </View>
        </View>

        {/* Menu Items */}
        <TouchableOpacity style={styles.menuItem} onPress={handleNotifications}>
          <View style={styles.menuIconContainer}>
            <MaterialIcons name="notifications-none" size={24} color="#616161" />
            {notificationCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          {notificationCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
          <MaterialIcons name="person-outline" size={24} color="#616161" />
          <Text style={styles.menuText}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleThemes}>
          <MaterialIcons name="palette" size={24} color="#616161" />
          <Text style={styles.menuText}>Themes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
          <MaterialIcons name="settings" size={24} color="#616161" />
          <Text style={styles.menuText}>Settings</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Switches */}
        <View style={styles.switchItem}>
          <MaterialIcons
            name={isDarkMode ? 'dark-mode' : 'light-mode'}
            size={24}
            color="#616161"
          />
          <Text style={styles.menuText}>Dark Mode</Text>
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
            size={24}
            color="#616161"
          />
          <Text style={styles.menuText}>Compact Cards</Text>
          <Switch
            value={compactCards}
            onValueChange={toggleCompactCards}
            trackColor={{ false: '#E0E0E0', true: `${primaryColor}80` }}
            thumbColor={compactCards ? primaryColor : '#FAFAFA'}
          />
        </View>

        {/* Inspirational Section */}
        <View style={styles.inspirationalSection}>
          <View style={styles.imageContainer}>
            <Image source={{ uri: selectedImage }} style={styles.inspirationalImage} />
            <View style={styles.imageGradient} />
          </View>
          <Text style={styles.quoteText}>"{selectedQuote.text}"</Text>
          <Text style={styles.authorText}>— {selectedQuote.author}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#14B7A3',
    padding: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 12,
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
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
    fontWeight: '700',
  },
  menuText: {
    flex: 1,
    marginLeft: 16,
    fontSize: 16,
    color: '#212121',
  },
  countBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
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
    borderRadius: 12,
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
    fontSize: 14,
    fontStyle: 'italic',
    color: '#616161',
    lineHeight: 20,
  },
  authorText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
});
