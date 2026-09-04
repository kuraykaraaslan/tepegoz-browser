// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { settingsDict } from '@tepegoz/settings-ui';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { privacyAndAdvancedSections } from './SettingsPage-sections-privacy';
import type { SettingsSectionsCtx } from './SettingsPage-sections';

/**
 * `privacyAndAdvancedSections` is a pure builder; its `content` JSX only runs when rendered. This
 * mounts the "privacy" section and drives its two bridge-backed rows — `ForgetSiteRow` (plan → clear)
 * and `ClientCertificatesRow` (list → forget, and the load-failed message) — plus the three plain
 * toggles in that card, and checks the developer section is omitted when `developerVisible` is false.
 */

const s = settingsDict.en;

const bridge = {
  planSiteDataClear: vi.fn(),
  clearSiteData: vi.fn(),
  listClientCertificateChoices: vi.fn(),
  forgetClientCertificateChoices: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.planSiteDataClear.mockResolvedValue({
    site: 'example.com',
    origins: ['https://example.com'],
    kinds: ['cookies'],
    warnings: ['signs_you_out'],
  });
  bridge.clearSiteData.mockResolvedValue({ site: 'example.com' });
  bridge.listClientCertificateChoices.mockResolvedValue([]);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function ctx(over: Partial<Preferences> = {}, developerVisible = true) {
  const setPref = vi.fn();
  const clearBrowsingHistory = vi.fn();
  const resetToDefaults = vi.fn();
  return {
    setPref,
    clearBrowsingHistory,
    resetToDefaults,
    ctx: {
      s,
      prefs: { ...DEFAULT_PREFERENCES, ...over },
      status: {},
      developerVisible,
      setPref,
      notify: vi.fn(),
      setDeveloperPref: vi.fn(() => Promise.resolve()),
      clearBrowsingHistory,
      resetToDefaults,
    } as unknown as SettingsSectionsCtx,
  };
}

function renderPrivacy(over: Partial<Preferences> = {}) {
  const c = ctx(over);
  const section = privacyAndAdvancedSections(c.ctx).find((sec) => sec.id === 'privacy');
  render(<I18nProvider locale="en">{section!.content}</I18nProvider>);
  return c;
}

describe('privacyAndAdvancedSections — the privacy card', () => {
  it('writes each of the three plain privacy toggles', () => {
    const { setPref } = renderPrivacy({
      telemetryEnabled: false,
      safeBrowsingEnabled: false,
    });
    fireEvent.click(screen.getByTestId('toggle-telemetry'));
    fireEvent.click(screen.getByTestId('toggle-safe-browsing'));
    expect(setPref).toHaveBeenCalledWith({ telemetryEnabled: true });
    expect(setPref).toHaveBeenCalledWith({ safeBrowsingEnabled: true });
  });

  it('ForgetSiteRow: review builds a plan, confirm clears and reports', async () => {
    renderPrivacy();
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));

    await waitFor(() =>
      expect(screen.getByText(s.forgetSite.confirmFor.replace('{site}', 'example.com'))).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.confirm }));
    await waitFor(() =>
      expect(screen.getByText(s.forgetSite.cleared.replace('{site}', 'example.com'))).toBeTruthy(),
    );
  });

  it('writes the clear-on-exit selection when a category is ticked', () => {
    const { setPref } = renderPrivacy({ clearOnExit: [] });
    // ClearBrowsingDataRow is collapsed by default, so the only checkboxes are the on-exit categories
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    const patch = setPref.mock.calls.at(-1)?.[0] as { clearOnExit?: unknown };
    expect(Array.isArray(patch.clearOnExit)).toBe(true);
    expect((patch.clearOnExit as unknown[]).length).toBe(1);
  });

  it('ForgetSiteRow: a failed clear also drops the confirm panel', async () => {
    bridge.clearSiteData.mockRejectedValueOnce(new Error('clear failed'));
    renderPrivacy();
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));
    await waitFor(() => screen.getByRole('button', { name: s.forgetSite.confirm }));
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.confirm }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: s.forgetSite.confirm })).toBeNull(),
    );
    expect(screen.queryByText(s.forgetSite.cleared.replace('{site}', 'example.com'))).toBeNull();
  });

  it('ForgetSiteRow: a failed plan clears the panel rather than showing a stale one', async () => {
    bridge.planSiteDataClear.mockRejectedValueOnce(new Error('no such site'));
    renderPrivacy();
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));
    await waitFor(() => expect(bridge.planSiteDataClear).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: s.forgetSite.confirm })).toBeNull();
  });

  it('ClientCertificatesRow: lists remembered choices and forgets them', async () => {
    bridge.listClientCertificateChoices.mockResolvedValue([
      { origin: 'https://corp.example', sent: true },
      { origin: 'https://other.example', sent: false },
    ]);
    renderPrivacy();
    await waitFor(() => expect(screen.getByText('https://corp.example')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: s.clientCerts.forget }));
    await waitFor(() => expect(screen.getByText(s.clientCerts.forgotten)).toBeTruthy());
  });

  it('ClientCertificatesRow: says so when the stored decisions could not be read', async () => {
    bridge.listClientCertificateChoices.mockRejectedValueOnce(new Error('store gone'));
    renderPrivacy();
    await waitFor(() => expect(screen.getByText(s.clientCerts.unavailable)).toBeTruthy());
  });
});

describe('privacyAndAdvancedSections — developer gating', () => {
  it('includes the developer section only when developerVisible is true', () => {
    const withDev = privacyAndAdvancedSections(ctx({}, true).ctx).map((sec) => sec.id);
    const withoutDev = privacyAndAdvancedSections(ctx({}, false).ctx).map((sec) => sec.id);
    expect(withDev).toContain('developer');
    expect(withoutDev).not.toContain('developer');
  });
});
