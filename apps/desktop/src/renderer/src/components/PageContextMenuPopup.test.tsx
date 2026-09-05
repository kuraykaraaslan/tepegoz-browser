// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import type { PageMenuContext } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { PageContextMenuPopup } from './PageContextMenuPopup';

/**
 * Standalone native page (web view) right-click popup — mirrors `MainMenuPopup`'s pattern: fetch prefs
 * (theme/locale) + the captured menu context, Escape closes, self-resizes to content. The MENU MODEL
 * itself (`buildPageContextMenuModel` — every variant/row) is `@tepegoz/page-context-menu`'s own,
 * fully covered package; this pins the glue — `toModelContext`'s null-coalescing defaults, the two
 * bridge fetches (+ their reject arms), and that a row's `onSelect` runs the right bridge call then
 * self-dismisses (both a plain action and a contribution action).
 */

stubJsdomLayout();

function pageMenuContext(over: Partial<PageMenuContext> = {}): PageMenuContext {
  return {
    menuId: 'm1',
    contributions: [],
    canGoBack: false,
    canGoForward: false,
    pageUrl: 'https://example.com',
    selectionText: '',
    linkUrl: '',
    srcUrl: '',
    mediaType: 'none',
    isEditable: false,
    canCopy: false,
    canCut: false,
    canPaste: false,
    canSelectAll: false,
    ...over,
  };
}

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ ...DEFAULT_PREFERENCES })),
  getPageMenuContext: vi.fn(() => Promise.resolve(pageMenuContext())),
  resizePopup: vi.fn(),
  closePopup: vi.fn(),
  pageMenuAction: vi.fn(),
  pageMenuContributionAction: vi.fn(),
  platform: 'win32',
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  bridge.getPageMenuContext.mockResolvedValue(pageMenuContext());
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

describe('PageContextMenuPopup', () => {
  it('fetches prefs + the page-menu context and reports its measured height', async () => {
    render(<PageContextMenuPopup />);
    await screen.findByRole('menu');
    expect(bridge.getPreferences).toHaveBeenCalled();
    expect(bridge.getPageMenuContext).toHaveBeenCalled();
    expect(bridge.resizePopup).toHaveBeenCalled();
  });

  it('survives every bridge call rejecting, rendering the default menu with everything disabled', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('x'));
    bridge.getPageMenuContext.mockRejectedValueOnce(new Error('x'));
    render(<PageContextMenuPopup />);
    await screen.findByRole('menuitem', { name: /Reload/ });
    expect(screen.getByRole('menuitem', { name: /Back/ })).toHaveProperty('ariaDisabled', 'true');
  });

  it('closes on Escape', async () => {
    render(<PageContextMenuPopup />);
    await screen.findByRole('menu');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('resolves the stored tr locale from prefs', async () => {
    bridge.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES, locale: 'tr' });
    render(<PageContextMenuPopup />);
    expect(await screen.findByRole('menuitem', { name: /Yeniden yükle/ })).toBeTruthy();
  });

  it('falls back through resolveLocale when the stored locale is neither en nor tr', async () => {
    bridge.getPreferences.mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      locale: 'de' as (typeof DEFAULT_PREFERENCES)['locale'],
    });
    render(<PageContextMenuPopup />);
    await screen.findByRole('menu');
    expect(bridge.getPreferences).toHaveBeenCalled();
  });

  it('runs a plain row action then self-dismisses the popup', async () => {
    render(<PageContextMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Reload/ }));
    expect(bridge.pageMenuAction).toHaveBeenCalledWith('reload');
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('dispatches a contribution row action then self-dismisses', async () => {
    bridge.getPageMenuContext.mockResolvedValue(
      pageMenuContext({
        contributions: [
          {
            id: 'sec1',
            contributorId: 'ext.tools',
            placement: 'bottom',
            priority: 0,
            items: [{ id: 'do-thing', label: 'Do the thing', actionId: 'do-thing-action' }],
          },
        ],
      }),
    );
    render(<PageContextMenuPopup />);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Do the thing' }));
    expect(bridge.pageMenuContributionAction).toHaveBeenCalledWith({
      menuId: 'm1',
      contributorId: 'ext.tools',
      sectionId: 'sec1',
      itemId: 'do-thing',
      actionId: 'do-thing-action',
    });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('renders the selection-menu variant and runs its search action', async () => {
    bridge.getPageMenuContext.mockResolvedValue(pageMenuContext({ selectionText: 'hello world' }));
    render(<PageContextMenuPopup />);
    const searchRow = await screen.findByRole('menuitem', { name: /Search .*hello world/ });
    fireEvent.click(searchRow);
    expect(bridge.pageMenuAction).toHaveBeenCalledWith('search-selection');
  });
});
