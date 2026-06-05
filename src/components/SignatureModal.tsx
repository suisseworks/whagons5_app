import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { SignaturePad } from './SignaturePad';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useTheme } from '../context/ThemeContext';
import { fontFamilies, radius } from '../config/designTokens';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.88;

interface SignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onSigned: (payload: { storageId: string; signerName: string; comment?: string }) => void;
  title?: string;
  subtitle?: string;
  taskLabel?: string;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  visible,
  onClose,
  onSigned,
  title,
  subtitle,
  taskLabel,
}) => {
  const { tenantId } = useTenant();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const generateUploadUrl = useMutation(api.taskResources.generateUploadUrl);

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lastErrorDetails, setLastErrorDetails] = useState<string | null>(null);

  const resolveUploadUrl = useCallback((rawUrl: string): string => {
    const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
    if (!convexUrl) return rawUrl;
    try {
      const expected = new URL(convexUrl);
      const actual = new URL(rawUrl);
      if (actual.origin !== expected.origin) {
        actual.protocol = expected.protocol;
        actual.hostname = expected.hostname;
        actual.port = expected.port;
        return actual.toString();
      }
    } catch {}
    return rawUrl;
  }, []);

  const signatureDataToBlob = useCallback(async (dataUri: string): Promise<Blob> => {
    const base64Prefix = 'data:image/svg+xml;base64,';
    if (dataUri.startsWith(base64Prefix)) {
      const svgXml = atob(dataUri.slice(base64Prefix.length));
      return new Blob([svgXml], { type: 'image/svg+xml' });
    }

    const response = await fetch(dataUri);
    return response.blob();
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    if (!signerName.trim()) {
      setSignerName(user?.name || user?.email || '');
    }
  }, [visible, signerName, user?.name, user?.email]);

  const handleConfirm = useCallback(async () => {
    if (!signatureData || !tenantId) return;
    const finalSignerName = signerName.trim();
    if (!finalSignerName) {
      Alert.alert(t('component.signatureModal.nameRequired'));
      return;
    }
    setUploading(true);
    setLastErrorDetails(null);
    try {
      const rawUploadUrl = await generateUploadUrl({ tenantId });
      const uploadUrl = resolveUploadUrl(rawUploadUrl);

      const blob = await signatureDataToBlob(signatureData);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/svg+xml' },
        body: blob,
      });

      if (!uploadResponse.ok) {
        const body = await uploadResponse.text().catch(() => '');
        throw new Error(
          [
            `upload_status=${uploadResponse.status}`,
            `upload_url=${uploadUrl}`,
            `upload_body=${body || '<empty>'}`,
          ].join('\n'),
        );
      }

      const { storageId } = await uploadResponse.json();
      onSigned({
        storageId,
        signerName: finalSignerName,
        comment: comment.trim() || undefined,
      });
      setSignatureData(null);
      setComment('');
    } catch (err: any) {
      const details = err?.message || String(err);
      setLastErrorDetails(details);
      Alert.alert(
        t('component.signatureModal.uploadError'),
        `${t('component.signatureModal.uploadErrorMessage')}\n\n${details}`,
      );
    } finally {
      setUploading(false);
    }
  }, [signatureData, tenantId, signerName, comment, generateUploadUrl, onSigned, t, resolveUploadUrl, signatureDataToBlob]);

  const handleClose = useCallback(() => {
    setSignatureData(null);
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
                maxHeight: SHEET_MAX_HEIGHT,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.container}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator
              bounces={false}
            >
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>{title || t('component.signatureModal.title')}</Text>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <MaterialIcons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.subtitle, { color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>
                {subtitle || t('component.signatureModal.subtitle')}
              </Text>
              {!!taskLabel && (
                <Text style={[styles.taskLabel, { color: colors.text }]} numberOfLines={1}>
                  {taskLabel}
                </Text>
              )}

              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('component.signatureModal.nameLabel')}</Text>
              <TextInput
                value={signerName}
                onChangeText={setSignerName}
                placeholder={t('component.signatureModal.namePlaceholder')}
                placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.35)' : '#9CA3AF'}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#FAFAFA',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
                  },
                ]}
              />

              <View style={styles.padWrapper}>
                <SignaturePad
                  value={signatureData}
                  onChange={setSignatureData}
                  strokeColor={isDarkMode ? '#FFFFFF' : '#000000'}
                  borderColor={isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB'}
                  backgroundColor={isDarkMode ? 'rgba(255,255,255,0.03)' : '#FAFAFA'}
                  height={160}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('component.signatureModal.commentLabel')}</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={t('component.signatureModal.commentPlaceholder')}
                placeholderTextColor={isDarkMode ? 'rgba(255,255,255,0.35)' : '#9CA3AF'}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.commentInput,
                  {
                    color: colors.text,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#FAFAFA',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
                  },
                ]}
              />

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

              {!!lastErrorDetails && (
                <View style={[styles.errorBox, { borderColor: '#EF4444', backgroundColor: isDarkMode ? 'rgba(239,68,68,0.1)' : '#FEF2F2' }]}>
                  <Text style={[styles.errorTitle, { color: '#B91C1C' }]}>{t('component.signatureModal.debugTitle')}</Text>
                  <Text selectable style={[styles.errorDetails, { color: isDarkMode ? '#FCA5A5' : '#7F1D1D' }]}>
                    {lastErrorDetails}
                  </Text>
                </View>
              )}
            </ScrollView>
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
    flexShrink: 1,
  },
  scroll: {
    maxHeight: SHEET_MAX_HEIGHT,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
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
    marginBottom: 8,
  },
  taskLabel: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fontFamilies.bodyRegular,
    marginBottom: 12,
  },
  padWrapper: {
    marginBottom: 12,
  },
  commentInput: {
    minHeight: 88,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
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
  errorBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 12,
    fontFamily: fontFamilies.bodySemibold,
    marginBottom: 4,
  },
  errorDetails: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyRegular,
  },
});

export default SignatureModal;
