// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { DEFAULT_READER_PREFERENCES } from '@tepegoz/reader';
import { useReaderPreferences } from './app-reader-preferences';

/**
 * Reading-view preferences: a `localStorage`-backed per-viewer choice. The choice must survive a
 * remount (a new tab, a re-toggle), a corrupt blob must degrade to the default rather than throw, and
 * storage being unavailable must not break the session-local choice.
 */

const KEY = 'tepegoz.reader.prefs';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('useReaderPreferences', () => {
  it('starts at the default when nothing is stored', () => {
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('persists a change and restores it on the next mount', () => {
    const first = renderHook(() => useReaderPreferences());
    act(() => {
      first.result.current.setPreferences({ fontScale: 1.3, theme: 'sepia' });
    });
    expect(first.result.current.preferences).toEqual({ fontScale: 1.3, theme: 'sepia' });
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')).toEqual({
      fontScale: 1.3,
      theme: 'sepia',
    });

    const second = renderHook(() => useReaderPreferences());
    expect(second.result.current.preferences).toEqual({ fontScale: 1.3, theme: 'sepia' });
  });

  it('degrades a corrupt stored blob to the default', () => {
    window.localStorage.setItem(KEY, '{ not json');
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.preferences).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('snaps an out-of-range stored scale onto a step', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ fontScale: 9, theme: 'dark' }));
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.preferences).toEqual({ fontScale: 1.5, theme: 'dark' });
  });
});
