// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { settingsDict } from '@tepegoz/settings-ui';
import type { CertificateSummary, PageInfo } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { siteInfoDict } from '../../../i18n';
import { SiteInfoPopup } from './SiteInfoPopup';

/**
 * The Site Information bubble as a popup surface. It walks three panes (panel → Security → Certificate)
 * with a back arrow, lists a permission row only for capabilities the site asked for or the user
 * decided (writes going through the same `updatePreferences` path as the Permissions Center), and
 * shrinks the native window to its content. Errors and the "still loading" state are worded apart.
 */

stubJsdomLayout();

const t = siteInfoDict.en;
const pc = settingsDict.en.permissionsCenter;

const cert = (over: Partial<CertificateSummary> = {}): CertificateSummary => ({
  subjectName: 'example.com',
  issuerName: "Example CA",
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2027-01-01T00:00:00.000Z',
  serialNumber: 'AA:BB',
  fingerprint: 'DE:AD:BE:EF',
  subjectAltNames: ['example.com', 'www.example.com'],
  chain: [{ subjectName: 'Example Root', issuerName: 'Example Root', validFrom: '', validTo: '' }],
  ...over,
});

const info = (over: Partial<PageInfo> = {}): PageInfo => ({
  url: 'https://example.com/page',
  origin: 'https://example.com',
  host: 'example.com',
  scheme: 'https:',
  level: 'secure',
  isPrivateWindow: false,
  certificate: cert(),
  certErrorCode: null,
  cookieCount: 3,
  permissions: [],
  trustLevel: null,
  ...over,
});

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getPageInfo: vi.fn<(url: string) => Promise<PageInfo | null>>(() => Promise.resolve(info())),
  updatePreferences: vi.fn<(patch: unknown) => Promise<unknown>>(() =>
    Promise.resolve({ ...DEFAULT_PREFERENCES }),
  ),
  clearSiteData: vi.fn(() => Promise.resolve({ site: 'example.com' })),
  navigateTab: vi.fn(),
  closePopup: vi.fn(),
  resizePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getPageInfo.mockResolvedValue(info());
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

const renderPopup = (url = 'https://example.com/page') => render(<SiteInfoPopup url={url} />);

describe('SiteInfoPopup', () => {
  it('closes on Escape and reports its measured height to the native window', async () => {
    renderPopup();
    await waitFor(() => expect(bridge.resizePopup).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('closes the popup when the header close button is clicked', async () => {
    renderPopup();
    await screen.findByText(t.connectionSecureTitle);
    fireEvent.click(screen.getByRole('button', { name: t.close }));
    expect(bridge.closePopup).toHaveBeenCalled();
  });

  it('shows the load-error line (distinct from "loading") when the bridge has no info', async () => {
    bridge.getPageInfo.mockResolvedValue(null);
    renderPopup();
    await waitFor(() => expect(screen.getByText(t.loadError)).toBeTruthy());
  });

  it('shows the load-error line when getPageInfo rejects', async () => {
    bridge.getPageInfo.mockRejectedValueOnce(new Error('main blew up'));
    renderPopup();
    await waitFor(() => expect(screen.getByText(t.loadError)).toBeTruthy());
  });

  it('renders the panel: secure connection, cookie count, and the site-settings link', async () => {
    renderPopup();
    await screen.findByText(t.connectionSecureTitle);
    expect(screen.getByText(t.cookiesInUse.replace('{count}', '3'))).toBeTruthy();

    fireEvent.click(screen.getByText(t.siteSettings));
    expect(bridge.navigateTab).toHaveBeenCalledWith('tepegoz://settings#privacy');
    expect(bridge.closePopup).toHaveBeenCalled();
  });

  it('shows the invalid-certificate styling, omits an empty serial, and falls back for a bad date', async () => {
    bridge.getPageInfo.mockResolvedValue(
      info({
        certErrorCode: 'net::ERR_CERT_DATE_INVALID',
        certificate: cert({ serialNumber: '', validFrom: 'not-a-date' }),
      }),
    );
    renderPopup();
    fireEvent.click(await screen.findByText(t.connectionSecureTitle));
    fireEvent.click(await screen.findByText(t.certificateInvalid));

    expect(await screen.findByText(t.certificate)).toBeTruthy();
    expect(screen.queryByText('AA:BB')).toBeNull();
    expect(screen.getByText('not-a-date')).toBeTruthy(); // fmtDate falls back to the raw string
  });

  it('drills panel → Security → Certificate and walks back', async () => {
    renderPopup();
    fireEvent.click(await screen.findByText(t.connectionSecureTitle));

    // Security pane
    expect(await screen.findByText(t.securityTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.certificateValid));

    // Certificate pane
    expect(await screen.findByText(t.certificate)).toBeTruthy();
    expect(screen.getByText('AA:BB')).toBeTruthy(); // serial — unique to the cert row
    expect(screen.getByText('DE:AD:BE:EF')).toBeTruthy(); // fingerprint
    expect(screen.getByText('example.com, www.example.com')).toBeTruthy(); // SANs
    expect(screen.getByText('Example Root')).toBeTruthy(); // chain node

    // back to Security, then back to the panel
    fireEvent.click(screen.getByRole('button', { name: t.back }));
    expect(await screen.findByText(t.securityTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.back }));
    await screen.findByText(t.siteSettings);
  });

  it('clears site data through the inline confirm and refetches', async () => {
    renderPopup();
    await screen.findByText(t.connectionSecureTitle);

    fireEvent.click(screen.getByText(t.clearSiteData));
    fireEvent.click(screen.getByRole('button', { name: t.clearSiteDataConfirm }));
    await waitFor(() => expect(bridge.clearSiteData).toHaveBeenCalledWith('https://example.com/page'));
    await waitFor(() => expect(bridge.getPageInfo).toHaveBeenCalledTimes(2));
  });

  it('dismisses the clear confirm without clearing', async () => {
    renderPopup();
    await screen.findByText(t.connectionSecureTitle);
    fireEvent.click(screen.getByText(t.clearSiteData));
    const confirmBox = screen.getByText(t.clearSiteDataBody.replace('{site}', 'example.com')).parentElement as HTMLElement;
    fireEvent.click(within(confirmBox).getByRole('button', { name: t.close }));
    expect(bridge.clearSiteData).not.toHaveBeenCalled();
    expect(screen.queryByText(t.clearSiteDataBody.replace('{site}', 'example.com'))).toBeNull();
  });

  it('lists a permission row, writes a change through updatePreferences, and offers a reset', async () => {
    bridge.getPageInfo.mockResolvedValue(
      info({ permissions: [{ capability: 'geolocation', state: 'allowed' }] }),
    );
    renderPopup();
    const select = await screen.findByLabelText(pc.capability.geolocation);
    fireEvent.change(select, { target: { value: 'denied' } });
    await waitFor(() => expect(bridge.updatePreferences).toHaveBeenCalled());
    const patch = bridge.updatePreferences.mock.calls[0]?.[0] as {
      sitePermissions?: Record<string, { geolocation?: string }>;
    } | undefined;
    expect(patch?.sitePermissions?.['https://example.com']?.geolocation).toBe('denied');

    // a non-prompt state → the reset link is shown
    fireEvent.click(screen.getByRole('button', { name: t.resetPermissions }));
    await waitFor(() => expect(bridge.updatePreferences).toHaveBeenCalledTimes(2));
  });

  it('shows the certificate-invalid wording and the trust-level footer', async () => {
    bridge.getPageInfo.mockResolvedValue(
      info({ level: 'dangerous', certErrorCode: 'ERR_CERT_DATE_INVALID', trustLevel: 'trusted' }),
    );
    renderPopup();
    expect(await screen.findByText(t.connectionDangerousTitle)).toBeTruthy();
    expect(screen.getByText(t.trustLevel.replace('{level}', 'trusted'))).toBeTruthy();

    fireEvent.click(screen.getByText(t.connectionDangerousTitle));
    expect(await screen.findByText(t.certificateInvalid)).toBeTruthy();
  });

  it('keeps its defaults when the preferences fetch rejects', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('prefs gone'));
    renderPopup();
    await screen.findByText(t.connectionSecureTitle);
  });

  it('resolves the stored tr locale', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    renderPopup();
    expect(await screen.findByText(siteInfoDict.tr.connectionSecureTitle)).toBeTruthy();
  });

  it('falls back to the internal treatment for an unclassified security level', async () => {
    bridge.getPageInfo.mockResolvedValue(info({ level: 'unknown', cookieCount: 1 }));
    renderPopup();
    // `unknown` is not in SHOWN_LEVELS → treated as `internal`, and one cookie uses the singular line
    expect(await screen.findByText(t.connectionInternalNote)).toBeTruthy();
    expect(screen.getByText(t.cookiesInUseOne)).toBeTruthy();
  });

  it('for an internal page: no cookie row, no drill-down certificate row', async () => {
    bridge.getPageInfo.mockResolvedValue(
      info({
        url: 'tepegoz://settings',
        origin: '',
        host: '',
        scheme: 'tepegoz:',
        level: 'internal',
        certificate: null,
        cookieCount: 0,
        permissions: [],
      }),
    );
    renderPopup('tepegoz://settings');
    expect(await screen.findByText(t.connectionInternalNote)).toBeTruthy();
    expect(screen.queryByText(t.clearSiteData)).toBeNull();
    // header falls back to the scheme without its colon
    expect(screen.getByText('tepegoz')).toBeTruthy();
  });
});
