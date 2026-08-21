import { app, dialog } from 'electron';
import type { PageMenuContributionActionInput } from '@tepegoz/desktop-ipc';
import { TRANSLATE_EXTENSION_ID } from '@tepegoz/ext-translate/host';
import type {
  PageContextMenuContributionContext,
  PageContextMenuContributor,
} from '../menus/page-context-menu-contributions';
import translateHost from './translate-host.electron';
import TranslatePageInjector from './translate-page-injector-controller.electron';

function labels(): {
  title: string;
  translatePage: string;
  translateSelection: string;
  restoreOriginal: string;
  resultTitle: string;
} {
  const locale = app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en';
  if (locale === 'tr') {
    return {
      title: 'Çeviri',
      translatePage: 'Sayfayı çevir',
      translateSelection: 'Seçimi çevir',
      restoreOriginal: 'Orijinali geri yükle',
      resultTitle: 'Çeviri sonucu',
    };
  }
  return {
    title: 'Translate',
    translatePage: 'Translate page',
    translateSelection: 'Translate selection',
    restoreOriginal: 'Restore original',
    resultTitle: 'Translation result',
  };
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
        title: t.title,
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
