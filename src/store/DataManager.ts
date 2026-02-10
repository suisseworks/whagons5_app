/**
 * DataManager – Sync engine for the Whagons React Native app.
 *
 * This mirrors the web client's DataManager. It:
 *   1. Calls GET /bootstrap to establish tenant context
 *   2. Calls GET /sync/stream (NDJSON) to get the full or delta state
 *   3. Stores every record in SQLite via the database module
 *   4. Tracks the cursor so subsequent syncs only fetch changes
 *
 * Usage:
 *   const dm = new DataManager({ subdomain: 'tenant', authToken: '...' });
 *   await dm.bootstrapAndSync();          // full or delta sync
 *   const tasks = await dm.getTasks();    // read from local cache
 */

import { buildBaseUrl, API_CONFIG } from '../config/api';
import * as DB from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataManagerConfig {
  /** Tenant subdomain, e.g. "mycompany" */
  subdomain: string;
  /** Bearer token from /login (Sanctum token) */
  authToken: string;
}

export interface SyncResult {
  success: boolean;
  /** Tables that received at least one upsert/delete */
  touchedTables: string[];
  error?: string;
}

/** Callback invoked after sync completes so the UI can refresh. */
export type SyncListener = (result: SyncResult) => void;

// ---------------------------------------------------------------------------
// DataManager
// ---------------------------------------------------------------------------

export class DataManager {
  private subdomain: string;
  private authToken: string;
  private listeners: SyncListener[] = [];

  constructor(config: DataManagerConfig) {
    this.subdomain = config.subdomain;
    this.authToken = config.authToken;
  }

  /** Update the auth token (e.g. after refresh). */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /** Register a listener that fires after every sync. */
  onSync(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(result: SyncResult) {
    for (const l of this.listeners) {
      try {
        l(result);
      } catch {}
    }
  }

  // -----------------------------------------------------------------------
  // Bootstrap + Sync
  // -----------------------------------------------------------------------

  /**
   * Main entry point. Call on app start and on pull-to-refresh.
   * - Initialises the SQLite database
   * - Calls /bootstrap
   * - Runs the NDJSON sync stream (full or delta based on cursor)
   */
  async bootstrapAndSync(): Promise<SyncResult> {
    await DB.initDb();

    const baseUrl = buildBaseUrl(this.subdomain);

    // 1. Bootstrap
    try {
      await fetch(`${baseUrl}/bootstrap`, {
        method: 'GET',
        headers: this.headers(),
      });
    } catch (err) {
      console.warn('DataManager: bootstrap failed', err);
    }

    // 2. Read cursor & determine if we can skip
    const cursorKey = this.cursorKey();
    const cursor = await DB.getMeta(cursorKey);
    const lastSyncKey = this.lastSyncKey();
    const lastSyncRaw = await DB.getMeta(lastSyncKey);
    const lastSyncAt = lastSyncRaw ? Number(lastSyncRaw) : 0;

    // Check if we have local data
    let hasLocalData = false;
    try {
      const counts = await Promise.all([
        DB.getRowCount('wh_workspaces'),
        DB.getRowCount('wh_teams'),
        DB.getRowCount('wh_categories'),
      ]);
      hasLocalData = counts.some((c) => c > 0);
    } catch {}

    // If we lost the data but still have a cursor, clear the cursor
    if (!hasLocalData && cursor) {
      await DB.deleteMeta(cursorKey);
    }

    // Skip sync if we synced very recently and have data
    const shouldSkip =
      hasLocalData &&
      !!cursor &&
      lastSyncAt > 0 &&
      Date.now() - lastSyncAt < 30_000;

    if (shouldSkip) {
      const result: SyncResult = { success: true, touchedTables: [] };
      this.notifyListeners(result);
      return result;
    }

    // 3. Stream sync
    const syncCursor = hasLocalData ? cursor ?? undefined : undefined;
    const result = await this.syncStream(syncCursor);

    if (result.success) {
      await DB.setMeta(lastSyncKey, String(Date.now()));
    }

    this.notifyListeners(result);
    return result;
  }

  // -----------------------------------------------------------------------
  // Sync stream
  // -----------------------------------------------------------------------

  private async syncStream(cursor?: string): Promise<SyncResult> {
    const baseUrl = buildBaseUrl(this.subdomain);
    const url = cursor
      ? `${baseUrl}/sync/stream?cursor=${encodeURIComponent(cursor)}`
      : `${baseUrl}/sync/stream`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      API_CONFIG.syncStreamTimeout,
    );

    const touchedTables = new Set<string>();
    // Snapshot tracking for clockless (pivot) tables
    const activeSnapshots = new Map<string, Set<string>>();
    const cursorKey = this.cursorKey();
    let doneReceived = false;
    let needsResync = false;

    // Batching for wh_tasks (highest-volume table)
    const taskUpserts: Array<{ id: string; record: Record<string, unknown> }> = [];
    const taskDeletes: string[] = [];
    const BATCH_SIZE = 200;

    const flushTasks = async () => {
      if (taskUpserts.length > 0) {
        await DB.upsertRows(
          'wh_tasks',
          taskUpserts.splice(0, taskUpserts.length),
        );
        touchedTables.add('wh_tasks');
      }
      if (taskDeletes.length > 0) {
        await DB.deleteRows('wh_tasks', taskDeletes.splice(0, taskDeletes.length));
        touchedTables.add('wh_tasks');
      }
    };

    const handleLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let msg: any;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        return;
      }

      // meta
      if (msg.type === 'meta') {
        const requires = Array.isArray(msg.requires_resync)
          ? msg.requires_resync
          : [];
        if (requires.includes('visibility')) {
          needsResync = true;
        }
        return;
      }

      // checkpoint
      if (msg.type === 'checkpoint' && msg.cursor) {
        await DB.setMeta(cursorKey, msg.cursor);
        return;
      }

      // done
      if (msg.type === 'done' && msg.next_cursor) {
        await DB.setMeta(cursorKey, msg.next_cursor);
        doneReceived = true;
        return;
      }

      // snapshot_start (pivot tables sent in full)
      if (msg.type === 'snapshot_start' && msg.entity) {
        activeSnapshots.set(msg.entity, new Set());
        return;
      }

      // snapshot_end – delete local rows not in snapshot
      if (msg.type === 'snapshot_end' && msg.entity) {
        const snapshotIds = activeSnapshots.get(msg.entity);
        if (snapshotIds) {
          activeSnapshots.delete(msg.entity);
          try {
            const localIds = await DB.getAllIds(msg.entity);
            const toDelete = localIds.filter(
              (lid) => !snapshotIds.has(lid),
            );
            if (toDelete.length > 0) {
              await DB.deleteRows(msg.entity, toDelete);
              touchedTables.add(msg.entity);
            }
          } catch {}
        }
        return;
      }

      // upsert / delete
      const table: string | undefined = msg.entity;
      const id = msg.id;
      if (!table || id == null) return;

      // Track for active snapshot
      const snap = activeSnapshots.get(table);
      if (snap) snap.add(String(id));

      // Special batching for tasks
      if (table === 'wh_tasks') {
        if (msg.type === 'delete') {
          taskDeletes.push(String(id));
        } else if (msg.type === 'upsert') {
          const record = msg.record;
          if (record?.deleted_at) {
            taskDeletes.push(String(id));
          } else {
            taskUpserts.push({ id: String(id), record });
          }
        }
        if (taskUpserts.length + taskDeletes.length >= BATCH_SIZE) {
          await flushTasks();
        }
        return;
      }

      // Generic tables
      if (msg.type === 'delete') {
        await DB.deleteRow(table, id);
        touchedTables.add(table);
      } else if (msg.type === 'upsert') {
        await DB.upsertRow(table, id, msg.record);
        touchedTables.add(table);
      }
    };

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/x-ndjson, application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${this.authToken}`,
        },
        signal: controller.signal,
      });

      if (!resp.ok) {
        if (resp.status === 400) {
          // Server says our cursor is invalid; full resync
          await this.resetAndResync();
          return { success: true, touchedTables: [] };
        }
        throw new Error(`Sync stream failed: ${resp.status}`);
      }

      // React Native's fetch doesn't support ReadableStream (resp.body is null).
      // Use streaming if available, otherwise fall back to text parsing.
      if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            await handleLine(line);
          }
          if (doneReceived) {
            try { await reader.cancel(); } catch {}
            break;
          }
        }
        if (buffer.trim()) {
          await handleLine(buffer);
        }
      } else {
        // Fallback: read the entire body as text (non-streaming)
        const text = await resp.text();
        const lines = text.split('\n');
        for (const line of lines) {
          await handleLine(line);
        }
      }

      // Flush remaining task batches
      await flushTasks();

      if (needsResync) {
        await this.resetAndResync();
        return { success: true, touchedTables: [] };
      }

      return { success: true, touchedTables: Array.from(touchedTables) };
    } catch (err: any) {
      console.warn('DataManager: sync stream error', err);
      return {
        success: false,
        touchedTables: Array.from(touchedTables),
        error: err?.message ?? 'sync failed',
      };
    } finally {
      clearTimeout(timeout);
      try { controller.abort(); } catch {}
    }
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  private async resetAndResync(): Promise<void> {
    await DB.clearAllData();
    await DB.deleteMeta(this.cursorKey());
    await this.syncStream();
  }

  // -----------------------------------------------------------------------
  // Data accessors – read from SQLite cache
  // -----------------------------------------------------------------------

  /** Read all rows for a wh_* table from the local cache. */
  async getAll<T = Record<string, unknown>>(table: string): Promise<T[]> {
    return DB.getAllRows<T>(table);
  }

  /** Read a single row by id. */
  async getById<T = Record<string, unknown>>(
    table: string,
    id: string | number,
  ): Promise<T | null> {
    return DB.getRow<T>(table, id);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Authorization: `Bearer ${this.authToken}`,
    };
  }

  private cursorKey(): string {
    return `sync_cursor:${this.subdomain}`;
  }

  private lastSyncKey(): string {
    return `sync_last:${this.subdomain}`;
  }
}
