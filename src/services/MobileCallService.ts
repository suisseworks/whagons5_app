type EventCallback = (payload: any) => void;

export type MobileCallMode = 'audio' | 'video';

export interface MobileCallParticipant {
  userId: string;
  userName: string;
  userPicture?: string;
  stream: null;
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

export interface CallEndedInfo {
  participants: Array<{ userId: string; userName: string; userPicture?: string }>;
  callMode: MobileCallMode;
  workspaceId: string | null;
  conversationId: string | null;
}

export class MobileCallService {
  private listeners = new Map<string, EventCallback[]>();

  get isInCall() {
    return false;
  }

  get callMode(): MobileCallMode {
    return 'audio';
  }

  get startedCall() {
    return false;
  }

  get workspaceId() {
    return null;
  }

  get conversationId() {
    return null;
  }

  get participantCount() {
    return 0;
  }

  get localStream() {
    return null;
  }

  get participants(): MobileCallParticipant[] {
    return [];
  }

  getParticipantList(): MobileCallParticipant[] {
    return [];
  }

  init() {}

  on(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
    return () => this.off(event, callback);
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event) ?? [];
    this.listeners.set(event, callbacks.filter((item) => item !== callback));
  }

  async startCall(): Promise<void> {}

  async joinCall(): Promise<void> {}

  async rejectCall(): Promise<void> {}

  async receiveSignal(): Promise<boolean> {
    return false;
  }

  hangUp() {}

  toggleAudio() {
    return false;
  }

  async toggleVideo() {
    return false;
  }

  switchCamera() {}
}

let singleton: MobileCallService | null = null;

export function getMobileCallService() {
  if (!singleton) {
    singleton = new MobileCallService();
  }
  return singleton;
}
