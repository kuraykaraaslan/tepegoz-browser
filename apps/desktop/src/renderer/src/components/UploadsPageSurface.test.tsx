// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { UploadsPageSurface } from './UploadsPageSurface';

/** Standalone `tepegoz://uploads` host — threads the preload bridge into `@tepegoz/uploads-ui`. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  listUploads: vi.fn(() => Promise.resolve([])),
  commandUpload: vi.fn(() => Promise.resolve()),
  onUploadsState: vi.fn(() => () => undefined),
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

describe('UploadsPageSurface', () => {
  it('wires the uploads list and live subscription to the bridge', async () => {
    render(<UploadsPageSurface />);
    await waitFor(() => expect(bridge.listUploads).toHaveBeenCalled());
    expect(bridge.onUploadsState).toHaveBeenCalled();
  });
});
