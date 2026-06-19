import assert from 'node:assert/strict';
import { isTaskAttachmentNote, isVisibleTaskNote } from './taskNotes';

assert.equal(isTaskAttachmentNote({ source: 'task_attachment', note: 'Report', attachments: [] }), true);
assert.equal(isVisibleTaskNote({ source: 'task_attachment', note: 'Report', attachments: [] }), false);

assert.equal(isTaskAttachmentNote({ source: 'comment', note: '', attachments: [{ storageId: 'file_1' }] }), false);
assert.equal(isVisibleTaskNote({ source: 'comment', note: '', attachments: [{ storageId: 'file_1' }] }), true);

assert.equal(isTaskAttachmentNote({ note: '', attachments: [{ storageId: 'legacy_file' }] }), true);
assert.equal(isTaskAttachmentNote({ note: 'Looks good', attachments: [{ storageId: 'comment_file' }] }), false);

process.stdout.write('taskNotes utils tests passed\n');
