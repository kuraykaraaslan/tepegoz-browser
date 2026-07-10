import { z } from 'zod';
import type {
  TranslateBatchInput,
  TranslateBatchItem,
  TranslateBatchResult,
  TranslateBatchResultItem,
  TranslateGlossaryTerm,
  TranslateLanguage,
  TranslateSettings,
} from './types';

const UNKNOWN_LANGUAGE = 'und';

export const TranslateModelItemSchema = z.object({
  id: z.string().min(1).max(128),
  translatedText: z.string().max(20_000),
});

export const TranslateModelResponseSchema = z.object({
  items: z.array(TranslateModelItemSchema).max(300),
});

export function normalizeTranslateLanguage(
  value: string | null | undefined,
  fallback: TranslateLanguage = UNKNOWN_LANGUAGE,
): TranslateLanguage {
  const clean = (value ?? '').trim().toLowerCase().replace('_', '-');
  const match = /^[a-z]{2,3}/.exec(clean);
  return match?.[0] ?? fallback;
}

export function resolveTranslateTargetLanguage(locale: string): TranslateLanguage {
  const normalized = normalizeTranslateLanguage(locale, 'en');
  return normalized === 'tr' ? 'tr' : 'en';
}

export function normalizeTranslateOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTranslateEnabledForOrigin(
  settings: TranslateSettings,
  originOrUrl?: string,
): boolean {
  if (!settings.enabled) return false;
  if (originOrUrl === undefined || originOrUrl.length === 0) return true;
  const origin = normalizeTranslateOrigin(originOrUrl);
  return origin !== null && !settings.disabledOrigins.includes(origin);
}

export function shouldAutoTranslatePage(
  settings: TranslateSettings,
  sourceLanguage: string | null | undefined,
  targetLanguage: string,
  originOrUrl: string,
): boolean {
  if (!settings.autoTranslateForeignPages || !isTranslateEnabledForOrigin(settings, originOrUrl)) {
    return false;
  }
  const source = normalizeTranslateLanguage(sourceLanguage);
  const target = normalizeTranslateLanguage(targetLanguage);
  return source !== UNKNOWN_LANGUAGE && target !== UNKNOWN_LANGUAGE && source !== target;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function glossaryTermsFor(
  terms: readonly TranslateGlossaryTerm[],
  sourceLanguage: string,
  targetLanguage: string,
): TranslateGlossaryTerm[] {
  const source = normalizeTranslateLanguage(sourceLanguage);
  const target = normalizeTranslateLanguage(targetLanguage);
  return terms.filter((term) => {
    const termSource = normalizeTranslateLanguage(term.sourceLanguage, source);
    const termTarget = normalizeTranslateLanguage(term.targetLanguage, target);
    return term.source.trim().length > 0 && term.target.trim().length > 0 && termSource === source && termTarget === target;
  });
}

export function applyGlossaryTerms(
  text: string,
  terms: readonly TranslateGlossaryTerm[],
): string {
  let out = text;
  for (const term of terms) {
    const source = term.source.trim();
    const target = term.target.trim();
    if (source.length === 0 || target.length === 0) continue;
    const flags = term.caseSensitive ? 'g' : 'gi';
    out = out.replace(new RegExp(escapeRegExp(source), flags), target);
  }
  return out;
}

export function createTranslateBatches(
  items: readonly TranslateBatchItem[],
  maxItems = 40,
  maxChars = 12_000,
): TranslateBatchItem[][] {
  const batches: TranslateBatchItem[][] = [];
  let current: TranslateBatchItem[] = [];
  let chars = 0;
  for (const item of items) {
    const text = item.text.trim();
    if (item.id.trim().length === 0 || text.length === 0) continue;
    const len = text.length;
    if (current.length > 0 && (current.length >= maxItems || chars + len > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push({ id: item.id, text: item.text });
    chars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function translationMemoryKey(
  sourceLanguage: string,
  targetLanguage: string,
  text: string,
): string {
  return `${normalizeTranslateLanguage(sourceLanguage)}:${normalizeTranslateLanguage(targetLanguage)}:${text}`;
}

export function parseTranslateModelResponse(
  rawText: string,
  input: TranslateBatchInput,
  engine: TranslateBatchResultItem['engine'],
): TranslateBatchResult {
  const parsed = TranslateModelResponseSchema.parse(JSON.parse(rawText));
  const sourceLanguage = normalizeTranslateLanguage(input.sourceLanguage);
  const targetLanguage = normalizeTranslateLanguage(input.targetLanguage, 'en');
  const originalById = new Map(input.items.map((item) => [item.id, item.text]));
  const items: TranslateBatchResultItem[] = [];
  for (const item of parsed.items) {
    const original = originalById.get(item.id);
    if (original === undefined) continue;
    items.push({
      id: item.id,
      text: original,
      translatedText: item.translatedText,
      engine,
    });
  }
  return { sourceLanguage, targetLanguage, items, engine, durationMs: 0 };
}
