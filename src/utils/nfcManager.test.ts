import assert from 'node:assert/strict';
import {
  buildNfcManagerActionConfig,
  buildNfcManagerSavePayload,
  canSaveNfcManagerForm,
  emptyNfcManagerForm,
  getNfcManagerFormFromTag,
} from './nfcManager';

const sessionForm = {
  ...emptyNfcManagerForm,
  label: '  Room 204 minibar  ',
  workspaceId: 'workspace_1',
  categoryId: 'category_1',
  templateId: '',
  spotId: 'spot_1',
  priorityId: '',
  taskName: '  Minibar check  ',
};
assert.equal(canSaveNfcManagerForm(sessionForm), true);
assert.deepEqual(buildNfcManagerActionConfig(sessionForm), {
  workspaceId: 'workspace_1',
  categoryId: 'category_1',
  templateId: undefined,
  spotId: 'spot_1',
  priorityId: undefined,
  taskName: 'Minibar check',
  assigneeMode: 'current_user',
});
assert.deepEqual(buildNfcManagerSavePayload(sessionForm, 'hotel'), {
  tenantId: 'hotel',
  label: 'Room 204 minibar',
  actionKind: 'task_session_toggle',
  actionConfig: {
    workspaceId: 'workspace_1',
    categoryId: 'category_1',
    templateId: undefined,
    spotId: 'spot_1',
    priorityId: undefined,
    taskName: 'Minibar check',
    assigneeMode: 'current_user',
  },
  executionMode: 'direct',
});

const linkedForm = {
  ...emptyNfcManagerForm,
  actionKind: 'linked_task_status' as const,
  taskId: 'task_1',
  linkedAction: 'complete_task' as const,
  executionMode: 'confirm' as const,
};
assert.equal(canSaveNfcManagerForm(linkedForm), true);
assert.deepEqual(buildNfcManagerActionConfig(linkedForm), {
  taskId: 'task_1',
  actionType: 'complete_task',
});

const urlForm = {
  ...emptyNfcManagerForm,
  actionKind: 'open_url' as const,
  url: '  https://whagons.com/help  ',
};
assert.equal(canSaveNfcManagerForm(urlForm), true);
assert.deepEqual(buildNfcManagerActionConfig(urlForm), {
  url: 'https://whagons.com/help',
});

assert.equal(canSaveNfcManagerForm({ ...emptyNfcManagerForm, actionKind: 'linked_task_status' }), false);
assert.equal(canSaveNfcManagerForm({ ...emptyNfcManagerForm, actionKind: 'open_url', url: '   ' }), false);
assert.equal(canSaveNfcManagerForm({ ...emptyNfcManagerForm, workspaceId: 'workspace_1' }, true), false);

const editForm = getNfcManagerFormFromTag({
  label: 'Service elevator',
  actionKind: 'task_session_toggle',
  executionMode: 'confirm',
  actionConfig: {
    workspaceId: 'workspace_2',
    categoryId: 'category_2',
    templateId: 'template_2',
    spotId: 'spot_2',
    priorityId: 'priority_2',
    taskName: 'Elevator check',
  },
});
assert.equal(editForm.label, 'Service elevator');
assert.equal(editForm.executionMode, 'confirm');
assert.equal(editForm.workspaceId, 'workspace_2');
assert.equal(editForm.templateId, 'template_2');

process.stdout.write('nfc manager tests passed\n');
