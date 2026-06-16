# Task Loading Consolidation — Architecture Plan

Status: **Phases 1–3 done; Phase 4 dead-code purge done; Phase 4 module-split deferred.**
`TaskContext.tsx` is down from 3,170 → 2,869 lines. All changes typecheck clean (no runtime
verification — Expo app can't be run in this environment; verify on device).

## Counts: server is the source of truth, SQLite is a cache (current design)

Counts must reflect the **real, visibility-scoped total** of every task the user may view for the
current view/filter — e.g. "Everything" + finished-off = all non-finished tasks across their
workspaces/spots, not just what is loaded locally. So the **server** (`api.bulk.taskSummaryCounts`)
is the source of truth; **SQLite is only a fast/offline cache**.

Resolution order per count (sidebar / workspace / status pills / totals), **cache-then-server**:

1. **Server (truth)** — two reactive `taskSummaryCounts` queries: all-workspaces (sidebar
   `byWorkspace` + "Everything" totals) and workspace-scoped (status pills + current view total),
   `mode = hot|all` from the finished toggle. The selected workspace's sidebar entry is overridden
   with its scoped total so sidebar = pills sum = header for the active workspace. For "Everything"
   it's a single query, so sidebar = pills = total are consistent by construction.
2. **SQLite cache (fast/offline)** — `queryTaskCacheSummary` over the same cache+filters as the list;
   used instantly on cold reload and while offline, until the server responds. Guarded so an empty
   cache result falls back rather than pinning counts to zero.
3. **In-memory** — last resort; also used for "Shared" and active text search (the server query has
   no search term).

Counts respect the finished toggle. All sidebar / workspace / pill / total counts come from
`taskSummaryCounts` with `mode = hot|all` from the toggle; the exact path filters by mode **before**
counting, so with finished-off every count (incl. `byWorkspace`) is the **non-finished** total.

Known server-side limits (backend follow-ups for fully-real counts at scale):
- `taskSummaryCounts` exact-count cap (`MAX_EXACT_COUNT_TASKS` / `MAX_EXACT_MODE_COUNT_TASKS`) **raised
  500 → 2000**.
- **Non-finished ("hot") counts now scan only the active statuses** (`by_status` index) instead of
  every task, so they're bounded by *active work*, not total history. This is the key fix: finished
  tasks accumulate forever, so the old "scan all tasks then filter" path forced the mode-blind
  materialized fallback (and the wrong "34") for any mature tenant. Now a tenant can have unlimited
  finished tasks and still get exact non-finished counts as long as it has ≤2000 *active* tasks.
- **Materialized path now also returns `byStatus`** (it used to be empty, which is why the finished-on
  pills showed the loaded "512" while the sidebar correctly showed ~4942). It scans tasks by status
  with workspace-level visibility — mode-aware (finished excluded when off) — capped at
  `MAX_MATERIALIZED_BYSTATUS_SCAN = 8000` reads. Past the cap it returns empty `byStatus` and the
  client falls back to its cache, so the query never exceeds Convex's read limit. This covers
  finished-on pills for tenants up to ~8000 total tasks.
- Remaining fallbacks: a single workspace with >2000 tasks, or a tenant with >8000 total tasks (for
  finished-on pills). Both degrade to cache-based pills, not a crash.
- All of the above are **Convex backend changes — require a deploy** to take effect.
- True unbounded fix (still TODO): a mode-aware per-status rollup table (maintained on task
  create/delete/status-change), giving O(1) per-status counts at any scale.
- True scale fix (still TODO): maintain a server-side per-status rollup table — mirror the existing
  `workspaceTaskCounts` rollup (`_helpers/workspaceTaskCounts.ts`) with a
  `(tenantId, workspaceId, statusId) → count`, updated on task create / delete / **status-change**,
  read by `materializedTaskSummaryCounts` for `byStatus`. Risk: every status-mutation site must update
  it or the count drifts — needs runtime testing.
- The materialized `workspaceTaskCounts` table may not be mode-aware (finished vs non-finished),
  which can skew large-tenant (>2000) sidebar counts when the finished toggle is off.

- **Phase 1 — server-driven counts (done).** `TaskContext` now reads the sidebar /
  workspace-screen / status-chip badges from the reactive `api.bulk.taskSummaryCounts` query
  (visibility-aware, materialized fallback for large tenants) instead of reducing over the
  in-memory paged task array. Fixes "counts stuck at 34 until you scroll". Falls back to the old
  in-memory counts when offline, while searching, in the "Shared" view, or in the archive
  (show-finished) path, so nothing regresses.
  - Reused the **existing** `taskSummaryCounts` server query rather than standing up new rollup
    docs — it already does exact counts up to 500 visible tasks and a materialized `byWorkspace`
    fallback above that.
  - Known limit: above 500 visible tasks the server returns `byStatus: {}` (materialized path), so
    **status-chip** counts fall back to in-memory there. Workspace/sidebar/total counts stay correct
    at any scale. Populating a status rollup in `materializedTaskSummaryCounts` would lift this.

- **Phase 3 — finished-tasks toggle (done).** The toggle now drives the reactive query mode
  (`mode: taskListMode`, i.e. `'all'` when finished are shown) instead of the hardcoded `'hot'`, and
  the separate SQLite "archive" read path (`shouldUseArchiveTaskCache`) is disabled — finished tasks
  flow through the normal list path. This only changes the show-finished view; the default
  (non-finished) view never used the archive path, so it can't regress.
  - Also stopped excluding finished statuses from the large-tenant SQL path when the toggle is on
    (`sqlExcludeStatuses`), so finished tasks appear there too.
  - Trade-off: old finished tasks (low id) now load by scrolling the normal paginated query rather
    than via the by-status archive backfill. Acceptable per the "lazy on toggle / decently well"
    decision; Phase 2 (SQLite-backed list) will make this properly scalable.
  - The DataContext archive-sync loop + `live`/`archive` bucket split are now unused by the read
    path and can be deleted in Phase 4.

- **Phase 2 — SQLite-backed list (done).** `TASK_SQL_THRESHOLD` lowered from 10000 → 0, so the
  SQLite-backed list (`queryTaskCache`) is the default read source whenever no memory-only filters
  are active — it hydrates instantly from the on-disk cache on cold start (no network round-trip)
  and keeps JS memory bounded to the visible window. The live SQLite query now also honours the
  search box (`search`) and re-runs on `taskCacheVersion` so it reflects synced/optimistic writes in
  near real time. The in-memory complex-filter path remains the fallback for category/priority/
  assignee/flag/tag filters.
  - Follow-up for full scale: denormalize tag/assignee/category/priority into `task_cache`
    (migration v9) so those filters/counts run in SQL instead of falling back to memory.

- **Phase 4 — dead-code purge (done); module split (deferred).** With the archive path disabled
  (Phase 3) and the threshold at 0 (Phase 2), the in-memory *indexed* path and the entire SQLite
  *archive read* path became statically unreachable and were deleted:
  - Removed: `indexedTaskLists`, `activeIndexedTasks`, `archiveFilterKey`, `archiveFilteredState`,
    `archiveQueryLoading`, the archive query effect, `activeArchiveFilteredState`, `archiveMergedTasks`,
    `liveFilteredTasksForArchive`, `archiveLiveVisibleTasks`, `archiveLiveTaskUniverseCount`,
    `archiveLiveWorkspaceTaskCounts`, `liveNonFinalizedMappedTasks`, `liveNonFinalizedVisibleTasks`
    (+ cache ref + effect), and the dead `shouldUseArchiveTaskCache` branches across counts,
    pagination, and the filtered-tasks selector. ~300 lines removed; all collapses were provably
    behaviour-preserving (`false ? A : B` → `B`).
  - **Deferred (intentionally not done blind):** (a) splitting `TaskContext` into the 7 separate
    modules — pure structural churn with whole-app blast radius if hook order/context shape breaks,
    best done with the app running; (b) deleting the now-idle DataContext archive-sync loop +
    `live`/`archive` bucket machinery in `database.ts` (it's inert because `archiveEnabled` is always
    false, so harmless to leave until the split).

## Locked decisions

1. **First load:** sync active (non-finished) tasks fast; finished/done tasks load **lazily** the
   first time the user taps "Show finished".
2. **Counts:** each badge shows the **real total** for that facet over the whole dataset
   (e.g. "Done: 1,240"), independent of other active filters. Never derived from what's paged in.
3. **Real-time:** the live subscription only needs to cover the **visible** tasks. Bulk edits are
   common, but off-screen rows don't need an instant push — counts stay correct via server rollups
   (below).
4. **Offline counts:** show the **last-synced** numbers when offline (acceptable). No full local
   mirror required.

## Goal

One scalable, real-time task pipeline where:

- **Counts are always correct** — sidebar, filter chips, workspace screen — no matter how many
  tasks are paged into view. Never "stuck at 34 until you scroll".
- **Memory is bounded** — we never hold the tenant's whole task set in JS.
- **Offline works** — you can browse what you've loaded and see last-known counts with no network.
- **Real-time is preserved** — edits to visible tasks and the count badges update live.
- **`TaskContext` stops being a 3,170-line god-object.**

## The core decision

Today there are **four competing read paths** (reactive in-memory, in-memory index, SQLite list,
SQLite archive) plus **five count derivations**, chosen at runtime by a 10k-row threshold and a
filter predicate. Counts are reduced over whatever is paged into memory; the list comes from a
different path. They disagree by construction — that is the root of every bug here.

**New model — two clean, separate concerns:**

```
  ┌─────────────────────────── THE LIST ────────────────────────────┐
  │  Live windowed Convex query for the VISIBLE page                 │
  │  (workspace + status + filters, ordered, limit ~50)              │
  │  • real-time • bounded by the screen • bulk off-screen edits     │
  │    cost nothing                                                  │
  │              │ cache loaded pages                                │
  │              ▼                                                   │
  │        SQLite task_cache  ──▶  useTaskList → rows on screen      │
  └──────────────────────────────────────────────────────────────────┘

  ┌────────────────────────── THE COUNTS ───────────────────────────┐
  │  Server maintains tiny COUNT ROLLUPS, bumped on every task       │
  │  change (incl. bulk):  count per (tenant, workspace),            │
  │  per (tenant, status), per (tenant, workspace, status), …        │
  │              │ reactive useQuery on the rollup docs              │
  │              ▼                                                   │
  │     snapshot to SQLite ──▶ useTaskCounts → badges (true totals)  │
  └──────────────────────────────────────────────────────────────────┘
```

**The list and the counts are deliberately decoupled.** The list is a bounded live window; the
counts are whole-dataset totals served by maintained rollups. Neither is derived from "what's loaded
in memory", so the stuck-at-34 class of bug is structurally impossible.

Convex stays the real-time transport and the owner of auth/visibility scoping. SQLite is the offline
cache (loaded pages + last count snapshot + the existing write queue) — **not** a full mirror.

## Why this satisfies every constraint

| Constraint              | How it's met                                                                  |
|-------------------------|-------------------------------------------------------------------------------|
| Correct counts          | Server rollups = true totals, pushed reactively; never reduced from a page     |
| Survives bulk edits     | A bulk mutation updates the rollups once; the list only re-renders visible rows |
| Bounded memory          | Only the visible window is live + parsed; nothing holds the whole tenant       |
| Real-time               | Live windowed query (rows) + live rollup subscription (counts)                 |
| Offline                 | SQLite serves loaded pages + last-synced counts; writes queue and replay       |
| Maintainable            | God-object split into windowed-list / counts / mutations / prefs / reference   |

## The list: live windowed query

- Subscribe to the **query that defines the current view** — `workspace = X`, `status in (...)`,
  active filters, `order by sort desc`, `limit pageSize` — **not** a fixed set of task IDs. Convex
  re-runs it reactively, so edits to visible rows *and* brand-new tasks entering the top appear live.
  A fixed-ID subscription would miss new tasks.
- Scroll = grow the window (next page). `usePaginatedQuery` keeps loaded pages live; cap/virtualize
  so a deep scroll doesn't grow the live set without bound.
- Every page that arrives is written to SQLite `task_cache`. On cold start / offline, `useTaskList`
  renders from SQLite immediately (fixes "on reload I have to reload again"), then the live query
  reconciles when the network returns.
- **Lazy finished tasks:** the default window excludes finished (`finished_at IS NULL`). Tapping
  "Show finished" widens the query to include them, with a real loading state — no separate
  archive path, no `v12` day-keyed cursor, no `live`/`archive` bucket split. (Fixes the dead toggle.)

## The counts: server-maintained rollups

- Counts are **totals**, each facet independent (e.g. each status chip shows its own full count;
  applying a priority filter does **not** change the status counts). This matches the decision and
  keeps rollups simple — no combinatorial faceting.
- The server keeps small rollup documents, updated transactionally whenever a task is
  created / status-changed / moved / soft-deleted:
  - `count(tenant, workspace)` — sidebar + workspace screen
  - `count(tenant, status)` and `count(tenant, workspace, status)` — status chips
  - `count(tenant, workspace, priority | flagColor | tag | assignee)` — other filter chips
  - separate `finished` vs `live` tallies so the toggle flips instantly
- A **bulk mutation updates the affected rollups once** (in the same transaction, or via a
  scheduled aggregator for very large batches) — so 500-task edits stay cheap and counts stay exact.
- The app `useQuery`-subscribes to the rollup docs → badges are always the live true total.
- Each rollup snapshot is cached in SQLite/AsyncStorage so **offline shows last-synced counts**.

> Implementation note: rollups can be hand-maintained counter docs or the Convex aggregate
> component (`@convex-dev/aggregate`). Counting by `.collect().length` on every read does **not**
> scale and is explicitly rejected. Tag/assignee facets are higher cardinality — bounded by
> tags×workspaces / members×workspaces; fine, but size them deliberately.

## Visibility / permissions

The windowed list query and the rollups must both respect the same per-user visibility scoping the
current `tasksByWorkspace` uses (visible spots, workspace context, reported tasks, acknowledgments),
so a user's counts equal *their* visible totals — no over-counting.

> Rollups-per-user are infeasible at scale. Practical approach: maintain rollups at the
> **(tenant, workspace[, status/...])** grain, and only show counts for workspaces the user can see.
> Where visibility is finer than workspace (spot/acknowledgment scoping), either (a) accept
> workspace-grain counts for the sidebar, or (b) compute those specific scoped counts on demand from
> the server for the active view only. Decide per surface during Phase 2.

## Writes: optimistic + offline queue (unchanged transport, unified state)

Today there are three override mechanisms (`localOverrides`, `queuedTaskOverrides`,
`pendingCreatedTasks`). Collapse them into **one** `dirty` flag on the cached SQLite row:

- A mutation writes optimistic state to SQLite (`dirty`), enqueues the Convex call via the existing
  `mutationQueueRuntime` / `enqueueMutation`. UI re-renders instantly from SQLite.
- The mutation also nudges the local count snapshot optimistically (so badges move immediately); the
  server rollup is authoritative on confirm.
- On confirm, the live windowed query / rollup push the authoritative values; reconcile by
  `updatedAt` + `dirty` so a newer local edit isn't clobbered by a stale echo.
- Offline: row stays `dirty` and renders; queue replays on reconnect (already built).

## Module decomposition (kills the 3,170-line file)

| Module                     | Responsibility                                                          |
|----------------------------|-------------------------------------------------------------------------|
| `useTaskList(filter)`      | Live windowed query + SQLite page cache + pagination                    |
| `useTaskCounts(filter)`    | Subscribe to rollup docs; snapshot to SQLite; expose badges             |
| `TaskRepository` (SQL)     | Read/write cached pages + count snapshots — extends `database.ts`       |
| `ReferenceDataContext`     | Small reactive lookup maps (status/workspace/user/tag/…) via `useQuery` |
| `taskMutations`            | create / changeStatus / changePriority / markDone — optimistic + queue  |
| `useTaskPrefs`             | card density, working tasks, active task, search, finished toggle        |

The ~24 FK lookup maps and ~10 task-array pipelines in `TaskContext` collapse: reference maps live in
`ReferenceDataContext` (small, bounded); the task pipelines disappear (list = live query, counts =
rollups).

## Server work required

- **Count rollups:** rollup table/docs + maintenance on task create/update/delete/bulk (or the
  aggregate component). New reactive query `api.tasks.counts(tenantId, scope)`.
- **Windowed list query:** the existing `tasksByWorkspace` paginated path already does most of this;
  ensure it cleanly supports the active filter set and finished/lazy widening, with visibility scoping.
- No `by_tenant_updatedAt` index / tail subscription / delta sweep needed in this model (that was the
  full-mirror approach we dropped).

## Phased migration (each phase ships; app stays working)

- **Phase 1 — Counts from server rollups (fixes "stuck at 34").** Stand up the rollup docs +
  maintenance + `api.tasks.counts`. Rewire `taskStatusCounts`, `workspaceTaskCounts`, chip counts to
  `useTaskCounts`. Delete the in-memory count reducers. Counts become correct immediately, even while
  the list still uses the old path. *Highest value, do first.*
- **Phase 2 — List = live windowed query + SQLite page cache (fixes reload-refetch + memory).**
  `useTaskList` subscribes to the visible window, caches pages, hydrates on cold start. Remove the
  10k threshold, `indexedTaskLists`, `activeIndexedTasks`, `allMappedTasks`, the 4-way
  `computedFilteredTasks` selector.
- **Phase 3 — Lazy finished tasks (fixes the dead toggle).** Toggle widens the windowed query to
  include `finished_at IS NOT NULL`, with a loading state. Delete the `live`/`archive` bucket split,
  the `v12` archive cursor, the hardcoded `mode:'hot'` effect, and the unused `taskListMode`.
- **Phase 4 — Writes + decompose.** Unify the three override mechanisms into the SQLite `dirty` flag;
  split `TaskContext` into the modules above; delete dead code.

## What gets deleted by the end

- The 10k `TASK_SQL_THRESHOLD` and the SQL-vs-memory branch.
- `indexedTaskLists`, `activeIndexedTasks`, `allMappedTasks`, the 4-way `computedFilteredTasks`.
- In-memory count reducers (`taskStatusCounts`, `availableTags`, … as array reductions).
- `live` / `archive` bucket split + `v12` day-keyed archive cursor.
- `localOverrides` / `queuedTaskOverrides` / `pendingCreatedTasks` as separate mechanisms.
- The hardcoded `mode:'hot'` effect and the unused `taskListMode`.

## Still open (small)

- **Faceted vs total chips:** confirmed as **total** (each chip independent). If you later want chips
  to react to other active filters, that's a heavier on-demand count, not a rollup.
- **Visibility grain for sidebar counts** (workspace-grain rollups vs on-demand scoped counts for
  spot/acknowledgment visibility) — decide per surface in Phase 2.
