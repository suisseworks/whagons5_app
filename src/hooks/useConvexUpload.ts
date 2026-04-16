/**
 * useConvexUpload – Shared hook for uploading files to Convex storage.
 *
 * Handles image picking (camera + gallery), document picking, and
 * uploading to Convex's file storage via generateUploadUrl.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from './useTenant';
import { useLanguage } from '../context/LanguageContext';
import type { AttachmentPickerSheetProps } from '../components/AttachmentPickerSheet';

export interface ConvexAttachment {
  storageId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface PendingFile {
  uri: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export function useConvexUpload() {
  const { tenantId } = useTenant();
  const { t } = useLanguage();
  const generateUploadUrl = useMutation(api.taskResources.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const pickerResolverRef = useRef<((attachments: ConvexAttachment[]) => void) | null>(null);

  const resolvePicker = useCallback((attachments: ConvexAttachment[]) => {
    pickerResolverRef.current?.(attachments);
    pickerResolverRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      resolvePicker([]);
    };
  }, [resolvePicker]);

  /**
   * Upload a single local file URI to Convex storage.
   * Returns the ConvexAttachment with storageId.
   */
  const uploadFile = useCallback(async (file: PendingFile): Promise<ConvexAttachment> => {
    if (!tenantId) throw new Error('Not authenticated');

    let uploadUrl = await generateUploadUrl({ tenantId });
    // Self-hosted Convex generates upload URLs using CONVEX_CLOUD_ORIGIN which
    // points to the dashboard domain. Rewrite to the actual backend domain.
    const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
    if (convexUrl && typeof uploadUrl === 'string') {
      try {
        const expected = new URL(convexUrl);
        const actual = new URL(uploadUrl);
        if (actual.hostname !== expected.hostname) {
          actual.hostname = expected.hostname;
          uploadUrl = actual.toString();
        }
      } catch {}
    }

    // React Native: use XMLHttpRequest to read local file URI as blob
    const blob: Blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.onerror = () => reject(new Error('Failed to read file'));
      xhr.responseType = 'blob';
      xhr.open('GET', file.uri, true);
      xhr.send(null);
    });

    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.fileType || 'application/octet-stream' },
      body: blob,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => '');
      throw new Error(`Upload failed (${uploadResp.status}): ${errText}`);
    }
    const { storageId } = await uploadResp.json();
    const resolvedFileSize = blob.size > 0 ? blob.size : file.fileSize;

    return {
      storageId,
      fileName: file.fileName,
      fileSize: resolvedFileSize,
      fileType: file.fileType,
    };
  }, [tenantId, generateUploadUrl]);

  /**
   * Upload multiple files to Convex storage.
   */
  const uploadFiles = useCallback(async (files: PendingFile[]): Promise<ConvexAttachment[]> => {
    setUploading(true);
    try {
      const results: ConvexAttachment[] = [];
      for (const file of files) {
        results.push(await uploadFile(file));
      }
      return results;
    } finally {
      setUploading(false);
    }
  }, [uploadFile]);

  /**
   * Pick images from gallery. Returns local file info (not yet uploaded).
   */
  const pickImages = useCallback(async (): Promise<PendingFile[]> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return [];

    return result.assets.map(a => ({
      uri: a.uri,
      fileName: a.fileName || a.uri.split('/').pop() || 'image.jpg',
      fileSize: a.fileSize || 0,
      fileType: a.mimeType || 'image/jpeg',
    }));
  }, []);

  /**
   * Take a photo with camera. Returns local file info.
   */
  const takePhoto = useCallback(async (): Promise<PendingFile | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(t('attachmentPicker.permissionTitle'), t('attachmentPicker.permissionMessage'));
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return null;

    const a = result.assets[0];
    return {
      uri: a.uri,
      fileName: a.fileName || `photo_${Date.now()}.jpg`,
      fileSize: a.fileSize || 0,
      fileType: a.mimeType || 'image/jpeg',
    };
  }, []);

  /**
   * Pick documents (any file type). Returns local file info.
   */
  const pickDocuments = useCallback(async (): Promise<PendingFile[]> => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return [];

    return result.assets.map(a => ({
      uri: a.uri,
      fileName: a.name || 'file',
      fileSize: a.size || 0,
      fileType: a.mimeType || 'application/octet-stream',
    }));
  }, []);

  /**
   * Show action sheet to pick images or files, then upload all selected.
   * Returns ConvexAttachment[] ready to attach to a note/message.
   */
  const closeAttachmentPicker = useCallback(() => {
    setPickerVisible(false);
    resolvePicker([]);
  }, [resolvePicker]);

  const handleTakePhotoSelection = useCallback(async () => {
    setPickerVisible(false);
    const photo = await takePhoto();
    if (!photo) {
      resolvePicker([]);
      return;
    }

    setUploading(true);
    try {
      resolvePicker([await uploadFile(photo)]);
    } catch (err: any) {
      Alert.alert(t('attachmentPicker.uploadFailedTitle'), err?.message || t('attachmentPicker.uploadFailedPhoto'));
      resolvePicker([]);
    } finally {
      setUploading(false);
    }
  }, [resolvePicker, t, takePhoto, uploadFile]);

  const handleChoosePhotosSelection = useCallback(async () => {
    setPickerVisible(false);
    const images = await pickImages();
    if (!images.length) {
      resolvePicker([]);
      return;
    }

    try {
      resolvePicker(await uploadFiles(images));
    } catch (err: any) {
      Alert.alert(t('attachmentPicker.uploadFailedTitle'), err?.message || t('attachmentPicker.uploadFailedImages'));
      resolvePicker([]);
    }
  }, [pickImages, resolvePicker, t, uploadFiles]);

  const handleChooseFilesSelection = useCallback(async () => {
    setPickerVisible(false);
    const docs = await pickDocuments();
    if (!docs.length) {
      resolvePicker([]);
      return;
    }

    try {
      resolvePicker(await uploadFiles(docs));
    } catch (err: any) {
      Alert.alert(t('attachmentPicker.uploadFailedTitle'), err?.message || t('attachmentPicker.uploadFailedFile'));
      resolvePicker([]);
    }
  }, [pickDocuments, resolvePicker, t, uploadFiles]);

  const pickAndUpload = useCallback((): Promise<ConvexAttachment[]> => {
    return new Promise((resolve) => {
      resolvePicker([]);
      pickerResolverRef.current = resolve;
      setPickerVisible(true);
    });
  }, [resolvePicker]);

  /**
   * Take a photo and upload it immediately. Returns a single ConvexAttachment or null.
   */
  const takePhotoAndUpload = useCallback(async (): Promise<ConvexAttachment | null> => {
    const photo = await takePhoto();
    if (!photo) return null;
    setUploading(true);
    try {
      return await uploadFile(photo);
    } catch (err: any) {
      Alert.alert(t('attachmentPicker.uploadFailedTitle'), err?.message || t('attachmentPicker.uploadFailedPhoto'));
      return null;
    } finally {
      setUploading(false);
    }
  }, [t, takePhoto, uploadFile]);

  const attachmentPickerProps: AttachmentPickerSheetProps = {
    visible: pickerVisible,
    busy: uploading,
    onClose: closeAttachmentPicker,
    onTakePhoto: handleTakePhotoSelection,
    onChoosePhotos: handleChoosePhotosSelection,
    onChooseFiles: handleChooseFilesSelection,
  };

  return {
    uploading,
    uploadFile,
    uploadFiles,
    pickImages,
    takePhoto,
    pickDocuments,
    pickAndUpload,
    takePhotoAndUpload,
    attachmentPickerProps,
  };
}
