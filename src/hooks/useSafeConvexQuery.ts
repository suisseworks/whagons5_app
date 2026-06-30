import { useEffect, useMemo, useState } from 'react';
import { useConvex } from 'convex/react';
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
): FunctionReturnType<Query> | undefined {
  const convex = useConvex();
  const argsKey = useMemo(() => stableArgsKey(args), [args]);
  const [data, setData] = useState<FunctionReturnType<Query> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (args === 'skip') {
      setData(undefined);
      return () => {
        cancelled = true;
      };
    }

    setData(undefined);
    void convex.query(queryRef, args)
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
            args,
            errorMessage: message,
            convex: convexDiagnostics,
          },
        });
        setData(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [apiPath, argsKey, convex, queryRef]);

  return data;
}
