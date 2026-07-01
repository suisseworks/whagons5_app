import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { addSupportBreadcrumb, captureSupportError } from '../services/supportDiagnostics';
import { getConvexErrorDiagnostics } from '../services/convexErrorDiagnostics';

type QueryArgs<Query extends FunctionReference<'query'>> = FunctionArgs<Query> | 'skip';

function stableArgsKey(args: unknown): string {
  if (args === 'skip') return 'skip';
  try {
    return JSON.stringify(args);
  } catch {
    return String(Date.now());
  }
}

export function useSafeConvexQuery<Query extends FunctionReference<'query'>>(
  queryRef: Query,
  args: QueryArgs<Query>,
  apiPath: string,
  refreshKey?: unknown,
): FunctionReturnType<Query> | undefined {
  const convex = useConvex();
  const argsKey = useMemo(() => stableArgsKey(args), [args]);
  const [data, setData] = useState<FunctionReturnType<Query> | undefined>(undefined);

  // `api.*` proxies produce a new object identity on every property access, so
  // the effect must key on the stable function name, never on `queryRef` itself
  // (an identity dep re-runs the effect on every render — an endless refetch loop).
  const queryName = getFunctionName(queryRef);
  const queryRefRef = useRef(queryRef);
  queryRefRef.current = queryRef;
  const argsRef = useRef(args);
  argsRef.current = args;
  const lastArgsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const currentArgs = argsRef.current;
    if (currentArgs === 'skip') {
      lastArgsKeyRef.current = null;
      setData(undefined);
      return () => {
        cancelled = true;
      };
    }

    // Clear only when the query scope changes (different args); on a plain
    // refresh (same args, new refreshKey) keep the previous result so consumers
    // (e.g. workspace counts) don't flash through undefined.
    if (lastArgsKeyRef.current !== argsKey) {
      lastArgsKeyRef.current = argsKey;
      setData(undefined);
    }

    void convex.query(queryRefRef.current, currentArgs)
      .then((result) => {
        if (!cancelled) setData(result as FunctionReturnType<Query>);
      })
      .catch((error) => {
        if (cancelled) return;
        const convexDiagnostics = getConvexErrorDiagnostics(error);
        const message = error instanceof Error ? error.message : String(error);
        addSupportBreadcrumb('convex.query.error', apiPath, {
          message,
          convex: convexDiagnostics,
        }, 'warn');
        captureSupportError({
          message: `Convex query failed: ${apiPath}`,
          stack: error instanceof Error ? error.stack : undefined,
          category: 'convex',
          metadata: {
            apiPath,
            args: currentArgs,
            errorMessage: message,
            convex: convexDiagnostics,
          },
        });
        setData(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath, argsKey, convex, queryName, refreshKey]);

  return data;
}
