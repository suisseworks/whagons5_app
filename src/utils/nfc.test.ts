import assert from 'node:assert/strict';
import {
  getNfcActionLabel,
  getNfcLinkedActionLabel,
  getNfcTapUrl,
} from './nfc';

assert.equal(
  getNfcTapUrl('abc 123', 'hotel', 'https://cvx-share.whagons.com'),
  'https://cvx-share.whagons.com/nfc/tap?uuid=abc+123&tenantId=hotel',
);
assert.equal(
  getNfcTapUrl('abc 123', 'hotel', 'https://cvx-share-dev.whagons.com/'),
  'https://cvx-share-dev.whagons.com/nfc/tap?uuid=abc+123&tenantId=hotel',
);
assert.equal(
  getNfcTapUrl('tag-id', null, 'https://cvx-share.whagons.com'),
  'https://cvx-share.whagons.com/nfc/tap?uuid=tag-id',
);
assert.equal(getNfcActionLabel('task_session_toggle'), 'Create task');
assert.equal(getNfcLinkedActionLabel('complete_task'), 'Complete task');

process.stdout.write('nfc utils tests passed\n');
