import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';
import {
  PageContextMenuContributionService,
  type PageContextMenuContributionContext,
} from './page-context-menu-contributions';

function context(menuId: string): PageContextMenuContributionContext {
  return {
    menuId,
    contributions: [],
    canGoBack: false,
    canGoForward: false,
    pageUrl: 'https://example.test/',
    selectionText: '',
    linkUrl: '',
    srcUrl: '',
    mediaType: 'none',
    isEditable: true,
    canCopy: true,
    canCut: true,
    canPaste: true,
    canSelectAll: true,
    x: 10,
    y: 20,
    parent: {} as BrowserWindow,
    webContents: {} as WebContents,
  };
}

describe('PageContextMenuContributionService', () => {
  it('rejects stale menu contribution actions', async () => {
    const service = new PageContextMenuContributionService();
    const runAction = vi.fn();
    service.provide({
      id: 'test-contributor',
      collect: () => [
        {
          id: 'section',
          contributorId: 'test-contributor',
          placement: 'top',
          priority: 0,
          items: [{ id: 'item', label: 'Item', actionId: 'act' }],
        },
      ],
      runAction,
    });

    await service.collect(context('menu-old'));
    await service.collect(context('menu-new'));
    await service.runAction({
      menuId: 'menu-old',
      contributorId: 'test-contributor',
      sectionId: 'section',
      itemId: 'item',
      actionId: 'act',
    });

    expect(runAction).not.toHaveBeenCalled();

    await service.runAction({
      menuId: 'menu-new',
      contributorId: 'test-contributor',
      sectionId: 'section',
      itemId: 'item',
      actionId: 'act',
    });

    expect(runAction).toHaveBeenCalledTimes(1);
  });
});
