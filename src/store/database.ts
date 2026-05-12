/**
 * SQLite database wrapper for the Whagons mobile app.
 *
 * Mirrors the role of IndexedDB in the web client: stores synced
 * data locally so the app can render immediately from cache and
 * only hit the network for delta sync.
 *
 * Each synced wh_* table gets a generic key-value store:
 *   sync_data(table TEXT, id TEXT, data TEXT, PRIMARY KEY(table, id))
 *
 * We also store sync metadata (cursor, last-sync timestamp) in a
 * separate sync_meta table.
 */

import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'whagons_sync.db';
const DB_VERSION = 5;

let _db: SQLiteDatabase | null = null;

async function getDb(): Promise<SQLiteDatabase> {
  if (_db) return _db;
  _db = await openDatabaseAsync(DB_NAME);
  await migrate(_db);
  return _db;
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_data (
        tbl   TEXT    NOT NULL,
        id    TEXT    NOT NULL,
        data  TEXT    NOT NULL,
        PRIMARY KEY (tbl, id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_data_tbl ON sync_data(tbl);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mutation_queue (
        id          TEXT    PRIMARY KEY,
        api_path    TEXT    NOT NULL,
        args        TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        status      TEXT    NOT NULL DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_mutation_queue_status
        ON mutation_queue(status, created_at);
    `);
  }

  if (currentVersion < 3) {
    const columns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info('mutation_queue')`,
    );
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has('tenant_id')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN tenant_id TEXT;`);
    }
    if (!columnNames.has('attempts')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!columnNames.has('last_error')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN last_error TEXT;`);
    }
    if (!columnNames.has('next_retry_at')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!columnNames.has('updated_at')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;`);
    }

    await db.execAsync(`
      UPDATE mutation_queue
      SET updated_at = CASE
        WHEN updated_at = 0 THEN created_at
        ELSE updated_at
      END;

      CREATE INDEX IF NOT EXISTS idx_mutation_queue_tenant_status_retry
        ON mutation_queue(tenant_id, status, next_retry_at, created_at);
    `);
  }

  if (currentVersion < 4) {
    const columns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info('mutation_queue')`,
    );
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has('action_at')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN action_at INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!columnNames.has('pushed_at')) {
      await db.execAsync(`ALTER TABLE mutation_queue ADD COLUMN pushed_at INTEGER NOT NULL DEFAULT 0;`);
    }

    await db.execAsync(`
      UPDATE mutation_queue
      SET action_at = CASE
        WHEN action_at = 0 THEN created_at
        ELSE action_at
      END,
          pushed_at = CASE
            WHEN pushed_at IS NULL THEN 0
            ELSE pushed_at
          END;

      CREATE INDEX IF NOT EXISTS idx_mutation_queue_tenant_status_action
        ON mutation_queue(tenant_id, status, action_at, created_at);

      CREATE TABLE IF NOT EXISTS mutation_history (
        id           TEXT    PRIMARY KEY,
        tenant_id    TEXT,
        api_path     TEXT    NOT NULL,
        args         TEXT    NOT NULL,
        action_at    INTEGER NOT NULL,
        queued_at    INTEGER NOT NULL,
        pushed_at    INTEGER NOT NULL DEFAULT 0,
        outcome      TEXT    NOT NULL,
        attempts     INTEGER NOT NULL DEFAULT 0,
        last_error   TEXT,
        archived_at  INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mutation_history_tenant_action
        ON mutation_history(tenant_id, action_at DESC, archived_at DESC);
    `);
  }

  if (currentVersion < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS task_cache (
        id          TEXT PRIMARY KEY,
        workspace_id TEXT,
        status_name  TEXT,
        status_id    TEXT,
        sort_id      INTEGER NOT NULL DEFAULT 0,
        deleted_at   TEXT,
        data         TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_cache_status_sort
        ON task_cache(status_name, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspace_status_sort
        ON task_cache(workspace_id, status_name, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspace_sort
        ON task_cache(workspace_id, sort_id DESC);
    `);
  }

  if (currentVersion < DB_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DB_VERSION};`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialise (open + migrate) the database. Safe to call multiple times. */
export async function initDb(): Promise<void> {
  await getDb();
}

/** Close the database (e.g. on logout). */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}

// ---- sync_data helpers ---------------------------------------------------

/**
 * Upsert a single record into the local cache.
 * `record` is the raw JSON object from the sync stream.
 */
export async function upsertRow(
  table: string,
  id: string | number,
  record: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_data (tbl, id, data) VALUES (?, ?, ?)`,
    [table, String(id), JSON.stringify(record)],
  );
}

/** Upsert many rows in a single transaction. */
export async function upsertRows(
  table: string,
  rows: Array<{ id: string | number; record: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_data (tbl, id, data) VALUES (?, ?, ?)`,
        [table, String(row.id), JSON.stringify(row.record)],
      );
    }
  });
}

/** Delete a single row from the cache. */
export async function deleteRow(
  table: string,
  id: string | number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM sync_data WHERE tbl = ? AND id = ?`,
    [table, String(id)],
  );
}

/** Delete many rows in a single transaction. */
export async function deleteRows(
  table: string,
  ids: Array<string | number>,
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync(
        `DELETE FROM sync_data WHERE tbl = ? AND id = ?`,
        [table, String(id)],
      );
    }
  });
}

/** Get all rows for a given table. Returns parsed JSON objects. */
export async function getAllRows<T = Record<string, unknown>>(
  table: string,
): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM sync_data WHERE tbl = ?`,
    [table],
  );
  return rows.map((r) => JSON.parse(r.data) as T);
}

/** Get a single row by table + id. */
export async function getRow<T = Record<string, unknown>>(
  table: string,
  id: string | number,
): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>(
    `SELECT data FROM sync_data WHERE tbl = ? AND id = ?`,
    [table, String(id)],
  );
  return row ? (JSON.parse(row.data) as T) : null;
}

/** Get all IDs stored for a given table. */
export async function getAllIds(table: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM sync_data WHERE tbl = ?`,
    [table],
  );
  return rows.map((r) => r.id);
}

/** Delete all rows for a given table (used for snapshot replace). */
export async function clearTable(table: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_data WHERE tbl = ?`, [table]);
}

/** Drop all synced data (used on logout or forced resync). */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`DELETE FROM sync_data; DELETE FROM sync_meta; DELETE FROM task_cache; DELETE FROM mutation_queue; DELETE FROM mutation_history;`);
}

/** Get count of rows for a given table. */
export async function getRowCount(table: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM sync_data WHERE tbl = ?`,
    [table],
  );
  return row?.cnt ?? 0;
}

// ---- indexed task cache helpers ------------------------------------------

export interface CachedTaskRecord {
  id?: string | number;
  status?: string | null;
  status_id?: string | number | null;
  workspace_id?: string | number | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface TaskCacheQuery {
  workspaceId?: string | number | null;
  statuses?: string[];
  limit: number;
  offset?: number;
}

function numericSortId(id: unknown): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

export async function upsertTaskCacheRows(rows: CachedTaskRecord[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      if (row.id == null) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO task_cache
          (id, workspace_id, status_name, status_id, sort_id, deleted_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          row.workspace_id == null ? null : String(row.workspace_id),
          row.status == null ? null : String(row.status),
          row.status_id == null ? null : String(row.status_id),
          numericSortId(row.id),
          row.deleted_at == null ? null : String(row.deleted_at),
          JSON.stringify(row),
        ],
      );
    }
  });
}

export async function queryTaskCache<T = CachedTaskRecord>({
  workspaceId,
  statuses,
  limit,
  offset = 0,
}: TaskCacheQuery): Promise<{ rows: T[]; total: number }> {
  const db = await getDb();
  const where: string[] = [`(deleted_at IS NULL OR deleted_at = '')`];
  const params: unknown[] = [];

  if (workspaceId != null) {
    where.push(`workspace_id = ?`);
    params.push(String(workspaceId));
  }

  if (statuses && statuses.length > 0) {
    where.push(`status_name IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const countRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM task_cache ${whereSql}`,
    params as any[],
  );
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM task_cache ${whereSql} ORDER BY sort_id DESC LIMIT ? OFFSET ?`,
    [...params, Math.max(1, Math.trunc(limit)), Math.max(0, Math.trunc(offset))] as any[],
  );

  return {
    total: countRow?.cnt ?? 0,
    rows: rows.map((row) => JSON.parse(row.data) as T),
  };
}

// ---- sync_meta helpers ---------------------------------------------------

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = ?`,
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`,
    [key, value],
  );
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_meta WHERE key = ?`, [key]);
}

// ---- mutation_queue helpers -----------------------------------------------

export interface QueuedMutation {
  id: string;
  tenant_id: string | null;
  api_path: string;
  args: string;
  action_at: number;
  created_at: number;
  updated_at: number;
  pushed_at: number;
  attempts: number;
  next_retry_at: number;
  last_error: string | null;
  status: 'pending' | 'syncing' | 'failed';
}

export interface MutationHistoryEntry {
  id: string;
  tenant_id: string | null;
  api_path: string;
  args: string;
  action_at: number;
  queued_at: number;
  pushed_at: number;
  outcome: 'synced' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  archived_at: number;
}

/** Enqueue a mutation for later replay. */
export async function enqueueMutation(
  id: string,
  apiPath: string,
  args: Record<string, unknown>,
  tenantId?: string | null,
  actionAt?: number,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const normalizedActionAt = Number.isFinite(actionAt ?? NaN)
    ? Math.max(0, Math.trunc(actionAt as number))
    : now;
  await db.runAsync(
    `INSERT INTO mutation_queue (id, tenant_id, api_path, args, action_at, created_at, updated_at, pushed_at, attempts, next_retry_at, last_error, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 'pending')`,
    [id, tenantId ?? null, apiPath, JSON.stringify(args), normalizedActionAt, now, now],
  );
}

/** Get all pending mutations in FIFO order. */
export async function getPendingMutations(tenantId?: string | null): Promise<QueuedMutation[]> {
  const db = await getDb();
  if (tenantId) {
    return db.getAllAsync<QueuedMutation>(
      `SELECT * FROM mutation_queue
       WHERE tenant_id = ? AND status = 'pending'
       ORDER BY action_at ASC, created_at ASC`,
      [tenantId],
    );
  }
  return db.getAllAsync<QueuedMutation>(
    `SELECT * FROM mutation_queue WHERE status = 'pending' ORDER BY action_at ASC, created_at ASC`,
  );
}

/** Get replayable (pending + due) mutations in FIFO order. */
export async function getReplayableMutations(tenantId?: string | null): Promise<QueuedMutation[]> {
  const db = await getDb();
  const now = Date.now();
  if (tenantId) {
    return db.getAllAsync<QueuedMutation>(
      `SELECT * FROM mutation_queue
       WHERE tenant_id = ?
         AND status = 'pending'
         AND (next_retry_at IS NULL OR next_retry_at = 0 OR next_retry_at <= ?)
       ORDER BY action_at ASC, created_at ASC`,
      [tenantId, now],
    );
  }
  return db.getAllAsync<QueuedMutation>(
    `SELECT * FROM mutation_queue
     WHERE status = 'pending'
       AND (next_retry_at IS NULL OR next_retry_at = 0 OR next_retry_at <= ?)
     ORDER BY action_at ASC, created_at ASC`,
    [now],
  );
}

/** Get all queue entries for inspection (pending/syncing/failed). */
export async function getQueuedMutations(tenantId?: string | null): Promise<QueuedMutation[]> {
  const db = await getDb();
  if (tenantId) {
    return db.getAllAsync<QueuedMutation>(
      `SELECT * FROM mutation_queue WHERE tenant_id = ? ORDER BY action_at ASC, created_at ASC`,
      [tenantId],
    );
  }
  return db.getAllAsync<QueuedMutation>(
    `SELECT * FROM mutation_queue ORDER BY action_at ASC, created_at ASC`,
  );
}

/** Get total count of pending mutations. */
export async function getPendingMutationCount(tenantId?: string | null): Promise<number> {
  const db = await getDb();
  if (tenantId) {
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt
       FROM mutation_queue
       WHERE tenant_id = ?
         AND status IN ('pending', 'syncing', 'failed')`,
      [tenantId],
    );
    return row?.cnt ?? 0;
  }
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM mutation_queue WHERE status IN ('pending', 'syncing', 'failed')`,
  );
  return row?.cnt ?? 0;
}

/** Mark a mutation as syncing. */
export async function markMutationSyncing(id: string, attempts: number): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE mutation_queue
     SET status = 'syncing', attempts = ?, last_error = NULL, next_retry_at = 0, updated_at = ?, pushed_at = CASE WHEN pushed_at = 0 THEN ? ELSE pushed_at END
     WHERE id = ?`,
    [attempts, now, now, id],
  );
}

/** Keep a failed replay attempt pending for future retries. */
export async function markMutationPendingRetry(
  id: string,
  attempts: number,
  nextRetryAt: number,
  errorMessage: string,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE mutation_queue
     SET status = 'pending', attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [attempts, nextRetryAt, errorMessage, now, id],
  );
}

/** Mark a mutation as permanently failed. */
export async function markMutationFailed(
  id: string,
  attempts: number,
  errorMessage: string,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE mutation_queue
     SET status = 'failed', attempts = ?, next_retry_at = 0, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [attempts, errorMessage, now, id],
  );
}

/** Persist a completed/failed mutation with action + push timestamps. */
export async function archiveMutation(
  mutation: QueuedMutation,
  outcome: 'synced' | 'failed' | 'skipped',
  pushedAt?: number,
  errorMessage?: string | null,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const normalizedPushedAt = Number.isFinite(pushedAt ?? NaN)
    ? Math.max(0, Math.trunc(pushedAt as number))
    : (mutation.pushed_at ?? 0);
  const normalizedActionAt = mutation.action_at && mutation.action_at > 0
    ? mutation.action_at
    : mutation.created_at;

  await db.runAsync(
    `INSERT OR REPLACE INTO mutation_history
      (id, tenant_id, api_path, args, action_at, queued_at, pushed_at, outcome, attempts, last_error, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mutation.id,
      mutation.tenant_id ?? null,
      mutation.api_path,
      mutation.args,
      normalizedActionAt,
      mutation.created_at,
      normalizedPushedAt,
      outcome,
      mutation.attempts ?? 0,
      errorMessage ?? mutation.last_error ?? null,
      now,
    ],
  );
}

/** Read archived mutations for audit/debugging. */
export async function getMutationHistory(tenantId?: string | null): Promise<MutationHistoryEntry[]> {
  const db = await getDb();
  if (tenantId) {
    return db.getAllAsync<MutationHistoryEntry>(
      `SELECT * FROM mutation_history WHERE tenant_id = ? ORDER BY action_at DESC, archived_at DESC`,
      [tenantId],
    );
  }
  return db.getAllAsync<MutationHistoryEntry>(
    `SELECT * FROM mutation_history ORDER BY action_at DESC, archived_at DESC`,
  );
}

/** Recover rows left in syncing state (e.g. app killed mid-replay). */
export async function resetSyncingMutations(tenantId?: string | null): Promise<void> {
  const db = await getDb();
  if (tenantId) {
    await db.runAsync(
      `UPDATE mutation_queue
       SET status = 'pending', next_retry_at = 0
       WHERE tenant_id = ? AND status = 'syncing'`,
      [tenantId],
    );
    return;
  }
  await db.runAsync(
    `UPDATE mutation_queue
     SET status = 'pending', next_retry_at = 0
     WHERE status = 'syncing'`,
  );
}

/** Remove a mutation from the queue (on success). */
export async function removeMutation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM mutation_queue WHERE id = ?`, [id]);
}

/** Clear all mutations (e.g. on logout). */
export async function clearMutationQueue(tenantId?: string | null): Promise<void> {
  const db = await getDb();
  if (tenantId) {
    await db.runAsync(`DELETE FROM mutation_queue WHERE tenant_id = ?`, [tenantId]);
    return;
  }
  await db.runAsync(`DELETE FROM mutation_queue`);
}
