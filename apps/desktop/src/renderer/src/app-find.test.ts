// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { FindInPageQuery, FindInPageResult } from '@tepegoz/desktop-ipc';
import { useFindInPage } from './app-find';

/**
 * Find-bar tab-switch resync. Main's find session lives per-`WebContents`, and switching tabs fires no
 * `found-in-page` event of its own — nothing invalidated the chrome's counters, so they used to keep
 * showing the PREVIOUS tab's numbers until the next keystroke. What's worth pinning: a switch re-issues
 * the same open query against the new tab (Chrome's own behavior), and does nothing when there is no
 * open query or the bar is closed — a switch must never SPONTANEOUSLY open a search nobody asked for.
 */

let calls: FindInPageQuery[];
let onResult: ((result: FindInPageResult) => void) | null;
let openBar: (() => void) | null;

function stubBridge(): void {
  calls = [];
  onResult = null;
  openBar = null;
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      onFindOpen: (cb: () => void) => {
        openBar = cb;
        return () => {
          openBar = null;
        };
      },
      onFindResult: (cb: (result: FindInPageResult) => void) => {
        onResult = cb;
        return () => {
          onResult = null;
        };
      },
      findInPage: (query: FindInPageQuery) => {
        calls.push(query);
      },
      stopFindInPage: () => undefined,
    },
  });
}

beforeEach(() => {
  stubBridge();
});

afterEach(() => {
  cleanup();
});

describe('useFindInPage — tab-switch resync', () => {
  it('does not issue a find call just from mounting', () => {
    renderHook(({ tabId }) => useFindInPage(tabId), { initialProps: { tabId: 'tab-a' } });
    expect(calls).toEqual([]);
  });

  it('re-runs the open query against the newly active tab', () => {
    const { result, rerender } = renderHook(({ tabId }) => useFindInPage(tabId), {
      initialProps: { tabId: 'tab-a' },
    });
    act(() => {
      openBar?.();
    });
    act(() => {
      result.current.setQuery('needle');
    });
    expect(calls).toEqual([{ query: 'needle', forward: true, findNext: true, matchCase: false }]);
    act(() => {
      onResult?.({ query: 'needle', activeMatchOrdinal: 2, matches: 5 });
    });
    expect(result.current.activeMatch).toBe(2);
    expect(result.current.totalMatches).toBe(5);

    rerender({ tabId: 'tab-b' });

    expect(calls).toEqual([
      { query: 'needle', forward: true, findNext: true, matchCase: false },
      { query: 'needle', forward: true, findNext: true, matchCase: false },
    ]);
  });

  it('does nothing on a tab switch when the bar has never been opened', () => {
    const { rerender } = renderHook(({ tabId }) => useFindInPage(tabId), {
      initialProps: { tabId: 'tab-a' },
    });
    rerender({ tabId: 'tab-b' });
    expect(calls).toEqual([]);
  });

  it('does nothing on a tab switch once the bar is closed again', () => {
    const { result, rerender } = renderHook(({ tabId }) => useFindInPage(tabId), {
      initialProps: { tabId: 'tab-a' },
    });
    act(() => {
      openBar?.();
    });
    act(() => {
      result.current.setQuery('needle');
    });
    act(() => {
      result.current.close();
    });
    calls = []; // ignore the setQuery call; only the switch matters from here
    rerender({ tabId: 'tab-b' });
    expect(calls).toEqual([]);
  });

  it('stale results for the tab it just left cannot overwrite the resynced count', () => {
    const { result, rerender } = renderHook(({ tabId }) => useFindInPage(tabId), {
      initialProps: { tabId: 'tab-a' },
    });
    act(() => {
      openBar?.();
    });
    act(() => {
      result.current.setQuery('needle');
    });
    act(() => {
      onResult?.({ query: 'needle', activeMatchOrdinal: 1, matches: 3 });
    });
    rerender({ tabId: 'tab-b' }); // re-issues findInPage for the SAME query on the new tab
    // The new tab's real answer:
    act(() => {
      onResult?.({ query: 'needle', activeMatchOrdinal: 1, matches: 9 });
    });
    expect(result.current.totalMatches).toBe(9);
  });
});
