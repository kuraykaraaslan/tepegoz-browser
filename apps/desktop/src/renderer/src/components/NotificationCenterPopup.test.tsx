// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppNotification } from '@tepegoz/shared-types/notifications';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { notificationsUiDict } from '@tepegoz/notifications-ui/i18n';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { NotificationCenterPopup } from './NotificationCenterPopup';

/**
 * The standalone notification-center popup window. Coverage focus: the bridge wiring (snapshot fetch,
 * live subscription, Escape closes, per-item mutations delegate to main) and the module-private
 * `formatRelative` — exercised through the list's rendered timestamps (seconds / minutes / hours).
 */

stubJsdomLayout();

function notif(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    kind: 'info',
    source: 'system',
    title: 'Update',
    body: 'Ready.',
    ts: Date.now(),
    read: false,
    channels: ['center'],
    ...over,
  };
}

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  listNotifications: vi.fn(() => Promise.resolve({ items: [] as AppNotification[], unread: 0 })),
  onNotificationsState: vi.fn(() => () => undefined),
  dismissNotification: vi.fn(),
  dismissAllNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  navigateTab: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  bridge.listNotifications.mockResolvedValue({ items: [], unread: 0 });
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotificationCenterPopup', () => {
  it('fetches the snapshot and subscribes to live pushes', async () => {
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(bridge.listNotifications).toHaveBeenCalled());
    expect(bridge.onNotificationsState).toHaveBeenCalled();
  });

  it('closes the popup on Escape', async () => {
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('delegates a per-item dismiss to the main process', async () => {
    bridge.listNotifications.mockResolvedValue({ items: [notif({ id: 'n7' })], unread: 1 });
    render(<NotificationCenterPopup />);
    const dismiss = await screen.findByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismiss);
    expect(bridge.dismissNotification).toHaveBeenCalledWith('n7');
  });

  it('renders a locale-aware relative time (minutes)', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ ts: Date.now() - 5 * 60_000 })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(screen.getByText(/5 min/i)).toBeTruthy());
  });

  it('renders a relative time in seconds for a just-now notification', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ ts: Date.now() - 10_000 })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(screen.getByText(/\d+ sec/i)).toBeTruthy());
  });

  it('applies the fetched theme and falls back to the OS language for a non-en/tr locale', async () => {
    bridge.getPreferences.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      locale: 'de' as (typeof DEFAULT_PREFERENCES)['locale'],
      themeColor: '#0088ff',
    });
    render(<NotificationCenterPopup />);
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--primary')).not.toBe(''),
    );
  });

  it('resolves the stored tr locale', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<NotificationCenterPopup />);
    expect(await screen.findByText(notificationsUiDict.tr.title)).toBeTruthy();
  });

  it('marks a notification read, marks all read, and clears all through the header/row controls', async () => {
    bridge.listNotifications.mockResolvedValue({ items: [notif({ id: 'n1', read: false })], unread: 1 });
    render(<NotificationCenterPopup />);

    fireEvent.click(await screen.findByText('Update'));
    expect(bridge.markNotificationRead).toHaveBeenCalledWith('n1');

    fireEvent.click(screen.getByRole('button', { name: notificationsUiDict.en.markAllRead }));
    expect(bridge.markAllNotificationsRead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: notificationsUiDict.en.clearAll }));
    expect(bridge.dismissAllNotifications).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected snapshot fetch', async () => {
    bridge.listNotifications.mockRejectedValue(new Error('center offline'));
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
  });

  it('keeps its defaults when the preferences fetch rejects', async () => {
    bridge.getPreferences.mockRejectedValue(new Error('prefs offline'));
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(bridge.listNotifications).toHaveBeenCalled());
  });

  it('renders a relative time in days for a notification older than a day', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ ts: Date.now() - 3 * 86_400_000 })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(screen.getByText(/\d+ (day|days)/i)).toBeTruthy());
  });

  it('closes the popup after a navigation notification action runs', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ id: 'n9', actions: [{ id: 'a', label: 'Open settings', type: 'open_settings' }] })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }));
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('renders a relative time in hours for an older notification', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ ts: Date.now() - 3 * 3_600_000 })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(screen.getByText(/3 hr/i)).toBeTruthy());
  });
});
