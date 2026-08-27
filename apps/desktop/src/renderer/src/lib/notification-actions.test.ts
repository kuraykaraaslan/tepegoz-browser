// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_SETTINGS_URL, type AppNotification, type NotificationAction } from '@tepegoz/desktop-ipc';
import { runNotificationAction } from './notification-actions';

/**
 * A notification action carries only bounded data — no callback — so this dispatches on `type` via the
 * trusted bridge. The return value is a contract: `true` means "a surface opened/navigated, so dismiss
 * the popup", `false` means "handled in place".
 */

const bridge = {
  createTab: vi.fn(),
  createTabInBackground: vi.fn(),
  navigateTab: vi.fn(),
  trustPopupOrigin: vi.fn(),
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(() => vi.restoreAllMocks());

const item = (over: Partial<AppNotification> = {}): AppNotification =>
  ({ id: 'n1', origin: 'https://site.example', ...over }) as AppNotification;
const act = (over: Partial<NotificationAction>): NotificationAction =>
  ({ id: 'a', label: 'x', ...over }) as NotificationAction;

describe('runNotificationAction', () => {
  it('open_url → new tab, returns true', () => {
    expect(runNotificationAction(item(), act({ type: 'open_url', url: 'https://a/' }))).toBe(true);
    expect(bridge.createTab).toHaveBeenCalledWith('https://a/');
  });

  it('open_url_background → background tab, returns true', () => {
    expect(
      runNotificationAction(item(), act({ type: 'open_url_background', url: 'https://a/' })),
    ).toBe(true);
    expect(bridge.createTabInBackground).toHaveBeenCalledWith('https://a/');
  });

  it('navigate_current → navigate the active tab, returns true', () => {
    expect(runNotificationAction(item(), act({ type: 'navigate_current', url: 'https://a/' }))).toBe(
      true,
    );
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://a/');
  });

  it('a URL action with no url does nothing and returns false', () => {
    expect(runNotificationAction(item(), act({ type: 'open_url' }))).toBe(false);
    expect(bridge.createTab).not.toHaveBeenCalled();
  });

  it('trust_origin trusts the item origin THEN opens the pending popup url', () => {
    expect(
      runNotificationAction(item(), act({ type: 'trust_origin', url: 'https://popup/' })),
    ).toBe(true);
    expect(bridge.trustPopupOrigin).toHaveBeenCalledWith('https://site.example');
    expect(bridge.createTab).toHaveBeenCalledWith('https://popup/');
  });

  it('open_settings navigates to the settings page, returns true', () => {
    expect(runNotificationAction(item(), act({ type: 'open_settings' }))).toBe(true);
    expect(bridge.navigateTab).toHaveBeenCalledWith(INTERNAL_SETTINGS_URL);
  });

  it('mark_read / dismiss act on the item id and return false (handled in place)', () => {
    expect(runNotificationAction(item(), act({ type: 'mark_read' }))).toBe(false);
    expect(bridge.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(runNotificationAction(item(), act({ type: 'dismiss' }))).toBe(false);
    expect(bridge.dismissNotification).toHaveBeenCalledWith('n1');
  });

  it('an unknown action type is a safe no-op → false', () => {
    expect(runNotificationAction(item(), act({ type: 'nope' as never }))).toBe(false);
  });
});
