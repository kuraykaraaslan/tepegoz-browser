import { describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@tepegoz/browser-menu';
import { en } from './i18n/en';
import {
  buildPageContextMenuModel,
  type PageContextMenuActions,
  type PageContextMenuContext,
} from './model';

/**
 * One branch is deliberately left uncovered: `compactMenu`'s trailing-separator pop. Every core menu
 * ends with `inspect`, and every placement merged after the loop appends its rows AFTER the separator
 * that introduces them — so the merged array cannot end on a separator. It is tidying for a shape the
 * builders do not currently produce.
 */

type MenuRowItem = Extract<MenuItem, { kind?: 'item' }>;

function actions(): PageContextMenuActions {
  const noop = vi.fn();
  return {
    back: noop,
    forward: noop,
    reload: noop,
    save: noop,
    print: noop,
    savePdf: noop,
    readerMode: noop,
    screenshotViewport: noop,
    screenshotFullPage: noop,
    viewSource: noop,
    inspect: noop,
    copy: noop,
    cut: noop,
    paste: noop,
    selectAll: noop,
    searchSelection: noop,
    copyLink: noop,
    openLinkNewTab: noop,
    copyImage: noop,
    copyMediaLink: noop,
    saveMedia: noop,
    openMediaNewTab: noop,
    contribution: vi.fn(),
  };
}

function editableCtx(patch: Partial<PageContextMenuContext> = {}): PageContextMenuContext {
  return {
    menuId: 'menu-1',
    contributions: [],
    canGoBack: false,
    canGoForward: false,
    selectionText: '',
    linkUrl: '',
    srcUrl: '',
    mediaType: 'none',
    isEditable: true,
    canCopy: true,
    canCut: true,
    canPaste: true,
    canSelectAll: true,
    ...patch,
  };
}

function key(item: MenuItem): string {
  if (item.kind === 'separator') return 'sep';
  if (item.kind === 'label') return `label:${item.text}`;
  return item.id;
}

function itemIds(items: MenuItem[]): string[] {
  return items.map(key);
}

function findItem(items: MenuItem[], id: string): MenuRowItem {
  const item = items.find((candidate) => key(candidate) === id);
  if (item === undefined || (item.kind !== undefined && item.kind !== 'item')) {
    throw new Error(`Missing menu item ${id}`);
  }
  return item;
}

describe('buildPageContextMenuModel contributions', () => {
  it('keeps the core menu unchanged when contributions are empty', () => {
    const core = buildPageContextMenuModel(en, editableCtx(), actions(), 'win32');
    const withEmptyContribution = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          {
            id: 'empty',
            contributorId: 'test',
            placement: 'top',
            priority: 0,
            items: [],
          },
        ],
      }),
      actions(),
      'win32',
    );

    expect(itemIds(withEmptyContribution)).toEqual(itemIds(core));
  });

  it('merges contribution placements around edit and inspect rows', () => {
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          {
            id: 'bottom',
            contributorId: 'test',
            placement: 'bottom',
            priority: 0,
            items: [{ id: 'bottom-item', label: 'Bottom', actionId: 'bottom' }],
          },
          {
            id: 'before-inspect',
            contributorId: 'test',
            placement: 'before-inspect',
            priority: 0,
            items: [{ id: 'before-inspect-item', label: 'Before Inspect', actionId: 'inspect' }],
          },
          {
            id: 'before-edit',
            contributorId: 'test',
            placement: 'before-edit',
            priority: 0,
            items: [{ id: 'before-edit-item', label: 'Before Edit', actionId: 'edit' }],
          },
          {
            id: 'top',
            contributorId: 'test',
            placement: 'top',
            priority: 0,
            items: [{ id: 'top-item', label: 'Top', actionId: 'top' }],
          },
        ],
      }),
      actions(),
      'win32',
    );
    const ids = itemIds(items);

    expect(ids.indexOf('contribution:test:top:top-item')).toBeLessThan(ids.indexOf('cut'));
    expect(ids.indexOf('contribution:test:before-edit:before-edit-item')).toBeLessThan(
      ids.indexOf('cut'),
    );
    expect(ids.indexOf('contribution:test:before-inspect:before-inspect-item')).toBeLessThan(
      ids.indexOf('inspect'),
    );
    expect(ids.indexOf('contribution:test:bottom:bottom-item')).toBeGreaterThan(
      ids.indexOf('inspect'),
    );
  });

  it('dispatches enabled contributed rows with the serialized action input', () => {
    const a = actions();
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          {
            id: 'typo',
            contributorId: 'com.tepegoz.typo',
            placement: 'top',
            priority: 0,
            title: 'Spelling: teh',
            items: [
              {
                id: 'suggestion-0',
                label: 'the',
                actionId: 'apply-suggestion',
                payload: { start: 0, end: 3, suggestion: 'the' },
              },
            ],
          },
        ],
      }),
      a,
      'win32',
    );

    findItem(items, 'contribution:com.tepegoz.typo:typo:suggestion-0').onSelect?.();

    expect(a.contribution).toHaveBeenCalledWith({
      menuId: 'menu-1',
      contributorId: 'com.tepegoz.typo',
      sectionId: 'typo',
      itemId: 'suggestion-0',
      actionId: 'apply-suggestion',
      payload: { start: 0, end: 3, suggestion: 'the' },
    });
  });

  it('does not dispatch disabled contributed rows', () => {
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          {
            id: 'disabled',
            contributorId: 'test',
            placement: 'top',
            priority: 0,
            items: [
              {
                id: 'item',
                label: 'Disabled',
                actionId: 'noop',
                disabled: true,
              },
            ],
          },
        ],
      }),
      actions(),
      'win32',
    );

    const item = findItem(items, 'contribution:test:disabled:item');
    expect(item.disabled).toBe(true);
    expect(item.onSelect).toBeUndefined();
  });
});

describe('the menu each right-click target gets', () => {
  const pageCtx = (patch: Partial<PageContextMenuContext> = {}): PageContextMenuContext =>
    editableCtx({ isEditable: false, ...patch });

  it('offers the image commands on an image', () => {
    const items = buildPageContextMenuModel(
      en,
      pageCtx({ mediaType: 'image' }),
      actions(),
      'win32',
    );
    expect(itemIds(items)).toEqual([
      'open-image-new-tab',
      'save-image',
      'copy-image',
      'copy-image-address',
      'sep',
      'inspect',
    ]);
    expect(findItem(items, 'save-image').disabled).toBe(false);
  });

  it('offers the media commands on a video and on audio, with no copy-image among them', () => {
    // Copying the pixels is an image affordance; a video frame is not what "copy" would mean here.
    for (const mediaType of ['video', 'audio'] as const) {
      const items = buildPageContextMenuModel(en, pageCtx({ mediaType }), actions(), 'win32');
      expect(itemIds(items), mediaType).toEqual([
        'open-media-new-tab',
        'save-media',
        'copy-media-address',
        'sep',
        'inspect',
      ]);
    }
  });

  it('appends the image rows to a LINK menu when the link is an image', () => {
    const items = buildPageContextMenuModel(
      en,
      pageCtx({ linkUrl: 'https://x/pic', mediaType: 'image' }),
      actions(),
      'win32',
    );
    expect(itemIds(items)).toEqual([
      'open-link-new-tab',
      'copy-link',
      'sep',
      'open-image-new-tab',
      'save-image',
      'copy-image',
      'sep',
      'inspect',
    ]);
  });

  it('adds Copy to a link menu when text is also selected', () => {
    const items = buildPageContextMenuModel(
      en,
      pageCtx({ linkUrl: 'https://x/', selectionText: 'some words' }),
      actions(),
      'win32',
    );
    expect(itemIds(items)).toEqual([
      'open-link-new-tab',
      'copy-link',
      'sep',
      'copy',
      'sep',
      'inspect',
    ]);
  });

  it('greys out each edit command the page says is unavailable, rather than hiding it', () => {
    // A command that vanishes reads as "this menu is broken"; a greyed one reads as "not now", which
    // is what an empty clipboard or an unselectable field actually means.
    const items = buildPageContextMenuModel(
      en,
      editableCtx({ canCut: false, canCopy: false, canPaste: false, canSelectAll: false }),
      actions(),
      'win32',
    );
    for (const id of ['cut', 'copy', 'paste', 'select-all']) {
      expect(findItem(items, id).disabled, id).toBe(true);
      expect(findItem(items, id).onSelect, id).toBeUndefined();
    }
    // and the row is still there, in place
    expect(itemIds(items)).toEqual(['cut', 'copy', 'paste', 'select-all', 'sep', 'inspect']);
  });

  it('greys out Back and Forward when there is no history either way', () => {
    const items = buildPageContextMenuModel(en, pageCtx(), actions(), 'win32');
    expect(findItem(items, 'back').disabled).toBe(true);
    expect(findItem(items, 'forward').disabled).toBe(true);

    const withHistory = buildPageContextMenuModel(
      en,
      pageCtx({ canGoBack: true, canGoForward: true }),
      actions(),
      'win32',
    );
    expect(findItem(withHistory, 'back').disabled).toBe(false);
    expect(findItem(withHistory, 'forward').disabled).toBe(false);
  });
});

describe('menu tidying', () => {
  it('never renders a doubled or trailing separator', () => {
    // Sections come and go with the context, so an absent section would otherwise leave the
    // separator that introduced it — two rules in a row, or a rule hanging off the bottom.
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          { id: 'a', contributorId: 'test', placement: 'top', priority: 0, items: [] },
          {
            id: 'b',
            contributorId: 'test',
            placement: 'bottom',
            priority: 0,
            items: [{ id: 'one', label: 'One', actionId: 'act.one' }],
          },
        ],
      }),
      actions(),
      'win32',
    );
    const ids = itemIds(items);
    expect(ids[ids.length - 1]).not.toBe('sep');
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] === 'sep' && ids[i - 1] === 'sep', `doubled separator at ${String(i)}`).toBe(
        false,
      );
    }
  });

  it('separates two contribution sections in the same placement from each other', () => {
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        contributions: [
          {
            id: 'second',
            contributorId: 'test',
            placement: 'top',
            priority: 2,
            items: [{ id: 'b', label: 'B', actionId: 'act.b' }],
          },
          {
            id: 'first',
            contributorId: 'test',
            placement: 'top',
            priority: 1,
            title: 'Section one',
            items: [{ id: 'a', label: 'A', actionId: 'act.a' }],
          },
        ],
      }),
      actions(),
      'win32',
    );
    const ids = itemIds(items);
    // priority orders the sections, the title labels the one that has one, and a separator divides
    expect(ids.slice(0, 4)).toEqual([
      'label:Section one',
      'contribution:test:first:a',
      'sep',
      'contribution:test:second:b',
    ]);
  });
});

describe('the selection menu', () => {
  const selCtx = (selectionText: string): PageContextMenuContext =>
    editableCtx({ isEditable: false, selectionText });

  it('offers copy, a search row naming the selection, and the not-yet-wired placeholders', () => {
    const items = buildPageContextMenuModel(en, selCtx('kuray'), actions(), 'win32');
    expect(itemIds(items)).toEqual([
      'copy',
      'copy-link-highlight',
      'search-selection',
      'sep',
      'print',
      'reading-mode',
      'translate-selection',
      'sep',
      'extensions',
      'sep',
      'inspect',
    ]);
    expect(findItem(items, 'search-selection').label).toBe('Search the web for “kuray”');
    // placeholders are greyed, so keyboard navigation skips them instead of landing on a dead row
    expect(findItem(items, 'reading-mode').disabled).toBe(true);
    expect(findItem(items, 'copy').disabled).toBe(false);
  });

  it('ellipsizes a long selection in the search row instead of stretching the menu', () => {
    const long = 'x'.repeat(200);
    const items = buildPageContextMenuModel(en, selCtx(long), actions(), 'win32');
    const label = findItem(items, 'search-selection').label;
    expect(label).toBe(`Search the web for “${'x'.repeat(40)}…”`);
    // a selection exactly at the cap keeps its last character and gains no ellipsis
    const exact = buildPageContextMenuModel(en, selCtx('y'.repeat(40)), actions(), 'win32');
    expect(findItem(exact, 'search-selection').label).toBe(
      `Search the web for “${'y'.repeat(40)}”`,
    );
  });

  it('drops a trailing separator left by a bottom contribution that renders nothing', () => {
    // `compactMenu` pops the tail. Without it a bottom section with no visible items leaves the
    // rule that was meant to introduce it hanging off the end of the menu.
    const items = buildPageContextMenuModel(
      en,
      editableCtx({
        isEditable: false,
        contributions: [
          {
            id: 'empty-bottom',
            contributorId: 'test',
            placement: 'bottom',
            priority: 0,
            items: [],
          },
        ],
      }),
      actions(),
      'win32',
    );
    expect(itemIds(items).at(-1)).not.toBe('sep');
  });
});
