export type TaskNoteLike = {
  note?: string | null;
  source?: string | null;
  attachments?: unknown[] | null;
};

export function isTaskAttachmentNote(note: TaskNoteLike | null | undefined): boolean {
  if (!note) return false;
  if (note.source === 'task_attachment') return true;
  return !note.source && !note.note?.trim() && (note.attachments?.length ?? 0) > 0;
}

export function isVisibleTaskNote(note: TaskNoteLike | null | undefined): boolean {
  return !isTaskAttachmentNote(note);
}
