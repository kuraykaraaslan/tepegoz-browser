// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { NotificationBellButton } from './NotificationBellButton';

/**
 * The caption-row notification bell. It opens the notification center as a native popup, mirrors the
 * live unread count into a badge (clamped at "99+"), and keeps `aria-expanded` honest when the popup
 * is dismissed from outside (main's `onPopupClosed`).
 */

type StateListener = (s: { unread: number }) => void;
type ClosedListener = (surface: string) => void;

let stateListener: StateListener = () => {};
let closedListener: ClosedListener = () => {};

const bridge = {
  listNotifications: vi.fn(() => Promise.resolve({ unread: 0 })),
  onNotificationsState: vi.fn((cb: StateListener) => {
    stateListener = cb;
    return () => {};
  }),
  onPopupClosed: vi.fn((cb: ClosedListener) => {
    closedListener = cb;
    return () => {};
  }),
  openPopup: vi.fn(),
  closePopup: vi.fn(),
};

function renderBell() {
  return render(
    <I18nProvider locale="en">
      <NotificationBellButton />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.listNotifications.mockResolvedValue({ unread: 0 });
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('NotificationBellButton', () => {
  it('shows no badge while there is nothing unread', async () => {
    renderBell();
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
    // the badge span is only rendered when active
    expect(screen.getByRole('button').querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('renders the unread count from the initial fetch', async () => {
    bridge.listNotifications.mockResolvedValue({ unread: 3 });
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toContain('3');
    });
  });

  it('clamps a large unread count to "99+"', async () => {
    bridge.listNotifications.mockResolvedValue({ unread: 250 });
    renderBell();
    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toContain('99+');
    });
  });

  it('stays at zero unread when the initial listNotifications call rejects', async () => {
    bridge.listNotifications.mockRejectedValueOnce(new Error('bridge unavailable'));
    renderBell();
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
    expect(screen.getByRole('button').querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('reflects a pushed state update', async () => {
    renderBell();
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
    act(() => stateListener({ unread: 7 }));
    expect(screen.getByRole('button').textContent).toContain('7');
  });

  it('opens the native popup on click and toggles it closed on the next click', async () => {
    renderBell();
    await waitFor(() => expect(bridge.onNotificationsState).toHaveBeenCalled());
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(bridge.openPopup).toHaveBeenCalledWith(
      'notifications',
      expect.any(Object),
      expect.any(Object),
    );
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('resets aria-expanded when main reports the notifications popup closed', async () => {
    renderBell();
    await waitFor(() => expect(bridge.onPopupClosed).toHaveBeenCalled());
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    act(() => closedListener('notifications'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
