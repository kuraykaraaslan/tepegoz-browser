import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContents } from 'electron';
import type { PageMenuContributionSection } from '@tepegoz/desktop-ipc';
import type { PageContextMenuContributionContext } from './page-context-menu-contributions';

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const { PageContextMenuContributionService } = await import('./page-context-menu-contributions');

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

function section(id: string, itemCount: number): PageMenuContributionSection {
  return {
    id,
    contributorId: 'will-be-overwritten',
    placement: 'top',
    priority: 0,
    items: Array.from({ length: itemCount }, (_v, i) => ({
      id: `${id}-item-${String(i)}`,
      label: `Item ${String(i)}`,
      actionId: 'act',
    })),
  };
}

function action(
  menuId: string,
  contributorId: string,
): { menuId: string; contributorId: string; sectionId: string; itemId: string; actionId: string } {
  return { menuId, contributorId, sectionId: 'section', itemId: 'item', actionId: 'act' };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PageContextMenuContributionService', () => {
  it('rejects stale menu contribution actions', async () => {
    const service = new PageContextMenuContributionService();
    const runAction = vi.fn();
    service.provide({ id: 'test-contributor', collect: () => [section('section', 1)], runAction });

    await service.collect(context('menu-old'));
    await service.collect(context('menu-new'));
    await service.runAction(action('menu-old', 'test-contributor'));
    expect(runAction).not.toHaveBeenCalled();

    await service.runAction(action('menu-new', 'test-contributor'));
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  describe('collect', () => {
    it('caps sections per contributor, drops empty sections, caps items, and stamps the contributor id', async () => {
      const service = new PageContextMenuContributionService();
      // An empty section within the first 8 (so the filter, not just the slice, has to drop it) plus
      // 9 populated ones with more than the per-section item cap.
      const sections: PageMenuContributionSection[] = [
        section('empty', 0),
        ...Array.from({ length: 9 }, (_v, i) => section(`s${String(i)}`, 25)),
      ];
      service.provide({ id: 'big', collect: () => sections, runAction: vi.fn() });

      const collected = await service.collect(context('m'));

      expect(collected).toHaveLength(7); // slice(0,8) → [empty, s0..s6]; filter drops [empty]
      expect(collected.every((s) => s.items.length > 0)).toBe(true);
      expect(collected.every((s) => s.items.length <= 20)).toBe(true);
      expect(collected.every((s) => s.contributorId === 'big')).toBe(true);
    });

    it('logs and skips a contributor that throws, still collecting the others', async () => {
      const service = new PageContextMenuContributionService();
      service.provide({
        id: 'bad',
        collect: () => {
          throw new Error('kaboom');
        },
        runAction: vi.fn(),
      });
      service.provide({ id: 'good', collect: () => [section('section', 2)], runAction: vi.fn() });

      const collected = await service.collect(context('m'));

      expect(collected).toHaveLength(1);
      expect(collected[0]?.contributorId).toBe('good');
      expect(logger.warn).toHaveBeenCalledWith('Page context menu contribution failed', {
        contributorId: 'bad',
        err: expect.stringContaining('kaboom') as string,
      });
    });

    it('drops a contributor whose collect outruns the timeout budget', async () => {
      vi.useFakeTimers();
      try {
        const service = new PageContextMenuContributionService();
        service.provide({
          id: 'slow',
          collect: () => new Promise<PageMenuContributionSection[]>(() => undefined),
          runAction: vi.fn(),
        });
        service.provide({ id: 'fast', collect: () => [section('section', 1)], runAction: vi.fn() });

        const pending = service.collect(context('m'));
        await vi.advanceTimersByTimeAsync(200);
        const collected = await pending;

        expect(collected).toHaveLength(1);
        expect(collected[0]?.contributorId).toBe('fast');
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not clobber a newer active context when an older collect finishes late', async () => {
      const service = new PageContextMenuContributionService();
      service.provide({ id: 'c', collect: () => [section('section', 1)], runAction: vi.fn() });

      const p1 = service.collect(context('A'));
      const p2 = service.collect(context('B'));
      const [r1] = await Promise.all([p1, p2]);

      expect(r1).toHaveLength(1);
      // Active context is 'B'; an action for the superseded 'A' menu is rejected as stale.
      await service.runAction(action('A', 'c'));
      expect(logger.warn).toHaveBeenCalledWith('Ignored stale page menu contribution action', {
        menuId: 'A',
        activeMenuId: 'B',
      });
    });
  });

  describe('runAction', () => {
    it('ignores an action when nothing has been collected yet', async () => {
      const service = new PageContextMenuContributionService();
      await service.runAction(action('m', 'c'));
      expect(logger.warn).toHaveBeenCalledWith('Ignored stale page menu contribution action', {
        menuId: 'm',
        activeMenuId: null,
      });
    });

    it('ignores an action naming a contributor that never registered', async () => {
      const service = new PageContextMenuContributionService();
      service.provide({ id: 'known', collect: () => [section('section', 1)], runAction: vi.fn() });
      await service.collect(context('m'));

      await service.runAction(action('m', 'ghost'));
      expect(logger.warn).toHaveBeenCalledWith('Ignored unknown page menu contribution action', {
        contributorId: 'ghost',
      });
    });

    it('logs when the contributor action itself throws', async () => {
      const service = new PageContextMenuContributionService();
      service.provide({
        id: 'known',
        collect: () => [section('section', 1)],
        runAction: () => {
          throw new Error('action boom');
        },
      });
      await service.collect(context('m'));

      await service.runAction(action('m', 'known'));
      expect(logger.warn).toHaveBeenCalledWith('Page context menu contribution action failed', {
        contributorId: 'known',
        actionId: 'act',
        err: expect.stringContaining('action boom') as string,
      });
    });

    it('runs the action for the live menu and contributor', async () => {
      const service = new PageContextMenuContributionService();
      const runAction = vi.fn();
      service.provide({ id: 'known', collect: () => [section('section', 1)], runAction });
      await service.collect(context('m'));

      await service.runAction(action('m', 'known'));
      expect(runAction).toHaveBeenCalledTimes(1);
    });
  });
});
