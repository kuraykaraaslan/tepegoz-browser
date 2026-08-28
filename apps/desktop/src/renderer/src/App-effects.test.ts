// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { AppEffectsParams } from './App-effects';
import { useAppEffects } from './App-effects';

/**
 * The App shell's cross-cutting effects. This covers the ones with real dispatch logic (initial IPC
 * fetch + degradation, toast cap-to-3, locale → document lang/dir, the glass-chrome class gate, the
 * cross-window prefs refetch, the extension context-menu relay, and the renderer keyboard shortcuts).
 * The layout effects (content-bounds ResizeObserver, theme matchMedia) are e2e territory and only
 * kept from throwing here.
 */

// jsdom has no ResizeObserver; the content-bounds effect constructs one.
class RO {
  observe() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO);

const applyTheme = vi.fn();
vi.mock('./lib/theme', () => ({ applyTheme: (...a: unknown[]) => void applyTheme(...a) }));

type Sub = (cb: (x: never) => void) => () => void;
const subs: Record<string, ((x: never) => void) | null> = {};
function sub(name: string): Sub {
  return (cb) => {
    subs[name] = cb;
    return () => {
      subs[name] = null;
    };
  };
}

const bridge = {
  getPreferences: vi.fn(() => Promise.resolve({ theme: 'light', themeColor: '', glassChrome: true })),
  getTabsState: vi.fn(() => Promise.resolve({ tabs: [{ id: 't1' }], activeId: 't1' })),
  getAppInfo: vi.fn(() => Promise.resolve({ glassAvailable: false })),
  captureActiveTab: vi.fn(() => Promise.resolve(null)),
  navigateTab: vi.fn(),
  createTab: vi.fn(),
  reopenClosedTab: vi.fn(),
  setContentBounds: vi.fn(),
  onTabsState: sub('tabs'),
  onTabGroupStartRename: sub('rename'),
  onNotificationToast: sub('toast'),
  onNotificationPermissionRequest: sub('perm'),
  onAutofillAvailable: sub('autofill'),
  onPublicSettingsChanged: sub('publicSettings'),
  onExtensionContextMenuAction: sub('extMenu'),
};

function params(over: Partial<AppEffectsParams> = {}): AppEffectsParams {
  return {
    prefs: { theme: 'light', themeColor: '', glassChrome: true } as AppEffectsParams['prefs'],
    locale: 'tr',
    glassAvailable: true,
    omniboxDropdownOpen: false,
    contentRef: { current: null },
    extSurfaces: { closeSurface: vi.fn() } as unknown as AppEffectsParams['extSurfaces'],
    onToggleExtension: vi.fn(),
    onUnpinExtension: vi.fn(),
    setPrefs: vi.fn(),
    setTabs: vi.fn(),
    setRenamingGroupId: vi.fn(),
    setToasts: vi.fn(),
    setPermReq: vi.fn(),
    setAutofill: vi.fn(),
    setGlassAvailable: vi.fn(),
    setOmniboxViewHidden: vi.fn(),
    setOmniboxSnapshot: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(subs)) subs[k] = null;
  document.documentElement.className = '';
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('useAppEffects', () => {
  it('fetches prefs + tabs on mount and pushes them into state', async () => {
    const p = params();
    renderHook(() => useAppEffects(p));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(p.setPrefs).toHaveBeenCalledWith({ theme: 'light', themeColor: '', glassChrome: true });
    expect(p.setTabs).toHaveBeenCalled();
  });

  it('a failed initial fetch leaves state at its defaults (no throw)', async () => {
    bridge.getPreferences.mockRejectedValueOnce(new Error('no bridge'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = params();
    expect(() => renderHook(() => useAppEffects(p))).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(p.setPrefs).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('caps the toast list to the newest three', () => {
    const p = params();
    renderHook(() => useAppEffects(p));
    const push = subs.toast as unknown as (t: unknown) => void;
    act(() => push({ id: 'a' }));
    const updater = (p.setToasts as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      prev: unknown[],
    ) => unknown[];
    expect(updater([{ id: '1' }, { id: '2' }, { id: '3' }])).toEqual([
      { id: '2' },
      { id: '3' },
      { id: 'a' },
    ]);
  });

  it('mirrors the locale onto <html lang>/<dir>', () => {
    renderHook(() => useAppEffects(params({ locale: 'tr' })));
    expect(document.documentElement.lang).toBe('tr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('adds the glass class only when the pref AND the runtime capability agree', () => {
    const { rerender } = renderHook((pr: AppEffectsParams) => useAppEffects(pr), {
      initialProps: params({ glassAvailable: true }),
    });
    expect(document.documentElement.classList.contains('glass')).toBe(true);
    rerender(params({ glassAvailable: false }));
    expect(document.documentElement.classList.contains('glass')).toBe(false);
  });

  it('refetches prefs when another window changes settings', async () => {
    const p = params();
    renderHook(() => useAppEffects(p));
    (p.setPrefs as ReturnType<typeof vi.fn>).mockClear();
    bridge.getPreferences.mockResolvedValueOnce({ theme: 'dark', themeColor: '', glassChrome: false });
    await act(async () => {
      (subs.publicSettings as unknown as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(p.setPrefs).toHaveBeenCalledWith({ theme: 'dark', themeColor: '', glassChrome: false });
  });

  it('relays an extension context-menu action to the right handler', () => {
    const p = params();
    renderHook(() => useAppEffects(p));
    const relay = subs.extMenu as unknown as (a: { id: string; action: string }) => void;
    act(() => relay({ id: 'ext.a', action: 'page' }));
    expect(bridge.navigateTab).toHaveBeenCalled();
    act(() => relay({ id: 'ext.a', action: 'unpin' }));
    expect(p.onUnpinExtension).toHaveBeenCalledWith('ext.a');
    act(() => relay({ id: 'ext.a', action: 'remove' }));
    expect(p.onToggleExtension).toHaveBeenCalledWith('ext.a', false);
  });

  it('the renderer keyboard shortcuts fire the right bridge calls', () => {
    const p = params();
    renderHook(() => useAppEffects(p));
    const key = (init: KeyboardEventInit): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }));
    };
    key({ key: 't', ctrlKey: true });
    expect(bridge.createTab).toHaveBeenCalledTimes(1);
    key({ key: 't', ctrlKey: true, shiftKey: true });
    expect(bridge.reopenClosedTab).toHaveBeenCalledTimes(1);
    key({ key: ',', ctrlKey: true });
    expect(bridge.navigateTab).toHaveBeenCalled();
  });
});
