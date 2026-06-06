import assert from 'node:assert/strict';
import {
  getNfcActionLabel,
  getNfcLinkedActionLabel,
  getNfcTapUrl,
} from './nfc';

assert.equal(
  getNfcTapUrl('abc 123', 'hotel', 'whagons.com'),
  'https://hotel.whagons.com/nfc/tap/abc%20123',
);
assert.equal(
  getNfcTapUrl('tag-id', null, 'https://whagons.com/nfc'),
  'https://app.whagons.com/nfc/tap/tag-id',
);
assert.equal(getNfcActionLabel('task_session_toggle'), 'Start/end task');
assert.equal(getNfcLinkedActionLabel('complete_task'), 'Complete task');

process.stdout.write('nfc utils tests passed\n');
