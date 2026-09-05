// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { UploadRecord } from '@tepegoz/uploads';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { UploadsPageSurface } from './UploadsPageSurface';

function record(over: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'u1',
    status: 'staged',
    risk: 'normal',
    files: [{ filename: 'x.txt', sizeBytes: 10, risk: 'normal' }],
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user' },
    ...over,
  };
}

/** Standalone `tepegoz://uploads` host — threads the preload bridge into `@tepegoz/uploads-ui`. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  listUploads: vi.fn<() => Promise<UploadRecord[]>>(() => Promise.resolve([])),
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

  it('sends an upload command through the bridge when an action button is clicked', async () => {
    bridge.listUploads.mockResolvedValueOnce([record()]);
    render(<UploadsPageSurface />);
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
    expect(bridge.commandUpload).toHaveBeenCalledWith({ id: 'u1', action: 'cancel' });
  });
});
