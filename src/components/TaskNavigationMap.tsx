import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { fontFamilies } from '../config/designTokens';

interface Props {
  taskLatitude: number;
  taskLongitude: number;
  taskTitle: string;
  spotName?: string | null;
  isDarkMode: boolean;
  secondarySurface: string;
  tertiaryText: string;
}

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function TaskNavigationMap({
  taskLatitude,
  taskLongitude,
  taskTitle,
  spotName,
  isDarkMode,
  secondarySurface,
  tertiaryText,
}: Props) {
  const { primaryColor, colors } = useTheme();
  const { t } = useLanguage();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [tracking, setTracking] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mountedRef.current) return;
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      setTracking(true);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => {
          if (mountedRef.current) {
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        },
      );
      if (mountedRef.current) {
        watchRef.current = sub;
      } else {
        sub.remove();
      }
    } catch {
      if (mountedRef.current) setPermissionDenied(true);
    }
  }, []);

  const stopTracking = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (mountedRef.current) {
      setTracking(false);
      setUserLocation(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  const distance =
    userLocation
      ? haversineDistance(userLocation.latitude, userLocation.longitude, taskLatitude, taskLongitude)
      : null;

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

  const openMap = () => {
    const url = Platform.select({
      ios: `maps:${taskLatitude},${taskLongitude}?q=${taskLatitude},${taskLongitude}`,
      android: `geo:${taskLatitude},${taskLongitude}?q=${taskLatitude},${taskLongitude}(${encodeURIComponent(taskTitle)})`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  };

  const isTracking = tracking && !permissionDenied;

  return (
    <View style={[styles.container, { backgroundColor: secondarySurface }]}>
      {/* Coordinates + spot */}
      <View style={styles.coordsRow}>
        <MaterialIcons name="place" size={20} color="#EF4444" />
        <View style={styles.coordsText}>
          {spotName ? (
            <Text style={[styles.spotName, { color: colors.text }]} numberOfLines={1}>{spotName}</Text>
          ) : null}
          <Text style={[styles.coords, { color: tertiaryText }]}>
            {taskLatitude.toFixed(6)}, {taskLongitude.toFixed(6)}
          </Text>
        </View>
      </View>

      {/* Live distance tracker */}
      {isTracking && (
        <View style={[styles.distanceRow, { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
          {userLocation ? (
            <>
              <View style={[styles.liveDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.distanceLabel, { color: colors.text }]}>
                {formatDistance(distance!)}
              </Text>
              <Text style={[styles.distanceAway, { color: tertiaryText }]}>
                {t('taskDetail.distanceAway', { distance: formatDistance(distance!) })}
              </Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color={primaryColor} style={{ marginRight: 8 }} />
              <Text style={[styles.distanceLabel, { color: tertiaryText }]}>
                {t('taskDetail.trackingYou')}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Permission denied */}
      {permissionDenied && (
        <View style={[styles.distanceRow, { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
          <MaterialIcons name="location-off" size={16} color={tertiaryText} />
          <Text style={[styles.permissionText, { color: tertiaryText }]} numberOfLines={2}>
            {t('taskDetail.locationPermissionDenied')}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={[styles.actionBar, { borderTopColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
        {!isTracking ? (
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={startTracking}>
            <MaterialIcons name="my-location" size={18} color={primaryColor} />
            <Text style={[styles.actionBtnText, { color: primaryColor }]}>
              {t('taskDetail.trackingYou').replace('…', '').trim()}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={stopTracking}>
            <MaterialIcons name="location-off" size={18} color={tertiaryText} />
            <Text style={[styles.actionBtnText, { color: tertiaryText }]}>
              {t('common.close')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={openNativeDirections}>
          <MaterialIcons name="directions" size={18} color={primaryColor} />
          <Text style={[styles.actionBtnText, { color: primaryColor }]}>
            {t('taskDetail.navigateToTask')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={openMap}>
          <MaterialIcons name="map" size={18} color={primaryColor} />
          <Text style={[styles.actionBtnText, { color: primaryColor }]}>
            {t('taskDetail.openInMaps')}
          </Text>
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
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  coordsText: {
    flex: 1,
  },
  spotName: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 2,
  },
  coords: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distanceLabel: {
    fontSize: 15,
    fontFamily: fontFamilies.bodySemibold,
  },
  distanceAway: {
    fontSize: 12,
    fontFamily: fontFamilies.bodyRegular,
    display: 'none',
  },
  permissionText: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
    flex: 1,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
  },
});
