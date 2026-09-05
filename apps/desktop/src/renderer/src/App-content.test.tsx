// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '@tepegoz/preferences';
import { INTERNAL_NEWTAB_URL } from '@tepegoz/desktop-ipc';
import type { AutofillAvailablePayload, TabsState } from '@tepegoz/desktop-ipc';
import { NewTabPage } from '@tepegoz/newtab-ui';
import { AutofillSuggestion } from '@tepegoz/password-ui';
import type { ExtensionDef, ExtensionSurfaceProps } from './extensions/registry';
import type { ExtensionSurfacesResult } from './app-extension-surfaces';
import { AGENT_EXTENSION_ID } from './app-extension-surfaces';
import type { AppContentModel } from './App-content-model';
import { useAppContentModel } from './App-content-model';
import { AppContent, type AppContentProps } from './App-content';

/**
 * The content region below the chrome (ADR-0010 split of `App.tsx`): the web-view host, the new-tab
 * page, an extension `page`/overlay surface, the autofill suggestion, and the sidebar dock. Its child
 * `NewTabPage`/`AutofillSuggestion` (own packages) and `useAppContentModel` (its own 100%-stmt test
 * file) are each mocked to a capturing stub — this pins ONLY this file's own derived values
 * (`newTabActive`, the extension `page`-surface resolution) and its inline closures
 * (`onOpenShortcut`/`onOpenAgent`/`onFill`/`onDismiss`).
 */

vi.mock('@tepegoz/newtab-ui', () => ({ NewTabPage: vi.fn(() => null) }));
vi.mock('@tepegoz/password-ui', () => ({ AutofillSuggestion: vi.fn(() => null) }));
vi.mock('./App-content-model', () => ({ useAppContentModel: vi.fn() }));

const bridge = { navigateTab: vi.fn(), fillLogin: vi.fn() };

function appContentModelFixture(over: Partial<AppContentModel> = {}): AppContentModel {
  return {
    newTabShortcuts: DEFAULT_PREFERENCES.newTabShortcuts,
    onAddShortcut: vi.fn(),
    onEditShortcut: vi.fn(),
    onRemoveShortcut: vi.fn(),
    resolvedNewTabBackground: DEFAULT_PREFERENCES.newTabBackground,
    onChangeNewTabBackground: vi.fn(),
    onPickNewTabBackgroundImage: vi.fn(() => Promise.resolve(null)),
    onNewTabSearch: vi.fn(),
    ...over,
  };
}

function extSurfacesFixture(over: Partial<ExtensionSurfacesResult> = {}): ExtensionSurfacesResult {
  return {
    activeSurface: null,
    sidebarExtId: null,
    popupOpenId: null,
    sidebarWidth: 360,
    resizingSidebar: false,
    resizeSnapshot: null,
    closeSurface: vi.fn(),
    closeSidebar: vi.fn(),
    runExtensionAction: vi.fn(),
    onSidebarResizeStart: vi.fn(),
    renderActiveSurface: () => null,
    renderSidebar: () => null,
    ...over,
  };
}

function pageSurface(label: string) {
  return function Surface({ onClose }: ExtensionSurfaceProps) {
    return (
      <div>
        <span>{label}</span>
        <button onClick={onClose}>Close {label}</button>
      </div>
    );
  };
}

function extDef(id: string, over: Partial<ExtensionDef> = {}): ExtensionDef {
  return {
    id,
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      description: '',
      icon: 'x',
      surfaces: [],
      actions: { click: undefined, doubleClick: undefined },
      labels: {},
      permissions: [],
    },
    icon: null,
    surfaces: {},
    ...over,
  };
}

function tabsState(over: Partial<TabsState> = {}): TabsState {
  return {
    tabs: [],
    groups: [],
    activeId: null,
    canGoBack: false,
    canGoForward: false,
    isPrivate: false,
    activeZoomFactor: 1,
    activeSecurityLevel: 'unknown',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAppContentModel).mockReturnValue(appContentModelFixture());
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderContent(over: Partial<AppContentProps> = {}) {
  const props: AppContentProps = {
    contentRef: { current: null },
    contentSnapshot: null,
    tabs: tabsState(),
    currentUrl: 'https://example.com',
    registry: [] as ExtensionDef[],
    prefs: { ...DEFAULT_PREFERENCES },
    surfaceFallback: <div>Loading…</div>,
    extSurfaces: extSurfacesFixture(),
    autofill: null,
    setAutofill: vi.fn(),
    onUpdatePrefs: vi.fn(() => Promise.resolve()),
    reader: { reader: { status: 'off' }, toggleReader: vi.fn(), closeReader: vi.fn() },
    ...over,
  };
  const utils = render(<AppContent {...props} />);
  return { ...utils, props };
}

function lastNewTabPageProps() {
  const calls = vi.mocked(NewTabPage).mock.calls;
  return calls[calls.length - 1]?.[0];
}

function lastAutofillProps() {
  const calls = vi.mocked(AutofillSuggestion).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('AppContent', () => {
  it('shows the new-tab page only when the current tab is the internal new-tab page', () => {
    renderContent({ currentUrl: 'https://example.com' });
    expect(vi.mocked(NewTabPage)).not.toHaveBeenCalled();

    renderContent({ currentUrl: `${INTERNAL_NEWTAB_URL}#anything` });
    expect(vi.mocked(NewTabPage)).toHaveBeenCalled();
  });

  it("opening a new-tab shortcut navigates the tab, and opening the agent runs the agent's click action", () => {
    const extSurfaces = extSurfacesFixture();
    renderContent({ currentUrl: INTERNAL_NEWTAB_URL, extSurfaces });
    const p = lastNewTabPageProps()!;
    p.onOpenShortcut('https://shortcut.example');
    expect(bridge.navigateTab).toHaveBeenCalledWith('https://shortcut.example');
    p.onOpenAgent();
    expect(extSurfaces.runExtensionAction).toHaveBeenCalledWith(AGENT_EXTENSION_ID, 'click');
  });

  it('threads the content model straight through to the new-tab page', () => {
    const model = appContentModelFixture({ onNewTabSearch: vi.fn() });
    vi.mocked(useAppContentModel).mockReturnValue(model);
    renderContent({ currentUrl: INTERNAL_NEWTAB_URL });
    const p = lastNewTabPageProps()!;
    expect(p.shortcuts).toBe(model.newTabShortcuts);
    expect(p.onSearch).toBe(model.onNewTabSearch);
    expect(p.background).toBe(model.resolvedNewTabBackground);
    expect(p.onAddShortcut).toBe(model.onAddShortcut);
    expect(p.onEditShortcut).toBe(model.onEditShortcut);
    expect(p.onRemoveShortcut).toBe(model.onRemoveShortcut);
    expect(p.onChangeBackground).toBe(model.onChangeNewTabBackground);
    expect(p.onPickBackgroundImage).toBe(model.onPickNewTabBackgroundImage);
  });

  it('shows a still snapshot over the content while one is provided', () => {
    const { container } = renderContent({ contentSnapshot: 'data:image/png;base64,abc' });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,abc');
  });

  it('shows no extension page surface with an empty registry or no active tab', () => {
    renderContent({ registry: [], tabs: tabsState({ activeId: null }) });
    expect(screen.queryByText(/Ext Page/)).toBeNull();
  });

  it('resolves and renders an extension "page" surface for the active tab\'s tepegoz:// url, closing via extSurfaces', () => {
    const extSurfaces = extSurfacesFixture();
    const registry = [extDef('com.tepegoz.notes', { surfaces: { page: pageSurface('Ext Page') } })];
    registry[0]!.manifest.surfaces = ['page'];
    renderContent({
      registry,
      extSurfaces,
      tabs: tabsState({ activeId: 't1', tabs: [{ id: 't1', url: 'tepegoz://com.tepegoz.notes' } as never] }),
    });
    expect(screen.getByText('Ext Page')).toBeTruthy();
    fireEvent.click(screen.getByText('Close Ext Page'));
    expect(extSurfaces.closeSurface).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a page-capable extension whose url does not match any known page id', () => {
    const registry = [extDef('com.tepegoz.notes', { surfaces: { page: pageSurface('Ext Page') } })];
    registry[0]!.manifest.surfaces = ['page'];
    renderContent({
      registry,
      tabs: tabsState({ activeId: 't1', tabs: [{ id: 't1', url: 'https://not-internal.example' } as never] }),
    });
    expect(screen.queryByText('Ext Page')).toBeNull();
  });

  it('renders nothing when the matched extension declares no page surface component', () => {
    const registry = [extDef('com.tepegoz.notes')];
    registry[0]!.manifest.surfaces = ['page'];
    renderContent({
      registry,
      tabs: tabsState({ activeId: 't1', tabs: [{ id: 't1', url: 'tepegoz://com.tepegoz.notes' } as never] }),
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the extension surfaces controller\'s active surface and sidebar', () => {
    const extSurfaces = extSurfacesFixture({
      renderActiveSurface: () => <div>Active surface</div>,
      renderSidebar: () => <div>Sidebar dock</div>,
    });
    renderContent({ extSurfaces });
    expect(screen.getByText('Active surface')).toBeTruthy();
    expect(screen.getByText('Sidebar dock')).toBeTruthy();
  });

  it('shows an autofill suggestion and fills or dismisses it', () => {
    const setAutofill = vi.fn();
    const autofill: AutofillAvailablePayload = { url: 'https://a.example', matches: [] };
    renderContent({ autofill, setAutofill });
    const p = lastAutofillProps()!;
    expect(p.url).toBe('https://a.example');

    p.onFill('login-1');
    expect(bridge.fillLogin).toHaveBeenCalledWith('login-1');
    expect(setAutofill).toHaveBeenCalledWith(null);

    p.onDismiss();
    expect(setAutofill).toHaveBeenLastCalledWith(null);
  });

  it('shows no autofill suggestion when there is nothing pending', () => {
    renderContent({ autofill: null });
    expect(vi.mocked(AutofillSuggestion)).not.toHaveBeenCalled();
  });

  it('reflects the content ref out to the caller', () => {
    const contentRef = { current: null };
    renderContent({ contentRef });
    expect(contentRef.current).not.toBeNull();
  });
});
