// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { ExtensionsPageSurface } from './ExtensionsPageSurface';

/**
 * Standalone `tepegoz://extensions` host. The real logic here is `onToggle`: it rebuilds the whole
 * `extensions` preference array (drop any existing entry for the id, push the new status) and persists
 * it through `updatePreferences` — a disable must not leave a stale `enabled` entry behind.
 */

stubJsdomLayout();

const AGENT_MANIFEST = {
  id: 'com.tepegoz.agent',
  name: 'Agent',
  version: '1.0.0',
  description: '',
  icon: 'robot',
  surfaces: ['sidebar'],
  actions: { click: 'sidebar' },
  labels: {},
  permissions: [],
};

let prefs: Preferences;
const updatePreferences = vi.fn();

const bridge = {
  getPreferences: () => Promise.resolve(prefs),
  onPublicSettingsChanged: () => () => undefined,
  updatePreferences,
  listExtensionManifests: () => Promise.resolve([AGENT_MANIFEST]),
};

beforeEach(() => {
  vi.clearAllMocks();
  prefs = { ...DEFAULT_PREFERENCES, extensions: [{ id: 'com.tepegoz.agent', status: 'enabled' }] };
  updatePreferences.mockImplementation((patch: Partial<Preferences>) =>
    Promise.resolve({ ...prefs, ...patch }),
  );
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

describe('ExtensionsPageSurface', () => {
  it('persists a disable by replacing the extension entry, not appending a second one', async () => {
    render(<ExtensionsPageSurface />);
    const toggle = await screen.findByRole<HTMLInputElement>('switch', { name: /Agent/ });
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1));
    expect(updatePreferences).toHaveBeenCalledWith({
      extensions: [{ id: 'com.tepegoz.agent', status: 'disabled' }],
    });
  });

  it('persists an enable the same way, replacing the disabled entry', async () => {
    prefs = {
      ...DEFAULT_PREFERENCES,
      extensions: [{ id: 'com.tepegoz.agent', status: 'disabled' }],
    };
    render(<ExtensionsPageSurface />);
    const toggle = await screen.findByRole<HTMLInputElement>('switch', { name: /Agent/ });
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1));
    expect(updatePreferences).toHaveBeenCalledWith({
      extensions: [{ id: 'com.tepegoz.agent', status: 'enabled' }],
    });
  });

  it('still writes a toggle when the preferences read failed', async () => {
    // The read rejects into `() => undefined`, so the page renders with no state at all — the rows
    // come from the catalog, not from preferences. A toggle then has to build the array from nothing
    // rather than throw on a null `prefs`.
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: { ...bridge, getPreferences: () => Promise.reject(new Error('prefs unreadable')) },
    });
    render(<ExtensionsPageSurface />);
    const toggle = await screen.findByRole<HTMLInputElement>('switch', { name: /Agent/ });
    expect(toggle.checked).toBe(true); // no stored state ⇒ a built-in reads as on

    fireEvent.click(toggle);

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1));
    expect(updatePreferences).toHaveBeenCalledWith({
      extensions: [{ id: 'com.tepegoz.agent', status: 'disabled' }],
    });
  });
});
