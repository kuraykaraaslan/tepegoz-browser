// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { DownloadRecord } from '@tepegoz/downloads';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { DownloadsPageSurface } from './DownloadsPageSurface';

function record(over: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.bin',
    filename: 'file.bin',
    status: 'completed',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 100,
    totalBytes: 100,
    canResume: false,
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user', sourceOrigin: 'https://example.com' },
    ...over,
  };
}

/** Standalone `tepegoz://downloads` host — threads the preload bridge into `@tepegoz/downloads-ui`. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  listDownloads: vi.fn<() => Promise<DownloadRecord[]>>(() => Promise.resolve([])),
  commandDownload: vi.fn(() => Promise.resolve()),
  onDownloadsState: vi.fn(() => () => undefined),
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

describe('DownloadsPageSurface', () => {
  it('wires the downloads list and live subscription to the bridge', async () => {
    render(<DownloadsPageSurface />);
    await waitFor(() => expect(bridge.listDownloads).toHaveBeenCalled());
    expect(bridge.onDownloadsState).toHaveBeenCalled();
  });

  it('sends a download command through the bridge when an action button is clicked', async () => {
    bridge.listDownloads.mockResolvedValueOnce([record()]);
    render(<DownloadsPageSurface />);
    fireEvent.click(await screen.findByRole('button', { name: /Open/ }));
    expect(bridge.commandDownload).toHaveBeenCalledWith({ id: 'd1', action: 'open' });
  });
});
