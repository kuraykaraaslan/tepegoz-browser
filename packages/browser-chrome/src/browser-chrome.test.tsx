// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserChrome, type BrowserChromeStrings } from './browser-chrome';

const STRINGS: BrowserChromeStrings = {
  common: { appName: 'Tepegöz' },
  window: { minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore', close: 'Close' },
  browser: {
    tabs: 'Tabs',
    untitled: 'Untitled',
    closeTab: 'Close tab',
    newTab: 'New tab',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    home: 'Home',
    omniboxPlaceholder: 'Search or type a URL',
    bookmarkAdd: 'Add bookmark',
    bookmarkRemove: 'Remove bookmark',
    unnamedGroup: 'Group',
    toggleGroup: 'Toggle group',
  },
};

function renderChrome() {
  const handlers = {
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onTabContextMenu: vi.fn(),
    onNewTab: vi.fn(),
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
    onBack: vi.fn(),
    onForward: vi.fn(),
    onReload: vi.fn(),
    onHome: vi.fn(),
    onNavigate: vi.fn(),
  };
  render(
    <BrowserChrome
      t={STRINGS}
      tabs={[{ id: '1', title: 'First page', faviconUrl: null, isLoading: false }]}
      activeTabId="1"
      isMaximized={false}
      currentUrl="https://a.test/"
      canGoBack
      canGoForward={false}
      menu={<span data-testid="menu-slot" />}
      {...handlers}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe('BrowserChrome', () => {
  it('composes the full chrome: brand, tab strip, caption controls, nav bar', () => {
    renderChrome();
    expect(screen.getByRole('img', { name: STRINGS.common.appName })).toBeDefined();
    expect(screen.getByRole('tablist', { name: STRINGS.browser.tabs })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'First page', selected: true })).toBeDefined();
    expect(screen.getByRole('button', { name: STRINGS.window.minimize })).toBeDefined();
    expect(screen.getByRole('button', { name: STRINGS.browser.back })).toBeDefined();
    expect(screen.getByTestId('menu-slot')).toBeDefined();
  });

  it('routes tab-strip and caption actions to the injected handlers', () => {
    const h = renderChrome();
    fireEvent.click(screen.getByRole('button', { name: STRINGS.browser.newTab }));
    expect(h.onNewTab).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: STRINGS.window.close }));
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
