// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ExtensionManifestWire, TabGroupSettingValue } from '@tepegoz/desktop-ipc';
import { extensionPageUrl } from '../../shared/extension-urls';
import type { ExtensionDef, ExtensionSurfaceProps } from './extensions/registry';
import { AGENT_EXTENSION_ID, AGENT_PANEL_OPEN_KEY } from './agent-dock';
import { useExtensionSurfaces, type ExtensionSurfacesResult } from './app-extension-surfaces';

/**
 * Extension overlay surfaces (popup/modal/panel), the resizable sidebar dock, and the Agent Console's
 * per-tab-group open/closed persistence — split out of `App.tsx` (ADR-0010). `nextAgentDock` (the
 * mount-effect's dock rule) has its own unit test; this drives the hook itself through a small render
 * harness (it returns render FUNCTIONS, not JSX, so a host component is needed to call them).
 */

function manifest(id: string, actions: Partial<ExtensionManifestWire['actions']> = {}): ExtensionManifestWire {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    icon: 'x',
    surfaces: [],
    actions: { click: undefined, doubleClick: undefined, ...actions },
    labels: {},
    permissions: [],
  };
}

function surface(label: string) {
  return function Surface({ onClose }: ExtensionSurfaceProps) {
    return (
      <div>
        <span>{label}</span>
        <button onClick={onClose}>Close {label}</button>
      </div>
    );
  };
}

function def(
  id: string,
  actions: Partial<ExtensionManifestWire['actions']>,
  surfaces: ExtensionDef['surfaces'] = {},
): ExtensionDef {
  return { id, manifest: manifest(id, actions), icon: null, surfaces };
}

interface HarnessProps {
  registry: ExtensionDef[];
  activeGroupId: string | null;
  activeGroupAgentPanelOpen: TabGroupSettingValue | undefined;
  overlayAlsoOpen: boolean;
  capture: (r: ExtensionSurfacesResult) => void;
}

function Harness({ registry, activeGroupId, activeGroupAgentPanelOpen, overlayAlsoOpen, capture }: HarnessProps) {
  const result = useExtensionSurfaces(
    registry,
    activeGroupId,
    activeGroupAgentPanelOpen,
    'en',
    'Resize sidebar',
    <div>Loading…</div>,
    overlayAlsoOpen,
  );
  capture(result);
  return (
    <>
      {result.renderSidebar()}
      {result.renderActiveSurface()}
    </>
  );
}

const bridge = {
  updateTabGroup: vi.fn(),
  ensureActiveGroup: vi.fn<() => Promise<string>>(() => Promise.resolve('g1')),
  navigateTab: vi.fn(),
  closePopup: vi.fn(),
  openPopup: vi.fn(),
  setContentVisible: vi.fn(),
  captureActiveTab: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
  onOpenExtension: vi.fn<(cb: (id: string) => void) => () => void>(() => () => undefined),
  onPopupClosed: vi.fn<(cb: (surface: string) => void) => () => void>(() => () => undefined),
};

let current!: ExtensionSurfacesResult;
function capture(r: ExtensionSurfacesResult): void {
  current = r;
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.ensureActiveGroup.mockResolvedValue('g1');
  bridge.captureActiveTab.mockResolvedValue(null);
  bridge.onOpenExtension.mockImplementation(() => () => undefined);
  bridge.onPopupClosed.mockImplementation(() => () => undefined);
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

function renderHarness(over: Partial<HarnessProps> = {}) {
  const props: HarnessProps = {
    registry: [],
    activeGroupId: null,
    activeGroupAgentPanelOpen: undefined,
    overlayAlsoOpen: false,
    capture,
    ...over,
  };
  const utils = render(<Harness {...props} />);
  return { ...utils, rerenderWith: (o: Partial<HarnessProps>) => utils.rerender(<Harness {...props} {...o} />) };
}

describe('useExtensionSurfaces', () => {
  it('renders nothing and keeps the content view visible when nothing is active', () => {
    renderHarness();
    expect(current.activeSurface).toBeNull();
    expect(current.sidebarExtId).toBeNull();
    expect(bridge.setContentVisible).toHaveBeenCalledWith(true);
  });

  it('runExtensionAction is a no-op for an unknown extension id or an action the manifest lacks', () => {
    renderHarness({ registry: [def('a', { click: 'modal' })] });
    act(() => current.runExtensionAction('missing', 'click'));
    expect(current.activeSurface).toBeNull();
    act(() => current.runExtensionAction('a', 'doubleClick')); // no doubleClick action declared
    expect(current.activeSurface).toBeNull();
  });

  it('a "page" action closes any open surface and navigates the internal tab', () => {
    renderHarness({ registry: [def('a', { click: 'page' })] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(bridge.navigateTab).toHaveBeenCalledWith(extensionPageUrl('a'));
    expect(current.activeSurface).toBeNull();
  });

  it('a "modal" action opens, re-triggering the same one closes, and a different id/kind replaces it', () => {
    renderHarness({
      registry: [def('a', { click: 'modal' }, { modal: surface('A') }), def('b', { click: 'panel' }, { panel: surface('B') })],
    });
    act(() => current.runExtensionAction('a', 'click'));
    expect(current.activeSurface).toEqual({ id: 'a', kind: 'modal' });
    act(() => current.runExtensionAction('a', 'click'));
    expect(current.activeSurface).toBeNull();
    act(() => current.runExtensionAction('a', 'click'));
    act(() => current.runExtensionAction('b', 'click'));
    expect(current.activeSurface).toEqual({ id: 'b', kind: 'panel' });
  });

  it('renders a "panel" surface directly and a "modal" surface inside a dialog, closing via the surface', () => {
    renderHarness({ registry: [def('a', { click: 'panel' }, { panel: surface('Panel body') })] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(screen.getByText('Panel body')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Close Panel body'));
    expect(current.activeSurface).toBeNull();
  });

  it('renders nothing for a surface kind the extension does not implement', () => {
    renderHarness({ registry: [def('a', { click: 'modal' }, {})] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(current.activeSurface).toEqual({ id: 'a', kind: 'modal' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a "popup" action opens a native popup window (with the given anchor, or a fallback) and closes it on re-trigger', () => {
    renderHarness({ registry: [def('a', { click: 'popup' })] });
    const anchor = { x: 1, y: 2, width: 3, height: 4 };
    act(() => current.runExtensionAction('a', 'click', anchor));
    expect(bridge.openPopup).toHaveBeenCalledWith('ext', anchor, { id: 'a' });
    expect(current.popupOpenId).toBe('a');

    act(() => current.runExtensionAction('a', 'click'));
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(current.popupOpenId).toBeNull();

    act(() => current.runExtensionAction('a', 'click'));
    expect(bridge.openPopup).toHaveBeenLastCalledWith('ext', expect.objectContaining({ width: 0, height: 0 }), {
      id: 'a',
    });
  });

  it('clears the popup-pressed state only when the closed native surface is this extension\'s', () => {
    let onClosed: ((surface: string) => void) | undefined;
    bridge.onPopupClosed.mockImplementation((cb) => {
      onClosed = cb;
      return () => undefined;
    });
    renderHarness({ registry: [def('a', { click: 'popup' })] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(current.popupOpenId).toBe('a');

    act(() => onClosed?.('menu:main'));
    expect(current.popupOpenId).toBe('a');

    act(() => onClosed?.('ext:a'));
    expect(current.popupOpenId).toBeNull();
  });

  it('toggling the sidebar for a non-agent extension does not touch tab-group settings', () => {
    renderHarness({ registry: [def('a', { click: 'sidebar' }, { sidebar: surface('Dock') })] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(current.sidebarExtId).toBe('a');
    expect(screen.getByText('Dock')).toBeTruthy();
    expect(bridge.updateTabGroup).not.toHaveBeenCalled();

    act(() => current.runExtensionAction('a', 'click'));
    expect(current.sidebarExtId).toBeNull();
  });

  it('docking the Agent Console with an active group remembers open/closed directly on it', () => {
    renderHarness({ registry: [def(AGENT_EXTENSION_ID, { click: 'sidebar' })], activeGroupId: 'g1' });
    act(() => current.runExtensionAction(AGENT_EXTENSION_ID, 'click'));
    expect(bridge.updateTabGroup).toHaveBeenCalledWith('g1', { settings: { [AGENT_PANEL_OPEN_KEY]: true } });

    act(() => current.closeSidebar());
    expect(bridge.updateTabGroup).toHaveBeenCalledWith('g1', { settings: { [AGENT_PANEL_OPEN_KEY]: false } });
    expect(current.sidebarExtId).toBeNull();
  });

  it('closing a docked non-agent sidebar never calls into tab-group settings', () => {
    renderHarness({ registry: [def('a', { click: 'sidebar' })], activeGroupId: 'g1' });
    act(() => current.runExtensionAction('a', 'click'));
    act(() => current.closeSidebar());
    expect(bridge.updateTabGroup).not.toHaveBeenCalled();
  });

  it('opening the Agent Console with no active group creates one, then remembers it open', async () => {
    renderHarness({ registry: [def(AGENT_EXTENSION_ID, { click: 'sidebar' })], activeGroupId: null });
    await act(async () => {
      current.runExtensionAction(AGENT_EXTENSION_ID, 'click');
      await Promise.resolve();
    });
    expect(bridge.ensureActiveGroup).toHaveBeenCalled();
    expect(bridge.updateTabGroup).toHaveBeenCalledWith('g1', { settings: { [AGENT_PANEL_OPEN_KEY]: true } });
  });

  it('survives a failed ensureActiveGroup when opening the Agent Console with no active tab', async () => {
    bridge.ensureActiveGroup.mockRejectedValueOnce(new Error('no active tab'));
    renderHarness({ registry: [def(AGENT_EXTENSION_ID, { click: 'sidebar' })], activeGroupId: null });
    await act(async () => {
      current.runExtensionAction(AGENT_EXTENSION_ID, 'click');
      await Promise.resolve();
    });
    expect(bridge.updateTabGroup).not.toHaveBeenCalled();
  });

  it('closing the Agent Console with no active group does nothing (nothing to forget it on)', () => {
    renderHarness({ registry: [def(AGENT_EXTENSION_ID, { click: 'sidebar' })], activeGroupId: null });
    act(() => current.closeSidebar());
    expect(bridge.ensureActiveGroup).not.toHaveBeenCalled();
    expect(bridge.updateTabGroup).not.toHaveBeenCalled();
  });

  it('Escape closes an open overlay surface, and does nothing when none is open', () => {
    renderHarness({ registry: [def('a', { click: 'modal' })] });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(current.activeSurface).toBeNull();

    act(() => current.runExtensionAction('a', 'click'));
    expect(current.activeSurface).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(current.activeSurface).toBeNull();
  });

  it('the native menu asks the chrome to open an extension by id', () => {
    let openFromMenu: ((id: string) => void) | undefined;
    bridge.onOpenExtension.mockImplementation((cb) => {
      openFromMenu = cb;
      return () => undefined;
    });
    renderHarness({ registry: [def('a', { click: 'modal' })] });
    act(() => openFromMenu?.('a'));
    expect(current.activeSurface).toEqual({ id: 'a', kind: 'modal' });
  });

  it('hides the content view while an overlay surface or another overlay is open', () => {
    const { rerenderWith } = renderHarness({ registry: [def('a', { click: 'modal' })] });
    act(() => current.runExtensionAction('a', 'click'));
    expect(bridge.setContentVisible).toHaveBeenLastCalledWith(false);
    act(() => current.closeSurface());
    expect(bridge.setContentVisible).toHaveBeenLastCalledWith(true);

    rerenderWith({ overlayAlsoOpen: true });
    expect(bridge.setContentVisible).toHaveBeenLastCalledWith(false);
  });

  it('drags the sidebar edge, clamping width to the min/max bounds, and shows a capture snapshot while dragging', async () => {
    let resolveCapture: ((snap: string | null) => void) | undefined;
    bridge.captureActiveTab.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    renderHarness({ registry: [def('a', { click: 'sidebar' }, { sidebar: surface('Dock') })] });
    act(() => current.runExtensionAction('a', 'click'));
    const separator = screen.getByRole('separator');

    act(() => {
      separator.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0 })); // dragging left widens past the max
    });
    expect(current.sidebarWidth).toBe(640);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900 })); // dragging right past the min
    });
    expect(current.sidebarWidth).toBe(280);

    await act(async () => {
      resolveCapture?.('data:image/png;base64,abc');
      await Promise.resolve();
    });
    expect(current.resizeSnapshot).toBe('data:image/png;base64,abc');
    expect(current.resizingSidebar).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(current.resizingSidebar).toBe(false);
    expect(current.resizeSnapshot).toBeNull();
  });

  it('drops a capture snapshot that resolves after the drag already ended', async () => {
    let resolveCapture: ((snap: string | null) => void) | undefined;
    bridge.captureActiveTab.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve;
        }),
    );
    renderHarness({ registry: [def('a', { click: 'sidebar' }, { sidebar: surface('Dock') })] });
    act(() => current.runExtensionAction('a', 'click'));
    act(() => {
      screen.getByRole('separator').dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    await act(async () => {
      resolveCapture?.('data:image/png;base64,late');
      await Promise.resolve();
    });
    expect(current.resizeSnapshot).toBeNull();
    expect(current.resizingSidebar).toBe(false);
  });

  it('still shows resizing (with no snapshot) when the capture rejects while still dragging', async () => {
    bridge.captureActiveTab.mockRejectedValueOnce(new Error('no page'));
    renderHarness({ registry: [def('a', { click: 'sidebar' }, { sidebar: surface('Dock') })] });
    act(() => current.runExtensionAction('a', 'click'));
    await act(async () => {
      screen.getByRole('separator').dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, bubbles: true }));
      await Promise.resolve();
    });
    expect(current.resizingSidebar).toBe(true);
    expect(current.resizeSnapshot).toBeNull();
  });

  it('does not force resizing back on when the capture rejects after the drag already ended', async () => {
    bridge.captureActiveTab.mockRejectedValueOnce(new Error('no page'));
    renderHarness({ registry: [def('a', { click: 'sidebar' }, { sidebar: surface('Dock') })] });
    act(() => current.runExtensionAction('a', 'click'));
    act(() => {
      screen.getByRole('separator').dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(current.resizingSidebar).toBe(false);
  });
});
