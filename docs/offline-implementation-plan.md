# Offline Enablement Plan (React Native)

## Goals

- Keep fetched data available in memory and durable local storage.
- Let users keep working while offline.
- Queue offline actions and replay them when connectivity returns.
- Show offline/sync state clearly in the UI.
- Provide a queue management screen in Settings.

## Current Baseline

- `DataContext` already hydrates cached data from SQLite and persists reference/task/chat data snapshots.
- `NetworkContext` already exposes online/offline state.
- `MutationQueueContext` and `useOfflineMutation` exist, but are not fully integrated and currently discard failures.
- Most feature actions still call raw `useMutation` directly.

## Implementation Phases

### Phase 1 - Queue + UX foundation (in progress)

1. Harden SQLite queue schema and APIs:
   - tenant scoping
   - retry metadata (`attempts`, `next_retry_at`, `last_error`, timestamps)
   - recovery for stuck `syncing` rows after app restart
2. Improve replay engine:
   - replay on startup when online
   - replay on reconnect
   - backoff retries
   - keep failed actions for inspection (do not auto-discard)
3. Add queue visibility + controls:
   - Offline Queue screen (`Settings -> Offline Queue`)
   - retry all, retry one, remove one, clear queue
4. Add global offline banner.

### Phase 2 - Migrate core actions to offline queue

1. Move high-frequency task actions to `useOfflineMutation` first:
   - status changes
   - priority changes
   - assignment
2. Ensure optimistic state is visible immediately and consistent after app restart.

### Phase 3 - Expand coverage to remaining mutations

1. Chat actions:
   - send/edit/delete message
   - reactions
   - mark as read
2. Boards, notifications, approvals, forms, and other write paths.

### Phase 4 - Cache additional read paths

1. Persist non-bulk screen-level queries where needed:
   - task detail extras (notes/signatures/views)
   - scheduling views
   - shares and ancillary detail queries
2. Ensure tenant-safe cache boundaries.

## Technical Rules

- Queue ordering is FIFO within tenant.
- Replay runs only when online and not already replaying.
- Transient failures are retried with exponential backoff.
- Permanent failures are retained as `failed` and shown in queue UI.
- Queue is tenant-scoped and cleared on logout/tenant switch.

## Acceptance Criteria (target)

- User can open app offline and see cached data.
- User actions made offline appear in UI immediately.
- Offline actions survive app restart.
- On reconnect, queued actions replay automatically.
- Failed actions are visible and manually retryable.
- App shows offline state globally.
