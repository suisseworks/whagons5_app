/**
 * MutationQueueContext – Manages the offline mutation queue.
 *
 * Watches for network reconnection and replays pending mutations
 * from SQLite in FIFO order. Exposes pendingCount so the UI can
 * show a "3 changes pending" indicator.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { useNetwork } from './NetworkContext';
import { convex } from '../providers/ConvexClientProvider';
import { api } from '../../../convex/_generated/api';
import * as DB from '../store/database';

// ---------------------------------------------------------------------------
// Map apiPath strings back to Convex function references for replay
// ---------------------------------------------------------------------------

function resolveApiRef(apiPath: string): any {
  const parts = apiPath.split('.');
  let ref: any = api;
  for (const p of parts) {
    ref = ref?.[p];
    if (!ref) return null;
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MutationQueueContextType {
  pendingCount: number;
  isReplaying: boolean;
  refreshCount: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MutationQueueContext = createContext<MutationQueueContextType>({
  pendingCount: 0,
  isReplaying: false,
  refreshCount: async () => {},
});

export const MutationQueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isOnline } = useNetwork();
  const [pendingCount, setPendingCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayingRef = useRef(false);
  const wasOfflineRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await DB.getPendingMutationCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Poll the count periodically and on mount
  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 5000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Track offline→online transitions to trigger replay
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      replayQueue();
    }
  }, [isOnline]);

  const replayQueue = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    setIsReplaying(true);

    try {
      const pending = await DB.getPendingMutations();
      if (pending.length === 0) return;

      let successCount = 0;
      let failCount = 0;

      for (const mutation of pending) {
        const apiRef = resolveApiRef(mutation.api_path);
        if (!apiRef) {
          await DB.markMutationFailed(mutation.id);
          failCount++;
          continue;
        }

        try {
          await DB.markMutationSyncing(mutation.id);
          const args = JSON.parse(mutation.args);
          await convex.mutation(apiRef, args);
          await DB.removeMutation(mutation.id);
          successCount++;
        } catch (err: any) {
          console.warn('[MutationQueue] Replay failed for', mutation.api_path, err?.message);
          await DB.markMutationFailed(mutation.id);
          failCount++;
        }
      }

      if (failCount > 0) {
        Alert.alert(
          'Sync Issue',
          `${successCount} change(s) synced successfully. ${failCount} change(s) failed to sync and have been discarded.`,
        );
        // Clean up failed mutations so they don't pile up
        const failed = await DB.getPendingMutations();
        for (const m of failed) {
          if (m.status === 'failed') {
            await DB.removeMutation(m.id);
          }
        }
      }
    } catch (err) {
      console.warn('[MutationQueue] Replay error:', err);
    } finally {
      replayingRef.current = false;
      setIsReplaying(false);
      refreshCount();
    }
  }, [refreshCount]);

  return (
    <MutationQueueContext.Provider value={{ pendingCount, isReplaying, refreshCount }}>
      {children}
    </MutationQueueContext.Provider>
  );
};

export const useMutationQueue = (): MutationQueueContextType => {
  return useContext(MutationQueueContext);
};
