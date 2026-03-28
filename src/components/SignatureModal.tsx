import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SignaturePad } from './SignaturePad';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, radius } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';

interface SignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onSigned: (storageId: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({ visible, onClose, onSigned }) => {
  const { tenantId } = useTenant();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const generateUploadUrl = useMutation(api.taskResources.generateUploadUrl);

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!signatureData || !tenantId) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ tenantId });

      // Convert SVG data URI to blob
      const response = await fetch(signatureData);
      const blob = await response.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/svg+xml' },
        body: blob,
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');

      const { storageId } = await uploadResponse.json();
      onSigned(storageId);
      setSignatureData(null);
    } catch (err: any) {
      Alert.alert(t('component.signatureModal.uploadError'), t('component.signatureModal.uploadErrorMessage'));
    } finally {
      setUploading(false);
    }
  }, [signatureData, tenantId, generateUploadUrl, onSigned]);

  const handleClose = useCallback(() => {
    setSignatureData(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{t('component.signatureModal.title')}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>
            {t('component.signatureModal.subtitle')}
          </Text>

          <View style={styles.padWrapper}>
            <SignaturePad
              value={signatureData}
              onChange={setSignatureData}
              strokeColor={isDarkMode ? '#FFFFFF' : '#000000'}
              borderColor={isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB'}
              backgroundColor={isDarkMode ? 'rgba(255,255,255,0.03)' : '#FAFAFA'}
              height={200}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB' }]}
              onPress={handleClose}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('component.signatureModal.cancelButton')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: signatureData ? '#4F46E5' : '#9CA3AF', opacity: uploading ? 0.7 : 1 },
              ]}
              onPress={handleConfirm}
              disabled={!signatureData || uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#FFFFFF" />
                  <Text style={styles.confirmText}>{t('component.signatureModal.confirmButton')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
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
  padWrapper: {
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
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmText: {
    fontSize: 14,
    fontFamily: fontFamilies.bodySemibold,
    color: '#FFFFFF',
  },
});

export default SignatureModal;
