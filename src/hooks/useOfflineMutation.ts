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
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server';
import { useNetwork } from '../context/NetworkContext';
import { useMutationQueue } from '../context/MutationQueueContext';
import * as DB from '../store/database';
import { useTenant } from './useTenant';
import { addSupportBreadcrumb, captureSupportError } from '../services/supportDiagnostics';
import { getConvexErrorDiagnostics } from '../services/convexErrorDiagnostics';
import { createConvexClientRequestId } from '../services/convexCorrelation';
import { APP_VERSION, GIT_HASH } from '../config/version';

let _idCounter = 0;
function generateQueueId(): string {
  return `mut_${Date.now()}_${++_idCounter}`;
}

function isConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('fetch')
  );
}

type OfflineQueuedResult = {
  _offlineQueued: true;
  _queueId: string;
};

const SUPPORT_METADATA_MUTATIONS = new Set([
  'tasks.create',
  'tasks.update',
  'tasks.updateByPgId',
  'taskFindings.create',
  'taskFindings.update',
  'taskFindings.reorder',
]);

function attachSupportMetadata<T extends Record<string, unknown>>(
  apiPath: string,
  args: T,
  clientRequestId: string,
): T {
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

/**
 * @param mutationRef  The Convex API reference (e.g. api.tasks.create)
 * @param apiPath      A string key for replay identification (e.g. 'tasks.create')
 */
export function useOfflineMutation<Mutation extends FunctionReference<'mutation'>>(
  mutationRef: Mutation,
  apiPath: string,
) {
  const mutate = useMutation(mutationRef);
  const { isOnline } = useNetwork();
  const { refreshCount } = useMutationQueue();
  const { tenantId } = useTenant();

  const execute = useCallback(
    async (...mutationArgs: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation> | OfflineQueuedResult> => {
      const args = (mutationArgs[0] ?? {}) as FunctionArgs<Mutation>;
      const argsRecord = args as Record<string, unknown>;
      const actionAt = Date.now();
      const argsTenantId = typeof argsRecord.tenantId === 'string'
        ? argsRecord.tenantId
        : null;
      const effectiveTenantId = tenantId ?? argsTenantId;
      const clientRequestId = createConvexClientRequestId(apiPath);
      const correlatedArgs = attachSupportMetadata(apiPath, argsRecord, clientRequestId) as FunctionArgs<Mutation>;
      const correlatedMutationArgs = [correlatedArgs] as OptionalRestArgs<Mutation>;

      if (isOnline) {
        try {
          addSupportBreadcrumb('convex.mutation', apiPath, { tenantId: effectiveTenantId, clientRequestId });
          return await mutate(...correlatedMutationArgs);
        } catch (error) {
          if (!effectiveTenantId || !isConnectivityError(error)) {
            const convex = getConvexErrorDiagnostics(error);
            const correlatedConvex = convex ? { ...convex, clientRequestId } : undefined;
            addSupportBreadcrumb('convex.error', apiPath, {
              tenantId: effectiveTenantId,
              clientRequestId,
              message: error instanceof Error ? error.message : String(error),
              convex: correlatedConvex,
            }, 'error');
            captureSupportError({
              message: `Convex mutation failed: ${apiPath}`,
              stack: error instanceof Error ? error.stack : undefined,
              category: 'convex',
              metadata: {
                apiPath,
                tenantId: effectiveTenantId,
                clientRequestId,
                args,
                errorMessage: error instanceof Error ? error.message : String(error),
                convex: correlatedConvex,
              },
            });
            throw error;
          }

          const id = generateQueueId();
          addSupportBreadcrumb('mutation.queue', apiPath, { tenantId: effectiveTenantId, queueId: id, clientRequestId, reason: 'connectivity' }, 'warn');
          await DB.enqueueMutation(id, apiPath, correlatedArgs, effectiveTenantId, actionAt);
          await refreshCount();
          return { _offlineQueued: true, _queueId: id };
        }
      }

      if (!effectiveTenantId) {
        throw new Error('No tenant selected');
      }

      // Offline: queue for later replay
      const id = generateQueueId();
      addSupportBreadcrumb('mutation.queue', apiPath, { tenantId: effectiveTenantId, queueId: id, clientRequestId, reason: 'offline' }, 'warn');
      await DB.enqueueMutation(id, apiPath, correlatedArgs, effectiveTenantId, actionAt);
      await refreshCount();
      return { _offlineQueued: true, _queueId: id };
    },
    [mutate, isOnline, apiPath, refreshCount, tenantId],
  );

  return execute;
}
