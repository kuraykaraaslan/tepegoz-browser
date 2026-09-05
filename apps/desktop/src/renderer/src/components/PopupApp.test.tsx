// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicSettings } from '@tepegoz/desktop-ipc';
import type { ExtensionDef, ExtensionSurfaceProps } from '../extensions/registry';
import { useExtensionCatalog } from '../extensions/useExtensionCatalog';
import { PopupApp } from './PopupApp';

/**
 * Standalone render target for a native extension popup window (`?surface=ext&id=<id>`) — renders ONLY
 * that extension's `popup` surface, no chrome. `useExtensionCatalog` (its own 100%-covered hook) is
 * mocked to a capturing stub so this file's test is scoped to ITS OWN concerns: resolving the surface
 * from the registry (or rendering nothing when the id/surface is missing), following the public
 * theme/locale settings (initial fetch + a live broadcast), and Escape/Close both closing the popup.
 */

vi.mock('../extensions/useExtensionCatalog', () => ({ useExtensionCatalog: vi.fn() }));

function publicSettings(over: Partial<PublicSettings> = {}): PublicSettings {
  return {
    theme: 'system',
    themeColor: '',
    locale: 'system',
    telemetryEnabled: false,
    notificationsEnabled: true,
    useLocalModelForSimpleTasks: false,
    defaultProvider: 'anthropic',
    resolvedLocale: 'en',
    ...over,
  };
}

function popupSurface(label: string) {
  return function Surface({ onClose }: ExtensionSurfaceProps) {
    return (
      <div>
        <span>{label}</span>
        <button onClick={onClose}>Close {label}</button>
      </div>
    );
  };
}

function extDef(id: string, surfaces: ExtensionDef['surfaces'] = {}): ExtensionDef {
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
    surfaces,
  };
}

const bridge = {
  getPublicSettings: vi.fn(() => Promise.resolve(publicSettings())),
  onPublicSettingsChanged: vi.fn<(cb: (s: PublicSettings) => void) => () => void>(
    () => () => undefined,
  ),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.getPublicSettings.mockResolvedValue(publicSettings());
  bridge.onPublicSettingsChanged.mockImplementation(() => () => undefined);
  vi.mocked(useExtensionCatalog).mockReturnValue({
    registry: [extDef('ext.a', { popup: popupSurface('Popup body') })],
    ready: true,
  });
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

describe('PopupApp', () => {
  it('renders nothing for an id not in the registry', () => {
    const { container } = render(<PopupApp id="missing" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the matched extension has no popup surface', () => {
    vi.mocked(useExtensionCatalog).mockReturnValue({
      registry: [extDef('ext.a', {})],
      ready: true,
    });
    const { container } = render(<PopupApp id="ext.a" />);
    expect(container.innerHTML).toBe('');
  });

  it("renders the matched extension's popup surface and closes it via its own Close button", async () => {
    render(<PopupApp id="ext.a" />);
    expect(await screen.findByText('Popup body')).toBeTruthy();
    fireEvent.click(screen.getByText('Close Popup body'));
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
  });

  it('fetches the public settings once and follows a later broadcast', async () => {
    let onChanged: ((s: PublicSettings) => void) | undefined;
    bridge.onPublicSettingsChanged.mockImplementation((cb) => {
      onChanged = cb;
      return () => undefined;
    });
    bridge.getPublicSettings.mockResolvedValue(publicSettings({ resolvedLocale: 'en' }));
    render(<PopupApp id="ext.a" />);
    await screen.findByText('Popup body');
    expect(bridge.getPublicSettings).toHaveBeenCalledTimes(1);

    act(() => onChanged?.(publicSettings({ resolvedLocale: 'tr' })));
    // still the same surface; the broadcast just re-applies theme/locale (asserted via no crash + still shown)
    expect(screen.getByText('Popup body')).toBeTruthy();
  });

  it('survives a rejected initial public-settings fetch', async () => {
    bridge.getPublicSettings.mockRejectedValueOnce(new Error('bridge unavailable'));
    render(<PopupApp id="ext.a" />);
    expect(await screen.findByText('Popup body')).toBeTruthy();
  });

  it('closes on Escape, and unsubscribes from the settings broadcast on unmount', async () => {
    let unsubscribed = false;
    bridge.onPublicSettingsChanged.mockImplementation(() => () => {
      unsubscribed = true;
    });
    const { unmount } = render(<PopupApp id="ext.a" />);
    await screen.findByText('Popup body');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribed).toBe(true);
  });
});
