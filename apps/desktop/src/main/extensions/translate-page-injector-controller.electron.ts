import { z } from 'zod';
import { type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import {
  normalizeTranslateLanguage,
  shouldAutoTranslatePage,
} from '@tepegoz/ext-translate/engine';
import type { TranslatePageState } from '@tepegoz/ext-translate/types';
import TabManager from '../tabs';
import translateHost, { setTranslatePageState } from './translate-host.electron';
import { originOf } from './translate-page-injector-binding.electron';
import { inject } from './translate-page-injector.electron';

const PageScriptStateSchema = z.object({
  sourceLanguage: z.string().max(16).optional(),
  targetLanguage: z.string().max(16).optional(),
});

let started = false;

async function pageLanguage(wc: WebContents): Promise<string> {
  const raw: unknown = await wc.executeJavaScript(
    "(document.documentElement.getAttribute('lang') || document.body?.getAttribute('lang') || navigator.language || '').slice(0, 16)",
    true,
  );
  return typeof raw === 'string' ? raw : '';
}

async function startTranslation(
  wc: WebContents,
  reason: 'page' | 'manual',
  sourceLanguage?: string,
): Promise<TranslatePageState | null> {
  if (wc.isDestroyed()) return null;
  const url = wc.getURL();
  const origin = originOf(url);
  if (origin === undefined || !translateHost.isActiveForPage(origin)) return null;
  const targetLanguage = translateHost.targetLanguage();
  const source = normalizeTranslateLanguage(sourceLanguage ?? (await pageLanguage(wc)));
  await inject(wc);
  await wc.executeJavaScript(
    `window.__tepegozTranslateStart?.(${JSON.stringify({
      targetLanguage,
      sourceLanguage: source,
      origin,
      reason,
    })}) ?? null;`,
    true,
  );
  return translateHost.pageState();
}

async function maybeAutoTranslate(url: string, wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const origin = originOf(url);
  if (origin === undefined) return;
  const settings = PreferenceStore.getAll().translate;
  const targetLanguage = translateHost.targetLanguage();
  const sourceLanguage = await pageLanguage(wc).catch(() => '');
  if (!shouldAutoTranslatePage(settings, sourceLanguage, targetLanguage, origin)) return;
  await startTranslation(wc, 'page', sourceLanguage).catch((err) => {
    Logger.warn('Automatic page translation failed', { url, err: String(err) });
  });
}

const TranslatePageInjector = {
  start(): void {
    if (started) return;
    started = true;
    TabManager.onNavigation((url, wc) => {
      void maybeAutoTranslate(url, wc);
    });
  },

  async translateActive(): Promise<TranslatePageState | null> {
    const wc = TabManager.activeWebContents();
    return wc === null ? null : startTranslation(wc, 'manual');
  },

  async translateWebContents(wc: WebContents): Promise<TranslatePageState | null> {
    return startTranslation(wc, 'manual');
  },

  async restoreActive(): Promise<TranslatePageState | null> {
    const wc = TabManager.activeWebContents();
    if (wc === null || wc.isDestroyed()) return null;
    await inject(wc);
    const raw: unknown = await wc.executeJavaScript('window.__tepegozTranslateRestore?.() ?? null;', true);
    const parsed = PageScriptStateSchema.safeParse(raw);
    const url = wc.getURL();
    const origin = originOf(url) ?? '';
    const restored: TranslatePageState = {
      url,
      origin,
      sourceLanguage: normalizeTranslateLanguage(parsed.success ? parsed.data.sourceLanguage : undefined),
      targetLanguage: normalizeTranslateLanguage(
        parsed.success ? parsed.data.targetLanguage : undefined,
        translateHost.targetLanguage(),
      ),
      status: 'restored',
      translatedItems: 0,
      totalItems: 0,
      engine: 'none',
      error: null,
      updatedAt: Date.now(),
    };
    setTranslatePageState(restored);
    return restored;
  },

  async restoreWebContents(wc: WebContents): Promise<TranslatePageState | null> {
    if (wc.isDestroyed()) return null;
    await inject(wc);
    const raw: unknown = await wc.executeJavaScript('window.__tepegozTranslateRestore?.() ?? null;', true);
    const parsed = PageScriptStateSchema.safeParse(raw);
    const url = wc.getURL();
    const origin = originOf(url) ?? '';
    const restored: TranslatePageState = {
      url,
      origin,
      sourceLanguage: normalizeTranslateLanguage(parsed.success ? parsed.data.sourceLanguage : undefined),
      targetLanguage: normalizeTranslateLanguage(
        parsed.success ? parsed.data.targetLanguage : undefined,
        translateHost.targetLanguage(),
      ),
      status: 'restored',
      translatedItems: 0,
      totalItems: 0,
      engine: 'none',
      error: null,
      updatedAt: Date.now(),
    };
    setTranslatePageState(restored);
    return restored;
  },
};

export default TranslatePageInjector;
