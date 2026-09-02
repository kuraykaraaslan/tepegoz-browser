// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { DownloadsPageSurface } from './DownloadsPageSurface';

/** Standalone `tepegoz://downloads` host — threads the preload bridge into `@tepegoz/downloads-ui`. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  listDownloads: vi.fn(() => Promise.resolve([])),
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
});
