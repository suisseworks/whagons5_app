const CORRELATION_PREFIX = 'whcx';

function randomToken(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function createConvexClientRequestId(functionPath?: string): string {
  const safePath = (functionPath || 'unknown')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .slice(0, 80);
  return `${CORRELATION_PREFIX}_${Date.now()}_${safePath}_${randomToken()}`;
}
