import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView, { Marker } from 'react-native-maps';

import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { RootStackParamList } from '../models/types';
import { fontFamilies, shadows } from '../config/designTokens';

type SpotsMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SpotsMap'>;
type SpotsMapRouteProp = RouteProp<RootStackParamList, 'SpotsMap'>;

export const SpotsMapScreen: React.FC = () => {
  const navigation = useNavigation<SpotsMapNavigationProp>();
  const route = useRoute<SpotsMapRouteProp>();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { location } = route.params;

  const openNativeDirections = () => {
    const url = Platform.select({
      ios: `maps:?daddr=${location.latitude},${location.longitude}&dirflg=d`,
      android: `google.navigation:q=${location.latitude},${location.longitude}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        const fallback = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
        Linking.openURL(fallback).catch(() => {});
      });
    }
  };

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

      <View style={styles.mapArea}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.0045,
            longitudeDelta: 0.0045,
          }}
        >
          <Marker
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title={location.title}
            description={location.subtitle ?? undefined}
          />
        </MapView>

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: isDarkMode ? 'rgba(24,24,27,0.94)' : 'rgba(255,255,255,0.96)',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {location.title}
          </Text>
          {location.subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {location.subtitle}
            </Text>
          ) : null}
          {location.helperText ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {location.helperText}
            </Text>
          ) : null}
          {location.warningText ? (
            <Text style={styles.warningText}>
              {location.warningText}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.navigateButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={openNativeDirections}
          >
            <MaterialIcons name="directions" size={18} color="#FFFFFF" />
            <Text style={styles.navigateButtonText}>{t('taskDetail.navigateToTask')}</Text>
          </TouchableOpacity>
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
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: fontFamilies.displaySemibold,
    textAlign: 'center',
  },
  mapArea: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    ...shadows.lifted,
  },
  title: {
    fontSize: 18,
    fontFamily: fontFamilies.bodySemibold,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
  },
  helperText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamilies.bodyRegular,
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamilies.bodyMedium,
    color: '#D97706',
  },
  navigateButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  navigateButtonText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});
