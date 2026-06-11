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
import type { FunctionReference } from 'convex/server';
import { useNetwork } from './NetworkContext';
import { convex } from '../providers/ConvexClientProvider';
import { api } from '../../../convex/_generated/api';
import * as DB from '../store/database';
import { isMutationQueueReplayPaused } from '../store/mutationQueueRuntime';
import { useTenant } from '../hooks/useTenant';
import { addSupportBreadcrumb, captureSupportError } from '../services/supportDiagnostics';
import { getConvexErrorDiagnostics } from '../services/convexErrorDiagnostics';
import { createConvexClientRequestId } from '../services/convexCorrelation';
import { APP_VERSION, GIT_HASH } from '../config/version';

// ---------------------------------------------------------------------------
// Map apiPath strings back to Convex function references for replay
// ---------------------------------------------------------------------------

const convexFunctionName = Symbol.for('functionName');

function errorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return fallback || String(error ?? '');
}

function isConvexMutationReference(value: unknown): value is FunctionReference<'mutation'> {
  return Boolean(value && typeof value === 'object' && convexFunctionName in value);
}

const SUPPORT_METADATA_MUTATIONS = new Set([
  'tasks.create',
  'tasks.update',
  'tasks.updateByPgId',
  'taskFindings.create',
  'taskFindings.update',
  'taskFindings.reorder',
]);

function existingClientRequestId(args: Record<string, unknown>): string | null {
  const support = args.support;
  if (!support || typeof support !== 'object') return null;
  const value = (support as Record<string, unknown>).clientRequestId;
  return typeof value === 'string' && value.trim() ? value : null;
}

function attachSupportMetadata(
  apiPath: string,
  args: Record<string, unknown>,
  clientRequestId: string,
): Record<string, unknown> {
  if (!SUPPORT_METADATA_MUTATIONS.has(apiPath)) return args;
  return {
    ...args,
    support: {
      clientRequestId,
      runtime: 'app',
      appVersion: APP_VERSION,
      buildCommit: GIT_HASH,
    },
  };
}

function resolveApiRef(apiPath: string): FunctionReference<'mutation'> | null {
  const parts = apiPath.split('.');
  let ref: unknown = api;
  for (const p of parts) {
    if (!ref || typeof ref !== 'object' || !(p in ref)) return null;
    ref = (ref as Record<string, unknown>)[p];
  }
  return isConvexMutationReference(ref) ? ref : null;
}

function isStateConflictError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes('invalid status') ||
    message.includes('cannot move') ||
    message.includes('transition') ||
    message.includes('state conflict') ||
    message.includes('stale')
  );
}

type TaskUpdateIntent = {
  taskId: string;
  fields: Array<'status' | 'priority'>;
};

function extractTaskUpdateIntent(apiPath: string, args: Record<string, unknown>): TaskUpdateIntent | null {
  if (apiPath === 'tasks.update') {
    const taskId = args.pgId ?? args.id;
    if (taskId == null) return null;
    const fields: Array<'status' | 'priority'> = [];
    if (args.statusId != null) fields.push('status');
    if (args.priorityId != null) fields.push('priority');
    if (fields.length === 0) return null;
    return { taskId: String(taskId), fields };
  }

  if (apiPath === 'tasks.updateByPgId') {
    if (args.pgId == null) return null;
    const updates = (args.updates && typeof args.updates === 'object')
      ? (args.updates as Record<string, unknown>)
      : null;
    if (!updates) return null;

    const fields: Array<'status' | 'priority'> = [];
    if (updates.status_id != null) fields.push('status');
    if (updates.priority_id != null) fields.push('priority');
    if (fields.length === 0) return null;
    return { taskId: String(args.pgId), fields };
  }

  return null;
}

function hasSupersedingTaskUpdate(
  current: DB.QueuedMutation,
  currentArgs: Record<string, unknown>,
  pending: DB.QueuedMutation[],
): boolean {
  const intent = extractTaskUpdateIntent(current.api_path, currentArgs);
  if (!intent) return false;

  for (const candidate of pending) {
    if (candidate.id === current.id) continue;

    const isAfterCurrent =
      candidate.action_at > current.action_at ||
      (candidate.action_at === current.action_at && candidate.created_at > current.created_at);
    if (!isAfterCurrent) continue;

    let candidateArgs: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(candidate.args);
      if (parsed && typeof parsed === 'object') {
        candidateArgs = parsed as Record<string, unknown>;
      }
    } catch {
      candidateArgs = null;
    }
    if (!candidateArgs) continue;

    const candidateIntent = extractTaskUpdateIntent(candidate.api_path, candidateArgs);
    if (!candidateIntent) continue;
    if (candidateIntent.taskId !== intent.taskId) continue;

    const hasOverlappingField = candidateIntent.fields.some((field) => intent.fields.includes(field));
    if (hasOverlappingField) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MutationQueueContextType {
  pendingCount: number;
  failedCount: number;
  isReplaying: boolean;
  queue: DB.QueuedMutation[];
  refreshCount: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  replayNow: () => Promise<void>;
  retryMutation: (id: string) => Promise<void>;
  removeQueuedMutation: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MutationQueueContext = createContext<MutationQueueContextType>({
  pendingCount: 0,
  failedCount: 0,
  isReplaying: false,
  queue: [],
  refreshCount: async () => {},
  refreshQueue: async () => {},
  replayNow: async () => {},
  retryMutation: async () => {},
  removeQueuedMutation: async () => {},
  clearQueue: async () => {},
});

export const MutationQueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isOnline } = useNetwork();
  const { tenantId } = useTenant();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [queue, setQueue] = useState<DB.QueuedMutation[]>([]);
  const replayingRef = useRef(false);

  const REPLAY_MAX_ATTEMPTS = 5;
  const BASE_RETRY_MS = 15000;

  const getBackoffMs = useCallback((attempts: number): number => {
    const normalized = Math.max(1, attempts);
    return Math.min(5 * 60 * 1000, BASE_RETRY_MS * (2 ** (normalized - 1)));
  }, []);

  const isRetriableError = useCallback((error: unknown): boolean => {
    const message = errorMessage(error).toLowerCase();
    if (!message) return true;

    if (
      message.includes('invalid') ||
      message.includes('forbidden') ||
      message.includes('unauthorized') ||
      message.includes('not found') ||
      message.includes('already exists')
    ) {
      return false;
    }

    return (
      message.includes('network') ||
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('fetch') ||
      message.includes('temporar') ||
      message.includes('offline')
    );
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      let rows = await DB.getQueuedMutations(tenantId);
      if (tenantId) {
        const globalRows = await DB.getQueuedMutations();
        if (globalRows.length > rows.length) {
          rows = globalRows;
        }
      }
      setQueue(rows);
      setPendingCount(rows.filter((row) => row.status !== 'failed').length);
      setFailedCount(rows.filter((row) => row.status === 'failed').length);
    } catch {
      setQueue([]);
      setPendingCount(0);
      setFailedCount(0);
    }
  }, [tenantId]);

  const refreshCount = useCallback(async () => {
    await refreshQueue();
  }, [refreshQueue]);

  // Recover stuck syncing rows after app restarts
  useEffect(() => {
    DB.resetSyncingMutations()
      .catch(() => {})
      .finally(() => {
        void refreshQueue();
      });
  }, [refreshQueue]);

  // Poll queue metadata periodically and on mount
  useEffect(() => {
    void refreshQueue();
    const interval = setInterval(() => {
      void refreshQueue();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  const replayQueue = useCallback(async () => {
    if (!isOnline) return;
    if (!tenantId) return;
    if (isMutationQueueReplayPaused()) return;
    if (replayingRef.current) return;

    const replayTenantId = tenantId;
    const shouldStopReplay = () => isMutationQueueReplayPaused() || replayTenantId !== tenantId;

    replayingRef.current = true;
    setIsReplaying(true);

    try {
      let pending = await DB.getReplayableMutations(replayTenantId);
      if (shouldStopReplay()) return;
      if (replayTenantId) {
        const globalPending = await DB.getReplayableMutations();
        if (shouldStopReplay()) return;
        if (globalPending.length > pending.length) {
          pending = globalPending;
        }
      }
      if (pending.length === 0) return;

      for (const mutation of pending) {
        if (shouldStopReplay()) return;
        const attempts = (mutation.attempts ?? 0) + 1;
        const apiRef = resolveApiRef(mutation.api_path);
        if (!apiRef) {
          const errorMessage = `Unknown API path: ${mutation.api_path}`;
          await DB.markMutationFailed(
            mutation.id,
            attempts,
            errorMessage,
          );
          await DB.archiveMutation({ ...mutation, attempts }, 'failed', mutation.pushed_at, errorMessage);
          continue;
        }

        let args: Record<string, unknown>;
        try {
          const parsed = JSON.parse(mutation.args);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid mutation arguments');
          }
          args = parsed as Record<string, unknown>;
        } catch (err) {
          const message = errorMessage(err, 'Invalid mutation arguments');
          await DB.markMutationFailed(mutation.id, attempts, message);
          await DB.archiveMutation({ ...mutation, attempts }, 'failed', mutation.pushed_at, message);
          continue;
        }

        const pushAttemptAt = Date.now();
        const clientRequestId = existingClientRequestId(args) ?? createConvexClientRequestId(mutation.api_path);
        const correlatedArgs = attachSupportMetadata(mutation.api_path, args, clientRequestId);

        try {
          if (shouldStopReplay()) return;
          await DB.markMutationSyncing(mutation.id, attempts);
          if (shouldStopReplay()) return;
          addSupportBreadcrumb('mutation.replay', mutation.api_path, {
            tenantId: replayTenantId,
            queueId: mutation.id,
            attempts,
            clientRequestId,
          });
          await convex.mutation(apiRef, correlatedArgs as any);
          if (shouldStopReplay()) return;
          await DB.archiveMutation(
            {
              ...mutation,
              attempts,
              pushed_at: mutation.pushed_at > 0 ? mutation.pushed_at : pushAttemptAt,
            },
            'synced',
            pushAttemptAt,
            null,
          );
          if (shouldStopReplay()) return;
          await DB.removeMutation(mutation.id);
        } catch (err) {
          if (shouldStopReplay()) return;
          const errMessage = errorMessage(err, 'Replay failed');
          const convex = getConvexErrorDiagnostics(err);
          const correlatedConvex = convex ? { ...convex, clientRequestId } : undefined;
          addSupportBreadcrumb('convex.error', mutation.api_path, {
            tenantId: replayTenantId,
            queueId: mutation.id,
            attempts,
            clientRequestId,
            message: errMessage,
            convex: correlatedConvex,
          }, 'error');
          captureSupportError({
            message: `Queued Convex mutation failed: ${mutation.api_path}`,
            stack: err instanceof Error ? err.stack : undefined,
            category: 'convex',
            metadata: {
              apiPath: mutation.api_path,
              tenantId: replayTenantId,
              queueId: mutation.id,
              attempts,
              clientRequestId,
              args: correlatedArgs,
              errorMessage: errMessage,
              convex: correlatedConvex,
            },
          });
          const shouldRetry = attempts < REPLAY_MAX_ATTEMPTS && isRetriableError(err);

          if (shouldRetry) {
            const nextRetryAt = Date.now() + getBackoffMs(attempts);
            await DB.markMutationPendingRetry(
              mutation.id,
              attempts,
              nextRetryAt,
              errMessage,
            );
          } else {
            const isConflict = isStateConflictError(err);
            if (isConflict && hasSupersedingTaskUpdate(mutation, args, pending)) {
              await DB.archiveMutation(
                {
                  ...mutation,
                  attempts,
                  pushed_at: mutation.pushed_at > 0 ? mutation.pushed_at : pushAttemptAt,
                },
                'skipped',
                pushAttemptAt,
                errMessage,
              );
              await DB.removeMutation(mutation.id);
              continue;
            }

            await DB.markMutationFailed(mutation.id, attempts, errMessage);
            await DB.archiveMutation(
              {
                ...mutation,
                attempts,
                pushed_at: mutation.pushed_at > 0 ? mutation.pushed_at : pushAttemptAt,
              },
              'failed',
              pushAttemptAt,
              errMessage,
            );
          }
        }
      }
    } catch (err) {
      addSupportBreadcrumb('mutation.replay', errorMessage(err, 'Replay error'), { tenantId }, 'error');
      console.warn('[MutationQueue] Replay error:', err);
    } finally {
      replayingRef.current = false;
      setIsReplaying(false);
      if (!isMutationQueueReplayPaused()) {
        await refreshQueue();
      }
    }
  }, [REPLAY_MAX_ATTEMPTS, getBackoffMs, isOnline, isRetriableError, refreshQueue, tenantId]);

  const replayNow = useCallback(async () => {
    if (!isOnline) return;
    if (!tenantId) return;
    await replayQueue();
  }, [isOnline, replayQueue, tenantId]);

  const retryMutation = useCallback(async (id: string) => {
    let rows = await DB.getQueuedMutations(tenantId);
    let mutation = rows.find((row) => row.id === id);
    if (!mutation && tenantId) {
      rows = await DB.getQueuedMutations();
      mutation = rows.find((row) => row.id === id);
    }
    if (!mutation) return;

    await DB.markMutationPendingRetry(
      id,
      mutation.attempts ?? 0,
      0,
      mutation.last_error ?? 'Manual retry',
    );
    await refreshQueue();
    if (isOnline) {
      await replayQueue();
    }
  }, [isOnline, refreshQueue, replayQueue, tenantId]);

  const removeQueuedMutation = useCallback(async (id: string) => {
    await DB.removeMutation(id);
    await refreshQueue();
  }, [refreshQueue]);

  const clearQueue = useCallback(async () => {
    await DB.clearMutationQueue(tenantId ?? undefined);
    await refreshQueue();
  }, [refreshQueue, tenantId]);

  // Replay on startup and whenever we reconnect
  useEffect(() => {
    if (!isOnline) return;
    if (!tenantId) return;
    void replayQueue();
  }, [isOnline, replayQueue, tenantId]);

  // Keep trying due retries while online
  useEffect(() => {
    if (!isOnline) return;
    if (!tenantId) return;
    const interval = setInterval(() => {
      void replayQueue();
    }, 15000);
    return () => clearInterval(interval);
  }, [isOnline, replayQueue, tenantId]);

  return (
    <MutationQueueContext.Provider
      value={{
        pendingCount,
        failedCount,
        isReplaying,
        queue,
        refreshCount,
        refreshQueue,
        replayNow,
        retryMutation,
        removeQueuedMutation,
        clearQueue,
      }}
    >
      {children}
    </MutationQueueContext.Provider>
  );
};

export const useMutationQueue = (): MutationQueueContextType => {
  return useContext(MutationQueueContext);
};
