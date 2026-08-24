import { describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@tepegoz/browser-menu';
import { en } from './i18n/en';
import {
  buildPageContextMenuModel,
  type PageContextMenuActions,
  type PageContextMenuContext,
} from './model';

type MenuRowItem = Extract<MenuItem, { kind?: 'item' }>;

function actions(): PageContextMenuActions {
  const noop = vi.fn();
  return {
    back: noop,
    forward: noop,
    reload: noop,
    save: noop,
    print: noop,
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
