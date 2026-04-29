/**
 * useOfflineMutation – Wraps Convex useMutation with offline queuing.
 *
 * When online: executes the mutation directly via Convex.
 * When offline: enqueues the mutation in SQLite for later replay,
 *               and optionally applies an optimistic update locally.
 *
 * Usage:
 *   const createTask = useOfflineMutation(api.tasks.create, 'tasks.create');
 *   await createTask({ tenantId, name: 'New task', ... });
 */

import { useCallback } from 'react';
import { useMutation } from 'convex/react';
import { useNetwork } from '../context/NetworkContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import * as DB from '../store/database';
import { useTenant } from './useTenant';

let _idCounter = 0;
function generateQueueId(): string {
  return `mut_${Date.now()}_${++_idCounter}`;
}

function isConnectivityError(error: unknown): boolean {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('fetch')
  );
}

/**
 * @param mutationRef  The Convex API reference (e.g. api.tasks.create)
 * @param apiPath      A string key for replay identification (e.g. 'tasks.create')
 */
export function useOfflineMutation<Args extends Record<string, any>>(
  mutationRef: any,
  apiPath: string,
) {
  const mutate = useMutation(mutationRef);
  const { isOnline } = useNetwork();
  const { refreshCount } = useMutationQueue();
  const { tenantId } = useTenant();

  const execute = useCallback(
    async (args: Args): Promise<any> => {
      const actionAt = Date.now();
      const argsTenantId = typeof (args as any)?.tenantId === 'string'
        ? String((args as any).tenantId)
        : null;
      const effectiveTenantId = tenantId ?? argsTenantId;

      if (isOnline) {
        try {
          return await mutate(args);
        } catch (error) {
          if (!effectiveTenantId || !isConnectivityError(error)) {
            throw error;
          }

          const id = generateQueueId();
          await DB.enqueueMutation(id, apiPath, args, effectiveTenantId, actionAt);
          await refreshCount();
          return { _offlineQueued: true, _queueId: id };
        }
      }

      if (!effectiveTenantId) {
        throw new Error('No tenant selected');
      }

      // Offline: queue for later replay
      const id = generateQueueId();
      await DB.enqueueMutation(id, apiPath, args, effectiveTenantId, actionAt);
      await refreshCount();
      return { _offlineQueued: true, _queueId: id };
    },
    [mutate, isOnline, apiPath, refreshCount, tenantId],
  );

  return execute;
}
