import { describe, expect, it, vi } from 'vitest';

/**
 * `index.ts` is the single preload entry: it assembles every `api-*` slice into one object and hands
 * it to `contextBridge.exposeInMainWorld` — the ONLY renderer↔main bridge (raw `ipcRenderer` in the
 * renderer is a security BLOCKER). Pinned: it exposes under the `'tepegoz'` key, the object carries a
 * representative method from every slice (so a dropped spread is caught), and `platform` rides along.
 */

const exposeInMainWorld = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn() },
}));

await import('./index');

describe('preload entry', () => {
  it('exposes the assembled API under the "tepegoz" key', () => {
    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith('tepegoz', expect.any(Object));
  });

  it('the exposed object carries one method from every slice, plus platform', () => {
    const api = exposeInMainWorld.mock.calls[0]![1] as Record<string, unknown>;
    for (const method of [
      'minimizeWindow', // windowTabsApi
      'runAgent', // agentModelsApi
      'listBookmarks', // bookmarksHistoryApi
      'getPreferences', // settingsMiscApi
      'listLogins', // loginsMacrosApi
      'listDownloads', // downloadsApi
      'addNetworkConnection', // networkApi
      'listUploads', // uploadsApi
      'listTasks', // tasksApi
      'listTrustProfiles', // trustApi
    ]) {
      expect(typeof api[method]).toBe('function');
    }
    expect(api['platform']).toBe(process.platform);
  });
});
