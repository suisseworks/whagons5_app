import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useTenant } from '../hooks/useTenant';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { VoiceMemoBubble } from './VoiceMemoControls';
import { ProgressiveImage } from './ProgressiveImage';

export interface NoteAttachmentData {
  storageId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export function fixConvexStorageUrl(url: string): string {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return url;
  try {
    const expected = new URL(convexUrl);
    const actual = new URL(url);

    const isConvexLikeSource =
      actual.pathname.includes('/api/storage/') ||
      actual.hostname.includes('convex') ||
      actual.hostname.startsWith('cvx-');

    if (!isConvexLikeSource) return url;

    if (actual.hostname !== expected.hostname) {
      actual.hostname = expected.hostname;
      return actual.toString();
    }
  } catch {}
  return url;
}

export const NoteAttachmentView: React.FC<{
  attachment: NoteAttachmentData;
  taskId?: string | null;
  colors: any;
  isDarkMode: boolean;
  isMe: boolean;
  onImagePress?: (uri: string) => void;
  primaryColor: string;
}> = ({ attachment, taskId, colors, isDarkMode, isMe, onImagePress, primaryColor }) => {
  const { tenantId } = useTenant();
  const markVoiceMemoListened = useOfflineMutation(api.taskResources.markVoiceMemoListened, 'taskResources.markVoiceMemoListened');
  const rawUrl = useQuery(
    api.files.getFileUrl,
    tenantId
      ? { tenantId, storageId: attachment.storageId as any }
      : 'skip'
  );
  const url = rawUrl ? fixConvexStorageUrl(rawUrl) : null;
  const isImage = attachment.fileType.startsWith('image/');
  const isVideo = attachment.fileType.startsWith('video/');
  const isAudio = attachment.fileType.startsWith('audio/') || /\.(m4a|mp3|aac|wav|caf|ogg|oga|webm)$/i.test(attachment.fileName) || attachment.fileName.toLowerCase().includes('voice memo');

  const handleVoiceMemoPlaybackStart = useCallback(() => {
    if (!tenantId || !taskId || !attachment.storageId) return;
    markVoiceMemoListened({ tenantId, taskId: taskId as any, storageId: attachment.storageId as any }).catch(() => {});
  }, [attachment.storageId, markVoiceMemoListened, taskId, tenantId]);

  const handleFilePress = useCallback(() => {
    if (!url) return;
    if (isImage && onImagePress) {
      onImagePress(url);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, [url, isImage, onImagePress]);

  // Loading state for inline media
  if ((isImage || isVideo || isAudio) && !url) {
    return (
      <View style={[noteAttachStyles.filePlaceholder, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' }]}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    );
  }

  if (isAudio && url) {
    return (
      <View style={noteAttachStyles.audioWrap}>
        <VoiceMemoBubble
          uri={url}
          outgoing={isMe}
          primaryColor={primaryColor}
          incomingBackgroundColor={isDarkMode ? 'rgba(31, 36, 34, 0.8)' : '#FFFFFF'}
          incomingTextColor={colors.textSecondary}
          timeLabel=""
          onPlaybackStart={handleVoiceMemoPlaybackStart}
        />
      </View>
    );
  }

  if (isVideo && url) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleFilePress}
        style={[
          noteAttachStyles.videoFallback,
          { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' },
        ]}
      >
        <MaterialIcons name="play-circle-outline" size={28} color={colors.textSecondary} />
        <Text style={[noteAttachStyles.videoFileName, { color: colors.text }]} numberOfLines={1}>
          {attachment.fileName}
        </Text>
        <Text style={[noteAttachStyles.videoHint, { color: colors.textSecondary }]}>
          Open video
        </Text>
      </TouchableOpacity>
    );
  }

  if (isImage && url) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={handleFilePress}>
        <ProgressiveImage
          uri={url}
          width={720}
          height={360}
          mode="fill"
          style={noteAttachStyles.image}
          contentFit="cover"
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleFilePress}
      disabled={!url}
      style={[noteAttachStyles.fileChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F5F5F7' }]}
    >
      <MaterialIcons name="attach-file" size={14} color={colors.textSecondary} />
      <Text style={[noteAttachStyles.fileName, { color: colors.text }]} numberOfLines={1}>
        {attachment.fileName}
      </Text>
      <MaterialIcons
        name="download"
        size={16}
        color={colors.textSecondary}
        style={{ marginLeft: 'auto' }}
      />
    </TouchableOpacity>
  );
};

export const ImageViewerModal: React.FC<{
  uri: string | null;
  onClose: () => void;
}> = ({ uri, onClose }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={noteAttachStyles.imageViewerOverlay}>
        <TouchableOpacity style={noteAttachStyles.imageViewerClose} onPress={onClose}>
          <MaterialIcons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {uri && (
          <ProgressiveImage
            uri={uri}
            width={Math.round(screenWidth * 0.95)}
            height={Math.round(screenHeight * 0.8)}
            mode="fit"
            style={noteAttachStyles.imageViewerImage}
            contentFit="contain"
          />
        )}
        <TouchableOpacity
          style={noteAttachStyles.imageViewerDownload}
          onPress={() => {
            if (uri) {
              Linking.openURL(uri).catch(() => {});
            }
          }}
        >
          <MaterialIcons name="download" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const noteAttachStyles = StyleSheet.create({
  audioWrap: {
    marginTop: 6,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginTop: 6,
  },
  videoFallback: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  videoFileName: {
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
  },
  videoHint: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
  },
  filePlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
    gap: 6,
  },
  fileName: {
    fontSize: 12,
    fontFamily: 'Montserrat_500Medium',
    flex: 1,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  imageViewerImage: {
    width: '95%',
    height: '80%',
  },
  imageViewerDownload: {
    position: 'absolute',
    bottom: 48,
    right: 24,
    zIndex: 2,
    padding: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
