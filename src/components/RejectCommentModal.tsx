import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, radius } from '../config/designTokens';

interface RejectCommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}

export const RejectCommentModal: React.FC<RejectCommentModalProps> = ({ visible, onClose, onSubmit }) => {
  const { colors, isDarkMode } = useTheme();
  const [comment, setComment] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setComment('');
  }, [comment, onSubmit]);

  const handleClose = useCallback(() => {
    setComment('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Reject Approval</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>
            A comment is required to reject this approval.
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
            placeholder="Enter your reason for rejection..."
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
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.rejectBtn,
                { backgroundColor: comment.trim() ? '#DC2626' : '#9CA3AF' },
              ]}
              onPress={handleSubmit}
              disabled={!comment.trim()}
            >
              <MaterialIcons name="close" size={18} color="#FFFFFF" />
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
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
