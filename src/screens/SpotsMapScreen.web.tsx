import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { fontFamilies } from '../config/designTokens';
import { RootStackParamList } from '../models/types';

type SpotsMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SpotsMap'>;
type SpotsMapRouteProp = RouteProp<RootStackParamList, 'SpotsMap'>;

export const SpotsMapScreen: React.FC = () => {
  const navigation = useNavigation<SpotsMapNavigationProp>();
  const route = useRoute<SpotsMapRouteProp>();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { location } = route.params;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View
        style={[
          styles.header,
          { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.06)' },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('spotsMap.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <MaterialIcons name="map" size={40} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>{location.title}</Text>
          {location.subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{location.subtitle}</Text> : null}
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            Maps are native-only in this mobile app build.
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
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 17,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    borderRadius: 16,
    gap: 10,
    padding: 24,
  },
  title: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 18,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    textAlign: 'center',
  },
  helper: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
