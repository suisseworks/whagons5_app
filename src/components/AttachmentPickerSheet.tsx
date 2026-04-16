import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';

export interface AttachmentPickerSheetProps {
  visible: boolean;
  busy?: boolean;
  title?: string;
  subtitle?: string;
  showFiles?: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChoosePhotos: () => void;
  onChooseFiles: () => void;
}

export const AttachmentPickerSheet: React.FC<AttachmentPickerSheetProps> = ({
  visible,
  busy = false,
  title,
  subtitle,
  showFiles = true,
  onClose,
  onTakePhoto,
  onChoosePhotos,
  onChooseFiles,
}) => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { t } = useLanguage();

  const cardBg = isDarkMode ? 'rgba(255,255,255,0.04)' : '#F8F5EF';
  const cardBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const iconBg = isDarkMode ? 'rgba(255,255,255,0.08)' : `${primaryColor}12`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: cardBorder,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)' }]} />

          <Text style={[styles.title, { color: colors.text }]}>{title || t('attachmentPicker.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle || t('attachmentPicker.subtitle')}</Text>

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: cardBg, borderColor: cardBorder }, busy && styles.optionDisabled]}
            onPress={onTakePhoto}
            disabled={busy}
            activeOpacity={0.85}
          >
            <View style={[styles.optionIcon, { backgroundColor: iconBg }]}>
              <MaterialIcons name="photo-camera" size={22} color={primaryColor} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>{t('attachmentPicker.takePhotoTitle')}</Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{t('attachmentPicker.takePhotoDescription')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: cardBg, borderColor: cardBorder }, busy && styles.optionDisabled]}
            onPress={onChoosePhotos}
            disabled={busy}
            activeOpacity={0.85}
          >
            <View style={[styles.optionIcon, { backgroundColor: iconBg }]}>
              <MaterialIcons name="photo-library" size={22} color={primaryColor} />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>{t('attachmentPicker.libraryTitle')}</Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{t('attachmentPicker.libraryDescription')}</Text>
            </View>
          </TouchableOpacity>

          {showFiles && (
            <TouchableOpacity
              style={[styles.optionCard, { backgroundColor: cardBg, borderColor: cardBorder }, busy && styles.optionDisabled]}
              onPress={onChooseFiles}
              disabled={busy}
              activeOpacity={0.85}
            >
              <View style={[styles.optionIcon, { backgroundColor: iconBg }]}>
                <MaterialIcons name="description" size={22} color={primaryColor} />
              </View>
              <View style={styles.optionBody}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>{t('attachmentPicker.filesTitle')}</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{t('attachmentPicker.filesDescription')}</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.cancelButton,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3EEE4',
                borderColor: cardBorder,
              },
            ]}
            onPress={onClose}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Text style={[styles.cancelText, { color: colors.text }]}>{t('common.cancel')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    ...shadows.lifted,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: spacing.md,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  optionDisabled: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionBody: {
    flex: 1,
  },
  optionTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
    lineHeight: 18,
  },
  cancelButton: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  cancelText: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
});
