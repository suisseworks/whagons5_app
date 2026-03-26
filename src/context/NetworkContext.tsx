/**
 * NetworkContext – Centralized connectivity state for offline mode.
 *
 * Combines @react-native-community/netinfo (OS-level reachability)
 * with the Convex SDK connection state so every component can check
 * "are we online?" without duplicating listeners.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetworkContextType {
  /** OS reports a network interface is available */
  isConnected: boolean;
  /** OS confirms the interface can actually reach the internet */
  isInternetReachable: boolean;
  /** Shorthand: connected AND reachable */
  isOnline: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  isOnline: true,
});

export const NetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);

  const handleNetInfoChange = useCallback((state: NetInfoState) => {
    setIsConnected(state.isConnected ?? true);
    setIsInternetReachable(state.isInternetReachable ?? state.isConnected ?? true);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handleNetInfoChange);
    // Also do an initial fetch to get the current state
    NetInfo.fetch().then(handleNetInfoChange);
    return () => unsubscribe();
  }, [handleNetInfoChange]);

  const isOnline = isConnected && isInternetReachable;

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable, isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = (): NetworkContextType => {
  return useContext(NetworkContext);
};
