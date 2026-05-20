import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';
import type { useVoiceMemoRecorder } from '../hooks/useVoiceMemoRecorder';
import type { VoiceMemoAttachment } from '../hooks/useVoiceMemoRecorder';

type VoiceMemoRecorder = ReturnType<typeof useVoiceMemoRecorder>;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function VoiceMemoRecordingBar({
  recorder,
  primaryColor,
  textColor,
  mutedColor,
  surfaceColor,
}: {
  recorder: VoiceMemoRecorder;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
}) {
  const duration = formatDuration(recorder.durationMs);

  return (
    <View style={[styles.recordingBar, { backgroundColor: surfaceColor }]}>
      <View style={styles.durationWrap}>
        <View style={styles.redDot} />
        <Text style={[styles.durationText, { color: textColor }]}>{duration}</Text>
      </View>

      {recorder.isLocked ? (
        <TouchableOpacity
          style={[styles.pauseButton, { backgroundColor: `${primaryColor}22` }]}
          onPress={recorder.isPaused ? recorder.resumeRecording : recorder.pauseRecording}
        >
          <MaterialIcons name={recorder.isPaused ? 'mic' : 'pause'} size={20} color={primaryColor} />
          <Text style={[styles.pauseLabel, { color: primaryColor }]}>
            {recorder.isPaused ? 'Resume' : 'Pause'}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.slideText, { color: mutedColor }]} numberOfLines={1}>‹ Slide to cancel</Text>
      )}

    </View>
  );
}

function VoiceMemoDraftItem({
  attachment,
  index,
  primaryColor,
  mutedColor,
  onRemove,
}: {
  attachment: VoiceMemoAttachment;
  index: number;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
  onRemove: (index: number) => void;
}) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformRef = useRef<View>(null);
  const waveformPageXRef = useRef(0);
  const waveformWidthRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const pendingSeekMsRef = useRef<number | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekAtRef = useRef(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [positionMs, setPositionMs] = React.useState(0);
  const durationMs = attachment.durationMs || 0;
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
      playerRef.current?.pause();
      playerRef.current = null;
    };
  }, []);

  const togglePlayback = async () => {
    if (!attachment.localUri) return;
    if (!playerRef.current) {
      playerRef.current = createAudioPlayer({ uri: attachment.localUri }, { updateInterval: 100 });
      intervalRef.current = setInterval(() => {
        const player = playerRef.current;
        if (!player) return;
        setIsPlaying(player.playing);
        if (!isScrubbingRef.current) {
          setPositionMs(Math.round((player.currentTime || 0) * 1000));
        }
        if (player.duration > 0 && player.currentTime >= player.duration - 0.05 && !player.playing) {
          setIsPlaying(false);
          setPositionMs(0);
          player.seekTo(0).catch(() => {});
        }
      }, 100);
    }

    const player = playerRef.current;
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
      return;
    }
    if (durationMs > 0 && positionMs >= durationMs - 100) {
      await player.seekTo(0);
    }
    player.play();
    setIsPlaying(true);
  };

  const flushPendingSeek = async () => {
    const nextMs = pendingSeekMsRef.current;
    if (nextMs == null || !playerRef.current) return;
    pendingSeekMsRef.current = null;
    lastSeekAtRef.current = Date.now();
    await playerRef.current.seekTo(nextMs / 1000);
  };

  const measureWaveform = () => {
    waveformRef.current?.measureInWindow((x, _y, width) => {
      waveformPageXRef.current = x;
      waveformWidthRef.current = Math.max(1, width);
    });
  };

  const seekFromPageX = (pageX: number) => {
    if (durationMs <= 0) return;
    const width = Math.max(1, waveformWidthRef.current);
    const ratio = Math.min(1, Math.max(0, (pageX - waveformPageXRef.current) / width));
    const nextMs = ratio * durationMs;
    setPositionMs(nextMs);
    if (!playerRef.current) return;

    pendingSeekMsRef.current = nextMs;
    const now = Date.now();
    if (now - lastSeekAtRef.current >= 140) {
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
      void flushPendingSeek();
      return;
    }
    if (!seekTimerRef.current) {
      seekTimerRef.current = setTimeout(() => {
        seekTimerRef.current = null;
        void flushPendingSeek();
      }, 140);
    }
  };

  const waveformPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        isScrubbingRef.current = true;
        const pageX = event.nativeEvent.pageX;
        measureWaveform();
        seekFromPageX(pageX);
      },
      onPanResponderMove: (event) => {
        const pageX = event.nativeEvent.pageX;
        seekFromPageX(pageX);
      },
      onPanResponderRelease: () => {
        isScrubbingRef.current = false;
        void flushPendingSeek();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        isScrubbingRef.current = false;
        void flushPendingSeek();
      },
    }),
    [durationMs],
  );

  return (
    <View style={styles.audioDraftRow}>
      <TouchableOpacity style={styles.audioDraftRemove} onPress={() => onRemove(index)}>
        <MaterialIcons name="delete-outline" size={24} color={mutedColor} />
      </TouchableOpacity>
      <View style={[styles.audioDraft, { backgroundColor: primaryColor }]}> 
        <TouchableOpacity style={styles.audioDraftPlay} onPress={togglePlayback} disabled={!attachment.localUri}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={18} color={primaryColor} />
        </TouchableOpacity>
        <Text style={styles.audioDraftDuration}>{formatDuration(durationMs)}</Text>
        <View style={styles.waveformBars}>
          {Array.from({ length: 24 }).map((_, barIndex) => {
            const active = barIndex / 24 <= progress;
            const height = 8 + ((barIndex * 7) % 18);
            return (
              <View
                key={barIndex}
                style={[
                  styles.waveformBar,
                  {
                    height,
                    backgroundColor: '#FFFFFF',
                    opacity: active ? 0.95 : 0.38,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function VoiceMemoDraftPreview({
  attachments,
  onRemove,
  recorder,
  primaryColor,
  textColor,
  mutedColor,
}: {
  attachments: VoiceMemoAttachment[];
  onRemove: (index: number) => void;
  recorder: VoiceMemoRecorder;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <View style={styles.audioDraftColumn}>
      {attachments.map((attachment, index) => (
        <VoiceMemoDraftItem
          key={`${attachment.storageId}-${index}`}
          attachment={attachment}
          index={index}
          primaryColor={primaryColor}
          textColor={textColor}
          mutedColor={mutedColor}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

export function VoiceMemoBubble({
  uri,
  outgoing,
  primaryColor,
  incomingBackgroundColor,
  incomingTextColor,
  timeLabel,
  delivered,
  durationMs: initialDurationMs = 0,
  onPlaybackStart,
}: {
  uri: string;
  outgoing: boolean;
  primaryColor: string;
  incomingBackgroundColor: string;
  incomingTextColor: string;
  timeLabel?: string;
  delivered?: boolean;
  durationMs?: number;
  onPlaybackStart?: () => void;
}) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformRef = useRef<View>(null);
  const waveformPageXRef = useRef(0);
  const waveformWidthRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const pendingSeekMsRef = useRef<number | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackStartRequestedAtRef = useRef<number | null>(null);
  const playbackStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackStartNotifiedRef = useRef(false);
  const lastSeekAtRef = useRef(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [positionMs, setPositionMs] = React.useState(0);
  const [durationMs, setDurationMs] = React.useState(initialDurationMs);
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  const clearPlaybackStartup = () => {
    playbackStartRequestedAtRef.current = null;
    if (playbackStartTimerRef.current) {
      clearTimeout(playbackStartTimerRef.current);
      playbackStartTimerRef.current = null;
    }
  };

  const notifyPlaybackStarted = () => {
    if (playbackStartNotifiedRef.current) return;
    playbackStartNotifiedRef.current = true;
    onPlaybackStart?.();
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
      if (playbackStartTimerRef.current) clearTimeout(playbackStartTimerRef.current);
      playerRef.current?.pause();
      playerRef.current = null;
    };
  }, []);

  const togglePlayback = async () => {
    if (!playerRef.current) {
      playerRef.current = createAudioPlayer({ uri }, { updateInterval: 100 });
      intervalRef.current = setInterval(() => {
        const player = playerRef.current;
        if (!player) return;
        const currentTime = player.currentTime || 0;
        const playerDuration = player.duration || 0;
        const nextDurationMs = Math.round(playerDuration * 1000);
        if (nextDurationMs > 0) setDurationMs(nextDurationMs);
        if (!isScrubbingRef.current) {
          setPositionMs(Math.round(currentTime * 1000));
        }

        const requestedAt = playbackStartRequestedAtRef.current;
        const isStarting = requestedAt != null;
        if (player.playing || (isStarting && currentTime > 0.03)) {
          clearPlaybackStartup();
          notifyPlaybackStarted();
          setIsPlaying(true);
        } else if (isStarting && Date.now() - requestedAt < 1200) {
          setIsPlaying(true);
        } else {
          clearPlaybackStartup();
          setIsPlaying(false);
        }

        if (playerDuration > 0 && currentTime >= playerDuration - 0.05 && !player.playing && !isStarting) {
          setIsPlaying(false);
          playbackStartNotifiedRef.current = false;
          setPositionMs(0);
          player.seekTo(0).catch(() => {});
        }
      }, 100);
    }

    const player = playerRef.current;
    if (player.playing || playbackStartRequestedAtRef.current != null) {
      player.pause();
      clearPlaybackStartup();
      playbackStartNotifiedRef.current = false;
      setIsPlaying(false);
      return;
    }
    if (durationMs > 0 && positionMs >= durationMs - 100) {
      await player.seekTo(0);
    }
    playbackStartRequestedAtRef.current = Date.now();
    playbackStartNotifiedRef.current = false;
    if (playbackStartTimerRef.current) clearTimeout(playbackStartTimerRef.current);
    playbackStartTimerRef.current = setTimeout(() => {
      clearPlaybackStartup();
    }, 1200);
    player.play();
    setIsPlaying(true);
  };

  const flushPendingSeek = async () => {
    const nextMs = pendingSeekMsRef.current;
    if (nextMs == null || !playerRef.current) return;
    pendingSeekMsRef.current = null;
    lastSeekAtRef.current = Date.now();
    await playerRef.current.seekTo(nextMs / 1000);
  };

  const measureWaveform = () => {
    waveformRef.current?.measureInWindow((x, _y, width) => {
      waveformPageXRef.current = x;
      waveformWidthRef.current = Math.max(1, width);
    });
  };

  const seekFromPageX = (pageX: number) => {
    if (durationMs <= 0) return;
    const width = Math.max(1, waveformWidthRef.current);
    const ratio = Math.min(1, Math.max(0, (pageX - waveformPageXRef.current) / width));
    const nextMs = ratio * durationMs;
    setPositionMs(nextMs);
    if (!playerRef.current) return;

    pendingSeekMsRef.current = nextMs;
    const now = Date.now();
    if (now - lastSeekAtRef.current >= 140) {
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
      void flushPendingSeek();
      return;
    }
    if (!seekTimerRef.current) {
      seekTimerRef.current = setTimeout(() => {
        seekTimerRef.current = null;
        void flushPendingSeek();
      }, 140);
    }
  };

  const waveformPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        isScrubbingRef.current = true;
        const pageX = event.nativeEvent.pageX;
        measureWaveform();
        seekFromPageX(pageX);
      },
      onPanResponderMove: (event) => {
        const pageX = event.nativeEvent.pageX;
        seekFromPageX(pageX);
      },
      onPanResponderRelease: () => {
        isScrubbingRef.current = false;
        void flushPendingSeek();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        isScrubbingRef.current = false;
        void flushPendingSeek();
      },
    }),
    [durationMs],
  );

  const barColor = outgoing ? '#FFFFFF' : primaryColor;
  const mutedBarColor = outgoing ? 'rgba(255,255,255,0.42)' : 'rgba(42, 171, 238, 0.28)';
  const metaColor = outgoing ? 'rgba(255,255,255,0.85)' : incomingTextColor;

  return (
    <View
      style={[
        styles.voiceBubble,
        {
          alignSelf: outgoing ? 'flex-end' : 'flex-start',
          backgroundColor: outgoing ? primaryColor : incomingBackgroundColor,
          borderBottomRightRadius: outgoing ? 4 : 18,
          borderBottomLeftRadius: outgoing ? 18 : 4,
        },
      ]}
    >
      <TouchableOpacity
        onPress={togglePlayback}
        style={[
          styles.voiceBubblePlay,
          { backgroundColor: outgoing ? '#FFFFFF' : primaryColor },
        ]}
      >
        <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={25} color={outgoing ? primaryColor : '#FFFFFF'} />
      </TouchableOpacity>
      <View style={styles.voiceBubbleContent}>
        <View
          ref={waveformRef}
          {...waveformPanResponder.panHandlers}
          style={styles.voiceBubbleWaveform}
          onLayout={(event: LayoutChangeEvent) => {
            waveformWidthRef.current = event.nativeEvent.layout.width;
          }}
        >
          {Array.from({ length: 42 }).map((_, index) => {
            const active = index / 42 <= progress;
            const height = 8 + ((index * 7) % 22);
            return (
              <View
                key={index}
                style={[
                  styles.voiceBubbleWaveBar,
                  {
                    height,
                    backgroundColor: active ? barColor : mutedBarColor,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.voiceBubbleMetaRow}>
          <View style={styles.voiceBubbleDurationWrap}>
            <Text style={[styles.voiceBubbleDuration, { color: metaColor }]}> 
              {formatDuration(isPlaying ? positionMs : durationMs)}
            </Text>
            <View style={[styles.voiceBubbleDot, { backgroundColor: metaColor }]} />
          </View>
          {!!timeLabel && (
            <Text style={[styles.voiceBubbleTime, { color: metaColor }]}> 
              {timeLabel}{outgoing ? (delivered ? '✓✓' : '✓') : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function VoiceMemoActionButton({
  recorder,
  hasContent,
  showAddRecording,
  isSending,
  disabled,
  primaryColor,
  inactiveColor,
  onSend,
}: {
  recorder: VoiceMemoRecorder;
  hasContent: boolean;
  showAddRecording?: boolean;
  isSending: boolean;
  disabled?: boolean;
  primaryColor: string;
  inactiveColor: string;
  onSend: () => void;
}) {
  const didCancelRef = useRef(false);
  const didLockRef = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!recorder.isActive) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 760, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, recorder.isActive]);

  const voiceBoost = recorder.isActive ? recorder.voiceLevel : 0;
  const activeMicSize = recorder.isActive ? 100 + voiceBoost * 18 : 44;
  const micScale = recorder.isActive ? 1 + voiceBoost * 0.12 : 1;
  const innerHaloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1 + voiceBoost * 0.2, 1.22 + voiceBoost * 0.38],
  });
  const outerHaloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.15 + voiceBoost * 0.3, 1.58 + voiceBoost * 0.52],
  });
  const blobTilt = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '10deg'] });
  const outerHaloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.05] });

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !hasContent && !recorder.isActive,
      onMoveShouldSetPanResponder: () => !disabled && !hasContent && recorder.isRecording,
      onPanResponderGrant: () => {
        didCancelRef.current = false;
        didLockRef.current = false;
        void recorder.startRecording();
      },
      onPanResponderMove: (_event, gesture) => {
        if (didCancelRef.current || didLockRef.current) return;
        if (gesture.dx < -72) {
          didCancelRef.current = true;
          void recorder.cancelRecording();
          return;
        }
        if (gesture.dy < -72) {
          didLockRef.current = true;
          recorder.lockRecording();
        }
      },
      onPanResponderRelease: () => {
        if (didCancelRef.current || didLockRef.current || recorder.isLocked) return;
        void recorder.finishRecording();
      },
      onPanResponderTerminate: () => {
        if (didCancelRef.current || didLockRef.current || recorder.isLocked) return;
        void recorder.finishRecording();
      },
    }),
    [disabled, hasContent, recorder],
  );

  if (hasContent) {
    return (
      <View style={styles.sendSlot}>
        {showAddRecording && (
          <TouchableOpacity
            style={[styles.addRecordingFloat, { backgroundColor: primaryColor }]}
            onPress={recorder.startRecording}
            disabled={disabled || isSending}
          >
            <MaterialIcons name="mic" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonInSlot, { backgroundColor: isSending ? inactiveColor : primaryColor }]}
          onPress={onSend}
          disabled={disabled || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (recorder.phase === 'uploading') {
    return (
      <View style={[styles.actionButton, { backgroundColor: inactiveColor }]}>
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  if (recorder.isLocked) {
    return (
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: primaryColor }]}
        onPress={recorder.finishRecording}
        disabled={disabled}
      >
        <MaterialIcons name="send" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.micWrap} {...panResponder.panHandlers}>
      {recorder.isActive && (
        <>
          <Animated.View
            style={[
              styles.micBlob,
              {
                backgroundColor: `${primaryColor}30`,
                opacity: outerHaloOpacity,
                transform: [{ rotate: blobTilt }, { scaleX: outerHaloScale }, { scaleY: outerHaloScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.micBlob,
              styles.micBlobInner,
              {
                backgroundColor: `${primaryColor}40`,
                transform: [{ rotate: '-14deg' }, { scaleX: innerHaloScale }, { scaleY: innerHaloScale }],
              },
            ]}
          />
        </>
      )}
      {recorder.isActive && <View style={[styles.lockHint, { backgroundColor: `${primaryColor}22` }]}><MaterialIcons name="lock" size={22} color={primaryColor} /></View>}
      <Animated.View
        style={[
          styles.actionButton,
          styles.actionButtonInMic,
          {
            left: '50%',
            marginLeft: -activeMicSize / 2,
            width: activeMicSize,
            height: activeMicSize,
            borderRadius: activeMicSize / 2,
            transform: [{ scale: micScale }],
            backgroundColor: primaryColor,
          },
        ]}
      >
        <MaterialIcons name="mic" size={recorder.isActive ? 34 : 20} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonInMic: {
    marginLeft: 0,
    position: 'absolute',
  },
  actionButtonInSlot: {
    marginLeft: 0,
  },
  addRecordingFloat: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 5,
    top: -42,
    width: 34,
    zIndex: 20,
  },
  cancelButton: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  cancelText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.xs,
    textTransform: 'uppercase',
  },
  durationText: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.md,
    minWidth: 42,
  },
  durationWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    width: 78,
  },
  audioDraft: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 8,
  },
  audioDraftColumn: {
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 3,
    paddingBottom: 3,
  },
  audioDraftDuration: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.xs,
    minWidth: 34,
  },
  audioDraftPlay: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  audioDraftRemove: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 32,
  },
  audioDraftRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
  },
  lockHint: {
    alignItems: 'center',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: -72,
    width: 52,
  },
  micBlob: {
    borderTopLeftRadius: 48,
    borderTopRightRadius: 36,
    borderBottomRightRadius: 50,
    borderBottomLeftRadius: 34,
    height: 130,
    left: '50%',
    marginLeft: -65,
    marginTop: -65,
    position: 'absolute',
    top: '50%',
    width: 130,
  },
  micBlobInner: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 40,
    borderBottomRightRadius: 31,
    borderBottomLeftRadius: 43,
    height: 108,
    marginLeft: -54,
    marginTop: -54,
    width: 108,
  },
  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 44,
    minWidth: 44,
    overflow: 'visible',
  },
  pauseButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pauseLabel: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.xs,
  },
  recordingBar: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    paddingLeft: 18,
    paddingRight: 72,
  },
  redDot: {
    backgroundColor: '#E5484D',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  sendSlot: {
    alignItems: 'center',
    height: 44,
    marginLeft: 8,
    overflow: 'visible',
    width: 44,
  },
  slideText: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    includeFontPadding: false,
  },
  waveformBars: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 28,
  },
  waveformBar: {
    borderRadius: 2,
    width: 3,
  },
  voiceBubble: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '92%',
    minWidth: 320,
    paddingHorizontal: 8,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  voiceBubbleContent: {
    flex: 1,
  },
  voiceBubbleDuration: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: fontSizes.xs,
  },
  voiceBubbleDurationWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  voiceBubbleDot: {
    borderRadius: 3,
    height: 5,
    opacity: 0.9,
    width: 5,
  },
  voiceBubbleMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  voiceBubblePlay: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  voiceBubbleTime: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 10,
  },
  voiceBubbleWaveform: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 26,
    overflow: 'hidden',
  },
  voiceBubbleWaveBar: {
    borderRadius: 2,
    flex: 1,
    minWidth: 2,
    maxWidth: 3,
  },
});
