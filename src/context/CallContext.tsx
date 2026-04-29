import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from 'convex/react';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { api } from '../../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { useTenant } from '../hooks/useTenant';
import { useOfflineMutation } from '../hooks/useOfflineMutation';
import { useTheme } from './ThemeContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { CALL_RING_TONE_DATA_URI } from '../utils/callToneData';
import { getInitials } from '../utils/helpers';
import { getOptimizedImageUrl } from '../utils/imgproxy';
import {
  getMobileCallService,
  IncomingMobileCall,
  MobileCallMode,
  MobileCallParticipant,
  MobileCallSignal,
} from '../services/MobileCallService';

interface ConversationCallStartOptions {
  conversationId: string | number;
  title: string;
  picture?: string | null;
  mode: MobileCallMode;
}

interface CallContextValue {
  startConversationCall: (options: ConversationCallStartOptions) => Promise<void>;
  hangUp: () => void;
  isCallActive: boolean;
  isIncomingCallVisible: boolean;
}

interface CallPresentation {
  conversationId?: string;
  workspaceId?: string;
  title: string;
  picture?: string | null;
  mode: MobileCallMode;
  launching: boolean;
}

interface DerivedCallUi {
  visible: boolean;
  mode: MobileCallMode;
  title: string;
  picture?: string | null;
  statusText: string;
  localParticipant: MobileCallParticipant | null;
  remoteParticipants: MobileCallParticipant[];
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

function Avatar({
  name,
  picture,
  size,
  accentColor,
}: {
  name: string;
  picture?: string | null;
  size: number;
  accentColor: string;
}) {
  if (picture) {
    return (
      <ExpoImage
        source={{ uri: getOptimizedImageUrl(picture, { width: size, height: size, mode: 'fill' }) || picture }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${accentColor}26`,
      }}
    >
      <Text style={{ color: accentColor, fontSize: size * 0.34, fontFamily: fontFamilies.bodySemibold }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  labelColor,
  iconColor,
  buttonColor,
  borderColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  labelColor: string;
  iconColor: string;
  buttonColor: string;
  borderColor?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.controlWrap} activeOpacity={0.85}>
      <View
        style={[
          styles.controlButton,
          {
            backgroundColor: buttonColor,
            borderColor: borderColor ?? 'transparent',
          },
        ]}
      >
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.controlLabel, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const [incomingCall, setIncomingCall] = useState<IncomingMobileCall | null>(null);
  const [presentation, setPresentation] = useState<CallPresentation | null>(null);
  const [revision, setRevision] = useState(0);
  const [isPrimaryLocal, setIsPrimaryLocal] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [callBodySize, setCallBodySize] = useState({ width: 0, height: 0 });
  const serviceInitialized = useRef(false);
  const processedSignalIds = useRef(new Set<string>());
  const outgoingToneRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const incomingToneRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const acknowledgeSignals = useOfflineMutation(api.calls.acknowledgeSignals, 'calls.acknowledgeSignals');
  const acknowledgeRoomSignals = useOfflineMutation(api.calls.acknowledgeRoomSignals, 'calls.acknowledgeRoomSignals');
  const signalDocs = useQuery(
    api.calls.listForUser,
    tenantId && user?.id ? { tenantId, userId: String(user.id) } : 'skip',
  );

  const bumpRevision = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    processedSignalIds.current.clear();
  }, [tenantId, user?.id]);

  const stopTone = useCallback((toneRef: React.MutableRefObject<ReturnType<typeof createAudioPlayer> | null>) => {
    const player = toneRef.current;
    if (!player) return;

    toneRef.current = null;
    try {
      player.pause();
      void player.seekTo(0).catch(() => {});
    } catch {}
    try {
      player.remove();
    } catch {}
  }, []);

  const startTone = useCallback(async (toneRef: React.MutableRefObject<ReturnType<typeof createAudioPlayer> | null>) => {
    if (toneRef.current?.playing) return;

    stopTone(toneRef);

    try {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const player = createAudioPlayer({ uri: CALL_RING_TONE_DATA_URI });
      player.loop = true;
      player.volume = 0.35;
      toneRef.current = player;
      player.play();
    } catch {}
  }, [stopTone]);

  useEffect(() => {
    if (!user?.id) return;

    const service = getMobileCallService();
    if (!serviceInitialized.current) {
      service.init(String(user.id), user.name || user.email, user.photo_url ?? undefined);
      serviceInitialized.current = true;
    }

    const unsubIncoming = service.on('call:incoming', (payload: IncomingMobileCall) => {
      setIncomingCall(payload);
      bumpRevision();
    });
    const unsubIncomingDismissed = service.on('call:incoming:dismissed', () => {
      setIncomingCall(null);
      bumpRevision();
    });
    const unsubStarted = service.on('call:started', () => {
      setPresentation((current) => current ? { ...current, launching: false, mode: service.callMode } : current);
      bumpRevision();
    });
    const unsubJoined = service.on('call:joined', () => {
      setPresentation((current) => current ? { ...current, launching: false, mode: service.callMode } : current);
      bumpRevision();
    });
    const unsubParticipants = service.on('participants:updated', () => {
      setPresentation((current) => current ? { ...current, launching: false, mode: service.callMode } : current);
      bumpRevision();
    });
    const unsubEnded = service.on('call:ended', () => {
      setIncomingCall(null);
      setPresentation(null);
      bumpRevision();
    });
    const unsubRejected = service.on('call:rejected', (payload: { userName?: string }) => {
      Alert.alert('Call declined', payload?.userName ? `${payload.userName} declined the call.` : 'The call was declined.');
    });
    const unsubFull = service.on('call:full', () => {
      Alert.alert('Call unavailable', 'The other user is already on another call.');
    });
    const unsubError = service.on('call:error', (payload: { error?: string }) => {
      if (payload?.error) {
        Alert.alert('Call error', payload.error);
      }
    });

    return () => {
      unsubIncoming();
      unsubIncomingDismissed();
      unsubStarted();
      unsubJoined();
      unsubParticipants();
      unsubEnded();
      unsubRejected();
      unsubFull();
      unsubError();
    };
  }, [bumpRevision, user?.email, user?.id, user?.name, user?.photo_url]);

  useEffect(() => {
    if (!tenantId || !signalDocs?.length) return;

    const service = getMobileCallService();
    const freshDocs = signalDocs.filter((doc: any) => {
      const id = String(doc._id);
      if (processedSignalIds.current.has(id)) return false;
      processedSignalIds.current.add(id);
      return true;
    });

    if (!freshDocs.length) return;

    void (async () => {
      const acknowledgedIds: any[] = [];

      for (const doc of freshDocs) {
        const operation = doc.operation as MobileCallSignal['operation'];
        const callMode = (doc.callMode || 'audio') as MobileCallSignal['callMode'];
        const signal: MobileCallSignal = {
          type: 'webrtc',
          operation,
          workspaceId: doc.workspaceId ? String(doc.workspaceId) : undefined,
          conversationId: doc.conversationId ? String(doc.conversationId) : undefined,
          fromUserId: String(doc.senderId),
          fromUserName: doc.senderName || '',
          fromUserPicture: doc.senderPicture || undefined,
          toUserId: doc.toUserId ? String(doc.toUserId) : undefined,
          callMode,
          payload: doc.payload,
        };

        try {
          await service.receiveSignal(signal);

          const isDurableIncoming =
            doc.operation === 'call-start' || doc.operation === 'call-invite';

          if (!isDurableIncoming) {
            acknowledgedIds.push(doc._id);
          }

          if (
            doc.operation === 'call-end' ||
            doc.operation === 'call-leave' ||
            doc.operation === 'call-reject' ||
            doc.operation === 'call-full'
          ) {
            await acknowledgeRoomSignals({
              tenantId,
              callerUserId: String(doc.senderId),
              workspaceId: doc.workspaceId ? String(doc.workspaceId) : undefined,
              conversationId: doc.conversationId ? String(doc.conversationId) : undefined,
            });
          }
        } catch {
          processedSignalIds.current.delete(String(doc._id));
        }
      }

      if (!acknowledgedIds.length) return;

      try {
        await acknowledgeSignals({ tenantId, ids: acknowledgedIds });
      } catch {
        for (const id of acknowledgedIds) {
          processedSignalIds.current.delete(String(id));
        }
      }
    })();
  }, [acknowledgeRoomSignals, acknowledgeSignals, signalDocs, tenantId]);

  const acknowledgeIncomingCall = useCallback(async (call: IncomingMobileCall) => {
    if (!tenantId) return;

    await acknowledgeRoomSignals({
      tenantId,
      callerUserId: call.callerUserId,
      workspaceId: call.workspaceId || undefined,
      conversationId: call.conversationId || undefined,
    });
  }, [acknowledgeRoomSignals, tenantId]);

  const startConversationCall = useCallback(async (options: ConversationCallStartOptions) => {
    if (!tenantId) {
      Alert.alert('Call unavailable', 'You need to be connected to a tenant to place a call.');
      return;
    }

    setIncomingCall(null);
    setPresentation({
      conversationId: String(options.conversationId),
      title: options.title,
      picture: options.picture ?? undefined,
      mode: options.mode,
      launching: true,
    });
    bumpRevision();

    try {
      await getMobileCallService().startCall(tenantId, {
        conversationId: String(options.conversationId),
        mode: options.mode,
      });
    } catch {
      setPresentation(null);
      bumpRevision();
    }
  }, [bumpRevision, tenantId]);

  const handleAccept = useCallback(() => {
    if (!incomingCall || !tenantId) return;

    setPresentation({
      conversationId: incomingCall.conversationId,
      workspaceId: incomingCall.workspaceId,
      title: incomingCall.callerUserName,
      picture: incomingCall.callerUserPicture ?? undefined,
      mode: incomingCall.callMode,
      launching: true,
    });
    setIncomingCall(null);
    bumpRevision();

    void (async () => {
      try {
        await getMobileCallService().joinCall(tenantId, {
          conversationId: incomingCall.conversationId,
          workspaceId: incomingCall.workspaceId,
          mode: incomingCall.callMode,
        });
        await acknowledgeIncomingCall(incomingCall);
      } catch {
        setPresentation(null);
        bumpRevision();
      }
    })();
  }, [acknowledgeIncomingCall, bumpRevision, incomingCall, tenantId]);

  const handleReject = useCallback(() => {
    if (!incomingCall || !tenantId) return;

    void (async () => {
      try {
        await acknowledgeIncomingCall(incomingCall);
        await getMobileCallService().rejectCall(tenantId, {
          workspaceId: incomingCall.workspaceId,
          conversationId: incomingCall.conversationId,
          mode: incomingCall.callMode,
          callerUserId: incomingCall.callerUserId,
        });
      } finally {
        setIncomingCall(null);
        bumpRevision();
      }
    })();
  }, [acknowledgeIncomingCall, bumpRevision, incomingCall, tenantId]);

  const activeCall = useMemo<DerivedCallUi>(() => {
    const service = getMobileCallService();
    const participants = service.getParticipantList();
    const localParticipant =
      participants.find((participant) => participant.userId === String(user?.id)) ?? null;
    const remoteParticipants = participants.filter((participant) => participant.userId !== String(user?.id));

    const title =
      presentation?.title ||
      remoteParticipants[0]?.userName ||
      'Call';
    const picture =
      presentation?.picture ||
      remoteParticipants[0]?.userPicture ||
      undefined;

    let statusText = '';
    if (presentation?.launching) {
      statusText = presentation.mode === 'video' ? 'Starting video call...' : 'Starting audio call...';
    } else if (!service.isInCall) {
      statusText = '';
    } else if (remoteParticipants.length === 0) {
      statusText = service.startedCall ? 'Calling...' : 'Connecting...';
    } else if (remoteParticipants.length === 1) {
      statusText = service.callMode === 'video' ? 'Video call live' : 'Audio call live';
    } else {
      statusText = `${remoteParticipants.length + 1} people in call`;
    }

    return {
      visible: Boolean(presentation?.launching) || service.isInCall,
      mode: service.isInCall ? service.callMode : presentation?.mode ?? 'audio',
      title,
      picture,
      statusText,
      localParticipant,
      remoteParticipants,
    };
  }, [presentation, revision, user?.id]);

  const contextValue = useMemo<CallContextValue>(() => ({
    startConversationCall,
    hangUp: () => getMobileCallService().hangUp(),
    isCallActive: activeCall.visible,
    isIncomingCallVisible: !!incomingCall,
  }), [activeCall.visible, incomingCall, startConversationCall]);

  const surfaceColor = isDarkMode ? '#111817' : '#F5F0EA';
  const panelColor = isDarkMode ? 'rgba(17,24,23,0.9)' : 'rgba(255,255,255,0.94)';
  const service = getMobileCallService();
  const shouldPlayOutgoingTone =
    !incomingCall &&
    service.startedCall &&
    activeCall.visible &&
    activeCall.remoteParticipants.length === 0;

  useEffect(() => {
    if (incomingCall) {
      void startTone(incomingToneRef);
    } else {
      stopTone(incomingToneRef);
    }
  }, [incomingCall, startTone, stopTone]);

  useEffect(() => {
    if (shouldPlayOutgoingTone) {
      void startTone(outgoingToneRef);
    } else {
      stopTone(outgoingToneRef);
    }
  }, [shouldPlayOutgoingTone, startTone, stopTone]);

  useEffect(() => () => {
    stopTone(incomingToneRef);
    stopTone(outgoingToneRef);
  }, [stopTone]);

  const remotePrimary = activeCall.remoteParticipants[0];
  const participantCount = Math.max(1, activeCall.remoteParticipants.length + (activeCall.localParticipant ? 1 : 0));
  const callModeLabel = activeCall.mode === 'video' ? 'Video call' : 'Audio call';
  const remoteVideo = activeCall.remoteParticipants.find(
    (participant) =>
      participant.stream &&
      participant.videoEnabled &&
      participant.stream.getVideoTracks().some(
        (track: any) => track.readyState === 'live' && !track.muted && track.enabled,
      ),
  );
  const localVideoReady = !!(
    activeCall.localParticipant?.stream &&
    activeCall.localParticipant.videoEnabled &&
    activeCall.localParticipant.stream.getVideoTracks().some(
      (track: any) => track.readyState === 'live' && !track.muted && track.enabled,
    )
  );
  const previewWidth = 108;
  const previewHeight = 148;
  const previewMargin = spacing.md;
  const canSwapVideo = !!(remoteVideo?.stream && localVideoReady && activeCall.localParticipant?.stream);
  const showLocalPrimary = canSwapVideo && isPrimaryLocal;
  const primaryVideoParticipant = showLocalPrimary
    ? activeCall.localParticipant
    : remoteVideo ?? (activeCall.remoteParticipants.length === 0 && localVideoReady ? activeCall.localParticipant : null);
  const previewVideoParticipant = canSwapVideo
    ? showLocalPrimary
      ? remoteVideo
      : activeCall.localParticipant
    : null;
  const primaryVideoMirror = primaryVideoParticipant?.userId === activeCall.localParticipant?.userId;
  const previewVideoMirror = previewVideoParticipant?.userId === activeCall.localParticipant?.userId;
  const previewPanStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!activeCall.visible) {
      setIsPrimaryLocal(false);
      setPreviewPosition(null);
      setCallBodySize({ width: 0, height: 0 });
      return;
    }

    if (!canSwapVideo && isPrimaryLocal) {
      setIsPrimaryLocal(false);
    }
  }, [activeCall.visible, canSwapVideo, isPrimaryLocal]);

  useEffect(() => {
    if (!callBodySize.width || !callBodySize.height) return;
    const maxX = Math.max(0, callBodySize.width - previewWidth - previewMargin);
    const maxY = Math.max(0, callBodySize.height - previewHeight - previewMargin);

    setPreviewPosition((current) => {
      if (!current) {
        return { x: maxX, y: maxY };
      }
      return {
        x: Math.min(Math.max(0, current.x), maxX),
        y: Math.min(Math.max(0, current.y), maxY),
      };
    });
  }, [callBodySize.height, callBodySize.width]);

  const previewPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !!previewVideoParticipant,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !!previewVideoParticipant && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
      onPanResponderGrant: () => {
        previewPanStart.current = previewPosition ?? { x: 0, y: 0 };
      },
      onPanResponderMove: (_, gesture) => {
        const start = previewPanStart.current ?? previewPosition ?? { x: 0, y: 0 };
        const maxX = Math.max(0, callBodySize.width - previewWidth - previewMargin);
        const maxY = Math.max(0, callBodySize.height - previewHeight - previewMargin);
        setPreviewPosition({
          x: Math.min(Math.max(0, start.x + gesture.dx), maxX),
          y: Math.min(Math.max(0, start.y + gesture.dy), maxY),
        });
      },
    }),
    [callBodySize.height, callBodySize.width, previewPosition, previewVideoParticipant],
  );

  return (
    <CallContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={!!incomingCall}
        animationType="fade"
        transparent
        onRequestClose={handleReject}
      >
        <View style={styles.incomingBackdrop}>
          <View
            style={[
              styles.incomingCard,
              {
                backgroundColor: panelColor,
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
              },
            ]}
          >
            <View style={styles.incomingHeader}>
              <Avatar
                name={incomingCall?.callerUserName || 'Caller'}
                picture={incomingCall?.callerUserPicture}
                size={58}
                accentColor={primaryColor}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.incomingName, { color: colors.text }]}>
                  {incomingCall?.callerUserName}
                </Text>
                <Text style={[styles.incomingSub, { color: colors.textSecondary }]}>
                  {incomingCall?.callMode === 'video' ? 'Incoming video call' : 'Incoming audio call'}
                </Text>
              </View>
              <View style={[styles.incomingModeChip, { backgroundColor: `${primaryColor}18` }]}>
                <MaterialIcons
                  name={incomingCall?.callMode === 'video' ? 'videocam' : 'call'}
                  size={18}
                  color={primaryColor}
                />
              </View>
            </View>

            <View style={styles.incomingActions}>
              <TouchableOpacity style={[styles.incomingAction, { backgroundColor: '#C73A4D' }]} onPress={handleReject}>
                <MaterialIcons name="call-end" size={18} color="#FFFFFF" />
                <Text style={styles.incomingActionText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.incomingAction, { backgroundColor: '#148A54' }]} onPress={handleAccept}>
                <MaterialIcons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.incomingActionText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeCall.visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => getMobileCallService().hangUp()}
      >
        <SafeAreaView style={[styles.callScreen, { backgroundColor: surfaceColor }]}> 
          <View pointerEvents="none" style={styles.callBackdropLayerTop} />
          <View pointerEvents="none" style={styles.callBackdropLayerBottom} />

          <View style={styles.callHeader}>
            <View style={styles.callHeaderMeta}>
              <View
                style={[
                  styles.callMetaChip,
                  { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)' },
                ]}
              >
                <MaterialIcons
                  name={activeCall.mode === 'video' ? 'videocam' : 'call'}
                  size={14}
                  color={primaryColor}
                />
                <Text style={[styles.callMetaChipText, { color: colors.textSecondary }]}>{callModeLabel}</Text>
              </View>
              <Text style={[styles.callTitle, { color: colors.text }]} numberOfLines={1}>
                {activeCall.title}
              </Text>
              {!!activeCall.statusText && (
                <Text style={[styles.callStatus, { color: colors.textSecondary }]}> 
                  {activeCall.statusText}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => getMobileCallService().hangUp()}
              style={[styles.closeButton, { borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)' }]}
            >
              <MaterialIcons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View
            style={styles.callBody}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setCallBodySize({ width, height });
            }}
          >
            <View
              style={[
                styles.callInfoStrip,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                },
              ]}
            >
              <View style={styles.callInfoItem}>
                <Text style={[styles.callInfoEyebrow, { color: colors.textSecondary }]}>Mode</Text>
                <Text style={[styles.callInfoValue, { color: colors.text }]}>{callModeLabel}</Text>
              </View>
              <View style={styles.callInfoDivider} />
              <View style={styles.callInfoItem}>
                <Text style={[styles.callInfoEyebrow, { color: colors.textSecondary }]}>People</Text>
                <Text style={[styles.callInfoValue, { color: colors.text }]}>{participantCount}</Text>
              </View>
            </View>

            {primaryVideoParticipant?.stream ? (
              <View style={styles.remoteVideoFrame}>
                <RTCView
                  streamURL={primaryVideoParticipant.stream.toURL()}
                  style={styles.remoteVideo}
                  objectFit="cover"
                  mirror={primaryVideoMirror}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.remoteVideoOutline,
                    {
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                    },
                  ]}
                />
                <View style={styles.videoStatusPill}>
                  <MaterialIcons
                    name={activeCall.mode === 'video' ? 'videocam' : 'call'}
                    size={14}
                    color="#FFFFFF"
                  />
                  <Text style={styles.videoStatusPillText}>{activeCall.statusText || 'Live'}</Text>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.audioHero,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                  },
                ]}
              >
                <Avatar
                  name={remotePrimary?.userName || activeCall.title}
                  picture={remotePrimary?.userPicture || activeCall.picture}
                  size={112}
                  accentColor={primaryColor}
                />
                <Text style={[styles.audioHeroName, { color: colors.text }]}>
                  {remotePrimary?.userName || activeCall.title}
                </Text>
                <Text style={[styles.audioHeroSub, { color: colors.textSecondary }]}> 
                  {activeCall.statusText || 'In call'}
                </Text>
                <View
                  style={[
                    styles.audioHeroBadge,
                    { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
                  ]}
                >
                  <MaterialIcons
                    name={activeCall.mode === 'video' ? 'videocam' : 'call'}
                    size={14}
                    color={primaryColor}
                  />
                  <Text style={[styles.audioHeroBadgeText, { color: colors.textSecondary }]}>{callModeLabel}</Text>
                </View>
              </View>
            )}

            {activeCall.remoteParticipants.length > 1 && (
              <View style={styles.participantRow}>
                {activeCall.remoteParticipants.slice(0, 4).map((participant) => (
                  <View
                    key={participant.userId}
                    style={[
                      styles.participantPill,
                      {
                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.76)',
                        borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                      },
                    ]}
                  >
                    <Avatar
                      name={participant.userName}
                      picture={participant.userPicture}
                      size={34}
                      accentColor={primaryColor}
                    />
                    <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>
                      {participant.userName}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {previewVideoParticipant?.stream && previewPosition && (
              <Pressable
                onPress={() => {
                  if (canSwapVideo) {
                    setIsPrimaryLocal((current) => !current);
                  }
                }}
                style={[
                  styles.localPreviewWrap,
                  {
                    left: previewPosition.x,
                    top: previewPosition.y,
                    right: undefined,
                    bottom: undefined,
                  },
                ]}
                {...previewPanResponder.panHandlers}
              >
                <RTCView
                  streamURL={previewVideoParticipant.stream.toURL()}
                  style={styles.localPreview}
                  objectFit="cover"
                  mirror={previewVideoMirror}
                  zOrder={2}
                />
              </Pressable>
            )}
          </View>

          <View
            style={[
              styles.controlsBar,
              {
                backgroundColor: isDarkMode ? 'rgba(8,13,13,0.94)' : 'rgba(255,255,255,0.94)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
              },
            ]}
          >
            <ControlButton
              icon={activeCall.localParticipant?.audioEnabled === false ? 'mic-off' : 'mic'}
              label={activeCall.localParticipant?.audioEnabled === false ? 'Muted' : 'Mic'}
              labelColor={colors.text}
              iconColor={activeCall.localParticipant?.audioEnabled === false ? '#F59E0B' : '#E7FFF7'}
              buttonColor={activeCall.localParticipant?.audioEnabled === false ? '#3B2A10' : '#0F7B6C'}
              borderColor={activeCall.localParticipant?.audioEnabled === false ? 'rgba(245,158,11,0.22)' : 'rgba(15,123,108,0.28)'}
              onPress={() => {
                getMobileCallService().toggleAudio();
                bumpRevision();
              }}
            />
            <ControlButton
              icon={activeCall.localParticipant?.videoEnabled === false ? 'videocam-off' : 'videocam'}
              label={activeCall.localParticipant?.videoEnabled === false ? 'Camera off' : 'Camera'}
              labelColor={colors.text}
              iconColor={activeCall.localParticipant?.videoEnabled === false ? '#F4D27A' : '#F4F8FF'}
              buttonColor={activeCall.localParticipant?.videoEnabled === false ? '#332A17' : '#425E96'}
              borderColor={activeCall.localParticipant?.videoEnabled === false ? 'rgba(244,210,122,0.22)' : 'rgba(66,94,150,0.28)'}
              onPress={() => {
                void getMobileCallService().toggleVideo().finally(() => bumpRevision());
              }}
            />
            {localVideoReady && (
              <ControlButton
                icon="cameraswitch"
                label="Flip"
                labelColor={colors.text}
                iconColor={isDarkMode ? '#F4F8FF' : '#203A59'}
                buttonColor={isDarkMode ? 'rgba(255,255,255,0.08)' : '#E7EDF8'}
                borderColor={isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(66,94,150,0.14)'}
                onPress={() => {
                  getMobileCallService().switchCamera();
                  bumpRevision();
                }}
              />
            )}
            <ControlButton
              icon="call-end"
              label="Hang up"
              labelColor={colors.text}
              iconColor="#FFFFFF"
              buttonColor="#C73A4D"
              borderColor="rgba(199,58,77,0.34)"
              onPress={() => getMobileCallService().hangUp()}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </CallContext.Provider>
  );
};

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used inside CallProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  incomingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 12, 0.42)',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  incomingCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.lifted,
  },
  incomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  incomingName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodySemibold,
  },
  incomingSub: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  incomingModeChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  },
  incomingAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 14,
    gap: 8,
  },
  incomingActionText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  callScreen: {
    flex: 1,
    overflow: 'hidden',
  },
  callBackdropLayerTop: {
    position: 'absolute',
    top: -120,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(20,138,84,0.12)',
  },
  callBackdropLayerBottom: {
    position: 'absolute',
    right: -80,
    bottom: 120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(66,94,150,0.12)',
  },
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  callHeaderMeta: {
    flex: 1,
    paddingRight: spacing.md,
  },
  callMetaChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  callMetaChipText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  callTitle: {
    fontSize: 28,
    fontFamily: fontFamilies.bodyBold,
  },
  callStatus: {
    marginTop: 4,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyRegular,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  callBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    justifyContent: 'center',
  },
  callInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  callInfoItem: {
    minWidth: 88,
    alignItems: 'center',
  },
  callInfoEyebrow: {
    fontSize: 11,
    fontFamily: fontFamilies.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  callInfoValue: {
    marginTop: 2,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
  },
  callInfoDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 12,
    backgroundColor: 'rgba(148,163,184,0.22)',
  },
  remoteVideoFrame: {
    flex: 1,
    position: 'relative',
    borderRadius: 30,
    backgroundColor: '#000000',
    overflow: 'hidden',
    ...shadows.lifted,
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#000000',
  },
  remoteVideoOutline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 1,
  },
  videoStatusPill: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(5,9,12,0.55)',
  },
  videoStatusPillText: {
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  audioHero: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl + spacing.md,
    minHeight: 320,
    ...shadows.lifted,
  },
  audioHeroName: {
    marginTop: spacing.md,
    fontSize: 32,
    fontFamily: fontFamilies.bodyBold,
  },
  audioHeroSub: {
    marginTop: 6,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyRegular,
  },
  audioHeroBadge: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  audioHeroBadgeText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  participantRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.lg,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  participantPill: {
    minWidth: 120,
    maxWidth: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantName: {
    flex: 1,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodySemibold,
  },
  localPreviewWrap: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    ...shadows.lifted,
  },
  localPreview: {
    width: 108,
    height: 148,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 18,
    borderTopWidth: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 28,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.lifted,
  },
  controlWrap: {
    alignItems: 'center',
    minWidth: 78,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    marginTop: 10,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
});
