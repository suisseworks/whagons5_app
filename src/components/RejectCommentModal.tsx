import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, radius } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.88;

interface RejectCommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  submitLabel?: string;
  submitIcon?: React.ComponentProps<typeof MaterialIcons>['name'];
  submitColor?: string;
  requireComment?: boolean;
}

export const RejectCommentModal: React.FC<RejectCommentModalProps> = ({
  visible,
  onClose,
  onSubmit,
  title,
  subtitle,
  placeholder,
  submitLabel,
  submitIcon = 'close',
  submitColor = '#DC2626',
  requireComment = true,
}) => {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = comment.trim();
    if (requireComment && !trimmed) return;
    onSubmit(trimmed);
    setComment('');
  }, [comment, onSubmit, requireComment]);

  const handleClose = useCallback(() => {
    setComment('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <KeyboardStickyView enabled={Platform.OS === 'android'} offset={{ closed: 0, opened: 0 }}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom, 16),
                maxHeight: SHEET_MAX_HEIGHT,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{title || t('component.rejectCommentModal.title')}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialIcons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>
              {subtitle || t('component.rejectCommentModal.subtitle')}
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#FAFAFA',
                },
              ]}
              placeholder={placeholder || t('component.rejectCommentModal.placeholder')}
              placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.3)' : '#9CA3AF'}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={comment}
              onChangeText={setComment}
              autoFocus
            />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]}
                onPress={handleClose}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('component.rejectCommentModal.cancelButton')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.rejectBtn,
                  { backgroundColor: !requireComment || comment.trim() ? submitColor : '#9CA3AF' },
                ]}
                onPress={handleSubmit}
                disabled={requireComment && !comment.trim()}
              >
                <MaterialIcons name={submitIcon} size={18} color="#FFFFFF" />
                <Text style={styles.rejectText}>{submitLabel || t('component.rejectCommentModal.rejectButton')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardStickyView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamilies.bodySemibold,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fontFamilies.bodyRegular,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    fontFamily: fontFamilies.bodyRegular,
    minHeight: 100,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodyMedium,
  },
  rejectBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});

export default RejectCommentModal;
