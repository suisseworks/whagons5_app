type ConvexFunctionKind = 'query' | 'mutation' | 'action' | 'fatal' | 'unknown';

export type ConvexErrorDiagnostics = {
  isConvexClientError: boolean;
  hasServerData: boolean;
  functionKind: ConvexFunctionKind;
  functionPath?: string;
  clientMessage?: string;
  serverData?: unknown;
  name?: string;
};

const CONVEX_STACK_RE = /\[CONVEX\s+([QMA?])\(([^)]+)\)\]\s*([^\n]*)/;
const CONVEX_FATAL_RE = /\[CONVEX FATAL ERROR\]\s*([^\n]*)/;

function functionKindFromPrefix(prefix?: string): ConvexFunctionKind {
  if (prefix === 'Q') return 'query';
  if (prefix === 'M') return 'mutation';
  if (prefix === 'A') return 'action';
  return 'unknown';
}

function readErrorData(error: unknown): unknown {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  return (error as { data?: unknown }).data;
}

function readMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '') || undefined;
  }
  if (typeof error === 'string') return error;
  return undefined;
}

function readStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as { stack?: unknown }).stack ?? '') || undefined;
  }
  return undefined;
}

export function getConvexErrorDiagnostics(error: unknown): ConvexErrorDiagnostics | undefined {
  const message = readMessage(error);
  const stack = readStack(error);
  const text = [message, stack].filter(Boolean).join('\n');
  const serverData = readErrorData(error);
  const stackMatch = text.match(CONVEX_STACK_RE);
  const fatalMatch = text.match(CONVEX_FATAL_RE);
  const isConvexClientError = Boolean(stackMatch || fatalMatch || serverData !== undefined);
  if (!isConvexClientError) return undefined;

  return {
    isConvexClientError,
    hasServerData: serverData !== undefined,
    functionKind: fatalMatch ? 'fatal' : functionKindFromPrefix(stackMatch?.[1]),
    functionPath: stackMatch?.[2],
    clientMessage: stackMatch?.[3] || fatalMatch?.[1] || message,
    serverData,
    name: error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : undefined,
  };
}
