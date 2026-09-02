// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppNotification } from '@tepegoz/shared-types/notifications';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
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
  getPreferences: () => Promise.resolve({ ...DEFAULT_PREFERENCES }),
  listNotifications: vi.fn(() => Promise.resolve({ items: [] as AppNotification[], unread: 0 })),
  onNotificationsState: vi.fn(() => () => undefined),
  dismissNotification: vi.fn(),
  dismissAllNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
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

  it('renders a relative time in hours for an older notification', async () => {
    bridge.listNotifications.mockResolvedValue({
      items: [notif({ ts: Date.now() - 3 * 3_600_000 })],
      unread: 1,
    });
    render(<NotificationCenterPopup />);
    await waitFor(() => expect(screen.getByText(/3 hr/i)).toBeTruthy());
  });
});
