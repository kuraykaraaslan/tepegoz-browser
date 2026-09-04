// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { DownloadSettingsSection } from './settings-downloads';

/**
 * Settings → Downloads. Under test: the native directory picker fills the path field and commits it
 * (a browser that makes you type an absolute path invites a typo); "Open folder" is dead with no path
 * set and shows an error when the OS could not open it; and "clear download history" is confirmed,
 * reports a count, and reports zero (not a stale count) when the clear fails.
 */

const s = settingsDict.en;

const pickDownloadDirectory = vi.fn();
const openDownloadFolder = vi.fn();
const clearFinishedDownloads = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { pickDownloadDirectory, openDownloadFolder, clearFinishedDownloads },
  });
});
afterEach(cleanup);

function renderSection(over: Partial<Preferences> = {}) {
  const setPref = vi.fn();
  render(
    <I18nProvider locale="en">
      <DownloadSettingsSection prefs={{ ...DEFAULT_PREFERENCES, ...over }} setPref={setPref} />
    </I18nProvider>,
  );
  return { setPref };
}

describe('DownloadSettingsSection', () => {
  it('fills and commits the download directory from the native picker', async () => {
    pickDownloadDirectory.mockResolvedValue({ cancelled: false, path: '/home/me/Downloads' });
    const { setPref } = renderSection({ downloadDirectory: '' });
    fireEvent.click(screen.getByRole('button', { name: s.downloadLocationBrowse }));
    await vi.waitFor(() =>
      expect(setPref).toHaveBeenCalledWith({ downloadDirectory: '/home/me/Downloads' }),
    );
  });

  it('ignores a cancelled directory pick', async () => {
    pickDownloadDirectory.mockResolvedValue({ cancelled: true, path: '' });
    const { setPref } = renderSection({ downloadDirectory: '' });
    fireEvent.click(screen.getByRole('button', { name: s.downloadLocationBrowse }));
    await Promise.resolve();
    expect(setPref).not.toHaveBeenCalled();
  });

  it('disables "Open folder" until a directory is set', () => {
    renderSection({ downloadDirectory: '' });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: s.downloadLocationOpen }).disabled,
    ).toBe(true);
  });

  it('shows the open-failed message when the OS could not open the folder', async () => {
    openDownloadFolder.mockResolvedValue(false);
    renderSection({ downloadDirectory: '/somewhere' });
    fireEvent.click(screen.getByRole('button', { name: s.downloadLocationOpen }));
    await vi.waitFor(() =>
      expect(screen.getByText(s.downloadLocationOpenFailed)).toBeTruthy(),
    );
  });

  it('shows the open-failed message when the open call rejects outright', async () => {
    openDownloadFolder.mockRejectedValue(new Error('spawn failed'));
    renderSection({ downloadDirectory: '/somewhere' });
    fireEvent.click(screen.getByRole('button', { name: s.downloadLocationOpen }));
    await vi.waitFor(() => expect(screen.getByText(s.downloadLocationOpenFailed)).toBeTruthy());
  });

  it('commits a hand-typed directory on blur', () => {
    const { setPref } = renderSection({ downloadDirectory: '' });
    const field = screen.getByLabelText(s.downloadLocationLabel);
    fireEvent.change(field, { target: { value: '/home/me/Docs' } });
    fireEvent.blur(field);
    expect(setPref).toHaveBeenCalledWith({ downloadDirectory: '/home/me/Docs' });
  });

  it('writes the show-downloads-when-done toggle', () => {
    const { setPref } = renderSection({ showDownloadsWhenDone: false });
    fireEvent.click(screen.getByRole('switch', { name: new RegExp(s.showDownloadsWhenDone, 'i') }));
    expect(setPref).toHaveBeenCalledWith({ showDownloadsWhenDone: true });
  });

  it('writes the ask-each-time toggle', () => {
    const { setPref } = renderSection({ downloadAskEachTime: false });
    fireEvent.click(screen.getByRole('switch', { name: /ask where to save each file/i }));
    expect(setPref).toHaveBeenCalledWith({ downloadAskEachTime: true });
  });

  it('writes the retention select', () => {
    const { setPref } = renderSection();
    fireEvent.change(screen.getByLabelText(s.downloadRetention), {
      target: { value: 'on-completion' },
    });
    expect(setPref).toHaveBeenCalledWith({ downloadHistoryRetention: 'on-completion' });
  });

  it('confirms, clears, and reports the removed count', async () => {
    clearFinishedDownloads.mockResolvedValue(5);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: s.clearDownloadsButton }));
    const confirmButtons = screen.getAllByRole('button', { name: s.clearDownloadsButton });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await vi.waitFor(() => expect(screen.getByText(/5 removed/)).toBeTruthy());
  });

  it('reports zero removed (not a stale count) when the clear fails', async () => {
    clearFinishedDownloads.mockRejectedValue(new Error('io'));
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: s.clearDownloadsButton }));
    const confirmButtons = screen.getAllByRole('button', { name: s.clearDownloadsButton });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await vi.waitFor(() => expect(screen.getByText(/0 removed/)).toBeTruthy());
  });
});
