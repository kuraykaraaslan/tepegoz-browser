import { dialog } from 'electron';
import type { PageMenuContributionActionInput } from '@tepegoz/desktop-ipc';
import { TRANSLATE_EXTENSION_ID } from '@tepegoz/ext-translate/host';
import type {
  PageContextMenuContributionContext,
  PageContextMenuContributor,
} from '../menus/page-context-menu-contributions';
import translateHost from './translate-host.electron';
import TranslatePageInjector from './translate-page-injector-controller.electron';
import { mainStrings } from '../lib/i18n-main';

/**
 * This submenu's labels used to be a hand-rolled two-branch table keyed on `app.getLocale()`. Two
 * things were wrong with that, and only the second is visible in a screenshot:
 *
 *  1. `app.getLocale()` is the OPERATING SYSTEM's language. The app's own locale preference wins over
 *     it everywhere else (see `mainLocale`), so a user running Tepegöz in Turkish on an English
 *     Windows got a Turkish browser with an English Translate submenu inside it — and the reverse.
 *  2. The strings lived in a `.ts` file instead of the extension's dictionary, so they were invisible
 *     to the i18n parity test and to every translator. ADR-0016 puts them in `ext-translate`'s own
 *     `src/i18n`, which is where they now are.
 *
 * `mainStrings()` resolves per call, so a locale change while the app runs is picked up on the next
 * right-click without a restart.
 */
function labels(): ReturnType<typeof mainStrings>['translate']['native'] {
  return mainStrings().translate.native;
}

async function fullSelection(ctx: PageContextMenuContributionContext): Promise<string> {
  if (ctx.webContents.isDestroyed()) return ctx.selectionText;
  const raw: unknown = await ctx.webContents.executeJavaScript(
    'String(window.getSelection?.() || "").slice(0, 50000);',
    true,
  );
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : ctx.selectionText;
}

const translateContextMenuContributor: PageContextMenuContributor = {
  id: TRANSLATE_EXTENSION_ID,

  collect(ctx: PageContextMenuContributionContext) {
    if (!translateHost.isActiveForPage(ctx.pageUrl) || ctx.webContents.isDestroyed()) return [];
    const t = labels();
    const items = [
      {
        id: 'translate-page',
        label: t.translatePage,
        actionId: 'translate-page',
      },
    ];
    if (ctx.selectionText.trim().length > 0) {
      items.unshift({
        id: 'translate-selection',
        label: t.translateSelection,
        actionId: 'translate-selection',
      });
    }
    const pageState = translateHost.pageState();
    if (pageState?.status === 'translated' && pageState.origin.length > 0) {
      items.push({
        id: 'restore-original',
        label: t.restoreOriginal,
        actionId: 'restore-original',
      });
    }
    return [
      {
        id: 'translate',
        contributorId: TRANSLATE_EXTENSION_ID,
        placement: 'top',
        priority: 10,
        title: t.menuTitle,
        items,
      },
    ];
  },

  async runAction(input: PageMenuContributionActionInput, ctx: PageContextMenuContributionContext) {
    if (ctx.webContents.isDestroyed()) return;
    if (input.actionId === 'translate-page') {
      await TranslatePageInjector.translateWebContents(ctx.webContents);
      return;
    }
    if (input.actionId === 'restore-original') {
      await TranslatePageInjector.restoreWebContents(ctx.webContents);
      return;
    }
    if (input.actionId === 'translate-selection') {
      const text = await fullSelection(ctx);
      if (text.trim().length === 0) return;
      const result = await translateHost.translateText({
        text,
        origin: ctx.pageUrl,
        reason: 'selection',
      });
      await dialog.showMessageBox(ctx.parent, {
        type: 'info',
        title: labels().resultTitle,
        message: result.translatedText,
      });
    }
  },
};

export default translateContextMenuContributor;
