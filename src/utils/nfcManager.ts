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
  description: string;
  startOnScan: boolean;
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
  description: '',
  startOnScan: false,
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
    workspaceId: form.workspaceId || undefined,
    categoryId: form.categoryId || undefined,
    templateId: form.templateId || undefined,
    spotId: form.spotId || undefined,
    priorityId: form.priorityId || undefined,
    taskName: form.taskName.trim() || undefined,
    description: form.description.trim() || undefined,
    startOnScan: form.startOnScan,
    assigneeMode: form.startOnScan ? 'current_user' : 'none',
  };
}

export function canSaveNfcManagerForm(form: NfcManagerFormState, saving = false): boolean {
  if (saving) return false;
  if (form.actionKind === 'linked_task_status') return !!form.taskId;
  if (form.actionKind === 'open_url') return !!form.url.trim();
  return !!form.templateId || !!form.workspaceId;
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
    description: String(config.description ?? ''),
    startOnScan: config.startOnScan === true || config.assigneeMode === 'current_user',
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
