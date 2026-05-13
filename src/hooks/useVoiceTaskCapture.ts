import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { RootStackParamList } from '../models/types';
import { useTenant } from './useTenant';
import { useLanguage } from '../context/LanguageContext';

type VoiceCapturePhase = 'idle' | 'starting' | 'recording' | 'processing';

const VAD_START_THRESHOLD = 0.18;
const VAD_STOP_THRESHOLD = 0.12;
const VAD_MIN_SPEECH_MS = 200;
const VAD_HANGOVER_MS = 500;
const VAD_MAX_SPEECH_MS = 8000;
const MIN_ACCEPTED_AUDIO_MS = 400;

function getAudioMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.caf')) return 'audio/x-caf';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'application/octet-stream';
}

export function useVoiceTaskCapture() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tenantId } = useTenant();
  const { t } = useLanguage();
  const generateUploadUrl = useMutation(api.voiceTaskDrafts.generateUploadUrl);
  const createFromAudio = useAction(api.voiceTaskDraftActions.createFromAudio);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<VoiceCapturePhase>('idle');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const selectedWorkspaceIdRef = useRef<string | undefined>(undefined);
  const pendingStopRef = useRef(false);
  const stopInFlightRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const speechStartedAtRef = useRef<number | null>(null);
  const aboveSinceRef = useRef<number | null>(null);
  const belowSinceRef = useRef<number | null>(null);
  const latestDurationMsRef = useRef(0);
  const latestRecorderUrlRef = useRef<string | undefined>(undefined);

  const isActive = phase === 'starting' || phase === 'recording' || phase === 'processing';

  useEffect(() => {
    latestDurationMsRef.current = recorderState.durationMillis || durationMs;
    const nextUrl = recorder.uri ?? recorderState.url ?? undefined;
    latestRecorderUrlRef.current = nextUrl === null ? undefined : nextUrl;
  }, [durationMs, recorder.uri, recorderState.durationMillis, recorderState.url]);

  const resetLocalState = useCallback(() => {
    pendingStopRef.current = false;
    stopInFlightRef.current = false;
    speechDetectedRef.current = false;
    speechStartedAtRef.current = null;
    aboveSinceRef.current = null;
    belowSinceRef.current = null;
    setVoiceLevel(0);
    setDurationMs(0);
    setPhase('idle');
  }, []);

  const uploadRecording = useCallback(async (uri: string, fileName: string, mimeType: string) => {
    if (!tenantId) throw new Error(t('voiceTaskCapture.noTenantSelected'));

    let uploadUrl = await generateUploadUrl({ tenantId });
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

    if (!uploadUrl || typeof uploadUrl !== 'string') {
      throw new Error(t('voiceTaskCapture.failedUploadUrl'));
    }
    const safeUploadUrl = uploadUrl;

    const blob: Blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.onerror = () => reject(new Error(t('voiceTaskCapture.failedReadRecording')));
      xhr.responseType = 'blob';
      xhr.open('GET', String(uri), true);
      xhr.send(null);
    });

    const uploadResponse = await fetch(safeUploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!uploadResponse.ok) {
      const body = await uploadResponse.text().catch(() => '');
      throw new Error(t('voiceTaskCapture.uploadFailedWithStatus', { status: uploadResponse.status, body }));
    }

    const { storageId } = await uploadResponse.json();
    return { storageId, fileName, mimeType };
  }, [generateUploadUrl, t, tenantId]);

  const stopCapture = useCallback(async (reason: 'manual' | 'vad' = 'manual') => {
    if (!tenantId) {
      resetLocalState();
      return;
    }

    if (phase === 'starting') {
      pendingStopRef.current = true;
      return;
    }
    if (phase !== 'recording' || stopInFlightRef.current) return;

    stopInFlightRef.current = true;
    setPhase('processing');

    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      const uri = latestRecorderUrlRef.current;
      const recordedMs = latestDurationMsRef.current;

      if (!uri || recordedMs < MIN_ACCEPTED_AUDIO_MS || !speechDetectedRef.current) {
        resetLocalState();
        if (reason === 'manual') {
          Alert.alert(t('voiceTaskCapture.noSpeechDetectedTitle'), t('voiceTaskCapture.noSpeechDetectedBody'));
        }
        return;
      }

      const fileName = uri.split('/').pop() || `voice-task-${Date.now()}.m4a`;
      const mimeType = getAudioMimeType(fileName);
      const uploaded = await uploadRecording(uri, fileName, mimeType);
      const result = await createFromAudio({
        tenantId,
        audioStorageId: uploaded.storageId as any,
        selectedWorkspaceId: selectedWorkspaceIdRef.current as any,
        audioFileName: uploaded.fileName,
        audioMimeType: uploaded.mimeType,
      });

      resetLocalState();
      navigation.navigate('VoiceTaskReview', { draftId: String(result.draftId) });
    } catch (error: any) {
      resetLocalState();
      Alert.alert(t('voiceTaskCapture.captureFailedTitle'), error?.message || t('voiceTaskCapture.createDraftFailedFallback'));
    }
  }, [
    createFromAudio,
    navigation,
    phase,
    recorder,
    resetLocalState,
    tenantId,
    t,
    uploadRecording,
  ]);

  const startCapture = useCallback(async (selectedWorkspaceId?: string) => {
    if (!tenantId || isActive) return;

    try {
      selectedWorkspaceIdRef.current = selectedWorkspaceId;
      pendingStopRef.current = false;
      stopInFlightRef.current = false;
      speechDetectedRef.current = false;
      speechStartedAtRef.current = null;
      aboveSinceRef.current = null;
      belowSinceRef.current = null;

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('voiceTaskCapture.microphonePermissionTitle'), t('voiceTaskCapture.microphonePermissionBody'));
        resetLocalState();
        return;
      }

      setPhase('starting');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recorder.record();
      setPhase('recording');

      if (pendingStopRef.current) {
        await stopCapture('manual');
      }
    } catch (error: any) {
      resetLocalState();
      Alert.alert(t('voiceTaskCapture.captureFailedTitle'), error?.message || t('voiceTaskCapture.startRecordingFailedFallback'));
    }
  }, [isActive, recorder, resetLocalState, stopCapture, tenantId, t]);

  useEffect(() => {
    if (phase !== 'recording') return;

    const now = Date.now();
    const metering = typeof recorderState.metering === 'number' ? recorderState.metering : -160;
    const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
    setVoiceLevel((previous) => previous * 0.75 + normalized * 0.25);
    setDurationMs(recorderState.durationMillis);

    if (!speechDetectedRef.current) {
      if (normalized >= VAD_START_THRESHOLD) {
        aboveSinceRef.current = aboveSinceRef.current ?? now;
        if (now - aboveSinceRef.current >= VAD_MIN_SPEECH_MS) {
          speechDetectedRef.current = true;
          speechStartedAtRef.current = now;
          belowSinceRef.current = null;
        }
      } else {
        aboveSinceRef.current = null;
      }
      return;
    }

    if (speechStartedAtRef.current && now - speechStartedAtRef.current >= VAD_MAX_SPEECH_MS) {
      void stopCapture('vad');
      return;
    }

    if (normalized <= VAD_STOP_THRESHOLD) {
      belowSinceRef.current = belowSinceRef.current ?? now;
      if (now - belowSinceRef.current >= VAD_HANGOVER_MS) {
        void stopCapture('vad');
      }
    } else {
      belowSinceRef.current = null;
    }
  }, [phase, recorderState.durationMillis, recorderState.metering, stopCapture]);

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder, recorderState.isRecording]);

  return useMemo(() => ({
    phase,
    isActive,
    voiceLevel,
    durationMs,
    startCapture,
    stopCapture,
  }), [durationMs, isActive, phase, startCapture, stopCapture, voiceLevel]);
}
