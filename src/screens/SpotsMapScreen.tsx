/**
 * SpotsMapScreen – Placeholder "Coming Soon" screen for the map feature.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';

type SpotsMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SpotsMap'>;

export const SpotsMapScreen: React.FC = () => {
  const navigation = useNavigation<SpotsMapNavigationProp>();
  const { colors, isDarkMode } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Map</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Coming Soon Content */}
      <View style={styles.content}>
        <MaterialIcons name="map" size={64} color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB'} />
        <Text style={[styles.title, { color: colors.text }]}>Map</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Interactive map view is on the way
        </Text>
        <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>Coming soon</Text>
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
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    marginTop: 16,
    fontSize: fontSizes.xl,
    fontFamily: fontFamilies.displaySemibold,
  },
  subtitle: {
    marginTop: 8,
    fontSize: fontSizes.md,
    textAlign: 'center',
    fontFamily: fontFamilies.bodyRegular,
  },
  comingSoon: {
    marginTop: 16,
    fontSize: fontSizes.xs,
    fontStyle: 'italic',
    fontFamily: fontFamilies.bodyMedium,
  },
});
