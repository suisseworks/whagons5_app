import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { fontFamilies } from '../config/designTokens';

interface Props {
  taskLatitude: number;
  taskLongitude: number;
  taskTitle: string;
  spotName?: string | null;
  helperText?: string | null;
  warningText?: string | null;
  secondarySurface: string;
  tertiaryText: string;
}

export default function TaskNavigationMap({
  taskLatitude,
  taskLongitude,
  taskTitle,
  spotName,
  helperText,
  warningText,
  secondarySurface,
  tertiaryText,
}: Props) {
  const { colors, primaryColor } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: secondarySurface }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="place" size={20} color="#EF4444" />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {spotName || taskTitle}
          </Text>
          <Text style={[styles.coords, { color: tertiaryText }]}>
            {taskLatitude.toFixed(6)}, {taskLongitude.toFixed(6)}
          </Text>
        </View>
      </View>

      <View style={styles.previewFrame}>
        <MaterialIcons name="map" size={30} color={primaryColor} />
        <Text style={[styles.previewTitle, { color: colors.text }]}>Map preview unavailable on web</Text>
        <Text style={[styles.previewText, { color: tertiaryText }]}>
          Native map previews are checked in the Android and iOS app builds.
        </Text>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    marginBottom: 4,
    overflow: 'hidden',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 14,
    marginBottom: 2,
  },
  coords: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 11,
  },
  previewFrame: {
    alignItems: 'center',
    backgroundColor: '#DCE7E2',
    borderRadius: 12,
    gap: 6,
    justifyContent: 'center',
    marginHorizontal: 12,
    minHeight: 148,
    padding: 16,
  },
  previewTitle: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 13,
    textAlign: 'center',
  },
  previewText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  messageBlock: {
    gap: 4,
    padding: 12,
  },
  helperText: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 12,
    lineHeight: 18,
  },
  warningText: {
    color: '#D97706',
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
});
