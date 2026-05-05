let paused = false;

export function pauseMutationQueueReplay(): void {
  paused = true;
}

export function resumeMutationQueueReplay(): void {
  paused = false;
}

export function isMutationQueueReplayPaused(): boolean {
  return paused;
}
