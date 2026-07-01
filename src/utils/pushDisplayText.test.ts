import assert from 'node:assert/strict';
import { resolvePushDisplayText } from './pushDisplayText';

// ---------------------------------------------------------------------------
// Regression: pushes whose `notification` block is missing/empty must resolve
// text from data.notification_title / data.notification_body (the backend
// duplicates the visible text there — convex/_helpers/pushPayload.ts).
// Before the fix, the app read data.title / data.body (keys the server never
// sends) and displayed a contentless notification that just said "Whagons".
// ---------------------------------------------------------------------------
{
  const resolved = resolvePushDisplayText({
    data: {
      type: 'task_comment',
      notification_title: 'Fix the boiler — New task comment',
      notification_body: 'Ariana: the valve is leaking again',
    },
  });
  assert.deepEqual(resolved, {
    title: 'Fix the boiler — New task comment',
    body: 'Ariana: the valve is leaking again',
  });
}

// The notification block wins when present.
{
  const resolved = resolvePushDisplayText({
    notification: { title: 'Block title', body: 'Block body' },
    data: { notification_title: 'Data title', notification_body: 'Data body' },
  });
  assert.deepEqual(resolved, { title: 'Block title', body: 'Block body' });
}

// Empty-string notification fields fall through to the data duplicates
// instead of being displayed as empty.
{
  const resolved = resolvePushDisplayText({
    notification: { title: '', body: '' },
    data: { notification_title: 'Recovered title', notification_body: 'Recovered body' },
  });
  assert.deepEqual(resolved, { title: 'Recovered title', body: 'Recovered body' });
}

// Legacy data.title / data.body keys still work as a last resort.
{
  const resolved = resolvePushDisplayText({
    data: { title: 'Legacy title', body: 'Legacy body' },
  });
  assert.deepEqual(resolved, { title: 'Legacy title', body: 'Legacy body' });
}

// A message with NO resolvable text returns null — callers must skip display
// entirely rather than render an empty "Whagons" notification.
{
  assert.equal(resolvePushDisplayText({ data: { type: 'task_updated', task_id: '42' } }), null);
  assert.equal(resolvePushDisplayText({}), null);
  assert.equal(resolvePushDisplayText({ notification: { title: '  ', body: '' }, data: {} }), null);
}

// Body-only messages get a type-derived fallback title, never an empty one.
{
  const resolved = resolvePushDisplayText({
    data: { type: 'task_comment', notification_body: 'Just a body' },
  });
  assert.deepEqual(resolved, { title: 'New task comment', body: 'Just a body' });

  const unknownType = resolvePushDisplayText({
    data: { type: 'something_new', notification_body: 'Body text' },
  });
  assert.equal(unknownType?.title, 'New notification');
}

// Attachment markdown in the body is humanized (sanitizeNotificationMessage).
{
  const resolved = resolvePushDisplayText({
    data: {
      notification_title: 'New task comment',
      notification_body: '![photo.jpg](convex-file:abc123)',
    },
  });
  assert.equal(resolved?.body, 'Image attachment');
}

console.log('pushDisplayText tests passed');
