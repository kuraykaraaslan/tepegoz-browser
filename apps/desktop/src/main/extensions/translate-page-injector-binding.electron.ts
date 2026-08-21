import { z } from 'zod';
import { type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  normalizeTranslateLanguage,
  normalizeTranslateOrigin,
} from '@tepegoz/ext-translate/engine';
import translateHost, { setTranslatePageState } from './translate-host.electron';

export const BINDING = '__tepegozTranslatePost';
export const MAX_PAGE_ITEMS = 260;
export const MAX_ITEM_CHARS = 1600;

export type BindingListener = (event: unknown, method: string, params?: unknown) => void;

const BindingPayloadSchema = z.object({
  requestId: z.string().min(1).max(128),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        text: z.string().min(1).max(MAX_ITEM_CHARS),
      }),
    )
    .max(MAX_PAGE_ITEMS),
  sourceLanguage: z.string().min(1).max(16).optional(),
  targetLanguage: z.string().min(1).max(16),
  origin: z.string().max(2048).optional(),
  reason: z.enum(['selection', 'page', 'manual']).optional(),
});

const DebuggerPayloadSchema = z.object({
  name: z.string(),
  payload: z.string(),
});

export function originOf(url: string): string | undefined {
  return normalizeTranslateOrigin(url) ?? undefined;
}

export function makeBindingListener(wc: WebContents): BindingListener {
  return (_event: unknown, method: string, params?: unknown): void => {
    if (method !== 'Runtime.bindingCalled') return;
    const parsed = DebuggerPayloadSchema.safeParse(params);
    if (!parsed.success || parsed.data.name !== BINDING) return;
    let payload: z.infer<typeof BindingPayloadSchema>;
    try {
      payload = BindingPayloadSchema.parse(JSON.parse(parsed.data.payload));
    } catch {
      return;
    }
    const url = wc.getURL();
    const origin = originOf(url);
    if (origin === undefined || !translateHost.isActiveForPage(origin)) return;
    setTranslatePageState({
      url,
      origin,
      sourceLanguage: normalizeTranslateLanguage(payload.sourceLanguage),
      targetLanguage: normalizeTranslateLanguage(
        payload.targetLanguage,
        translateHost.targetLanguage(),
      ),
      status: 'translating',
      translatedItems: 0,
      totalItems: payload.items.length,
      engine: 'none',
      error: null,
      updatedAt: Date.now(),
    });
    void translateHost
      .translateBatch({
        items: payload.items,
        sourceLanguage: payload.sourceLanguage,
        targetLanguage: payload.targetLanguage,
        origin,
        reason: payload.reason ?? 'page',
      })
      .then((result) => {
        if (wc.isDestroyed()) return;
        const translatedItems = result.items.filter((item) => item.engine !== 'none').length;
        setTranslatePageState({
          url: wc.getURL(),
          origin,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          status: 'translated',
          translatedItems,
          totalItems: result.items.length,
          engine: result.engine,
          error: null,
          updatedAt: Date.now(),
        });
        const message = JSON.stringify({ requestId: payload.requestId, result });
        return wc.executeJavaScript(`window.__tepegozTranslateReceive?.(${message});`, true);
      })
      .catch((err) => {
        Logger.warn('Translate page batch failed', { err: String(err) });
        setTranslatePageState({
          url: wc.getURL(),
          origin,
          sourceLanguage: normalizeTranslateLanguage(payload.sourceLanguage),
          targetLanguage: normalizeTranslateLanguage(
            payload.targetLanguage,
            translateHost.targetLanguage(),
          ),
          status: 'error',
          translatedItems: 0,
          totalItems: payload.items.length,
          engine: 'none',
          error: String(err),
          updatedAt: Date.now(),
        });
      });
  };
}
