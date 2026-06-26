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
const DB_VERSION = 8;

/**
 * Single-flight promise for the ONE shared connection (open + migrate).
 * Every caller awaits the SAME promise, so the same database file is never
 * opened twice. This is the whole fix: concurrent opens create multiple
 * SQLiteDatabase instances for one file, and those are what caused both the
 * Android `prepareAsync` NullPointerException storm AND the use-after-free
 * SIGSEGV in libexpo-sqlite (a prepared statement finalized on one thread
 * while bound/read on another). With a single instance, expo-sqlite
 * serializes all access internally and stays safe.
 *
 * We deliberately do NOT reopen-on-error or closeAsync() a live handle:
 * closing finalizes prepared statements out from under in-flight queries,
 * which is exactly the native crash we hit. A dead handle only really
 * happens on a dev Fast Refresh, surfaces as a catchable JS error that
 * callers already handle, and clears on the next full app start.
 */
let _dbPromise: Promise<SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DB_NAME);
  await migrate(db);
  return db;
}

function getRaw(): Promise<SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = openAndMigrate().catch((err) => {
      _dbPromise = null; // let the next caller retry a failed open
      throw err;
    });
  }
  return _dbPromise;
}

async function exec<T>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  return fn(await getRaw());
}

/**
 * Facade over the SQLiteDatabase methods used in this module, each routed
 * through exec() so a dead native handle self-heals transparently.
 */
const dbFacade = {
  runAsync: (...args: any[]) => exec((db) => (db.runAsync as any)(...args)),
  getAllAsync: (...args: any[]) => exec((db) => (db.getAllAsync as any)(...args)),
  getFirstAsync: (...args: any[]) => exec((db) => (db.getFirstAsync as any)(...args)),
  execAsync: (...args: any[]) => exec((db) => (db.execAsync as any)(...args)),
  withTransactionAsync: (task: any) => exec((db) => db.withTransactionAsync(task)),
} as unknown as SQLiteDatabase;

async function getDb(): Promise<SQLiteDatabase> {
  return dbFacade;
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

  if (currentVersion < 6) {
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
    `);

    const columns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info('task_cache')`,
    );
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has('tenant_id')) {
      await db.execAsync(`ALTER TABLE task_cache ADD COLUMN tenant_id TEXT;`);
    }
    if (!columnNames.has('bucket')) {
      await db.execAsync(`ALTER TABLE task_cache ADD COLUMN bucket TEXT NOT NULL DEFAULT 'live';`);
    }
    if (!columnNames.has('finished_at')) {
      await db.execAsync(`ALTER TABLE task_cache ADD COLUMN finished_at INTEGER;`);
    }
    if (!columnNames.has('updated_at')) {
      await db.execAsync(`ALTER TABLE task_cache ADD COLUMN updated_at INTEGER;`);
    }
    if (!columnNames.has('search_text')) {
      await db.execAsync(`ALTER TABLE task_cache ADD COLUMN search_text TEXT;`);
    }

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_bucket_sort
        ON task_cache(tenant_id, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_workspace_bucket_sort
        ON task_cache(tenant_id, workspace_id, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_status_bucket_sort
        ON task_cache(tenant_id, status_name, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_finished
        ON task_cache(tenant_id, finished_at DESC);
    `);
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS task_cache_workspaces (
        task_id       TEXT NOT NULL,
        tenant_id     TEXT,
        bucket        TEXT NOT NULL DEFAULT 'live',
        workspace_key TEXT NOT NULL,
        PRIMARY KEY(task_id, workspace_key)
      );

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspaces_lookup
        ON task_cache_workspaces(tenant_id, workspace_key, bucket, task_id);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspaces_task
        ON task_cache_workspaces(task_id);
    `);
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS task_cache_v8 (
        id           TEXT NOT NULL,
        tenant_id    TEXT NOT NULL DEFAULT '',
        bucket       TEXT NOT NULL DEFAULT 'live',
        workspace_id TEXT,
        status_name  TEXT,
        status_id    TEXT,
        sort_id      INTEGER NOT NULL DEFAULT 0,
        finished_at  INTEGER,
        updated_at   INTEGER,
        search_text  TEXT,
        deleted_at   TEXT,
        data         TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id, bucket)
      );

      INSERT OR REPLACE INTO task_cache_v8
        (id, tenant_id, bucket, workspace_id, status_name, status_id, sort_id, finished_at, updated_at, search_text, deleted_at, data)
      SELECT
        id,
        COALESCE(tenant_id, ''),
        COALESCE(bucket, 'live'),
        workspace_id,
        status_name,
        status_id,
        sort_id,
        finished_at,
        updated_at,
        search_text,
        deleted_at,
        data
      FROM task_cache;

      DROP TABLE task_cache;
      ALTER TABLE task_cache_v8 RENAME TO task_cache;

      CREATE INDEX IF NOT EXISTS idx_task_cache_status_sort
        ON task_cache(status_name, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspace_status_sort
        ON task_cache(workspace_id, status_name, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspace_sort
        ON task_cache(workspace_id, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_bucket_sort
        ON task_cache(tenant_id, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_workspace_bucket_sort
        ON task_cache(tenant_id, workspace_id, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_status_bucket_sort
        ON task_cache(tenant_id, status_name, bucket, sort_id DESC);

      CREATE INDEX IF NOT EXISTS idx_task_cache_tenant_finished
        ON task_cache(tenant_id, finished_at DESC);

      CREATE TABLE IF NOT EXISTS task_cache_workspaces_v8 (
        task_id       TEXT NOT NULL,
        tenant_id     TEXT NOT NULL DEFAULT '',
        bucket        TEXT NOT NULL DEFAULT 'live',
        workspace_key TEXT NOT NULL,
        PRIMARY KEY(tenant_id, bucket, task_id, workspace_key)
      );

      INSERT OR REPLACE INTO task_cache_workspaces_v8
        (task_id, tenant_id, bucket, workspace_key)
      SELECT
        task_id,
        COALESCE(tenant_id, ''),
        COALESCE(bucket, 'live'),
        workspace_key
      FROM task_cache_workspaces;

      DROP TABLE task_cache_workspaces;
      ALTER TABLE task_cache_workspaces_v8 RENAME TO task_cache_workspaces;

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspaces_lookup
        ON task_cache_workspaces(tenant_id, workspace_key, bucket, task_id);

      CREATE INDEX IF NOT EXISTS idx_task_cache_workspaces_task
        ON task_cache_workspaces(tenant_id, bucket, task_id);
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
  await getRaw();
}

/** Close the database (e.g. on logout). */
export async function closeDb(): Promise<void> {
  const stale = _dbPromise;
  _dbPromise = null;
  if (stale) {
    try {
      const db = await stale;
      await db.closeAsync();
    } catch {
      // already dead/closed — nothing to release
    }
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
  await db.execAsync(`DELETE FROM sync_data; DELETE FROM sync_meta; DELETE FROM task_cache; DELETE FROM task_cache_workspaces; DELETE FROM mutation_queue; DELETE FROM mutation_history;`);
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
  tenant_id?: string | null;
  tenantId?: string | null;
  bucket?: TaskCacheBucket;
  status?: string | null;
  status_id?: string | number | null;
  workspace_id?: string | number | null;
  workspaceId?: string | number | null;
  source_workspace_id?: string | number | null;
  sourceWorkspaceId?: string | number | null;
  active_workspace_context?: any;
  activeWorkspaceContext?: any;
  workspace_contexts?: any;
  workspaceContexts?: any;
  completed_at?: string | number | null;
  completedAt?: string | number | null;
  updated_at?: string | number | null;
  updatedAt?: string | number | null;
  search_text?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

export type TaskCacheBucket = 'live' | 'archive';

export interface TaskCacheQuery {
  tenantId?: string | null;
  buckets?: TaskCacheBucket[];
  workspaceId?: string | number | null;
  statuses?: string[];
  excludeStatuses?: string[];
  recentFinishedStatuses?: string[];
  recentFinishedSince?: number | null;
  search?: string;
  limit: number;
  offset?: number;
}

export interface TaskCacheSummaryQuery {
  tenantId?: string | null;
  buckets?: TaskCacheBucket[];
  workspaceId?: string | number | null;
  statuses?: string[];
  excludeStatuses?: string[];
  recentFinishedStatuses?: string[];
  recentFinishedSince?: number | null;
  search?: string;
}

export interface TaskCacheSummary {
  total: number;
  byWorkspace: Record<string, number>;
  byStatus: Record<string, { name: string; count: number }>;
}

export interface TaskCacheWriteOptions {
  tenantId?: string | null;
  bucket?: TaskCacheBucket;
}

function numericSortId(id: unknown): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

function readEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTaskSearchText(row: CachedTaskRecord): string {
  if (typeof row.search_text === 'string' && row.search_text.trim().length > 0) {
    return row.search_text.toLowerCase();
  }

  const values = [
    row.id,
    row.name,
    row.description,
    row.status,
    row.status_id,
    row.workspace_id,
    row.spot_id,
    row.spot,
    row.priority,
  ];

  return values
    .filter((value) => value != null && value !== '')
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function normalizeTaskTenantId(value: string | null | undefined): string {
  return value ?? '';
}

function resolveTaskTenantId(row: CachedTaskRecord, options?: TaskCacheWriteOptions): string {
  return normalizeTaskTenantId(options?.tenantId ?? row.tenant_id ?? row.tenantId ?? null);
}

function resolveTaskBucket(row: CachedTaskRecord, options?: TaskCacheWriteOptions): TaskCacheBucket {
  const candidate = options?.bucket ?? row.bucket;
  return candidate === 'archive' ? 'archive' : 'live';
}

function readTaskWorkspaceKeys(row: CachedTaskRecord): string[] {
  const keys = new Set<string>();
  const addKey = (value: unknown) => {
    if (value != null && value !== '') keys.add(String(value));
  };

  const activeContext = row.activeWorkspaceContext ?? row.active_workspace_context ?? null;
  const activeContextKind = String(activeContext?.kind ?? '').toLowerCase();
  const isActionContext = activeContextKind === 'approval' || activeContextKind === 'acknowledgment';

  if (!isActionContext) {
    addKey(row.workspace_id);
    addKey(row.workspaceId);
    addKey(row.source_workspace_id);
    addKey(row.sourceWorkspaceId);
  }

  addKey(activeContext?.workspaceId);
  addKey(activeContext?.workspace_id);

  const contexts = row.workspaceContexts ?? row.workspace_contexts ?? [];
  if (Array.isArray(contexts)) {
    for (const context of contexts) {
      addKey(context?.workspaceId);
      addKey(context?.workspace_id);
    }
  }

  return [...keys];
}

async function writeTaskCacheRows(
  db: SQLiteDatabase,
  rows: CachedTaskRecord[],
  options?: TaskCacheWriteOptions,
): Promise<void> {
  for (const row of rows) {
    if (row.id == null) continue;
    const rowId = String(row.id);
    const tenantId = resolveTaskTenantId(row, options);
    const bucket = resolveTaskBucket(row, options);
    const finishedAt = readEpochMs(row.completed_at ?? row.completedAt);
    const updatedAt = readEpochMs(row.updated_at ?? row.updatedAt);
    await db.runAsync(
      `INSERT OR REPLACE INTO task_cache
        (id, tenant_id, bucket, workspace_id, status_name, status_id, sort_id, finished_at, updated_at, search_text, deleted_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rowId,
        tenantId,
        bucket,
        row.workspace_id == null ? null : String(row.workspace_id),
        row.status == null ? null : String(row.status),
        row.status_id == null ? null : String(row.status_id),
        numericSortId(row.id),
        finishedAt,
        updatedAt,
        normalizeTaskSearchText(row),
        row.deleted_at == null ? null : String(row.deleted_at),
        JSON.stringify({ ...row, tenant_id: tenantId, bucket }),
      ],
    );
    await db.runAsync(
      `DELETE FROM task_cache_workspaces WHERE tenant_id = ? AND bucket = ? AND task_id = ?`,
      [tenantId, bucket, rowId],
    );
    for (const workspaceKey of readTaskWorkspaceKeys(row)) {
      await db.runAsync(
        `INSERT OR REPLACE INTO task_cache_workspaces
          (task_id, tenant_id, bucket, workspace_key)
         VALUES (?, ?, ?, ?)`,
        [rowId, tenantId, bucket, workspaceKey],
      );
    }
  }
}

export async function upsertTaskCacheRows(rows: CachedTaskRecord[], options?: TaskCacheWriteOptions): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await writeTaskCacheRows(db, rows, options);
  });
}

export async function replaceTaskCacheBucketRows(rows: CachedTaskRecord[], options: TaskCacheWriteOptions & { bucket: TaskCacheBucket }): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM task_cache WHERE tenant_id = ? AND bucket = ?`,
      [normalizeTaskTenantId(options.tenantId), options.bucket],
    );
    await db.runAsync(
      `DELETE FROM task_cache_workspaces WHERE tenant_id = ? AND bucket = ?`,
      [normalizeTaskTenantId(options.tenantId), options.bucket],
    );
    await writeTaskCacheRows(db, rows, options);
  });
}

function buildTaskCacheWhere({
  tenantId,
  buckets,
  workspaceId,
  statuses,
  excludeStatuses,
  recentFinishedStatuses,
  recentFinishedSince,
  search,
}: TaskCacheSummaryQuery): { whereSql: string; params: unknown[] } {
  const where: string[] = [`(task_cache.deleted_at IS NULL OR task_cache.deleted_at = '')`];
  const params: unknown[] = [];

  if (tenantId) {
    where.push(`task_cache.tenant_id = ?`);
    params.push(normalizeTaskTenantId(tenantId));
  }

  if (buckets && buckets.length > 0) {
    where.push(`task_cache.bucket IN (${buckets.map(() => '?').join(', ')})`);
    params.push(...buckets);
  }

  if (workspaceId != null) {
    where.push(`(
      EXISTS (
        SELECT 1
          FROM task_cache_workspaces tcw_filter
         WHERE tcw_filter.task_id = task_cache.id
           AND tcw_filter.tenant_id = task_cache.tenant_id
           AND tcw_filter.bucket = task_cache.bucket
           AND tcw_filter.workspace_key = ?
      )
      OR (
        task_cache.workspace_id = ?
        AND NOT EXISTS (
          SELECT 1
           FROM task_cache_workspaces tcw_any
           WHERE tcw_any.task_id = task_cache.id
             AND tcw_any.tenant_id = task_cache.tenant_id
             AND tcw_any.bucket = task_cache.bucket
        )
      )
    )`);
    params.push(String(workspaceId), String(workspaceId));
  }

  if (statuses && statuses.length > 0) {
    where.push(`task_cache.status_name IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }

  if (excludeStatuses && excludeStatuses.length > 0) {
    where.push(`(task_cache.status_name IS NULL OR task_cache.status_name NOT IN (${excludeStatuses.map(() => '?').join(', ')}))`);
    params.push(...excludeStatuses);
  }

  if (recentFinishedStatuses && recentFinishedStatuses.length > 0 && Number.isFinite(recentFinishedSince ?? NaN)) {
    where.push(`(
      task_cache.status_name IS NULL
      OR task_cache.status_name NOT IN (${recentFinishedStatuses.map(() => '?').join(', ')})
      OR (task_cache.finished_at IS NOT NULL AND task_cache.finished_at >= ?)
    )`);
    params.push(...recentFinishedStatuses, recentFinishedSince);
  }

  const terms = (search ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((term) => (/^#\d+$/.test(term) ? term.slice(1) : term))
    .filter(Boolean);
  for (const term of terms) {
    where.push(`task_cache.search_text LIKE ?`);
    params.push(`%${term}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, params };
}

export async function queryTaskCache<T = CachedTaskRecord>({
  limit,
  offset = 0,
  ...filters
}: TaskCacheQuery): Promise<{ rows: T[]; total: number }> {
  const db = await getDb();
  const { whereSql, params } = buildTaskCacheWhere(filters);
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

export async function queryTaskCacheSummary(filters: TaskCacheSummaryQuery): Promise<TaskCacheSummary> {
  const db = await getDb();
  const { whereSql, params } = buildTaskCacheWhere(filters);
  const countRow = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM task_cache ${whereSql}`,
    params as any[],
  );
  const workspaceKeyExpr = `COALESCE(tcw.workspace_key, task_cache.workspace_id)`;
  const workspaceWhereSql = whereSql
    ? `${whereSql} AND ${workspaceKeyExpr} IS NOT NULL AND ${workspaceKeyExpr} != ''`
    : `WHERE ${workspaceKeyExpr} IS NOT NULL AND ${workspaceKeyExpr} != ''`;
  const workspaceRows = await db.getAllAsync<{ workspace_key: string | null; cnt: number }>(
    `SELECT ${workspaceKeyExpr} as workspace_key, COUNT(DISTINCT task_cache.id) as cnt
       FROM task_cache
       LEFT JOIN task_cache_workspaces tcw
         ON tcw.task_id = task_cache.id
        AND tcw.tenant_id = task_cache.tenant_id
        AND tcw.bucket = task_cache.bucket
       ${workspaceWhereSql}
       GROUP BY workspace_key`,
    params as any[],
  );
  const statusRows = await db.getAllAsync<{ status_name: string | null; cnt: number }>(
    `SELECT status_name, COUNT(*) as cnt
       FROM task_cache
       ${whereSql}
       GROUP BY status_name`,
    params as any[],
  );

  const byWorkspace: Record<string, number> = {};
  for (const row of workspaceRows) {
    if (!row.workspace_key) continue;
    byWorkspace[String(row.workspace_key)] = row.cnt;
  }

  const byStatus: Record<string, { name: string; count: number }> = {};
  for (const row of statusRows) {
    if (!row.status_name) continue;
    byStatus[row.status_name] = { name: row.status_name, count: row.cnt };
  }

  return {
    total: countRow?.cnt ?? 0,
    byWorkspace,
    byStatus,
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
