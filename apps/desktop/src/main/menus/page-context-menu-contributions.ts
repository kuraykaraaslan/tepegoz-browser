import type { BrowserWindow, WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import type {
  PageMenuContext,
  PageMenuContributionActionInput,
  PageMenuContributionSection,
} from '@tepegoz/desktop-ipc';

const COLLECT_TIMEOUT_MS = 160;
const MAX_SECTIONS_PER_CONTRIBUTOR = 8;
const MAX_ITEMS_PER_SECTION = 20;

export interface PageContextMenuContributionContext extends PageMenuContext {
  x: number;
  y: number;
  parent: BrowserWindow;
  webContents: WebContents;
}

export interface PageContextMenuContributor {
  id: string;
  collect(
    ctx: PageContextMenuContributionContext,
  ): PageMenuContributionSection[] | Promise<PageMenuContributionSection[]>;
  runAction(
    input: PageMenuContributionActionInput,
    ctx: PageContextMenuContributionContext,
  ): void | Promise<void>;
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(value), ms);
    timer.unref?.();
  });
}

function cleanSections(
  contributorId: string,
  sections: PageMenuContributionSection[],
): PageMenuContributionSection[] {
  return sections
    .slice(0, MAX_SECTIONS_PER_CONTRIBUTOR)
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      ...section,
      contributorId,
      items: section.items.slice(0, MAX_ITEMS_PER_SECTION),
    }));
}

export class PageContextMenuContributionService {
  private readonly contributors = new Map<string, PageContextMenuContributor>();
  private activeCtx: PageContextMenuContributionContext | null = null;

  provide(contributor: PageContextMenuContributor): void {
    this.contributors.set(contributor.id, contributor);
  }

  async collect(
    ctx: PageContextMenuContributionContext,
  ): Promise<PageMenuContributionSection[]> {
    this.activeCtx = ctx;
    const menuId = ctx.menuId;
    const collected: PageMenuContributionSection[] = [];
    for (const contributor of this.contributors.values()) {
      try {
        const sections = await Promise.race([
          Promise.resolve(contributor.collect(ctx)),
          timeout<PageMenuContributionSection[]>(COLLECT_TIMEOUT_MS, []),
        ]);
        collected.push(...cleanSections(contributor.id, sections));
      } catch (err) {
        Logger.warn('Page context menu contribution failed', {
          contributorId: contributor.id,
          err: String(err),
        });
      }
    }
    if (this.activeCtx?.menuId === menuId) {
      this.activeCtx = { ...ctx, contributions: collected };
    }
    return collected;
  }

  async runAction(input: PageMenuContributionActionInput): Promise<void> {
    const ctx = this.activeCtx;
    if (ctx === null || input.menuId !== ctx.menuId) {
      Logger.warn('Ignored stale page menu contribution action', {
        menuId: input.menuId,
        activeMenuId: ctx?.menuId ?? null,
      });
      return;
    }
    const contributor = this.contributors.get(input.contributorId);
    if (contributor === undefined) {
      Logger.warn('Ignored unknown page menu contribution action', {
        contributorId: input.contributorId,
      });
      return;
    }
    try {
      await contributor.runAction(input, ctx);
    } catch (err) {
      Logger.warn('Page context menu contribution action failed', {
        contributorId: input.contributorId,
        actionId: input.actionId,
        err: String(err),
      });
    }
  }
}

const pageContextMenuContributionService = new PageContextMenuContributionService();
export default pageContextMenuContributionService;
