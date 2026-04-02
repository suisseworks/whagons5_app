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
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { api } from '../../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { useTenant } from '../hooks/useTenant';
import { useTheme } from './ThemeContext';
import { fontFamilies, fontSizes, radius, shadows, spacing } from '../config/designTokens';
import { CALL_RING_TONE_DATA_URI } from '../utils/callToneData';
import { getInitials } from '../utils/helpers';
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
        source={{ uri: picture }}
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
  active = false,
  destructive = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  labelColor: string;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.controlWrap} activeOpacity={0.85}>
      <View
        style={[
          styles.controlButton,
          destructive
            ? { backgroundColor: '#C73A4D' }
            : active
              ? { backgroundColor: '#0F7B6C' }
              : { backgroundColor: 'rgba(255,255,255,0.14)' },
        ]}
      >
        <MaterialIcons name={icon} size={22} color="#FFFFFF" />
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
  const serviceInitialized = useRef(false);
  const processedSignalIds = useRef(new Set<string>());
  const outgoingToneRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const incomingToneRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  const acknowledgeSignals = useMutation(api.calls.acknowledgeSignals);
  const acknowledgeRoomSignals = useMutation(api.calls.acknowledgeRoomSignals);
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
        const signal: MobileCallSignal = {
          type: 'webrtc',
          operation: doc.operation,
          workspaceId: doc.workspaceId ? String(doc.workspaceId) : undefined,
          conversationId: doc.conversationId ? String(doc.conversationId) : undefined,
          fromUserId: String(doc.senderId),
          fromUserName: doc.senderName || '',
          fromUserPicture: doc.senderPicture || undefined,
          toUserId: doc.toUserId ? String(doc.toUserId) : undefined,
          callMode: doc.callMode || 'audio',
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
  const remoteVideo = activeCall.remoteParticipants.find(
    (participant) =>
      participant.stream &&
      participant.videoEnabled &&
      participant.stream.getVideoTracks().length > 0,
  );
  const localVideoReady = !!(
    activeCall.localParticipant?.stream &&
    activeCall.localParticipant.videoEnabled &&
    activeCall.localParticipant.stream.getVideoTracks().length > 0
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
          <View style={styles.callHeader}>
            <View>
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

          <View style={styles.callBody}>
            {activeCall.mode === 'video' && remoteVideo?.stream ? (
              <RTCView
                streamURL={remoteVideo.stream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
              />
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

            {activeCall.mode === 'video' && localVideoReady && activeCall.localParticipant?.stream && (
              <View style={styles.localPreviewWrap}>
                <RTCView
                  streamURL={activeCall.localParticipant.stream.toURL()}
                  style={styles.localPreview}
                  objectFit="cover"
                  mirror
                />
              </View>
            )}
          </View>

          <View
            style={[
              styles.controlsBar,
              {
                backgroundColor: isDarkMode ? 'rgba(11,17,16,0.9)' : 'rgba(255,255,255,0.88)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
              },
            ]}
          >
            <ControlButton
              icon={activeCall.localParticipant?.audioEnabled === false ? 'mic-off' : 'mic'}
              label={activeCall.localParticipant?.audioEnabled === false ? 'Muted' : 'Mic'}
              labelColor={colors.text}
              onPress={() => {
                getMobileCallService().toggleAudio();
                bumpRevision();
              }}
              active={activeCall.localParticipant?.audioEnabled !== false}
            />
            {activeCall.mode === 'video' && (
              <ControlButton
                icon={activeCall.localParticipant?.videoEnabled === false ? 'videocam-off' : 'videocam'}
                label={activeCall.localParticipant?.videoEnabled === false ? 'Camera off' : 'Camera'}
                labelColor={colors.text}
                onPress={() => {
                  getMobileCallService().toggleVideo();
                  bumpRevision();
                }}
                active={activeCall.localParticipant?.videoEnabled !== false}
              />
            )}
            <ControlButton
              icon="call-end"
              label="Hang up"
              labelColor={colors.text}
              onPress={() => getMobileCallService().hangUp()}
              destructive
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
  },
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  callTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.bodySemibold,
  },
  callStatus: {
    marginTop: 4,
    fontSize: fontSizes.sm,
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
    justifyContent: 'center',
  },
  remoteVideo: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  audioHero: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    minHeight: 320,
  },
  audioHeroName: {
    marginTop: spacing.md,
    fontSize: 28,
    fontFamily: fontFamilies.bodySemibold,
  },
  audioHeroSub: {
    marginTop: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000000',
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
    gap: 18,
    borderTopWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  controlWrap: {
    alignItems: 'center',
    minWidth: 74,
  },
  controlButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    marginTop: 8,
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
});
