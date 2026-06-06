import assert from 'node:assert/strict';
import {
  getTaskFindingsSummary,
  isTaskFindingResolved,
  sortTaskFindingsForMobile,
  type TaskFindingRow,
} from './taskFindings';

const rows: TaskFindingRow[] = [
  { _id: 'resolved', text: 'Fixed', resolved: true, sortOrder: 3 },
  { _id: 'linked-done', text: 'Linked done', linkedTask: { completed: true }, sortOrder: 2 },
  { _id: 'linked-open', text: 'Linked open', linkedTaskId: 'task-1', linkedTask: { statusName: 'Working' }, sortOrder: 1 },
  { _id: 'pending', text: 'Pending', sortOrder: 0 },
];

assert.equal(isTaskFindingResolved(rows[0]), true);
assert.equal(isTaskFindingResolved(rows[1]), true);
assert.equal(isTaskFindingResolved(rows[2]), false);

assert.deepEqual(getTaskFindingsSummary(rows), {
  total: 4,
  corrected: 2,
  inProgress: 1,
  pending: 1,
});

assert.deepEqual(
  sortTaskFindingsForMobile(rows).map((row) => row._id),
  ['pending', 'linked-open', 'linked-done', 'resolved'],
);

process.stdout.write('taskFindings tests passed\n');
