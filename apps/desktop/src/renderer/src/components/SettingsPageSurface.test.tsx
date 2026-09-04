// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { settingsDict } from '@tepegoz/settings-ui';
import type { CredentialsStatus, LoginCredentialMeta, ProviderKeyMeta } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { SettingsPageSurface } from './SettingsPageSurface';

/**
 * Desktop host for `tepegoz://settings` loaded as a real page (mirrors `OnboardingApp.tsx`'s pattern):
 * it owns its own bridge fetch, locale and theme, then hands everything to the presentational
 * `SettingsPage` unchanged. `SettingsPage`'s own sections/behavior have their own tests; this pins the
 * glue — the initial fetch (+ its failure/retry), the live-broadcast refetch, and every one-line wrapper
 * (`onUpdatePrefs`/`onResetPrefs`/the provider-key CRUD/the login CRUD) actually reaching the bridge.
 */

stubJsdomLayout();

const s = settingsDict.en;

function credentialsStatus(over: Partial<CredentialsStatus> = {}): CredentialsStatus {
  return {
    encryptionAvailable: true,
    providers: {} as CredentialsStatus['providers'],
    keys: [],
    regions: {},
    ...over,
  };
}

function key(over: Partial<ProviderKeyMeta> = {}): ProviderKeyMeta {
  return { id: 'k1', provider: 'anthropic', label: 'Work', createdAt: 0, last4: 'abcd', model: '', ...over };
}

function login(over: Partial<LoginCredentialMeta> = {}): LoginCredentialMeta {
  return { id: 'c1', url: 'https://example.com', username: 'alice', title: '', ...over } as LoginCredentialMeta;
}

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getCredentialsStatus: vi.fn(() => Promise.resolve(credentialsStatus())),
  onPublicSettingsChanged: vi.fn<(cb: () => void) => () => void>(() => () => undefined),
  listLogins: vi.fn<() => Promise<LoginCredentialMeta[]>>(() => Promise.resolve([])),
  updatePreferences: vi.fn<(patch: unknown) => Promise<typeof DEFAULT_PREFERENCES>>(() =>
    Promise.resolve({ ...DEFAULT_PREFERENCES }),
  ),
  resetPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  addProviderKey: vi.fn(() => Promise.resolve(credentialsStatus())),
  removeProviderKeyById: vi.fn(() => Promise.resolve(credentialsStatus())),
  renameProviderKey: vi.fn(() => Promise.resolve(credentialsStatus())),
  setProviderKeyModel: vi.fn(() => Promise.resolve(credentialsStatus())),
  reorderProviderKeys: vi.fn(() => Promise.resolve(credentialsStatus())),
  setLogin: vi.fn(() => Promise.resolve()),
  removeLogin: vi.fn(() => Promise.resolve()),
  importLogins: vi.fn(() => Promise.resolve({ imported: 1, skipped: 0, errors: [] })),
  exportLogins: vi.fn(() => Promise.resolve('url,username,password\n')),
  getAgentConfig: vi.fn(() => Promise.resolve({ models: {} })),
  getAppInfo: vi.fn(() => Promise.resolve({ glassAvailable: false })),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getCredentialsStatus.mockResolvedValue(credentialsStatus());
  bridge.onPublicSettingsChanged.mockImplementation(() => () => undefined);
  bridge.listLogins.mockResolvedValue([]);
  bridge.getAgentConfig.mockResolvedValue({ models: {} });
  bridge.getAppInfo.mockResolvedValue({ glassAvailable: false });
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
  window.location.hash = '';
});

async function renderAt(hash: string) {
  window.location.hash = hash;
  render(<SettingsPageSurface />);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
}

describe('SettingsPageSurface', () => {
  it('fetches prefs + credentials status and renders the settings page', async () => {
    render(<SettingsPageSurface />);
    expect(screen.getByRole('status')).toBeTruthy();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalled());
    expect(bridge.getCredentialsStatus).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('drops a fetch that resolves after unmount instead of setting state on a dead component', async () => {
    let resolvePrefs: ((p: typeof DEFAULT_PREFERENCES) => void) | undefined;
    bridge.getPreferences.mockImplementationOnce(
      () =>
        new Promise<typeof DEFAULT_PREFERENCES>((resolve) => {
          resolvePrefs = resolve;
        }),
    );
    const { unmount } = render(<SettingsPageSurface />);
    unmount();
    resolvePrefs?.({ ...DEFAULT_PREFERENCES });
    await Promise.resolve();
    expect(bridge.getCredentialsStatus).toHaveBeenCalledTimes(1);
  });

  it('shows a retry state when the first fetch rejects, and recovers on retry', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('down'));
    render(<SettingsPageSurface />);
    const retry = await screen.findByRole('button', { name: /retry|try again/i });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(bridge.getPreferences).toHaveBeenCalledTimes(2);
  });

  it('refetches preferences when main broadcasts a settings change, surviving a rejection', async () => {
    let changedCb: (() => void) | undefined;
    bridge.onPublicSettingsChanged.mockImplementation((cb: () => void) => {
      changedCb = cb;
      return () => undefined;
    });
    await renderAt('');

    bridge.getPreferences.mockRejectedValueOnce(new Error('gone'));
    changedCb?.();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(2));

    bridge.getPreferences.mockResolvedValueOnce({ ...DEFAULT_PREFERENCES });
    changedCb?.();
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(3));
  });

  it('writes an ordinary preference through onUpdatePrefs', async () => {
    await renderAt('notifications');
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(bridge.updatePreferences).toHaveBeenCalledWith({ notificationsEnabled: false }),
    );
  });

  it('resets every preference to defaults through onResetPrefs', async () => {
    await renderAt('reset');
    fireEvent.click(screen.getByRole('button', { name: s.resetButton }));
    const confirms = screen.getAllByRole('button', { name: s.resetButton });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(bridge.resetPreferences).toHaveBeenCalledTimes(1));
  });

  it('adds a provider key through onAddKey', async () => {
    await renderAt('providers');
    fireEvent.change(screen.getByLabelText(s.apiKey), { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByRole('button', { name: s.addKey }));
    await waitFor(() =>
      expect(bridge.addProviderKey).toHaveBeenCalledWith(
        'anthropic',
        s.providerNames.anthropic,
        'sk-secret',
        undefined,
      ),
    );
  });

  it('renames a provider key through onRenameKey', async () => {
    bridge.getCredentialsStatus.mockResolvedValue(credentialsStatus({ keys: [key({ label: 'Old' })] }));
    await renderAt('providers');
    fireEvent.click(screen.getByRole('button', { name: s.rename }));
    fireEvent.change(document.getElementById('rename-k1')!, { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(bridge.renameProviderKey).toHaveBeenCalledWith('k1', 'New name'));
  });

  it('pins a model on a provider key through onSetKeyModel', async () => {
    bridge.getCredentialsStatus.mockResolvedValue(credentialsStatus({ keys: [key()] }));
    bridge.getAgentConfig.mockResolvedValue({ models: { anthropic: [{ id: 'sonnet', label: 'Sonnet' }] } });
    await renderAt('providers');
    const trigger = await screen.findByRole('button', { name: s.keyModel.label });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sonnet/ }));
    await waitFor(() => expect(bridge.setProviderKeyModel).toHaveBeenCalledWith('k1', 'sonnet'));
  });

  it('removes a provider key through onRemoveKeyById', async () => {
    bridge.getCredentialsStatus.mockResolvedValue(credentialsStatus({ keys: [key({ label: 'Doomed' })] }));
    await renderAt('providers');
    fireEvent.click(screen.getByRole('button', { name: s.remove }));
    const confirms = screen.getAllByRole('button', { name: s.remove });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(bridge.removeProviderKeyById).toHaveBeenCalledWith('k1'));
  });

  it('reorders provider keys through onReorderKeys and re-reads preferences afterward', async () => {
    bridge.getCredentialsStatus.mockResolvedValue(
      credentialsStatus({ keys: [key({ id: 'a', label: 'A' }), key({ id: 'b', label: 'B' })] }),
    );
    await renderAt('providers');
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: s.moveDown.replace('{name}', 'A') }));
    await waitFor(() => expect(bridge.reorderProviderKeys).toHaveBeenCalledWith(['b', 'a']));
    await waitFor(() => expect(bridge.getPreferences).toHaveBeenCalledTimes(2));
  });

  it('fetches logins on section mount and removes one through onRemoveLogin', async () => {
    bridge.listLogins.mockResolvedValue([login()]);
    await renderAt('passwords');
    await waitFor(() => expect(bridge.listLogins).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
    await waitFor(() => expect(bridge.removeLogin).toHaveBeenCalledWith('c1'));
  });

  it('survives a rejected login list on section mount', async () => {
    bridge.listLogins.mockRejectedValueOnce(new Error('locked'));
    await renderAt('passwords');
    await waitFor(() => expect(bridge.listLogins).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adds a login through onAddLogin', async () => {
    await renderAt('passwords');
    fireEvent.click(await screen.findByRole('button', { name: /add password/i }));
    fireEvent.change(screen.getByPlaceholderText(/website/i), {
      target: { value: 'https://site.example' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^username/i), { target: { value: 'bob' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(bridge.setLogin).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://site.example', username: 'bob', password: 'hunter2' }),
      ),
    );
  });

  it('imports logins from a dropped CSV file through onImportLogins', async () => {
    await renderAt('passwords');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['url,username,password\n'], 'passwords.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('url,username,password\n') });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    await waitFor(() =>
      expect(bridge.importLogins).toHaveBeenCalledWith('url,username,password\n', 'google-csv'),
    );
  });

  it('exports logins through onExportLogins', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderAt('passwords');
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(bridge.exportLogins).toHaveBeenCalledWith('google-csv'));
  });
});
