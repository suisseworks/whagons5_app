import type { NfcActionKind, NfcExecutionMode, NfcLinkedAction } from './nfc';

export type NfcManagerTagLike = {
  _id?: string;
  label?: string | null;
  actionKind?: NfcActionKind;
  actionConfig?: Record<string, any>;
  actionType?: string;
  executionMode?: NfcExecutionMode;
};

export type NfcManagerFormState = {
  label: string;
  actionKind: NfcActionKind;
  executionMode: NfcExecutionMode;
  taskId: string;
  linkedAction: NfcLinkedAction;
  workspaceId: string;
  categoryId: string;
  templateId: string;
  spotId: string;
  priorityId: string;
  taskName: string;
  url: string;
};

export const emptyNfcManagerForm: NfcManagerFormState = {
  label: '',
  actionKind: 'task_session_toggle',
  executionMode: 'direct',
  taskId: '',
  linkedAction: 'start_task',
  workspaceId: '',
  categoryId: '',
  templateId: '',
  spotId: '',
  priorityId: '',
  taskName: '',
  url: '',
};

export function buildNfcManagerActionConfig(form: NfcManagerFormState) {
  if (form.actionKind === 'linked_task_status') {
    return { taskId: form.taskId, actionType: form.linkedAction };
  }

  if (form.actionKind === 'open_url') {
    return { url: form.url.trim() };
  }

  return {
    workspaceId: form.workspaceId,
    categoryId: form.categoryId || undefined,
    templateId: form.templateId || undefined,
    spotId: form.spotId || undefined,
    priorityId: form.priorityId || undefined,
    taskName: form.taskName.trim() || undefined,
    assigneeMode: 'current_user',
  };
}

export function canSaveNfcManagerForm(form: NfcManagerFormState, saving = false): boolean {
  if (saving) return false;
  if (form.actionKind === 'linked_task_status') return !!form.taskId;
  if (form.actionKind === 'open_url') return !!form.url.trim();
  return !!form.workspaceId;
}

export function getNfcManagerFormFromTag(tag: NfcManagerTagLike): NfcManagerFormState {
  const config = tag.actionConfig ?? {};
  return {
    label: tag.label ?? '',
    actionKind: tag.actionKind ?? 'task_session_toggle',
    executionMode: tag.executionMode ?? 'direct',
    taskId: String(config.taskId ?? ''),
    linkedAction: (config.actionType ?? tag.actionType ?? 'start_task') as NfcLinkedAction,
    workspaceId: String(config.workspaceId ?? ''),
    categoryId: String(config.categoryId ?? ''),
    templateId: String(config.templateId ?? ''),
    spotId: String(config.spotId ?? ''),
    priorityId: String(config.priorityId ?? ''),
    taskName: String(config.taskName ?? ''),
    url: String(config.url ?? ''),
  };
}

export function buildNfcManagerSavePayload(form: NfcManagerFormState, tenantId: string) {
  return {
    tenantId,
    label: form.label.trim() || undefined,
    actionKind: form.actionKind,
    actionConfig: buildNfcManagerActionConfig(form),
    executionMode: form.executionMode,
  };
}
