// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { settingsDict } from '@tepegoz/settings-ui';
import type { CredentialsStatus, Preferences } from '@tepegoz/desktop-ipc';
import { SettingsPage } from './SettingsPage';

/**
 * The settings page's own wrapper functions — `setPref`'s reject arm, `setDeveloperPref`,
 * `setSitePermission`/`resetSitePermission`, `clearBrowsingHistory`, and the reset-confirmation
 * modal's dismiss paths (Escape/backdrop + Cancel). Every SECTION's own behavior (`DeveloperSection`,
 * `PermissionsCenter`, `ClientCertificatesRow`, …) is separately, thoroughly covered elsewhere — this
 * only needs each wrapper reached ONCE by driving the real section it's wired into, via
 * `initialSectionId` (no click-through nav needed) — same technique as `SettingsPageSurface.test.tsx`.
 */

vi.mock('../lib/developer-env', () => ({
  isDeveloperSettingsVisible: () => true,
  nodeEnv: 'test',
}));

const s = settingsDict.en;

function credentialsStatus(): CredentialsStatus {
  return { encryptionAvailable: true, providers: {} as CredentialsStatus['providers'], keys: [], regions: {} };
}

const bridge = {
  clearHistory: vi.fn(() => Promise.resolve()),
  listClientCertificateChoices: vi.fn(() => Promise.resolve([])),
  listAgentCapabilities: vi.fn(() => Promise.resolve([])),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.clearHistory.mockResolvedValue(undefined);
  bridge.listClientCertificateChoices.mockResolvedValue([]);
  bridge.listAgentCapabilities.mockResolvedValue([]);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderPage(
  over: Partial<Preferences> = {},
  initialSectionId?: string,
  propOverrides: Partial<{ onResetPrefs: () => Promise<void> }> = {},
) {
  const onUpdatePrefs = vi.fn<(patch: Partial<Preferences>) => Promise<void>>(() => Promise.resolve());
  const props = {
    ...(initialSectionId !== undefined ? { initialSectionId } : {}),
    prefs: { ...DEFAULT_PREFERENCES, ...over },
    status: credentialsStatus(),
    onUpdatePrefs,
    onResetPrefs: vi.fn(() => Promise.resolve()),
    onAddKey: vi.fn(() => Promise.resolve()),
    onRemoveKeyById: vi.fn(() => Promise.resolve()),
    onRenameKey: vi.fn(() => Promise.resolve()),
    onSetKeyModel: vi.fn(() => Promise.resolve()),
    onReorderKeys: vi.fn(() => Promise.resolve()),
    loginCredentials: [],
    onLoginSectionMount: vi.fn(() => Promise.resolve()),
    onAddLogin: vi.fn(() => Promise.resolve()),
    onRemoveLogin: vi.fn(() => Promise.resolve()),
    onImportLogins: vi.fn(() => Promise.resolve({ imported: 0, skipped: 0, errors: [] })),
    onExportLogins: vi.fn(() => Promise.resolve('')),
    ...propOverrides,
  };
  render(<SettingsPage {...props} />);
  return { ...props, onUpdatePrefs };
}

describe('SettingsPage', () => {
  it('reports a failed ordinary preference write instead of the saved indicator', async () => {
    const { onUpdatePrefs } = renderPage({}, 'notifications');
    onUpdatePrefs.mockRejectedValueOnce(new Error('vault locked'));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('writes a developer preference and reports success', async () => {
    const { onUpdatePrefs } = renderPage({}, 'developer');
    fireEvent.change(screen.getByPlaceholderText(s.developerSearchPlaceholder), {
      target: { value: 'onboardingCompleted' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: s.developerEdit })[0]!);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('switch'));
    await waitFor(() =>
      expect(onUpdatePrefs).toHaveBeenCalledWith({ onboardingCompleted: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports a rejected developer preference write and keeps the editor open', async () => {
    const { onUpdatePrefs } = renderPage({}, 'developer');
    onUpdatePrefs.mockRejectedValueOnce(new Error('write failed'));
    fireEvent.change(screen.getByPlaceholderText(s.developerSearchPlaceholder), {
      target: { value: 'onboardingCompleted' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: s.developerEdit })[0]!);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('switch'));
    await waitFor(() => expect(within(dialog).getByText(/upstream|down|failed/i)).toBeTruthy());
  });

  it('sets and resets a site permission through the site-permissions section', async () => {
    const origin = 'https://a.example';
    const { onUpdatePrefs } = renderPage(
      { sitePermissions: { [origin]: { camera: 'prompt' } } },
      'site-permissions',
    );
    const select = document.getElementById(`perm-${origin}-camera`);
    fireEvent.change(select!, { target: { value: 'allowed' } });
    await waitFor(() => expect(onUpdatePrefs).toHaveBeenCalledTimes(1));
    const setPatch = onUpdatePrefs.mock.calls[0]?.[0];
    expect(setPatch?.sitePermissions?.[origin]).toEqual(expect.objectContaining({ camera: 'allowed' }));

    fireEvent.click(screen.getByRole('button', { name: s.permissionsCenter.forgetSite }));
    const confirms = screen.getAllByRole('button', { name: s.permissionsCenter.forgetSite });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(onUpdatePrefs).toHaveBeenCalledTimes(2));
    const resetPatch = onUpdatePrefs.mock.calls[1]?.[0];
    expect(resetPatch?.sitePermissions?.[origin]).toBeUndefined();
  });

  it('clears browsing history through the two-step confirm', async () => {
    renderPage({}, 'privacy');
    fireEvent.click(screen.getByRole('button', { name: s.clearHistoryButton }));
    const confirms = screen.getAllByRole('button', { name: s.clearHistoryButton });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(bridge.clearHistory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(s.historyCleared)).toBeTruthy();
  });

  it('reports a failed clear-history through the alert banner', async () => {
    bridge.clearHistory.mockRejectedValueOnce(new Error('locked'));
    renderPage({}, 'privacy');
    fireEvent.click(screen.getByRole('button', { name: s.clearHistoryButton }));
    const confirms = screen.getAllByRole('button', { name: s.clearHistoryButton });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('opens the reset-confirmation modal and cancels it without resetting', () => {
    const { onResetPrefs } = renderPage({}, 'reset');
    fireEvent.click(screen.getByRole('button', { name: s.resetButton }));
    fireEvent.click(screen.getByRole('button', { name: s.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onResetPrefs).not.toHaveBeenCalled();
  });

  it('dismisses the reset-confirmation modal on Escape without resetting', () => {
    const { onResetPrefs } = renderPage({}, 'reset');
    fireEvent.click(screen.getByRole('button', { name: s.resetButton }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onResetPrefs).not.toHaveBeenCalled();
  });

  it('reports a rejected reset through the alert banner', async () => {
    renderPage({}, 'reset', { onResetPrefs: vi.fn(() => Promise.reject(new Error('locked'))) });
    fireEvent.click(screen.getByRole('button', { name: s.resetButton }));
    const confirms = screen.getAllByRole('button', { name: s.resetButton });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('auto-dismisses the saved badge and the feedback banner after their timeouts', async () => {
    vi.useFakeTimers();
    try {
      const { onUpdatePrefs } = renderPage({}, 'notifications');
      fireEvent.click(screen.getByRole('switch'));
      await vi.advanceTimersByTimeAsync(0);
      expect(onUpdatePrefs).toHaveBeenCalled();
      expect(screen.getByText(s.savedIndicator)).toBeTruthy();
      await vi.advanceTimersByTimeAsync(1600);
      expect(screen.queryByText(s.savedIndicator)).toBeNull();

      onUpdatePrefs.mockRejectedValueOnce(new Error('locked'));
      fireEvent.click(screen.getByRole('switch'));
      await vi.advanceTimersByTimeAsync(0);
      expect(screen.getByRole('alert')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(4000);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirms the reset and reports success', async () => {
    const { onResetPrefs } = renderPage({}, 'reset');
    fireEvent.click(screen.getByRole('button', { name: s.resetButton }));
    const confirms = screen.getAllByRole('button', { name: s.resetButton });
    fireEvent.click(confirms[confirms.length - 1]!);
    await waitFor(() => expect(onResetPrefs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(s.resetDone)).toBeTruthy();
  });
});
