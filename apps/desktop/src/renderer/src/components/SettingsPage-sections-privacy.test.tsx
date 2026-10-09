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
  exportPreferences: vi.fn(() => Promise.resolve('{"theme":"dark"}')),
  importPreferences: vi.fn(() => Promise.resolve({ applied: 2, skipped: [] as string[] })),
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
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));

    await waitFor(() =>
      expect(
        screen.getByText(s.forgetSite.confirmFor.replace('{site}', 'example.com')),
      ).toBeTruthy(),
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
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));
    await waitFor(() => screen.getByRole('button', { name: s.forgetSite.confirm }));
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.confirm }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: s.forgetSite.confirm })).toBeNull(),
    );
    expect(screen.queryByText(s.forgetSite.cleared.replace('{site}', 'example.com'))).toBeNull();
  });

  it('ForgetSiteRow: a clear that returns nothing reports nothing', async () => {
    // `clearSiteData` resolves null when main could not act on the url. Reporting "cleared
    // example.com" off a null result would be the settings page claiming a deletion that did not
    // happen — the one sentence a privacy screen must not say falsely.
    bridge.clearSiteData.mockResolvedValueOnce(null);
    renderPrivacy();
    fireEvent.change(screen.getByLabelText(s.forgetSite.title), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.review }));
    await waitFor(() => screen.getByRole('button', { name: s.forgetSite.confirm }));

    fireEvent.click(screen.getByRole('button', { name: s.forgetSite.confirm }));

    // the confirm panel still goes away, but no "cleared" line appears
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

describe('privacyAndAdvancedSections — HTTPS-only on tunnelled tabs', () => {
  it('renders the toggle from prefs and writes false when switched off', () => {
    const { setPref } = renderPrivacy({ httpsOnlyOnTunnel: true });
    const toggle = screen.getByTestId('toggle-https-only-tunnel');
    expect(screen.getByText(s.httpsOnly.title)).toBeTruthy();
    expect(screen.getByText(s.httpsOnly.desc)).toBeTruthy();
    fireEvent.click(toggle);
    expect(setPref).toHaveBeenCalledTimes(1);
    expect(setPref).toHaveBeenCalledWith({ httpsOnlyOnTunnel: false });
  });

  it('writes true when switched back on from the off state', () => {
    const { setPref } = renderPrivacy({ httpsOnlyOnTunnel: false });
    fireEvent.click(screen.getByTestId('toggle-https-only-tunnel'));
    expect(setPref).toHaveBeenCalledWith({ httpsOnlyOnTunnel: true });
    expect(setPref).not.toHaveBeenCalledWith(
      expect.objectContaining({ safeBrowsingEnabled: true }),
    );
  });

  it('is found by settings search, and says the Site Info warning stays', () => {
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.httpsOnly.title);
    expect(section!.searchText).toContain(s.httpsOnly.desc);
    expect(s.httpsOnly.desc).toMatch(/Site Info/);
  });

  it('has a Turkish translation distinct from English', () => {
    expect(settingsDict.tr.httpsOnly.title.length).toBeGreaterThan(0);
    expect(settingsDict.tr.httpsOnly.title).not.toBe(s.httpsOnly.title);
    expect(settingsDict.tr.httpsOnly.desc).not.toBe(s.httpsOnly.desc);
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

describe('privacyAndAdvancedSections — the Back up settings card', () => {
  function renderReset() {
    const c = ctx();
    const section = privacyAndAdvancedSections(c.ctx).find((sec) => sec.id === 'reset');
    render(<I18nProvider locale="en">{section!.content}</I18nProvider>);
    return c;
  }

  it('downloads the exported JSON the bridge returns via a blob link', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const realCreate = document.createElement.bind(document);
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = click;
        anchor = el as HTMLAnchorElement;
      }
      return el;
    });

    renderReset();
    fireEvent.click(screen.getByRole('button', { name: s.exportButton }));

    await waitFor(() => expect(bridge.exportPreferences).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(anchor?.download).toBe('tepegoz-settings.json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
  });

  it('sends the picked file text to the bridge and reports the applied + skipped counts', async () => {
    bridge.importPreferences.mockResolvedValueOnce({ applied: 3, skipped: ['ghostKey'] });
    renderReset();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('{"theme":"dark"}') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(bridge.importPreferences).toHaveBeenCalledWith('{"theme":"dark"}'));
    await screen.findByText(/Imported 3/);
    expect(screen.getByText(/Skipped 1/)).toBeTruthy();
  });

  it('shows the failure string when the import bridge rejects a bad file', async () => {
    bridge.importPreferences.mockRejectedValueOnce(new Error('bad request'));
    renderReset();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { text: () => Promise.resolve('not json') } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(s.importFailed);
  });
});

describe('privacyAndAdvancedSections — Autoplay', () => {
  it('shows the current policy, writes a change, and is found by settings search', () => {
    const { setPref } = renderPrivacy({ autoplayPolicy: 'block-audio' });
    const select = document.getElementById('autoplay-policy') as HTMLSelectElement;
    expect(select.value).toBe('block-audio');
    // Two honest choices — there is no "block everything", which Chromium cannot deliver.
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['allow', 'block-audio']);
    fireEvent.change(select, { target: { value: 'allow' } });
    expect(setPref).toHaveBeenCalledWith({ autoplayPolicy: 'allow' });
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.autoplay.title);
    expect(s.autoplay.desc).toMatch(/tabs you open after/);
  });
});

describe('privacyAndAdvancedSections — Secure DNS', () => {
  const get = (id: string) =>
    document.getElementById(id) as HTMLSelectElement | HTMLInputElement | null;

  it('shows only the mode while off, and writes the chosen mode', () => {
    const { setPref } = renderPrivacy({ secureDnsMode: 'off' });
    expect(get('secure-dns-mode')!.value).toBe('off');
    expect(get('secure-dns-provider')).toBeNull();
    fireEvent.change(get('secure-dns-mode')!, { target: { value: 'automatic' } });
    expect(setPref).toHaveBeenCalledWith({ secureDnsMode: 'automatic' });
  });

  it('shows the provider once on, and writes it; the custom address only for "Custom"', () => {
    const { setPref } = renderPrivacy({ secureDnsMode: 'secure', secureDnsProvider: 'cloudflare' });
    expect(get('secure-dns-custom-url')).toBeNull();
    fireEvent.change(get('secure-dns-provider')!, { target: { value: 'quad9' } });
    expect(setPref).toHaveBeenCalledWith({ secureDnsProvider: 'quad9' });
  });

  it('commits a valid custom address on blur, and flags and withholds an invalid one', () => {
    const { setPref } = renderPrivacy({
      secureDnsMode: 'secure',
      secureDnsProvider: 'custom',
      secureDnsCustomUrl: '',
    });
    const input = get('secure-dns-custom-url')!;
    fireEvent.change(input, { target: { value: 'http://dns.example/dns-query' } });
    fireEvent.blur(input);
    expect(screen.getByText(s.secureDns.customUrlInvalid)).toBeTruthy();
    // Nothing was written for the invalid address (no call carries a custom URL at all).
    expect(setPref.mock.calls.some(([patch]) => 'secureDnsCustomUrl' in (patch as object))).toBe(
      false,
    );
    fireEvent.change(input, { target: { value: ' https://dns.example/dns-query ' } });
    fireEvent.blur(input);
    expect(setPref).toHaveBeenCalledWith({ secureDnsCustomUrl: 'https://dns.example/dns-query' });
  });

  it('is found by settings search and says who sees the lookups', () => {
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.secureDns.title);
    expect(s.secureDns.desc).toMatch(/provider you pick sees your lookups/);
  });
});

describe('privacyAndAdvancedSections — HTTPS-first for all sites', () => {
  it('is off by default, writes true when switched on, and is found by settings search', () => {
    const { setPref } = renderPrivacy({ httpsFirstEverywhere: false });
    expect(screen.getByText(s.httpsFirst.title)).toBeTruthy();
    fireEvent.click(screen.getByTestId('toggle-https-first'));
    expect(setPref).toHaveBeenCalledWith({ httpsFirstEverywhere: true });
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.httpsFirst.title);
    expect(s.httpsFirst.desc).toMatch(/your own network/);
  });
});

describe('privacyAndAdvancedSections — pre-resolve linked addresses', () => {
  it('is on by default, writes false when switched off, and is found by settings search', () => {
    const { setPref } = renderPrivacy({ preloadPages: true });
    expect(screen.getByText(s.preload.title)).toBeTruthy();
    fireEvent.click(screen.getByTestId('toggle-preload-pages'));
    expect(setPref).toHaveBeenCalledWith({ preloadPages: false });
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.preload.title);
    expect(s.preload.desc).toMatch(/VPN/);
  });

  it('writes true when switched back on', () => {
    const { setPref } = renderPrivacy({ preloadPages: false });
    fireEvent.click(screen.getByTestId('toggle-preload-pages'));
    expect(setPref).toHaveBeenCalledWith({ preloadPages: true });
  });
});

describe('privacyAndAdvancedSections — privacy signals', () => {
  it('Global Privacy Control is on by default and writes false when switched off', () => {
    const { setPref } = renderPrivacy({ globalPrivacyControl: true });
    expect(screen.getByText(s.privacySignals.gpcTitle)).toBeTruthy();
    fireEvent.click(screen.getByTestId('toggle-global-privacy-control'));
    expect(setPref).toHaveBeenCalledWith({ globalPrivacyControl: false });
  });

  it('Do Not Track is off by default and writes true when switched on', () => {
    const { setPref } = renderPrivacy({ doNotTrack: false });
    fireEvent.click(screen.getByTestId('toggle-do-not-track'));
    expect(setPref).toHaveBeenCalledWith({ doNotTrack: true });
  });

  it('both are found by settings search', () => {
    const section = privacyAndAdvancedSections(ctx().ctx).find((sec) => sec.id === 'privacy');
    expect(section!.searchText).toContain(s.privacySignals.gpcTitle);
    expect(section!.searchText).toContain(s.privacySignals.dntTitle);
  });
});
