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

let _idCounter = 0;
function generateQueueId(): string {
  return `mut_${Date.now()}_${++_idCounter}`;
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

  const execute = useCallback(
    async (args: Args): Promise<any> => {
      if (isOnline) {
        return mutate(args);
      }

      // Offline: queue for later replay
      const id = generateQueueId();
      await DB.enqueueMutation(id, apiPath, args);
      refreshCount();
      return { _offlineQueued: true, _queueId: id };
    },
    [mutate, isOnline, apiPath, refreshCount],
  );

  return execute;
}
