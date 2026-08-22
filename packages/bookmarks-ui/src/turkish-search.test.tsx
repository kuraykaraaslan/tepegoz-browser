// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { BookmarksManager, type BookmarkManagerNode } from './bookmarks-ui';

/**
 * The "Turkish first-class" claim, made measurable on a real surface.
 *
 * "İSTANBUL Gezisi" was unreachable by typing `istanbul`, because `'İ'.toLowerCase()` is `i` followed by
 * a COMBINING DOT ABOVE, so the substring check silently missed. The mirror case is worse because it
 * looks like it works: capital `I` lowercases to a DOTTED i, so "ISPARTA" never matched a user typing
 * `ısparta`. Both are ordinary words for this product's primary market, and neither produced an error —
 * only an empty result list, which reads as "you have no such bookmark".
 *
 * Tested through the rendered surface rather than against the fold helper, because the helper was
 * already correct in the omnibox. What was broken was this surface not using it, and only a test that
 * types into the real search box can tell those two apart.
 */
function bm(id: string, title: string, url: string): BookmarkManagerNode {
  return { id, type: 'bookmark', title, url, favicon: null, children: [] };
}

const TREE: BookmarkManagerNode[] = [
  {
    id: 'root-bar',
    type: 'folder',
    title: 'Bookmarks bar',
    url: null,
    favicon: null,
    children: [
      bm('a', 'İSTANBUL Gezisi', 'https://a.example/'),
      bm('b', 'ISPARTA notları', 'https://b.example/'),
      bm('c', 'Şişli kahvaltı', 'https://c.example/'),
      bm('d', 'Inbox Zero', 'https://d.example/'),
    ],
  },
  {
    id: 'root-other',
    type: 'folder',
    title: 'Other bookmarks',
    url: null,
    favicon: null,
    children: [],
  },
];

async function searchFor(term: string): Promise<void> {
  render(
    <I18nProvider locale="en">
      <BookmarksManager
        getTree={vi.fn().mockResolvedValue(TREE)}
        refreshKey={0}
        onMove={vi.fn()}
        onNewFolder={vi.fn()}
        onOpen={vi.fn()}
        onContextMenu={vi.fn()}
      />
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getAllByText('Bookmarks bar').length).toBeGreaterThan(0));
  fireEvent.change(screen.getByPlaceholderText('Search bookmarks'), { target: { value: term } });
}

afterEach(cleanup);

describe('bookmark search is usable in Turkish', () => {
  it('finds a dotted-İ title from a plain-i query', async () => {
    // `'İSTANBUL Gezisi'.toLowerCase().includes('istanbul')` is false.
    await searchFor('istanbul');
    expect(await screen.findByText('İSTANBUL Gezisi')).toBeDefined();
  });

  it('finds a capital-I title from a dotless-ı query', async () => {
    // `'ISPARTA notları'.toLowerCase().includes('ısparta')` is false.
    await searchFor('ısparta');
    expect(await screen.findByText('ISPARTA notları')).toBeDefined();
  });

  it('finds an accented title from an unaccented query, as the omnibox already did', async () => {
    await searchFor('sisli');
    expect(await screen.findByText('Şişli kahvaltı')).toBeDefined();
  });

  it('still finds English titles, which locale-correct folding would have broken', async () => {
    // `'Inbox Zero'.toLocaleLowerCase('tr')` is 'ınbox zero' — swapping search to turkishLower would
    // have fixed Turkish by breaking English.
    await searchFor('INBOX');
    expect(await screen.findByText('Inbox Zero')).toBeDefined();
  });

  it('still excludes what does not match', async () => {
    await searchFor('istanbul');
    expect(screen.queryByText('Inbox Zero')).toBeNull();
  });
});
