// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { useAppContentModel } from './App-content-model';

/**
 * The new-tab page's data bindings. What's worth pinning: the shortcut list is a plain array
 * transform capped at 10; a blank title falls back to the URL; submitting the new-tab search
 * navigates AND closes the now-orphaned newtab tab (Chrome's replace-in-place behaviour).
 */

const update = vi.fn<(p: Partial<Preferences>) => Promise<void>>(() => Promise.resolve());
const bridge = {
  navigateTab: vi.fn(),
  closeTab: vi.fn(),
  getNewTabBackgroundImage: vi.fn<(ref: string) => Promise<string | null>>(() =>
    Promise.resolve(null),
  ),
  pickNewTabBackgroundImage: vi.fn(),
};

function prefs(shortcuts: Array<{ id: string; title: string; url: string }> = []): Preferences {
  return { newTabShortcuts: shortcuts } as unknown as Preferences;
}
const render = (p: Preferences | null, activeId: string | null = 'newtab-1') =>
  renderHook(() => useAppContentModel(p, update, activeId));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('new-tab shortcuts', () => {
  it('adds one, defaulting a blank title to the url', () => {
    const { result } = render(prefs());
    act(() => result.current.onAddShortcut('  ', 'https://a.test/'));
    const patch = update.mock.calls[0]?.[0]?.newTabShortcuts;
    expect(patch).toHaveLength(1);
    expect(patch?.[0]).toMatchObject({ title: 'https://a.test/', url: 'https://a.test/' });
    expect(patch?.[0]?.id).toBeTruthy();
  });

  it('refuses an 11th shortcut', () => {
    const full = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      title: `t${i}`,
      url: `u${i}`,
    }));
    const { result } = render(prefs(full));
    act(() => result.current.onAddShortcut('t', 'https://x/'));
    expect(update).not.toHaveBeenCalled();
  });

  it('edits by id (blank title → url) and removes by id', () => {
    const { result } = render(prefs([{ id: 's1', title: 'old', url: 'https://o/' }]));
    act(() => result.current.onEditShortcut('s1', '', 'https://new/'));
    expect(update.mock.calls[0]?.[0]?.newTabShortcuts?.[0]).toMatchObject({
      id: 's1',
      title: 'https://new/',
      url: 'https://new/',
    });
    act(() => result.current.onRemoveShortcut('s1'));
    expect(update.mock.calls[1]?.[0]?.newTabShortcuts).toEqual([]);
  });

  it('leaves the other shortcuts untouched when one is edited', () => {
    const a = { id: 's1', title: 'A', url: 'https://a/' };
    const b = { id: 's2', title: 'B', url: 'https://b/' };
    const { result } = render(prefs([a, b]));
    act(() => result.current.onEditShortcut('s2', 'B2', 'https://b2/'));
    const next = update.mock.calls[0]?.[0]?.newTabShortcuts;
    expect(next?.[0]).toBe(a); // untouched entries pass through by identity, not as rebuilt copies
    expect(next?.[1]).toMatchObject({ id: 's2', title: 'B2', url: 'https://b2/' });
  });
});

describe('before preferences have loaded', () => {
  // `prefs` is null until the first read returns, and the new-tab page renders in that window. Every
  // transform reads through the same `?? []`, so none of them may throw or write undefined.
  it('reports an empty list and still adds the first shortcut', () => {
    const { result } = render(null);
    expect(result.current.newTabShortcuts).toEqual([]);
    act(() => result.current.onAddShortcut('First', 'https://a.test/'));
    expect(update.mock.calls[0]?.[0]?.newTabShortcuts).toHaveLength(1);
  });

  it('edits and removes against the empty list instead of throwing', () => {
    const { result } = render(null);
    act(() => result.current.onEditShortcut('s1', 't', 'https://x/'));
    expect(update.mock.calls[0]?.[0]?.newTabShortcuts).toEqual([]);
    act(() => result.current.onRemoveShortcut('s1'));
    expect(update.mock.calls[1]?.[0]?.newTabShortcuts).toEqual([]);
  });
});

describe('new-tab search', () => {
  it('navigates then closes the orphaned newtab tab', () => {
    const { result } = render(prefs(), 'newtab-1');
    act(() => result.current.onNewTabSearch('weather'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('weather');
    expect(bridge.closeTab).toHaveBeenCalledWith('newtab-1');
  });

  it('navigates but closes nothing when there is no active tab', () => {
    const { result } = render(prefs(), null);
    act(() => result.current.onNewTabSearch('weather'));
    expect(bridge.navigateTab).toHaveBeenCalledWith('weather');
    expect(bridge.closeTab).not.toHaveBeenCalled();
  });
});

describe('new-tab background', () => {
  it('onChangeNewTabBackground merges the patch onto the current descriptor', () => {
    const { result } = render(prefs());
    act(() => result.current.onChangeNewTabBackground({ opacity: 0.5 }));
    expect(update.mock.calls[0]?.[0]?.newTabBackground).toMatchObject({ opacity: 0.5 });
  });

  it('resolves an image-ref background through the blob store and caches the data URL', async () => {
    bridge.getNewTabBackgroundImage.mockResolvedValueOnce('data:image/webp;base64,ZZ');
    const p = {
      newTabShortcuts: [],
      newTabBackground: {
        kind: 'image',
        imageRef: 'cas://xy',
        color: '#000',
        svgId: '',
        imageFit: 'cover',
      },
    } as unknown as Preferences;
    const { result } = render(p);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge.getNewTabBackgroundImage).toHaveBeenCalledWith('cas://xy');
    expect(result.current.resolvedNewTabBackground.imageDataUrl).toBe('data:image/webp;base64,ZZ');
  });

  it('leaves the cache untouched when the blob store returns null for the ref', async () => {
    bridge.getNewTabBackgroundImage.mockResolvedValueOnce(null);
    const p = {
      newTabShortcuts: [],
      newTabBackground: {
        kind: 'image',
        imageRef: 'cas://missing',
        color: '#000',
        svgId: '',
        imageFit: 'cover',
      },
    } as unknown as Preferences;
    const { result } = render(p);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.resolvedNewTabBackground.imageDataUrl).toBeUndefined();
  });

  it('pick returns null on cancel and caches the ref otherwise', async () => {
    bridge.pickNewTabBackgroundImage.mockResolvedValueOnce({ cancelled: true });
    const { result } = render(prefs());
    await expect(result.current.onPickNewTabBackgroundImage()).resolves.toBeNull();

    bridge.pickNewTabBackgroundImage.mockResolvedValueOnce({
      cancelled: false,
      ref: 'cas://abc',
      dataUrl: 'data:image/webp;base64,AA',
    });
    await expect(result.current.onPickNewTabBackgroundImage()).resolves.toEqual({
      ref: 'cas://abc',
      dataUrl: 'data:image/webp;base64,AA',
    });
  });
});
