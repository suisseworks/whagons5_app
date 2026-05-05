import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { ConvexAttachment, PendingFile } from './useConvexUpload';

export type VoiceMemoPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'uploading';

export interface VoiceMemoAttachment extends ConvexAttachment {
  localUri?: string;
  durationMs?: number;
  displayName?: string;
}

const MIN_RECORDING_MS = 400;

function getAudioMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
}

export function voiceMemoMarkdown(attachment: ConvexAttachment): string {
  return `[Voice memo](convex-file:${attachment.storageId})`;
}

export function useVoiceMemoRecorder(
  uploadFile: (file: PendingFile) => Promise<ConvexAttachment>,
  onRecorded: (attachment: VoiceMemoAttachment) => void,
) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<VoiceMemoPhase>('idle');
  const [isLocked, setIsLocked] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const phaseRef = useRef<VoiceMemoPhase>('idle');
  const lockedRef = useRef(false);
  const pendingStopRef = useRef(false);
  const stopInFlightRef = useRef(false);
  const latestDurationMsRef = useRef(0);
  const latestRecorderUrlRef = useRef<string | undefined>(undefined);

  const isRecording = phase === 'starting' || phase === 'recording';
  const isActive = phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'uploading';
  const isBusy = isActive;

  const setRecorderPhase = useCallback((nextPhase: VoiceMemoPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  useEffect(() => {
    latestDurationMsRef.current = recorderState.durationMillis;
    const nextUrl = recorder.uri ?? recorderState.url ?? undefined;
    latestRecorderUrlRef.current = nextUrl === null ? undefined : nextUrl;
  }, [recorder.uri, recorderState.durationMillis, recorderState.url]);

  const reset = useCallback(() => {
    pendingStopRef.current = false;
    stopInFlightRef.current = false;
    lockedRef.current = false;
    setIsLocked(false);
    setVoiceLevel(0);
    setRecorderPhase('idle');
  }, [setRecorderPhase]);

  const stopRecording = useCallback(async (options?: { upload?: boolean; force?: boolean }) => {
    const currentPhase = phaseRef.current;
    if (currentPhase === 'starting') {
      pendingStopRef.current = true;
      return;
    }
    if (!options?.force && lockedRef.current && currentPhase === 'recording') return;
    if ((currentPhase !== 'recording' && currentPhase !== 'paused') || stopInFlightRef.current) return;

    stopInFlightRef.current = true;
    setRecorderPhase('uploading');

    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      const uri = latestRecorderUrlRef.current;
      const recordedMs = latestDurationMsRef.current;
      if (options?.upload === false || !uri || recordedMs < MIN_RECORDING_MS) {
        reset();
        return;
      }

      const extensionName = uri.split('/').pop() || `voice-memo-${Date.now()}.m4a`;
      const hasExtension = /\.[a-z0-9]+$/i.test(extensionName);
      const sourceFileName = hasExtension ? extensionName : `${extensionName}.m4a`;
      const extension = sourceFileName.match(/\.([a-z0-9]+)$/i)?.[1] || 'm4a';
      const attachment = await uploadFile({
        uri,
        fileName: `voice-memo.${extension}`,
        fileSize: 0,
        fileType: getAudioMimeType(sourceFileName),
      });
      onRecorded({ ...attachment, localUri: uri, durationMs: recordedMs, displayName: 'Voice memo' });
      reset();
    } catch (error: any) {
      reset();
      Alert.alert('Voice memo failed', error?.message || 'Could not record this voice memo.');
    }
  }, [onRecorded, recorder, reset, setRecorderPhase, uploadFile]);

  const startRecording = useCallback(async () => {
    if (isBusy) return;

    try {
      pendingStopRef.current = false;
      stopInFlightRef.current = false;
      lockedRef.current = false;
      setIsLocked(false);

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission', 'Microphone access is required to send voice memos.');
        reset();
        return;
      }

      setRecorderPhase('starting');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recorder.record();
      setRecorderPhase('recording');

      if (pendingStopRef.current) {
        await stopRecording();
      }
    } catch (error: any) {
      reset();
      Alert.alert('Voice memo failed', error?.message || 'Could not start recording.');
    }
  }, [isBusy, recorder, reset, setRecorderPhase, stopRecording]);

  const lockRecording = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    lockedRef.current = true;
    setIsLocked(true);
  }, []);

  const cancelRecording = useCallback(async () => {
    await stopRecording({ upload: false, force: true });
  }, [stopRecording]);

  const pauseRecording = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    recorder.pause();
    setRecorderPhase('paused');
  }, [recorder, setRecorderPhase]);

  const resumeRecording = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    recorder.record();
    setRecorderPhase('recording');
  }, [recorder, setRecorderPhase]);

  const finishRecording = useCallback(async () => {
    await stopRecording({ upload: true, force: true });
  }, [stopRecording]);

  useEffect(() => {
    if (phase !== 'recording') {
      if (phase === 'idle') setVoiceLevel(0);
      return;
    }

    const metering = typeof recorderState.metering === 'number' ? recorderState.metering : -160;
    const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
    setVoiceLevel((previous) => previous * 0.7 + normalized * 0.3);
  }, [phase, recorderState.metering]);

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder, recorderState.isRecording]);

  return {
    durationMs: recorderState.durationMillis,
    cancelRecording,
    finishRecording,
    isActive,
    isBusy,
    isLocked,
    isPaused: phase === 'paused',
    isRecording,
    lockRecording,
    pauseRecording,
    phase,
    resumeRecording,
    startRecording,
    stopRecording,
    voiceLevel,
  };
}
