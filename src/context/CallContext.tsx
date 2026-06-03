import React, { createContext, useContext, useMemo } from 'react';

interface ConversationCallStartOptions {
  conversationId: string | number;
  title: string;
  picture?: string | null;
  mode: 'audio' | 'video';
}

interface CallContextValue {
  startConversationCall: (options: ConversationCallStartOptions) => Promise<void>;
  hangUp: () => void;
  isCallActive: boolean;
  isIncomingCallVisible: boolean;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const contextValue = useMemo<CallContextValue>(
    () => ({
      startConversationCall: async () => {
        throw new Error('Native calls are not available in the web smoke-test build.');
      },
      hangUp: () => {},
      isCallActive: false,
      isIncomingCallVisible: false,
    }),
    [],
  );

  return (
    <CallContext.Provider value={contextValue}>
      {children}
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
