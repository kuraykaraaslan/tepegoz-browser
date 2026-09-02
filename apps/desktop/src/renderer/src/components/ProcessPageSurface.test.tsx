// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { ProcessPageSurface } from './ProcessPageSurface';

/** Standalone `tepegoz://process` (Task Manager) host — threads the preload bridge into
 *  `@tepegoz/process-ui`, which polls `getProcessMetrics` on its own interval. */

stubJsdomLayout();

const bridge = {
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  onPublicSettingsChanged: () => () => undefined,
  getProcessMetrics: vi.fn(() => Promise.resolve({ rows: [] })),
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
});
