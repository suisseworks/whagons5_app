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
const DB_VERSION = 2;

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
  await db.execAsync(`DELETE FROM sync_data; DELETE FROM sync_meta;`);
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
  api_path: string;
  args: string;
  created_at: number;
  status: 'pending' | 'syncing' | 'failed';
}

/** Enqueue a mutation for later replay. */
export async function enqueueMutation(
  id: string,
  apiPath: string,
  args: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mutation_queue (id, api_path, args, created_at, status) VALUES (?, ?, ?, ?, 'pending')`,
    [id, apiPath, JSON.stringify(args), Date.now()],
  );
}

/** Get all pending mutations in FIFO order. */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedMutation>(
    `SELECT * FROM mutation_queue WHERE status = 'pending' ORDER BY created_at ASC`,
  );
}

/** Get total count of pending mutations. */
export async function getPendingMutationCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM mutation_queue WHERE status IN ('pending', 'syncing')`,
  );
  return row?.cnt ?? 0;
}

/** Mark a mutation as syncing. */
export async function markMutationSyncing(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE mutation_queue SET status = 'syncing' WHERE id = ?`,
    [id],
  );
}

/** Mark a mutation as failed. */
export async function markMutationFailed(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE mutation_queue SET status = 'failed' WHERE id = ?`,
    [id],
  );
}

/** Remove a mutation from the queue (on success). */
export async function removeMutation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM mutation_queue WHERE id = ?`, [id]);
}

/** Clear all mutations (e.g. on logout). */
export async function clearMutationQueue(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM mutation_queue`);
}
