// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  INTERNAL_SETTINGS_URL,
  type AppNotification,
  type BasicAuthRequest,
  type CertificateErrorRequest,
  type ClientCertificateRequest,
} from '@tepegoz/desktop-ipc';
import { notificationsUiDict } from '@tepegoz/notifications-ui/i18n';
import { browserDict } from '../../i18n';
import type { BookmarksBarResult } from './app-bookmarks';
import { useBasicAuth } from './app-basic-auth';
import { useCertWarning } from './app-cert-warning';
import { useClientCert } from './app-client-cert';
import { AppOverlays } from './App-overlays';

/**
 * The App shell's floating overlays (ADR-0010 split of `App.tsx`): the toast stack, the four blocking
 * consent modals (Web Notification permission, HTTP basic-auth, TLS cert warning, client-cert chooser),
 * and the bookmark-folder "open all" confirmation. Every prompt component itself is presentational and
 * fully tested in its own package; this pins the GLUE — which hook feeds which `Modal`'s `open`, and
 * that every callback reaches the right prop (`dismissToast`/`answerPermission`/the mocked hooks'
 * setters/`bookmarks.setOpenAllUrls`/`window.tepegoz.createTabInBackground`).
 */

vi.mock('./app-basic-auth', () => ({ useBasicAuth: vi.fn() }));
vi.mock('./app-cert-warning', () => ({ useCertWarning: vi.fn() }));
vi.mock('./app-client-cert', () => ({ useClientCert: vi.fn() }));

const t = notificationsUiDict.en;
const browserT = browserDict.en;

const basicAuth = { request: null as BasicAuthRequest | null, submit: vi.fn(), cancel: vi.fn() };
const certWarning = {
  request: null as CertificateErrorRequest | null,
  proceed: vi.fn(),
  refuse: vi.fn(),
};
const clientCert = {
  request: null as ClientCertificateRequest | null,
  choose: vi.fn(),
  dismiss: vi.fn(),
};

const bridge = { navigateTab: vi.fn(), createTab: vi.fn(), createTabInBackground: vi.fn() };

function notif(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 't1',
    kind: 'info',
    source: 'system',
    title: 'Title',
    body: '',
    ts: 0,
    read: false,
    channels: ['toast'],
    ...over,
  };
}

function bookmarksFixture(over: Partial<BookmarksBarResult> = {}): BookmarksBarResult {
  return { openAllUrls: null, setOpenAllUrls: vi.fn(), ...over } as unknown as BookmarksBarResult;
}

function renderOverlays(over: Partial<Parameters<typeof AppOverlays>[0]> = {}) {
  const props = {
    locale: 'en' as const,
    toasts: [] as AppNotification[],
    dismissToast: vi.fn(),
    permReq: null,
    answerPermission: vi.fn(),
    bookmarks: bookmarksFixture(),
    ...over,
  };
  render(<AppOverlays {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  basicAuth.request = null;
  certWarning.request = null;
  clientCert.request = null;
  vi.mocked(useBasicAuth).mockReturnValue(basicAuth);
  vi.mocked(useCertWarning).mockReturnValue(certWarning);
  vi.mocked(useClientCert).mockReturnValue(clientCert);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('AppOverlays', () => {
  it('renders nothing when no overlay is active', () => {
    renderOverlays();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a toast and dismisses it via the close button', () => {
    const props = renderOverlays({ toasts: [notif()] });
    expect(screen.getByText('Title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.dismiss }));
    expect(props.dismissToast).toHaveBeenCalledWith('t1');
  });

  it('runs a toast action then dismisses it', () => {
    const props = renderOverlays({
      toasts: [notif({ actions: [{ id: 'a1', type: 'open_settings', label: 'Open settings' }] })],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_SETTINGS_URL);
    expect(props.dismissToast).toHaveBeenCalledWith('t1');
  });

  it('shows the notification-permission prompt and forwards allow/block, closing on Escape', () => {
    const props = renderOverlays({
      permReq: { requestId: 'r1', origin: 'https://site.example', capability: 'notifications' },
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(props.answerPermission).toHaveBeenCalledWith(true, true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.answerPermission).toHaveBeenCalledWith(false, false);
  });

  it('shows the basic-auth prompt, submits credentials, and cancels on Escape', () => {
    basicAuth.request = { requestId: 'r1', origin: 'https://site.example', realm: 'Realm', isProxy: false };
    renderOverlays();
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'alice' } });
    fireEvent.change(dialog.querySelector('input[type="password"]')!, { target: { value: 'hunter2' } });
    fireEvent.submit(dialog.querySelector('form')!);
    expect(basicAuth.submit).toHaveBeenCalledWith('alice', 'hunter2');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(basicAuth.cancel).toHaveBeenCalledTimes(1);
  });

  it('shows the cert-warning prompt and forwards back/proceed', () => {
    certWarning.request = {
      requestId: 'r2',
      origin: 'https://bad.example',
      errorCode: 'net::ERR_CERT_AUTHORITY_INVALID',
      issuer: 'Evil CA',
      expiry: '2020-01-01',
    };
    renderOverlays();
    expect(screen.getByText('https://bad.example')).toBeTruthy();
    fireEvent.click(screen.getByText('Continue anyway'));
    expect(certWarning.proceed).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(certWarning.refuse).toHaveBeenCalledTimes(1);
  });

  it('shows the client-cert picker and forwards choosing an option or sending nothing', () => {
    clientCert.request = {
      requestId: 'r3',
      origin: 'https://site.example',
      options: [{ index: 0, subject: 'Alice', issuer: 'CA', expiry: '2030-01-01' }],
    };
    renderOverlays();
    fireEvent.click(screen.getByText('Alice'));
    expect(clientCert.choose).toHaveBeenCalledWith(0);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(clientCert.dismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the "open all" bookmark confirmation and cancels without opening tabs', () => {
    const setOpenAllUrls = vi.fn();
    renderOverlays({ bookmarks: bookmarksFixture({ openAllUrls: ['https://a.example'], setOpenAllUrls }) });
    expect(screen.getByText(new RegExp(`${browserT.openAllConfirm.replace(/[()]/g, '\\$&')}`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: browserT.cancel }));
    expect(setOpenAllUrls).toHaveBeenCalledWith(null);
    expect(bridge.createTabInBackground).not.toHaveBeenCalled();
  });

  it('closes the "open all" confirmation on Escape without opening tabs', () => {
    const setOpenAllUrls = vi.fn();
    renderOverlays({ bookmarks: bookmarksFixture({ openAllUrls: ['https://a.example'], setOpenAllUrls }) });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setOpenAllUrls).toHaveBeenCalledWith(null);
    expect(bridge.createTabInBackground).not.toHaveBeenCalled();
  });

  it('opens every url in the folder in the background when the "open all" confirmation is confirmed', () => {
    const setOpenAllUrls = vi.fn();
    renderOverlays({
      bookmarks: bookmarksFixture({ openAllUrls: ['https://a.example', 'https://b.example'], setOpenAllUrls }),
    });
    fireEvent.click(screen.getByRole('button', { name: browserT.bookmarkMenu.openAll }));
    expect(bridge.createTabInBackground).toHaveBeenCalledWith('https://a.example');
    expect(bridge.createTabInBackground).toHaveBeenCalledWith('https://b.example');
    expect(setOpenAllUrls).toHaveBeenCalledWith(null);
  });
});
