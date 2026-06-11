import React, { ReactNode, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { APP_VERSION, BUILD_NUMBER, GIT_HASH } from '../config/version';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';
import {
  addSupportBreadcrumb,
  captureSupportError,
  getSupportBreadcrumbs,
  registerSupportErrorReporter,
} from '../services/supportDiagnostics';
import { getConvexErrorDiagnostics } from '../services/convexErrorDiagnostics';
import { createConvexClientRequestId } from '../services/convexCorrelation';

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEVICE_STORAGE_KEY = 'wh_support_device_id';
const SESSION_STORAGE_KEY = 'wh_support_session_id';

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getOrCreateStoredId(key: string, prefix: string): Promise<string> {
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const next = createId(prefix);
  await AsyncStorage.setItem(key, next);
  return next;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unknown error');
  }
  return String(error ?? 'Unknown error');
}

export function TechSupportSessionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const { subdomain, user } = useAuth();
  const network = useNetwork();
  const recordHeartbeat = useMutation(api.techSupport.recordHeartbeat);
  const recordClientError = useMutation(api.techSupport.recordClientError);

  const ids = useMemo(() => ({
    device: getOrCreateStoredId(DEVICE_STORAGE_KEY, 'dev'),
    session: getOrCreateStoredId(SESSION_STORAGE_KEY, 'sess'),
  }), []);

  useEffect(() => {
    registerSupportErrorReporter((payload) => {
      if (!isAuthenticated || !subdomain || !user) return;

      void Promise.all([ids.device, ids.session])
        .then(([deviceId, sessionKey]) => {
          const convex = payload.metadata?.convex && typeof payload.metadata.convex === 'object'
            ? payload.metadata.convex as Record<string, unknown>
            : null;
          const clientRequestId = convex
            ? String(convex.clientRequestId ?? createConvexClientRequestId(String(convex.functionPath ?? payload.category ?? 'convex')))
            : undefined;

          return recordClientError({
            tenantId: subdomain,
            sessionKey,
            deviceId,
            runtime: 'app',
            level: 'error',
            category: payload.category ?? 'ui',
            message: payload.message,
            stack: payload.stack,
            appVersion: APP_VERSION,
            buildCommit: GIT_HASH,
            buildTime: `build ${BUILD_NUMBER}`,
            path: payload.metadata?.route ? String(payload.metadata.route) : undefined,
            userAgent: `react-native ${Platform.OS}`,
            metadata: {
              platform: Platform.OS,
              buildNumber: BUILD_NUMBER,
              online: network.isOnline,
              ...payload.metadata,
              ...(clientRequestId ? { clientRequestId } : {}),
              ...(convex ? { convex: { ...convex, clientRequestId } } : {}),
              breadcrumbs: getSupportBreadcrumbs(),
            },
          });
        })
        .catch((error) => {
          console.warn('[TechSupport] Failed to record support error', error);
        });
    });

    return () => registerSupportErrorReporter(null);
  }, [ids.device, ids.session, isAuthenticated, network.isOnline, recordClientError, subdomain, user]);

  useEffect(() => {
    if (!isAuthenticated || !subdomain || !user) return;

    let cancelled = false;

    const sendHeartbeat = async () => {
      try {
        const [deviceId, sessionKey] = await Promise.all([ids.device, ids.session]);
        if (cancelled) return;
        await recordHeartbeat({
          tenantId: subdomain,
          sessionKey,
          deviceId,
          runtime: 'app',
          platform: Platform.OS,
          appVersion: APP_VERSION,
          buildCommit: GIT_HASH,
          buildTime: `build ${BUILD_NUMBER}`,
          userAgent: `react-native ${Platform.OS}`,
          currentPath: getSupportBreadcrumbs().slice(-1)[0]?.message,
          metadata: {
            buildNumber: BUILD_NUMBER,
            online: network.isOnline,
            isConnected: network.isConnected,
            isInternetReachable: network.isInternetReachable,
            breadcrumbs: getSupportBreadcrumbs().slice(-8),
          },
        });
      } catch (error) {
        console.warn('[TechSupport] Heartbeat failed', error);
      }
    };

    void sendHeartbeat();
    const interval = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ids.device, ids.session, isAuthenticated, network.isConnected, network.isInternetReachable, network.isOnline, recordHeartbeat, subdomain, user]);

  useEffect(() => {
    const globalHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
    (globalThis as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
      const convex = getConvexErrorDiagnostics(error);
      const correlatedConvex = convex
        ? { ...convex, clientRequestId: createConvexClientRequestId(convex.functionPath) }
        : undefined;
      addSupportBreadcrumb(convex ? 'convex.error' : 'app.crash', errorMessage(error), { isFatal, convex: correlatedConvex }, 'error');
      captureSupportError({
        message: `[${isFatal ? 'Fatal' : 'Unhandled'}] ${errorMessage(error)}`,
        stack: error?.stack,
        category: convex ? 'convex' : 'ui',
        metadata: { isFatal, convex: correlatedConvex },
      });
      globalHandler?.(error, isFatal);
    });

    return () => {
      if (globalHandler) {
        (globalThis as any).ErrorUtils?.setGlobalHandler?.(globalHandler);
      }
    };
  }, []);

  return <>{children}</>;
}
