// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AppNotification } from '@tepegoz/shared-types/notifications';
import { NotificationCenter, type NotificationCenterProps } from './notification-center';

// No `I18nProvider` is mounted, so `useT` falls back to the default locale (en) — assertions below
// use the source strings from ./i18n/en.
function notif(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    kind: 'info',
    source: 'system',
    title: 'System update',
    body: 'A new version is ready.',
    ts: 1_700_000_000_000,
    read: false,
    channels: ['center'],
    ...over,
  };
}

function renderCenter(over: Partial<NotificationCenterProps> = {}) {
  const handlers = {
    onDismiss: vi.fn(),
    onDismissAll: vi.fn(),
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
    onAction: vi.fn(),
  };
  const { container } = render(
    <NotificationCenter items={[notif()]} {...handlers} {...over} />,
  );
  return { container, ...handlers };
}

const disabled = (el: HTMLElement): boolean => (el as HTMLButtonElement).disabled;

afterEach(cleanup);

describe('NotificationCenter', () => {
  it('shows the empty state and disables the header bulk actions', () => {
    renderCenter({ items: [] });
    expect(screen.getByText('No notifications yet')).toBeDefined();
    expect(disabled(screen.getByRole('button', { name: 'Mark all as read' }))).toBe(true);
    expect(disabled(screen.getByRole('button', { name: 'Clear all' }))).toBe(true);
  });

  it('renders each notification title + body', () => {
    renderCenter({
      items: [
        notif({ id: 'a', title: 'First', body: 'One' }),
        notif({ id: 'b', title: 'Second', body: 'Two', read: true }),
      ],
    });
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('One')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
  });

  it('shows the unread indicator on unread rows only', () => {
    const { container } = renderCenter({
      items: [notif({ id: 'a', read: false }), notif({ id: 'b', read: true })],
    });
    expect(container.querySelectorAll('[aria-label="Unread"]')).toHaveLength(1);
  });

  it('enables mark-all-read when something is unread and fires the callback', () => {
    const { onMarkAllRead } = renderCenter({ items: [notif({ read: false })] });
    const btn = screen.getByRole('button', { name: 'Mark all as read' });
    expect(disabled(btn)).toBe(false);
    fireEvent.click(btn);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('disables mark-all-read when everything is already read', () => {
    renderCenter({ items: [notif({ read: true })] });
    expect(disabled(screen.getByRole('button', { name: 'Mark all as read' }))).toBe(true);
  });

  it('fires clear-all from the header', () => {
    const { onDismissAll } = renderCenter({ items: [notif()] });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it('marks a row read on body click only when it is unread', () => {
    const { onMarkRead } = renderCenter({
      items: [notif({ id: 'a', title: 'Unread row', read: false })],
    });
    fireEvent.click(screen.getByText('Unread row'));
    expect(onMarkRead).toHaveBeenCalledWith('a');
  });

  it('does not re-mark an already-read row on body click', () => {
    const { onMarkRead } = renderCenter({
      items: [notif({ id: 'a', title: 'Read row', read: true })],
    });
    fireEvent.click(screen.getByText('Read row'));
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('dismisses a row via its dismiss button', () => {
    const { onDismiss } = renderCenter({ items: [notif({ id: 'z' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('z');
  });

  it('hides the dismiss button for non-dismissible rows', () => {
    renderCenter({ items: [notif({ dismissible: false })] });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('renders each action button and fires onAction with the item + action', () => {
    const action = { id: 'go', label: 'Open', type: 'open_url' as const, url: 'https://ex.com' };
    const item = notif({ id: 'a', actions: [action], title: 'Has action' });
    const { onAction } = renderCenter({ items: [item] });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onAction).toHaveBeenCalledWith(item, action);
  });

  it('renders multiple actions on one notification', () => {
    const item = notif({
      id: 'm',
      actions: [
        { id: 'a1', label: 'View', type: 'open_url', url: 'https://ex.com' },
        { id: 'a2', label: 'Settings', type: 'open_settings' },
      ],
    });
    renderCenter({ items: [item] });
    expect(screen.getByRole('button', { name: 'View' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
  });

  it('renders host-formatted relative time when a formatter is given', () => {
    renderCenter({ items: [notif({ ts: 42 })], formatTime: (ts) => `t+${String(ts)}` });
    expect(screen.getByText('t+42')).toBeDefined();
  });

  it('moves row focus with Arrow / Home / End keys (autoFocus starts on the first row)', () => {
    const { container } = renderCenter({
      items: [notif({ id: 'a', title: 'A' }), notif({ id: 'b', title: 'B' }), notif({ id: 'c', title: 'C' })],
      autoFocus: true,
    });
    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-notif-row]'));
    expect(rows).toHaveLength(3);
    const list = screen.getByRole('list', { name: 'Notifications' });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('renders every notification kind without error', () => {
    renderCenter({
      items: [
        notif({ id: 'i', kind: 'info', title: 'i' }),
        notif({ id: 's', kind: 'success', title: 's' }),
        notif({ id: 'w', kind: 'warning', title: 'w' }),
        notif({ id: 'e', kind: 'error', title: 'e' }),
      ],
    });
    expect(screen.getByText('i')).toBeDefined();
    expect(screen.getByText('e')).toBeDefined();
  });
});
