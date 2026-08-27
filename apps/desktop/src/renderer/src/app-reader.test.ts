// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReaderArticle } from '@tepegoz/reader';
import { useReader } from './app-reader';

/**
 * Reading-view state. The view is a display toggle, not a navigation, so the tab's URL/history/scroll
 * are untouched — and any tab switch or navigation drops it (an article left up would misattribute
 * itself to the new page). Extraction failure and "no article on this page" are the same outcome:
 * `none`, never an error.
 */

const ARTICLE: ReaderArticle = { title: 'T', blocks: [] } as unknown as ReaderArticle;
let extract: () => Promise<ReaderArticle | null>;

function stubBridge(): void {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { extractArticle: () => extract() },
  });
}

beforeEach(() => {
  extract = () => Promise.resolve(ARTICLE);
  stubBridge();
});
afterEach(cleanup);

describe('useReader', () => {
  it('starts off', () => {
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    expect(result.current.reader).toEqual({ status: 'off' });
  });

  it('toggles off → working → article', async () => {
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    act(() => result.current.toggleReader());
    expect(result.current.reader.status).toBe('working');
    await waitFor(() =>
      expect(result.current.reader).toEqual({ status: 'article', article: ARTICLE }),
    );
  });

  it('resolves to none when the page has no article', async () => {
    extract = () => Promise.resolve(null);
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader).toEqual({ status: 'none' }));
  });

  it('a failed extraction is also just none — never an error state', async () => {
    extract = () => Promise.reject(new Error('boom'));
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader).toEqual({ status: 'none' }));
  });

  it('toggling again from a shown article turns it off', async () => {
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader.status).toBe('article'));
    act(() => result.current.toggleReader());
    expect(result.current.reader).toEqual({ status: 'off' });
  });

  it('closeReader forces it off', async () => {
    const { result } = renderHook(() => useReader('t1', 'https://a/'));
    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader.status).toBe('article'));
    act(() => result.current.closeReader());
    expect(result.current.reader).toEqual({ status: 'off' });
  });

  it('a tab switch or a navigation closes the view', async () => {
    const { result, rerender } = renderHook(
      ({ id, url }: { id: string; url: string }) => useReader(id, url),
      { initialProps: { id: 't1', url: 'https://a/' } },
    );
    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader.status).toBe('article'));
    rerender({ id: 't2', url: 'https://a/' });
    expect(result.current.reader).toEqual({ status: 'off' });

    act(() => result.current.toggleReader());
    await waitFor(() => expect(result.current.reader.status).toBe('article'));
    rerender({ id: 't2', url: 'https://b/' });
    expect(result.current.reader).toEqual({ status: 'off' });
  });
});
