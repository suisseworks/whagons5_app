export type SupportBreadcrumb = {
  timestamp: number;
  category: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
  data?: Record<string, unknown>;
};

type ErrorPayload = {
  message: string;
  stack?: string;
  category?: string;
  metadata?: Record<string, unknown>;
};

const MAX_BREADCRUMBS = 40;
const breadcrumbs: SupportBreadcrumb[] = [];
let errorReporter: ((payload: ErrorPayload) => void) | null = null;

function scrub(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 2) return '[Object]';
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => scrub(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
      result[key] = /password|token|secret|authorization|credential|cookie/i.test(key)
        ? '[redacted]'
        : scrub(child, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function addSupportBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  breadcrumbs.push({
    timestamp: Date.now(),
    category,
    message: message.length > 240 ? `${message.slice(0, 240)}...` : message,
    level,
    ...(data ? { data: scrub(data) as Record<string, unknown> } : {}),
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
}

export function getSupportBreadcrumbs(): SupportBreadcrumb[] {
  return breadcrumbs.slice();
}

export function registerSupportErrorReporter(reporter: ((payload: ErrorPayload) => void) | null): void {
  errorReporter = reporter;
}

export function captureSupportError(payload: ErrorPayload): void {
  errorReporter?.({
    ...payload,
    metadata: {
      ...(scrub(payload.metadata) as Record<string, unknown> | undefined),
      breadcrumbs: getSupportBreadcrumbs(),
    },
  });
}
