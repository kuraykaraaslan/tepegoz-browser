import type {
  DownloadRecord,
  DownloadStatePatch,
  DownloadStatus,
  DownloadsState,
} from './download-types';

export function emptyDownloadsState(): DownloadsState {
  return { items: [] };
}

export function upsertDownload(state: DownloadsState, record: DownloadRecord): DownloadsState {
  const index = state.items.findIndex((item) => item.id === record.id);
  if (index === -1) return { items: [record, ...state.items] };
  const items = state.items.slice();
  items[index] = record;
  return { items };
}

export function patchDownload(state: DownloadsState, input: DownloadStatePatch): DownloadsState {
  const current = state.items.find((item) => item.id === input.id);
  if (current === undefined) return state;
  return upsertDownload(state, {
    ...current,
    ...input.patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: input.patch.updatedAt ?? Date.now(),
  });
}

export function removeDownload(state: DownloadsState, id: string): DownloadsState {
  return { items: state.items.filter((item) => item.id !== id) };
}

export function clearInactiveDownloads(state: DownloadsState): DownloadsState {
  return {
    items: state.items.filter((item) =>
      ['requested', 'in_progress', 'paused', 'quarantined'].includes(item.status),
    ),
  };
}

export function getDownload(state: DownloadsState, id: string): DownloadRecord | undefined {
  return state.items.find((item) => item.id === id);
}

export function activeDownloads(state: DownloadsState): DownloadRecord[] {
  return state.items.filter((item) =>
    ['requested', 'in_progress', 'paused', 'quarantined'].includes(item.status),
  );
}

export function isTerminalDownloadStatus(status: DownloadStatus): boolean {
  return ['completed', 'blocked', 'canceled', 'failed'].includes(status);
}

/** Whether a command action is a "start it over" that only a stopped download accepts. */
export function isRetryableStatus(status: DownloadStatus): boolean {
  return status === 'failed' || status === 'canceled';
}
