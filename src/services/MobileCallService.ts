import { api } from '../../../convex/_generated/api';
import { convex } from '../providers/ConvexClientProvider';
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

type EventCallback = (payload: any) => void;

export type MobileCallMode = 'audio' | 'video';

export interface MobileCallParticipant {
  userId: string;
  userName: string;
  userPicture?: string;
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface MobileCallSignal {
  type: 'webrtc';
  operation:
    | 'call-start'
    | 'call-join'
    | 'call-leave'
    | 'call-end'
    | 'call-reject'
    | 'call-full'
    | 'call-invite'
    | 'offer'
    | 'answer'
    | 'ice-candidate';
  workspaceId?: string;
  conversationId?: string;
  fromUserId: string;
  fromUserName: string;
  fromUserPicture?: string;
  toUserId?: string;
  callMode: MobileCallMode;
  payload?: any;
}

export interface IncomingMobileCall {
  workspaceId?: string;
  conversationId?: string;
  callMode: MobileCallMode;
  callerUserId: string;
  callerUserName: string;
  callerUserPicture?: string;
}

interface PendingIncomingCall {
  workspaceId?: string;
  conversationId?: string;
  callerUserId: string;
}

interface StartOrJoinArgs {
  workspaceId?: string;
  conversationId?: string;
  mode: MobileCallMode;
}

export interface CallEndedInfo {
  participants: Array<{ userId: string; userName: string; userPicture?: string }>;
  callMode: MobileCallMode;
  workspaceId: string | null;
  conversationId: string | null;
}

function buildRoomId(workspaceId?: string | null, conversationId?: string | null): string | null {
  if (conversationId) return `conv-${conversationId}`;
  if (workspaceId) return `ws-${workspaceId}`;
  return null;
}

export class MobileCallService {
  private peers = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private listeners = new Map<string, EventCallback[]>();

  private localStream: MediaStream | null = null;
  private _workspaceId: string | null = null;
  private _conversationId: string | null = null;
  private _callMode: MobileCallMode = 'audio';
  private _isInCall = false;
  private _startedCall = false;
  private _tenantId: string | null = null;
  private _pendingIncomingCall: PendingIncomingCall | null = null;

  private _userId = '';
  private _userName = '';
  private _userPicture?: string;
  private _participants = new Map<string, MobileCallParticipant>();

  get isInCall() {
    return this._isInCall;
  }

  get callMode() {
    return this._callMode;
  }

  get startedCall() {
    return this._startedCall;
  }

  get workspaceId() {
    return this._workspaceId;
  }

  get conversationId() {
    return this._conversationId;
  }

  get participantCount() {
    return this._participants.size;
  }

  init(userId: string, userName: string, userPicture?: string) {
    this._userId = userId;
    this._userName = userName;
    this._userPicture = userPicture;
  }

  on(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
    return () => {
      const current = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        current.filter((entry) => entry !== callback),
      );
    };
  }

  getParticipantList() {
    return Array.from(this._participants.values());
  }

  getLocalStream() {
    return this.localStream;
  }

  async startCall(tenantId: string, args: StartOrJoinArgs) {
    if (this._isInCall) return;

    this._tenantId = tenantId;
    this._workspaceId = args.workspaceId ?? null;
    this._conversationId = args.conversationId ?? null;
    this._callMode = args.mode;
    this._isInCall = true;
    this._startedCall = true;
    this._pendingIncomingCall = null;

    try {
      await this.acquireLocalMedia(args.mode);
      this.addSelfParticipant();

      const delivered = await this.sendSignal({
        operation: 'call-start',
        workspaceId: this._workspaceId ?? undefined,
        conversationId: this._conversationId ?? undefined,
        callMode: this._callMode,
      });

      if (delivered < 1) {
        const summary = this.captureCallSummary();
        this.cleanup();
        this.emit('call:error', { error: 'No one is available to receive this call right now.' });
        this.emit('call:ended', summary);
        throw new Error('Call had no recipients');
      }

      this.emit('call:started', {
        workspaceId: this._workspaceId,
        conversationId: this._conversationId,
        mode: this._callMode,
        participants: this.getParticipantList(),
      });
    } catch (error) {
      if (this._isInCall) {
        const summary = this.captureCallSummary();
        this.cleanup();
        this.emit('call:ended', summary);
      }
      throw error;
    }
  }

  async joinCall(tenantId: string, args: StartOrJoinArgs) {
    if (this._isInCall) return;

    this._tenantId = tenantId;
    this._workspaceId = args.workspaceId ?? null;
    this._conversationId = args.conversationId ?? null;
    this._callMode = args.mode;
    this._isInCall = true;
    this._startedCall = false;
    this._pendingIncomingCall = null;

    try {
      await this.acquireLocalMedia(args.mode);
      this.addSelfParticipant();

      await this.sendSignal({
        operation: 'call-join',
        workspaceId: this._workspaceId ?? undefined,
        conversationId: this._conversationId ?? undefined,
        callMode: this._callMode,
      });

      this.emit('call:joined', {
        workspaceId: this._workspaceId,
        conversationId: this._conversationId,
        mode: this._callMode,
        participants: this.getParticipantList(),
      });
    } catch (error) {
      if (this._isInCall) {
        const summary = this.captureCallSummary();
        this.cleanup();
        this.emit('call:ended', summary);
      }
      throw error;
    }
  }

  hangUp() {
    if (!this._isInCall) return;

    const summary = this.captureCallSummary();
    const shouldEndForOthers = this._startedCall && this._participants.size <= 1;

    void this.sendSignal({
      operation: shouldEndForOthers ? 'call-end' : 'call-leave',
      workspaceId: this._workspaceId ?? undefined,
      conversationId: this._conversationId ?? undefined,
      callMode: this._callMode,
    }).finally(() => {
      this.cleanup();
      this.emit('call:ended', summary);
    });
  }

  endCallForAll() {
    if (!this._isInCall) return;

    const summary = this.captureCallSummary();
    void this.sendSignal({
      operation: 'call-end',
      workspaceId: this._workspaceId ?? undefined,
      conversationId: this._conversationId ?? undefined,
      callMode: this._callMode,
    }).finally(() => {
      this.cleanup();
      this.emit('call:ended', summary);
    });
  }

  async rejectCall(
    tenantId: string,
    args: {
      workspaceId?: string;
      conversationId?: string;
      mode: MobileCallMode;
      callerUserId?: string;
    },
  ) {
    this._pendingIncomingCall = null;
    await this.sendSignal({
      tenantId,
      operation: 'call-reject',
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      toUserId: args.callerUserId,
      callMode: args.mode,
    });
    this.emit('call:incoming:dismissed', {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
    });
  }

  toggleAudio() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;

    audioTrack.enabled = !audioTrack.enabled;
    const self = this._participants.get(this._userId);
    if (self) {
      self.audioEnabled = audioTrack.enabled;
    }
    this.emit('participants:updated', { participants: this.getParticipantList() });
    return audioTrack.enabled;
  }

  toggleVideo() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    videoTrack.enabled = !videoTrack.enabled;
    const self = this._participants.get(this._userId);
    if (self) {
      self.videoEnabled = videoTrack.enabled;
    }
    this.emit('participants:updated', { participants: this.getParticipantList() });
    return videoTrack.enabled;
  }

  async receiveSignal(signal: MobileCallSignal) {
    if (signal.fromUserId === this._userId) return;

    const signalRoom = buildRoomId(signal.workspaceId, signal.conversationId);
    const currentRoom = buildRoomId(this._workspaceId, this._conversationId);
    const pendingRoom = buildRoomId(
      this._pendingIncomingCall?.workspaceId ?? null,
      this._pendingIncomingCall?.conversationId ?? null,
    );

    if (
      signal.operation !== 'call-start' &&
      signal.operation !== 'call-invite' &&
      signalRoom !== currentRoom &&
      signalRoom !== pendingRoom
    ) {
      return;
    }

    switch (signal.operation) {
      case 'call-start':
        await this.handleIncomingRequest(signal);
        break;
      case 'call-invite':
        await this.handleIncomingInvite(signal);
        break;
      case 'call-join':
        await this.handleCallJoin(signal);
        break;
      case 'call-leave':
        this.handleCallLeave(signal);
        break;
      case 'call-end':
        this.handleCallEnd(signal);
        break;
      case 'call-reject':
        this.emit('call:rejected', {
          userId: signal.fromUserId,
          userName: signal.fromUserName,
        });
        if (this._isInCall && this._participants.size <= 1) {
          this.hangUp();
        }
        break;
      case 'call-full':
        this.emit('call:full', { userId: signal.fromUserId });
        break;
      case 'offer':
        await this.handleOffer(signal);
        break;
      case 'answer':
        await this.handleAnswer(signal);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(signal);
        break;
    }
  }

  private async handleIncomingRequest(signal: MobileCallSignal) {
    if (this._isInCall) {
      await this.sendBusySignal(signal);
      return;
    }

    this._pendingIncomingCall = {
      workspaceId: signal.workspaceId,
      conversationId: signal.conversationId,
      callerUserId: signal.fromUserId,
    };

    this.emit('call:incoming', {
      workspaceId: signal.workspaceId,
      conversationId: signal.conversationId,
      callMode: signal.callMode,
      callerUserId: signal.fromUserId,
      callerUserName: signal.fromUserName,
      callerUserPicture: signal.fromUserPicture,
    } satisfies IncomingMobileCall);
  }

  private async handleIncomingInvite(signal: MobileCallSignal) {
    if (signal.toUserId && signal.toUserId !== this._userId) return;
    await this.handleIncomingRequest(signal);
  }

  private async handleCallJoin(signal: MobileCallSignal) {
    if (!this._isInCall) return;
    if (buildRoomId(signal.workspaceId, signal.conversationId) !== buildRoomId(this._workspaceId, this._conversationId)) {
      return;
    }

    if (!this._participants.has(signal.fromUserId)) {
      this._participants.set(signal.fromUserId, {
        userId: signal.fromUserId,
        userName: signal.fromUserName,
        userPicture: signal.fromUserPicture,
        stream: null,
        audioEnabled: true,
        videoEnabled: signal.callMode === 'video',
      });
      this.emit('participants:updated', { participants: this.getParticipantList() });
    }

    await this.createPeerConnection(signal.fromUserId, true);
  }

  private handleCallLeave(signal: MobileCallSignal) {
    const signalRoom = buildRoomId(signal.workspaceId, signal.conversationId);
    const pendingRoom = buildRoomId(
      this._pendingIncomingCall?.workspaceId ?? null,
      this._pendingIncomingCall?.conversationId ?? null,
    );

    if (
      !this._isInCall &&
      this._pendingIncomingCall &&
      signalRoom === pendingRoom &&
      signal.fromUserId === this._pendingIncomingCall.callerUserId
    ) {
      this._pendingIncomingCall = null;
      this.emit('call:incoming:dismissed', null);
      return;
    }

    if (signalRoom !== buildRoomId(this._workspaceId, this._conversationId)) return;

    this.removePeer(signal.fromUserId);
    this._participants.delete(signal.fromUserId);
    this.emit('participants:updated', { participants: this.getParticipantList() });

    if (this._participants.size <= 1) {
      const summary = this.captureCallSummary();
      this.cleanup();
      this.emit('call:ended', summary);
    }
  }

  private handleCallEnd(signal: MobileCallSignal) {
    const signalRoom = buildRoomId(signal.workspaceId, signal.conversationId);
    const pendingRoom = buildRoomId(
      this._pendingIncomingCall?.workspaceId ?? null,
      this._pendingIncomingCall?.conversationId ?? null,
    );

    if (
      this._pendingIncomingCall &&
      signalRoom === pendingRoom &&
      signal.fromUserId === this._pendingIncomingCall.callerUserId
    ) {
      this._pendingIncomingCall = null;
      this.emit('call:incoming:dismissed', null);
    }

    if (signalRoom !== buildRoomId(this._workspaceId, this._conversationId)) return;

    const summary = this.captureCallSummary();
    this.cleanup();
    this.emit('call:ended', summary);
  }

  private async handleOffer(signal: MobileCallSignal) {
    if (!this._isInCall) return;
    if (signal.toUserId && signal.toUserId !== this._userId) return;

    const roomId = buildRoomId(signal.workspaceId, signal.conversationId);
    if (roomId !== buildRoomId(this._workspaceId, this._conversationId)) return;

    if (!this._participants.has(signal.fromUserId)) {
      this._participants.set(signal.fromUserId, {
        userId: signal.fromUserId,
        userName: signal.fromUserName,
        userPicture: signal.fromUserPicture,
        stream: null,
        audioEnabled: true,
        videoEnabled: signal.callMode === 'video',
      });
      this.emit('participants:updated', { participants: this.getParticipantList() });
    }

    let pc = this.peers.get(signal.fromUserId);
    if (!pc) {
      pc = await this.createPeerConnection(signal.fromUserId, false);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    await this.flushIceCandidates(signal.fromUserId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.sendSignal({
      operation: 'answer',
      workspaceId: this._workspaceId ?? undefined,
      conversationId: this._conversationId ?? undefined,
      toUserId: signal.fromUserId,
      callMode: this._callMode,
      payload: pc.localDescription?.toJSON(),
    });
  }

  private async handleAnswer(signal: MobileCallSignal) {
    if (!this._isInCall) return;
    if (signal.toUserId && signal.toUserId !== this._userId) return;

    const pc = this.peers.get(signal.fromUserId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    await this.flushIceCandidates(signal.fromUserId);
  }

  private async handleIceCandidate(signal: MobileCallSignal) {
    if (!this._isInCall) return;
    if (signal.toUserId && signal.toUserId !== this._userId) return;

    const pc = this.peers.get(signal.fromUserId);
    if (!pc || !pc.remoteDescription) {
      const pending = this.pendingIceCandidates.get(signal.fromUserId) ?? [];
      pending.push(signal.payload as RTCIceCandidateInit);
      this.pendingIceCandidates.set(signal.fromUserId, pending);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
    } catch {
      this.emit('call:error', { error: 'Failed to connect call media.' });
    }
  }

  private async flushIceCandidates(remoteUserId: string) {
    const pending = this.pendingIceCandidates.get(remoteUserId);
    const pc = this.peers.get(remoteUserId);
    if (!pending?.length || !pc) return;

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        this.emit('call:error', { error: 'Failed to connect call media.' });
      }
    }

    this.pendingIceCandidates.delete(remoteUserId);
  }

  private async createPeerConnection(remoteUserId: string, createOffer: boolean) {
    this.removePeer(remoteUserId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const nativePc = pc as any;
    this.peers.set(remoteUserId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    nativePc.ontrack = (event: any) => {
      const baseStream = event.streams?.[0];
      const stream = baseStream ?? new MediaStream();
      if (!baseStream && event.track) {
        stream.addTrack(event.track);
      }

      this.remoteStreams.set(remoteUserId, stream);
      const participant = this._participants.get(remoteUserId);
      if (participant) {
        participant.stream = stream;
        participant.videoEnabled = stream.getVideoTracks().some((track: any) => track.enabled);
      }
      this.emit('participants:updated', { participants: this.getParticipantList() });
    };

    nativePc.onicecandidate = (event: any) => {
      if (!event.candidate) return;
      void this.sendSignal({
        operation: 'ice-candidate',
        workspaceId: this._workspaceId ?? undefined,
        conversationId: this._conversationId ?? undefined,
        toUserId: remoteUserId,
        callMode: this._callMode,
        payload: event.candidate.toJSON(),
      });
    };

    nativePc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.removePeer(remoteUserId);
        this._participants.delete(remoteUserId);
        this.emit('participants:updated', { participants: this.getParticipantList() });
      }
    };

    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendSignal({
        operation: 'offer',
        workspaceId: this._workspaceId ?? undefined,
        conversationId: this._conversationId ?? undefined,
        toUserId: remoteUserId,
        callMode: this._callMode,
        payload: pc.localDescription?.toJSON(),
      });
    }

    return pc;
  }

  private removePeer(userId: string) {
    const pc = this.peers.get(userId);
    if (pc) {
      const nativePc = pc as any;
      nativePc.ontrack = null;
      nativePc.onicecandidate = null;
      nativePc.onconnectionstatechange = null;
      pc.close();
      this.peers.delete(userId);
    }

    this.remoteStreams.delete(userId);
    this.pendingIceCandidates.delete(userId);
  }

  private async acquireLocalMedia(mode: MobileCallMode) {
    try {
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video'
          ? {
              frameRate: 24,
              facingMode: 'user',
              width: 640,
              height: 480,
            }
          : false,
      });
    } catch (error) {
      if (mode === 'video') {
        this._callMode = 'audio';
        this.localStream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        return;
      }
      this.emit('call:error', { error: 'Microphone or camera access is blocked for Whagons.' });
      throw error;
    }
  }

  private addSelfParticipant() {
    this._participants.set(this._userId, {
      userId: this._userId,
      userName: this._userName,
      userPicture: this._userPicture,
      stream: this.localStream,
      audioEnabled: this.localStream?.getAudioTracks()[0]?.enabled ?? true,
      videoEnabled: this.localStream?.getVideoTracks()[0]?.enabled ?? false,
    });
    this.emit('participants:updated', { participants: this.getParticipantList() });
  }

  private captureCallSummary(): CallEndedInfo {
    return {
      participants: this.getParticipantList().map((participant) => ({
        userId: participant.userId,
        userName: participant.userName,
        userPicture: participant.userPicture,
      })),
      callMode: this._callMode,
      workspaceId: this._workspaceId,
      conversationId: this._conversationId,
    };
  }

  private cleanup() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }

    this.localStream = null;
    this._workspaceId = null;
    this._conversationId = null;
    this._callMode = 'audio';
    this._isInCall = false;
    this._startedCall = false;
    this._tenantId = null;
    this._pendingIncomingCall = null;
    this._participants.clear();
    this.pendingIceCandidates.clear();
  }

  private emit(event: string, payload: any) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.forEach((callback) => callback(payload));
  }

  private async sendBusySignal(signal: MobileCallSignal) {
    await this.sendSignal({
      operation: 'call-full',
      workspaceId: signal.workspaceId,
      conversationId: signal.conversationId,
      toUserId: signal.fromUserId,
      callMode: this._callMode,
    });
  }

  private async sendSignal(
    signal: {
      operation: MobileCallSignal['operation'];
      workspaceId?: string;
      conversationId?: string;
      toUserId?: string;
      callMode: MobileCallMode;
      payload?: any;
      tenantId?: string;
    },
  ) {
    const tenantId = signal.tenantId ?? this._tenantId;
    if (!tenantId || !this._userId) {
      return 0;
    }

    const result = await convex.mutation(api.calls.sendSignal, {
      tenantId,
      operation: signal.operation,
      workspaceId: signal.workspaceId || undefined,
      conversationId: signal.conversationId || undefined,
      toUserId: signal.toUserId || undefined,
      callMode: signal.callMode,
      payload: signal.payload,
    });

    return result.delivered ?? 0;
  }
}

let singleton: MobileCallService | null = null;

export function getMobileCallService() {
  if (!singleton) {
    singleton = new MobileCallService();
  }
  return singleton;
}
