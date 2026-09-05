// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { ProcessSnapshot } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { ProcessPageSurface } from './ProcessPageSurface';

/** Standalone `tepegoz://process` (Task Manager) host — threads the preload bridge into
 *  `@tepegoz/process-ui`, which polls `getProcessMetrics` on its own interval. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  getProcessMetrics: vi.fn<() => Promise<ProcessSnapshot>>(() =>
    Promise.resolve({ rows: [], sampledAt: 0 }),
  ),
  endTabProcess: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProcessPageSurface', () => {
  it('polls process metrics through the bridge', async () => {
    render(<ProcessPageSurface />);
    await waitFor(() => expect(bridge.getProcessMetrics).toHaveBeenCalled());
  });

  it('ends a tab process through the bridge when its End process button is clicked', async () => {
    bridge.getProcessMetrics.mockResolvedValueOnce({
      rows: [
        { pid: 100, kind: 'tab', label: 'Example', cpuPercent: 1, memoryBytes: 1024, tabId: 't-1' },
      ],
      sampledAt: Date.now(),
    });
    render(<ProcessPageSurface />);
    fireEvent.click(await screen.findByRole('button', { name: 'End process' }));
    expect(bridge.endTabProcess).toHaveBeenCalledWith('t-1');
  });
});
