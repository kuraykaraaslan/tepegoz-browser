// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { HistoryPage } from './history-ui';

/**
 * The browsing-history manager: search, newest-first list, per-row remove, clear all, and a 50-at-a-
 * time lazy load driven by an IntersectionObserver sentinel.
 *
 * jsdom has no IntersectionObserver, so this file supplies one whose callback the tests can fire —
 * scrolling is the only way more history ever loads, and stubbing it out would leave the paging
 * untested rather than merely unscrolled.
 *
 * Three branches stay uncovered: the two `cancelled` guards in the load effect (unmounting mid-read,
 * whose setState React 18 already drops silently) and the favicon type guard for a non-string value,
 * which the item type does not admit.
 */

const PAGE_SIZE = 50;

interface HistoryItem {
  url: string;
  title: string;
  ts: number;
  favicon?: string | null;
}

const item = (n: number, over: Partial<HistoryItem> = {}): HistoryItem => ({
  url: `https://site-${String(n)}.test/`,
  title: `Page ${String(n)}`,
  ts: 1_700_000_000_000 + n,
  favicon: null,
  ...over,
});

const page = (count: number, from = 0): HistoryItem[] =>
  Array.from({ length: count }, (_, i) => item(from + i));

/** Fire the most recently registered sentinel callback as if it had scrolled into view. */
let intersect: (() => void) | null = null;

beforeEach(() => {
  intersect = null;
  class FakeIntersectionObserver {
    constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {
      intersect = () => {
        this.cb([{ isIntersecting: true }]);
      };
    }
    observe(): void {
      /* the callback is all these tests need */
    }
    disconnect(): void {
      intersect = null;
    }
    unobserve(): void {
      /* unused */
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(
  over: {
    list?: (query: string, offset: number) => Promise<HistoryItem[]>;
    remove?: (url: string) => Promise<void>;
    clear?: () => Promise<void>;
  } = {},
) {
  const list = vi.fn(over.list ?? (() => Promise.resolve(page(3))));
  const remove = vi.fn(over.remove ?? (() => Promise.resolve()));
  const clear = vi.fn(over.clear ?? (() => Promise.resolve()));
  render(
    <I18nProvider locale="en">
      <HistoryPage
        list={list as unknown as (q: string, o: number) => Promise<never[]>}
        remove={remove}
        clear={clear}
      />
    </I18nProvider>,
  );
  return { list, remove, clear };
}

describe('loading history', () => {
  it('asks for the first page on mount and lists what came back', async () => {
    const { list } = renderPage();
    expect(await screen.findByText('Page 0')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();
    expect(list).toHaveBeenCalledWith('', 0);
  });

  it('shows the empty state, not a permanent "Loading...", when the read fails', async () => {
    // A history page stuck on "Loading..." is indistinguishable from one that is still working.
    renderPage({ list: () => Promise.reject(new Error('store gone')) });
    expect(await screen.findByText('No history yet')).toBeDefined();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows the empty state when there simply is no history', async () => {
    renderPage({ list: () => Promise.resolve([]) });
    expect(await screen.findByText('No history yet')).toBeDefined();
  });
});

describe('search', () => {
  it('re-queries the store rather than filtering the page already loaded', async () => {
    // History is paged 50 at a time; filtering what is on screen would search a window, not the
    // history — the match the user wants is usually not in the first fifty.
    const { list } = renderPage();
    await screen.findByText('Page 0');

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: '  kuray  ' } });
    await waitFor(() => expect(list).toHaveBeenCalledWith('kuray', 0));
  });

  it('starts the new query from offset 0, not from where the last one had scrolled to', async () => {
    const { list } = renderPage({
      list: (_q, offset) => Promise.resolve(offset === 0 ? page(PAGE_SIZE) : page(5, PAGE_SIZE)),
    });
    await screen.findByText('Page 0');

    act(() => intersect?.());
    await waitFor(() => expect(list).toHaveBeenCalledWith('', PAGE_SIZE));

    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'q' } });
    await waitFor(() => expect(list).toHaveBeenCalledWith('q', 0));
  });
});

describe('paging as the list is scrolled', () => {
  it('loads the next page when the sentinel comes into view, and appends it', async () => {
    const { list } = renderPage({
      list: (_q, offset) => Promise.resolve(offset === 0 ? page(PAGE_SIZE) : page(2, PAGE_SIZE)),
    });
    await screen.findByText('Page 0');

    act(() => intersect?.());

    expect(await screen.findByText(`Page ${String(PAGE_SIZE)}`)).toBeDefined();
    expect(screen.getByText('Page 0')).toBeDefined(); // appended, not replaced
    expect(list).toHaveBeenCalledWith('', PAGE_SIZE);
  });

  it('stops paging once a short page comes back, because that was the end', async () => {
    // A page shorter than the page size IS the end-of-list signal; asking again would spin against
    // the store forever at the bottom of the list.
    const { list } = renderPage({ list: () => Promise.resolve(page(3)) });
    await screen.findByText('Page 0');

    act(() => intersect?.());
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second page request on top of one already in flight', async () => {
    let release: ((v: HistoryItem[]) => void) | null = null;
    const { list } = renderPage({
      list: (_q, offset) =>
        offset === 0
          ? Promise.resolve(page(PAGE_SIZE))
          : new Promise<HistoryItem[]>((res) => {
              release = res;
            }),
    });
    await screen.findByText('Page 0');

    act(() => intersect?.());
    act(() => intersect?.());
    act(() => intersect?.());
    expect(list).toHaveBeenCalledTimes(2); // the first page, plus exactly one more

    act(() => release?.(page(1, PAGE_SIZE)));
    expect(await screen.findByText(`Page ${String(PAGE_SIZE)}`)).toBeDefined();
  });

  it('keeps what is already listed when a page request fails', async () => {
    const { list } = renderPage({
      list: (_q, offset) =>
        offset === 0 ? Promise.resolve(page(PAGE_SIZE)) : Promise.reject(new Error('offline')),
    });
    await screen.findByText('Page 0');

    act(() => intersect?.());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Page 0')).toBeDefined();
  });
});

describe('removing entries', () => {
  it('drops the row immediately and tells the store, rather than waiting on it', async () => {
    // The row is gone the moment it is clicked because the alternative is a history page that keeps
    // showing a page the user just asked to forget.
    const { remove } = renderPage();
    await screen.findByText('Page 1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);

    expect(screen.queryByText('Page 1')).toBeNull();
    expect(screen.getByText('Page 0')).toBeDefined();
    expect(remove).toHaveBeenCalledWith('https://site-1.test/');
  });

  it('clears the whole list and tells the store', async () => {
    const { clear } = renderPage();
    await screen.findByText('Page 0');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(screen.getByText('No history yet')).toBeDefined());
    expect(clear).toHaveBeenCalled();
  });

  it('leaves the list alone when clearing fails, rather than claiming it worked', async () => {
    renderPage({ clear: () => Promise.reject(new Error('write denied')) });
    await screen.findByText('Page 0');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(screen.getByText('Page 0')).toBeDefined());
    expect(screen.queryByText('No history yet')).toBeNull();
  });
});

describe('favicons on a history page', () => {
  it('renders an inline data: favicon', async () => {
    renderPage({
      list: () => Promise.resolve([item(0, { favicon: 'data:image/png;base64,AA' })]),
    });
    await screen.findByText('Page 0');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA');
  });

  it('refuses a REMOTE favicon url and draws the glyph instead', async () => {
    // This is the whole point of the data:-only rule. Fetching a favicon from the history page would
    // announce to that site — and to anything on the path — which pages the user is reviewing.
    renderPage({
      list: () => Promise.resolve([item(0, { favicon: 'https://tracker.example/favicon.ico' })]),
    });
    await screen.findByText('Page 0');
    expect(document.querySelector('img')).toBeNull();
  });

  it('falls back to the glyph when an inline favicon fails to decode', async () => {
    renderPage({
      list: () => Promise.resolve([item(0, { favicon: 'data:image/png;base64,broken' })]),
    });
    await screen.findByText('Page 0');
    fireEvent.error(document.querySelector('img')!);
    expect(document.querySelector('img')).toBeNull();
  });

  it('draws the glyph for an entry with no favicon at all', async () => {
    renderPage({ list: () => Promise.resolve([item(0, { favicon: null })]) });
    await screen.findByText('Page 0');
    expect(document.querySelector('img')).toBeNull();
  });
});
