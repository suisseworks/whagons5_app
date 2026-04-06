import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';

import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { fontFamilies } from '../config/designTokens';
import { MapLocationPayload, RootStackParamList } from '../models/types';

interface Props {
  taskLatitude: number;
  taskLongitude: number;
  taskTitle: string;
  spotName?: string | null;
  helperText?: string | null;
  warningText?: string | null;
  isDarkMode: boolean;
  secondarySurface: string;
  tertiaryText: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TaskNavigationMap({
  taskLatitude,
  taskLongitude,
  taskTitle,
  spotName,
  helperText,
  warningText,
  isDarkMode,
  secondarySurface,
  tertiaryText,
}: Props) {
  const { primaryColor, colors } = useTheme();
  const { t } = useLanguage();
  const navigation = useNavigation<NavigationProp>();
  const hasEmbeddedMap = Platform.OS !== 'android' || Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const locationPayload: MapLocationPayload = {
    latitude: taskLatitude,
    longitude: taskLongitude,
    title: spotName || taskTitle,
    subtitle: `${taskLatitude.toFixed(6)}, ${taskLongitude.toFixed(6)}`,
    helperText,
    warningText,
  };

  const previewRegion: Region = {
    latitude: taskLatitude,
    longitude: taskLongitude,
    latitudeDelta: 0.0045,
    longitudeDelta: 0.0045,
  };

  const openNativeDirections = () => {
    const url = Platform.select({
      ios: `maps:?daddr=${taskLatitude},${taskLongitude}&dirflg=d`,
      android: `google.navigation:q=${taskLatitude},${taskLongitude}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        const fallback = `https://www.google.com/maps/dir/?api=1&destination=${taskLatitude},${taskLongitude}`;
        Linking.openURL(fallback).catch(() => {});
      });
    }
  };

  const openInAppMap = () => {
    if (!hasEmbeddedMap) {
      openNativeDirections();
      return;
    }
    navigation.navigate('SpotsMap', { location: locationPayload });
  };

  return (
    <View style={[styles.container, { backgroundColor: secondarySurface }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="place" size={20} color="#EF4444" />
        <View style={styles.headerText}>
          {spotName ? (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {spotName}
            </Text>
          ) : null}
          <Text style={[styles.coords, { color: tertiaryText }]}>
            {locationPayload.subtitle}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.previewTouch} activeOpacity={0.92} onPress={openInAppMap}>
        <View style={styles.previewFrame}>
          {hasEmbeddedMap ? (
            <>
              <MapView
                style={styles.mapPreview}
                initialRegion={previewRegion}
                region={previewRegion}
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                liteMode={Platform.OS === 'android'}
              >
                <Marker
                  coordinate={{ latitude: taskLatitude, longitude: taskLongitude }}
                  title={locationPayload.title}
                  description={locationPayload.subtitle ?? undefined}
                />
              </MapView>

              <View style={styles.previewHint}>
                <MaterialIcons name="open-in-full" size={12} color="#FFFFFF" />
                <Text style={styles.previewHintText}>{t('spotsMap.tapToExpand')}</Text>
              </View>
            </>
          ) : (
            <View style={styles.previewFallback}>
              <MaterialIcons name="map" size={30} color={primaryColor} />
              <Text style={[styles.previewFallbackTitle, { color: colors.text }]}>Map preview unavailable</Text>
              <Text style={[styles.previewFallbackText, { color: tertiaryText }]}>
                Open this location in your device map app.
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {(helperText || warningText) ? (
        <View style={styles.messageBlock}>
          {helperText ? (
            <Text style={[styles.helperText, { color: tertiaryText }]} numberOfLines={2}>
              {helperText}
            </Text>
          ) : null}
          {warningText ? (
            <Text style={styles.warningText} numberOfLines={2}>
              {warningText}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.actionBar,
          { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
        ]}
      >
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
          activeOpacity={0.85}
          onPress={openNativeDirections}
        >
          <MaterialIcons name="directions" size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>{t('taskDetail.navigateToTask')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 2,
  },
  coords: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  previewTouch: {
    marginHorizontal: 12,
    marginTop: 2,
  },
  previewFrame: {
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#DCE7E2',
  },
  mapPreview: {
    flex: 1,
  },
  previewHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.72)',
  },
  previewHintText: {
    fontSize: 10,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
  previewFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  previewFallbackTitle: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
  },
  previewFallbackText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: fontFamilies.bodyRegular,
  },
  messageBlock: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  helperText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 16,
  },
  warningText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodySemibold,
    color: '#D97706',
    lineHeight: 16,
    marginTop: 6,
  },
  actionBar: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryActionText: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});
