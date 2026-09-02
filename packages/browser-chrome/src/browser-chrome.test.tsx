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
    siteInfo: {
      button: 'View site information',
      secure: 'Connection is secure',
      notSecure: 'Not secure',
      dangerous: 'Dangerous',
      internal: 'Tepegöz page',
      file: 'Local file',
    },
    zoom: 'Zoom',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset',
    unnamedGroup: 'Group',
    toggleGroup: 'Toggle group',
    routeTunneled: 'Routed through {name}',
    routeTunneledInherited: 'Inherited route: {name}',
    routeBlocked: 'Blocked — {name} is not connected',
    routeLegVpn: 'VPN',
    routeLegTor: 'Tor',
    routeStatusUp: 'connected',
    routeStatusConnecting: 'connecting',
    routeStatusDown: 'not connected',
  },
};

function renderChrome(over: { platform?: string } = {}) {
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
      platform={over.platform ?? 'win32'}
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

describe('the window caption follows the platform', () => {
  it('draws our own controls on Windows', () => {
    renderChrome({ platform: 'win32' });
    expect(screen.getByRole('button', { name: STRINGS.window.close })).toBeDefined();
  });

  it('draws NONE on macOS, where the OS keeps its traffic lights', () => {
    // `frame: false` used to strip the traffic lights AND draw Windows-style buttons on the right, so
    // a Mac window had its close button on the wrong side and no native one at all.
    renderChrome({ platform: 'darwin' });
    expect(screen.queryByRole('button', { name: STRINGS.window.close })).toBeNull();
  });
});
