/**
 * SpotsMapScreen – Interactive map showing all spots with GPS coordinates.
 *
 * Features:
 *  - Full map view with colored markers per spot type
 *  - "I'm Here" button to capture device GPS and assign to a spot
 *  - Spot list panel with search, showing which spots still need GPS
 *  - Tap marker to see spot details
 *  - Filter by spot type
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

import { useTheme } from '../context/ThemeContext';
import { useData, SyncedSpot, SyncedSpotType } from '../context/DataContext';
import { apiClient } from '../services/apiClient';
import { RootStackParamList } from '../models/types';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

type SpotsMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SpotsMap'>;
type SpotsMapRouteProp = RouteProp<RootStackParamList, 'SpotsMap'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_MARKER_COLOR = '#6B7280';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SpotsMapScreen: React.FC = () => {
  const navigation = useNavigation<SpotsMapNavigationProp>();
  const route = useRoute<SpotsMapRouteProp>();
  const focusSpotId = route.params?.focusSpotId;

  const { colors, primaryColor, isDarkMode } = useTheme();
  const { data, refresh } = useData();

  const mapRef = useRef<MapView>(null);

  // State
  const [showList, setShowList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SyncedSpot | null>(null);
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Build spot type lookup
  const spotTypeMap = useMemo(() => {
    const map = new Map<number, SyncedSpotType>();
    for (const st of data.spotTypes) {
      map.set(st.id, st);
    }
    return map;
  }, [data.spotTypes]);

  // Filter non-deleted spots
  const allSpots = useMemo(() => {
    return data.spots.filter((s: any) => !s.deleted_at);
  }, [data.spots]);

  // Spots with GPS coordinates (for map markers)
  const mappedSpots = useMemo(() => {
    return allSpots.filter(
      (s) => s.latitude != null && s.longitude != null,
    );
  }, [allSpots]);

  // Spots without GPS coordinates
  const unmappedSpots = useMemo(() => {
    return allSpots.filter(
      (s) => s.latitude == null || s.longitude == null,
    );
  }, [allSpots]);

  // Filtered spots for the list panel
  const filteredSpots = useMemo(() => {
    let result = allSpots;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.alias && s.alias.toLowerCase().includes(q)),
      );
    }
    if (selectedTypeId !== null) {
      result = result.filter((s) => s.spot_type_id === selectedTypeId);
    }
    return result;
  }, [allSpots, searchQuery, selectedTypeId]);

  // Compute initial map region from spots with GPS
  const initialRegion = useMemo<Region>(() => {
    if (focusSpotId) {
      const spot = allSpots.find((s) => s.id === focusSpotId);
      if (spot?.latitude && spot?.longitude) {
        return {
          latitude: Number(spot.latitude),
          longitude: Number(spot.longitude),
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
      }
    }

    if (mappedSpots.length > 0) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      for (const s of mappedSpots) {
        const lat = Number(s.latitude);
        const lng = Number(s.longitude);
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const deltaLat = Math.max((maxLat - minLat) * 1.3, 0.005);
      const deltaLng = Math.max((maxLng - minLng) * 1.3, 0.005);
      return {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: deltaLat,
        longitudeDelta: deltaLng,
      };
    }

    // Default: a reasonable world view
    return {
      latitude: 19.4326,
      longitude: -99.1332,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [mappedSpots, focusSpotId, allSpots]);

  // Get marker color for a spot
  const getSpotColor = useCallback(
    (spot: SyncedSpot): string => {
      if (spot.spot_type_id) {
        const st = spotTypeMap.get(spot.spot_type_id);
        if (st?.color) return st.color;
      }
      return DEFAULT_MARKER_COLOR;
    },
    [spotTypeMap],
  );

  // Get spot type name
  const getSpotTypeName = useCallback(
    (spot: SyncedSpot): string => {
      if (spot.spot_type_id) {
        const st = spotTypeMap.get(spot.spot_type_id);
        if (st?.name) return st.name;
      }
      return 'Untyped';
    },
    [spotTypeMap],
  );

  // Handle "I'm Here" button
  const handleImHere = useCallback(
    async (spot: SyncedSpot) => {
      setIsCapturingGPS(true);
      try {
        // Request permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Denied',
            'Location permission is required to capture GPS coordinates. Please enable it in your device settings.',
          );
          return;
        }

        // Get current position
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = location.coords;
        setUserLocation({ latitude, longitude });

        // Confirm with user
        Alert.alert(
          'Confirm Location',
          `Set "${spot.name}" to:\nLat: ${latitude.toFixed(6)}\nLng: ${longitude.toFixed(6)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: async () => {
                try {
                  await apiClient.updateSpotLocation(spot.id, latitude, longitude);
                  Alert.alert('Saved', `Location set for "${spot.name}"`);
                  // Refresh data to reflect the change
                  await refresh();
                } catch (err: any) {
                  Alert.alert('Error', err?.message ?? 'Failed to save location');
                }
              },
            },
          ],
        );
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Failed to get location');
      } finally {
        setIsCapturingGPS(false);
      }
    },
    [refresh],
  );

  // Focus map on a spot
  const focusOnSpot = useCallback(
    (spot: SyncedSpot) => {
      if (spot.latitude != null && spot.longitude != null) {
        mapRef.current?.animateToRegion(
          {
            latitude: Number(spot.latitude),
            longitude: Number(spot.longitude),
            latitudeDelta: 0.002,
            longitudeDelta: 0.002,
          },
          500,
        );
        setSelectedSpot(spot);
        setShowList(false);
      }
    },
    [],
  );

  // Focus on focusSpotId when screen mounts
  useEffect(() => {
    if (focusSpotId) {
      const spot = allSpots.find((s) => s.id === focusSpotId);
      if (spot) {
        setSelectedSpot(spot);
      }
    }
  }, [focusSpotId, allSpots]);

  // Render a spot list item
  const renderSpotItem = useCallback(
    ({ item }: { item: SyncedSpot }) => {
      const hasGPS = item.latitude != null && item.longitude != null;
      const color = getSpotColor(item);
      const typeName = getSpotTypeName(item);

      return (
        <View
          style={[
            styles.spotItem,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E6E0D7',
            },
          ]}
        >
          <TouchableOpacity
            style={styles.spotItemContent}
            activeOpacity={0.7}
            onPress={() => hasGPS ? focusOnSpot(item) : undefined}
            disabled={!hasGPS}
          >
            <View style={[styles.spotDot, { backgroundColor: color }]} />
            <View style={styles.spotItemInfo}>
              <Text style={[styles.spotItemName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.spotItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {typeName}
                {item.alias ? ` · ${item.alias}` : ''}
                {hasGPS ? '' : ' · No GPS'}
              </Text>
            </View>
            {hasGPS && (
              <View style={[styles.gpsBadge, { backgroundColor: `${primaryColor}18` }]}>
                <MaterialIcons name="place" size={14} color={primaryColor} />
              </View>
            )}
            {!hasGPS && (
              <View style={[styles.gpsBadge, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
                <MaterialIcons name="location-off" size={14} color="#D97706" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.imHereBtn, { backgroundColor: primaryColor }]}
            onPress={() => handleImHere(item)}
            disabled={isCapturingGPS}
          >
            {isCapturingGPS ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="my-location" size={16} color="#FFFFFF" />
                <Text style={styles.imHereBtnText}>I'm Here</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [colors, isDarkMode, primaryColor, getSpotColor, getSpotTypeName, focusOnSpot, handleImHere, isCapturingGPS],
  );

  // Spot type filter chips
  const spotTypeChips = useMemo(() => {
    const types = Array.from(spotTypeMap.values());
    return types.sort((a, b) => a.name.localeCompare(b.name));
  }, [spotTypeMap]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E8E1D6' }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Spots Map</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {mappedSpots.length} mapped · {unmappedSpots.length} unmapped
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.toggleListBtn,
            {
              backgroundColor: showList
                ? primaryColor
                : isDarkMode
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.05)',
            },
          ]}
          onPress={() => setShowList(!showList)}
        >
          <MaterialIcons
            name={showList ? 'map' : 'list'}
            size={20}
            color={showList ? '#FFFFFF' : colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Map View */}
      {!showList && (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          >
            {mappedSpots.map((spot) => {
              const color = getSpotColor(spot);
              return (
                <Marker
                  key={spot.id}
                  coordinate={{
                    latitude: Number(spot.latitude),
                    longitude: Number(spot.longitude),
                  }}
                  title={spot.name}
                  description={getSpotTypeName(spot)}
                  pinColor={color}
                  onPress={() => setSelectedSpot(spot)}
                />
              );
            })}
          </MapView>

          {/* Selected spot info card */}
          {selectedSpot && (
            <View
              style={[
                styles.spotCard,
                {
                  backgroundColor: isDarkMode ? '#1F2422' : '#FFFFFF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7',
                },
              ]}
            >
              <View style={styles.spotCardHeader}>
                <View style={[styles.spotDot, { backgroundColor: getSpotColor(selectedSpot) }]} />
                <View style={styles.spotCardInfo}>
                  <Text style={[styles.spotCardName, { color: colors.text }]} numberOfLines={1}>
                    {selectedSpot.name}
                  </Text>
                  <Text style={[styles.spotCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {getSpotTypeName(selectedSpot)}
                    {selectedSpot.alias ? ` · ${selectedSpot.alias}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedSpot(null)}>
                  <MaterialIcons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {selectedSpot.latitude != null && selectedSpot.longitude != null && (
                <Text style={[styles.spotCardCoords, { color: colors.textSecondary }]}>
                  {Number(selectedSpot.latitude).toFixed(6)}, {Number(selectedSpot.longitude).toFixed(6)}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.imHereCardBtn, { backgroundColor: primaryColor }]}
                onPress={() => handleImHere(selectedSpot)}
                disabled={isCapturingGPS}
              >
                {isCapturingGPS ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="my-location" size={18} color="#FFFFFF" />
                    <Text style={styles.imHereCardBtnText}>
                      {selectedSpot.latitude != null ? 'Update Location' : "I'm Here"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Unmapped spots count indicator */}
          {unmappedSpots.length > 0 && !selectedSpot && (
            <TouchableOpacity
              style={[
                styles.unmappedBadge,
                {
                  backgroundColor: isDarkMode ? '#1F2422' : '#FFFFFF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7',
                },
              ]}
              onPress={() => setShowList(true)}
            >
              <MaterialIcons name="location-off" size={16} color="#D97706" />
              <Text style={[styles.unmappedBadgeText, { color: colors.text }]}>
                {unmappedSpots.length} spot{unmappedSpots.length !== 1 ? 's' : ''} need GPS
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* List View */}
      {showList && (
        <View style={styles.listContainer}>
          {/* Search bar */}
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7',
              },
            ]}
          >
            <MaterialIcons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search spots..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Spot type filter chips */}
          {spotTypeChips.length > 0 && (
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      selectedTypeId === null
                        ? primaryColor
                        : isDarkMode
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)',
                    borderColor: selectedTypeId === null ? primaryColor : isDarkMode ? 'rgba(255,255,255,0.1)' : '#E6E0D7',
                  },
                ]}
                onPress={() => setSelectedTypeId(null)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selectedTypeId === null ? '#FFFFFF' : colors.text },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {spotTypeChips.map((st) => (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        selectedTypeId === st.id
                          ? (st.color || primaryColor)
                          : isDarkMode
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.04)',
                      borderColor:
                        selectedTypeId === st.id
                          ? (st.color || primaryColor)
                          : isDarkMode
                            ? 'rgba(255,255,255,0.1)'
                            : '#E6E0D7',
                    },
                  ]}
                  onPress={() => setSelectedTypeId(selectedTypeId === st.id ? null : st.id)}
                >
                  {st.color && (
                    <View style={[styles.chipDot, { backgroundColor: selectedTypeId === st.id ? '#FFFFFF' : st.color }]} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      { color: selectedTypeId === st.id ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {st.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Spot list */}
          <FlatList
            data={filteredSpots}
            renderItem={renderSpotItem}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialIcons
                  name="location-off"
                  size={48}
                  color={isDarkMode ? 'rgba(255,255,255,0.15)' : '#D5CFC6'}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No spots found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {searchQuery ? 'Try a different search term' : 'Spots will appear here once created'}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  headerTitleContainer: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  headerSubtitle: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  toggleListBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },

  // Selected spot card (overlay on map)
  spotCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    ...shadows.lifted,
  },
  spotCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotCardInfo: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  spotCardName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  spotCardMeta: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  spotCardCoords: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 6,
    marginLeft: 22,
  },
  imHereCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    gap: 6,
  },
  imHereCardBtnText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Unmapped indicator badge
  unmappedBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    ...shadows.subtle,
  },
  unmappedBadgeText: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },

  // List view
  listContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 5,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Spot list item
  spotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  spotItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  spotItemInfo: {
    flex: 1,
  },
  spotItemName: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  spotItemMeta: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
  gpsBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // I'm Here button (in list)
  imHereBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    gap: 4,
  },
  imHereBtnText: {
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 6,
    textAlign: 'center',
  },
});
