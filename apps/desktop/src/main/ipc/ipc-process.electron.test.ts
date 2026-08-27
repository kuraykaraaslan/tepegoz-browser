import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * Task-manager IPC (`tepegoz://process`). Small, but it makes two decisions that fail silently when
 * wrong: `process-metrics:end` must reject a malformed `tabId` payload (it force-crashes a renderer),
 * and every entry point must refuse an untrusted sender frame.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      h.handlers.set(channel, fn);
    },
    on: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
      h.listeners.set(channel, fn);
    },
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => null },
}));

const TRUSTED = 'app://tepegoz/chrome.html';

vi.mock('../lib/trusted-origin', () => ({
  isTrustedAppUrl: (url: string) => url === TRUSTED,
}));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden', badRequest: 'bad' } }),
}));

const metrics = vi.hoisted(() => ({
  snapshot: { rows: [{ pid: 1, kind: 'browser', label: 'Browser', cpuPercent: 0, memoryBytes: 0 }], sampledAt: 7 },
  collect: vi.fn(),
  end: vi.fn(),
}));

vi.mock('../process-metrics.electron', () => ({
  collectProcessSnapshot: () => {
    metrics.collect();
    return metrics.snapshot;
  },
  endTabProcess: (tabId: string) => {
    metrics.end(tabId);
  },
}));

const { registerProcessIpc } = await import('./ipc-process');

const trustedEvent = { senderFrame: { url: TRUSTED }, sender: {} };
const untrustedEvent = { senderFrame: { url: 'https://evil.example/' }, sender: {} };

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  metrics.collect.mockClear();
  metrics.end.mockClear();
  registerProcessIpc();
});

describe('registerProcessIpc', () => {
  it('registers exactly the two channels', () => {
    expect([...h.handlers.keys()]).toEqual([IpcChannels.processMetricsGet]);
    expect([...h.listeners.keys()]).toEqual([IpcChannels.processMetricsEnd]);
  });

  it('process-metrics:get returns a fresh snapshot for a trusted sender', () => {
    const result = h.handlers.get(IpcChannels.processMetricsGet)?.(trustedEvent, undefined);
    expect(result).toEqual(metrics.snapshot);
    expect(metrics.collect).toHaveBeenCalledTimes(1);
  });

  it('process-metrics:get throws (mapped 403) for an untrusted sender', () => {
    expect(() => h.handlers.get(IpcChannels.processMetricsGet)?.(untrustedEvent, undefined)).toThrow();
    expect(metrics.collect).not.toHaveBeenCalled();
  });

  it('process-metrics:end force-ends the named tab for a valid trusted payload', () => {
    h.listeners.get(IpcChannels.processMetricsEnd)?.(trustedEvent, { tabId: 't-9' });
    expect(metrics.end).toHaveBeenCalledWith('t-9');
  });

  it('process-metrics:end drops a malformed payload without ending anything', () => {
    h.listeners.get(IpcChannels.processMetricsEnd)?.(trustedEvent, { tabId: 123 });
    h.listeners.get(IpcChannels.processMetricsEnd)?.(trustedEvent, {});
    h.listeners.get(IpcChannels.processMetricsEnd)?.(trustedEvent, 'not-an-object');
    expect(metrics.end).not.toHaveBeenCalled();
  });

  it('process-metrics:end ignores an untrusted sender', () => {
    h.listeners.get(IpcChannels.processMetricsEnd)?.(untrustedEvent, { tabId: 't-9' });
    expect(metrics.end).not.toHaveBeenCalled();
  });
});
