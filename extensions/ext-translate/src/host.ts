import {
  applyGlossaryTerms,
  createTranslateBatches,
  glossaryTermsFor,
  isTranslateEnabledForOrigin,
  normalizeTranslateLanguage,
  normalizeTranslateOrigin,
  resolveTranslateTargetLanguage,
  translationMemoryKey,
} from './engine';
import { translateManifest } from './manifest';
import {
  DEFAULT_TRANSLATE_SETTINGS,
  type TranslateBatchInput,
  type TranslateBatchItem,
  type TranslateBatchResult,
  type TranslateBatchResultItem,
  type TranslateCloudFallbackRequest,
  type TranslateCloudFallbackResponse,
  type TranslateGlossaryTerm,
  type TranslatePageState,
  type TranslateReason,
  type TranslateSettings,
  type TranslateState,
  type TranslateTextInput,
  type TranslateTextResult,
} from './types';

export const TRANSLATE_EXTENSION_ID = translateManifest.id;

const MAX_DISABLED_ORIGINS = 500;
const MAX_GLOSSARY_TERMS = 1000;
const MAX_TEXT_CHARS = 50_000;
let nextId = 0;

export interface TranslateRunBatchInput extends TranslateBatchInput {
  glossaryTerms: TranslateGlossaryTerm[];
}

export interface TranslateHostPorts {
  getPersisted(): TranslateSettings;
  setPersisted(settings: TranslateSettings): void;
  isExtensionEnabled(): boolean;
  getResolvedLocale(): string;
  localAvailable(): boolean;
  runLocalBatch(input: TranslateRunBatchInput): Promise<TranslateBatchResult>;
  runCloudBatch(input: TranslateRunBatchInput): Promise<TranslateBatchResult>;
  requestCloudFallback(
    request: TranslateCloudFallbackRequest,
  ): Promise<TranslateCloudFallbackResponse>;
  memoryLookup(key: string): string | null;
  memoryStore(key: string, value: string): void;
}

export interface TranslateHost {
  init(): void;
  get(): TranslateSettings;
  update(patch: Partial<TranslateSettings>): TranslateSettings;
  state(): TranslateState;
  targetLanguage(): string;
  translateText(input: TranslateTextInput): Promise<TranslateTextResult>;
  translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult>;
  setSiteEnabled(origin: string, enabled: boolean): TranslateSettings;
  addGlossaryTerm(term: Omit<TranslateGlossaryTerm, 'id'>): TranslateSettings;
  removeGlossaryTerm(id: string): TranslateSettings;
  isActiveForPage(pageUrlOrOrigin: string): boolean;
  setPageState(state: TranslatePageState | null): void;
  pageState(): TranslatePageState | null;
}

function uniqueOrigins(items: readonly string[]): string[] {
  const clean: string[] = [];
  for (const item of items) {
    const origin = normalizeTranslateOrigin(item);
    if (origin !== null && !clean.includes(origin)) clean.push(origin);
    if (clean.length >= MAX_DISABLED_ORIGINS) break;
  }
  return clean;
}

function cleanGlossary(items: readonly TranslateGlossaryTerm[]): TranslateGlossaryTerm[] {
  const clean: TranslateGlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const source = item.source.trim();
    const target = item.target.trim();
    if (source.length === 0 || target.length === 0) continue;
    const sourceLanguage = normalizeTranslateLanguage(item.sourceLanguage, '');
    const targetLanguage = normalizeTranslateLanguage(item.targetLanguage, '');
    const key = `${sourceLanguage}:${targetLanguage}:${source.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      id: item.id.trim().length > 0 ? item.id.trim() : `term-${++nextId}`,
      source,
      target,
      ...(sourceLanguage.length > 0 ? { sourceLanguage } : {}),
      ...(targetLanguage.length > 0 ? { targetLanguage } : {}),
      caseSensitive: item.caseSensitive,
    });
    if (clean.length >= MAX_GLOSSARY_TERMS) break;
  }
  return clean;
}

function sanitizeSettings(input: TranslateSettings): TranslateSettings {
  return {
    enabled: input.enabled,
    autoTranslateForeignPages: input.autoTranslateForeignPages,
    targetLanguageMode: 'app-locale',
    displayMode: 'replace',
    engineMode: 'local-first',
    cloudFallbackMode: input.cloudFallbackMode,
    disabledOrigins: uniqueOrigins(input.disabledOrigins),
    glossaryTerms: cleanGlossary(input.glossaryTerms),
  };
}

function cloneSettings(settings: TranslateSettings): TranslateSettings {
  return {
    enabled: settings.enabled,
    autoTranslateForeignPages: settings.autoTranslateForeignPages,
    targetLanguageMode: settings.targetLanguageMode,
    displayMode: settings.displayMode,
    engineMode: settings.engineMode,
    cloudFallbackMode: settings.cloudFallbackMode,
    disabledOrigins: [...settings.disabledOrigins],
    glossaryTerms: settings.glossaryTerms.map((term) => ({ ...term })),
  };
}

function clonePageState(state: TranslatePageState | null): TranslatePageState | null {
  return state === null ? null : { ...state };
}

function passthroughBatch(
  input: TranslateBatchInput,
  sourceLanguage: string,
  targetLanguage: string,
  startedAt: number,
): TranslateBatchResult {
  return {
    sourceLanguage,
    targetLanguage,
    items: input.items.map((item) => ({
      id: item.id,
      text: item.text,
      translatedText: item.text,
      engine: 'none',
    })),
    engine: 'none',
    durationMs: Date.now() - startedAt,
  };
}

function mergeResults(
  input: TranslateBatchInput,
  sourceLanguage: string,
  targetLanguage: string,
  startedAt: number,
  translated: Map<string, TranslateBatchResultItem>,
): TranslateBatchResult {
  const items = input.items.map((item): TranslateBatchResultItem => {
    const match = translated.get(item.id);
    return (
      match ?? {
        id: item.id,
        text: item.text,
        translatedText: item.text,
        engine: 'none',
      }
    );
  });
  const engine =
    items.find((item) => item.engine !== 'memory' && item.engine !== 'none')?.engine ??
    items.find((item) => item.engine === 'memory')?.engine ??
    'none';
  return { sourceLanguage, targetLanguage, items, engine, durationMs: Date.now() - startedAt };
}

export function createTranslateHost(ports: TranslateHostPorts): TranslateHost {
  let settings = cloneSettings(DEFAULT_TRANSLATE_SETTINGS);
  let activePage: TranslatePageState | null = null;

  // Cloud-fallback consent, when the mode is 'ask', is resolved once per origin for the life of
  // this host (the app session) and concurrent batches/pages share the single in-flight prompt.
  // Without this a page translation fans a dialog out per sub-batch, and every re-run (DOM
  // mutation, back-navigation, a second frame) asks again — the dialog spam. A "Not now" choice
  // is not persisted but still holds for the session; a restart asks again.
  const sessionCloudConsent = new Map<string, boolean>();
  const inFlightCloudConsent = new Map<string, Promise<boolean>>();

  const persist = (): TranslateSettings => {
    ports.setPersisted(settings);
    return cloneSettings(settings);
  };

  async function resolveCloudConsent(
    origin: string,
    targetLanguage: string,
    reason: TranslateReason,
    textCharCount: number,
  ): Promise<boolean> {
    if (settings.cloudFallbackMode === 'allow') return true;
    if (settings.cloudFallbackMode === 'deny') return false;

    const remembered = sessionCloudConsent.get(origin);
    if (remembered !== undefined) return remembered;

    const existing = inFlightCloudConsent.get(origin);
    if (existing !== undefined) return existing;

    const ask = (async (): Promise<boolean> => {
      const requestId = `translate-${Date.now()}-${++nextId}`;
      const response = await ports.requestCloudFallback({
        requestId,
        origin,
        provider: 'default',
        targetLanguage,
        textCharCount,
        reason,
      });
      if (response.remember) {
        settings = sanitizeSettings({
          ...settings,
          cloudFallbackMode: response.allow ? 'allow' : 'deny',
        });
        persist();
      }
      sessionCloudConsent.set(origin, response.allow);
      return response.allow;
    })();

    inFlightCloudConsent.set(origin, ask);
    try {
      return await ask;
    } finally {
      inFlightCloudConsent.delete(origin);
    }
  }

  async function runEngine(
    input: TranslateBatchInput,
    sourceLanguage: string,
    targetLanguage: string,
    pending: TranslateBatchItem[],
    glossaryTerms: TranslateGlossaryTerm[],
  ): Promise<TranslateBatchResult | null> {
    const runInput: TranslateRunBatchInput = {
      ...input,
      items: pending,
      sourceLanguage,
      targetLanguage,
      glossaryTerms,
    };
    if (ports.localAvailable()) {
      try {
        return await ports.runLocalBatch(runInput);
      } catch {
        // Fall through to the configured cloud fallback policy when a present local model fails.
      }
    }
    const allowed = await resolveCloudConsent(
      input.origin ?? '',
      targetLanguage,
      input.reason ?? 'manual',
      pending.reduce((sum, item) => sum + item.text.length, 0),
    );
    if (!allowed) return null;
    return ports.runCloudBatch(runInput);
  }

  return {
    init(): void {
      settings = sanitizeSettings({ ...DEFAULT_TRANSLATE_SETTINGS, ...ports.getPersisted() });
    },

    get(): TranslateSettings {
      return cloneSettings(settings);
    },

    update(patch: Partial<TranslateSettings>): TranslateSettings {
      // An explicit change to the fallback mode (e.g. the user setting it back to 'ask' in
      // settings after a session "Not now") must override the per-session consent cache.
      if (patch.cloudFallbackMode !== undefined) sessionCloudConsent.clear();
      settings = sanitizeSettings({ ...settings, ...patch });
      return persist();
    },

    state(): TranslateState {
      return { settings: cloneSettings(settings), activePage: clonePageState(activePage) };
    },

    targetLanguage(): string {
      return resolveTranslateTargetLanguage(ports.getResolvedLocale());
    },

    async translateText(input: TranslateTextInput): Promise<TranslateTextResult> {
      const result = await this.translateBatch({
        items: [{ id: 'text', text: input.text.slice(0, MAX_TEXT_CHARS) }],
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        origin: input.origin,
        reason: input.reason ?? 'manual',
      });
      const item = result.items[0];
      return {
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        translatedText: item?.translatedText ?? input.text,
        engine: item?.engine ?? result.engine,
        durationMs: result.durationMs,
      };
    },

    async translateBatch(input: TranslateBatchInput): Promise<TranslateBatchResult> {
      const startedAt = Date.now();
      const sourceLanguage = normalizeTranslateLanguage(input.sourceLanguage);
      const targetLanguage = normalizeTranslateLanguage(
        input.targetLanguage,
        this.targetLanguage(),
      );
      if (!ports.isExtensionEnabled() || !isTranslateEnabledForOrigin(settings, input.origin)) {
        return passthroughBatch(input, sourceLanguage, targetLanguage, startedAt);
      }
      const glossaryTerms = glossaryTermsFor(
        settings.glossaryTerms,
        sourceLanguage,
        targetLanguage,
      );
      const translated = new Map<string, TranslateBatchResultItem>();
      const pending: TranslateBatchItem[] = [];
      for (const item of input.items) {
        const text = item.text.slice(0, MAX_TEXT_CHARS);
        const memoryKey = translationMemoryKey(sourceLanguage, targetLanguage, text);
        const cached = ports.memoryLookup(memoryKey);
        if (cached !== null) {
          translated.set(item.id, { id: item.id, text, translatedText: cached, engine: 'memory' });
        } else {
          pending.push({ id: item.id, text });
        }
      }
      for (const batch of createTranslateBatches(pending)) {
        const batchResult = await runEngine(
          input,
          sourceLanguage,
          targetLanguage,
          batch,
          glossaryTerms,
        );
        if (batchResult === null) continue;
        for (const item of batchResult.items) {
          const text = item.text;
          const glossaryApplied = applyGlossaryTerms(item.translatedText, glossaryTerms);
          const next = { ...item, translatedText: glossaryApplied };
          translated.set(item.id, next);
          if (next.engine !== 'none') {
            ports.memoryStore(
              translationMemoryKey(sourceLanguage, targetLanguage, text),
              glossaryApplied,
            );
          }
        }
      }
      return mergeResults(input, sourceLanguage, targetLanguage, startedAt, translated);
    },

    setSiteEnabled(origin: string, enabled: boolean): TranslateSettings {
      const normalized = normalizeTranslateOrigin(origin);
      if (normalized === null) return cloneSettings(settings);
      const disabled = settings.disabledOrigins.filter((item) => item !== normalized);
      settings = {
        ...settings,
        disabledOrigins: enabled
          ? disabled
          : [...disabled, normalized].slice(0, MAX_DISABLED_ORIGINS),
      };
      return persist();
    },

    addGlossaryTerm(term: Omit<TranslateGlossaryTerm, 'id'>): TranslateSettings {
      const id = `term-${Date.now()}-${++nextId}`;
      settings = sanitizeSettings({
        ...settings,
        glossaryTerms: [...settings.glossaryTerms, { ...term, id }].slice(0, MAX_GLOSSARY_TERMS),
      });
      return persist();
    },

    removeGlossaryTerm(id: string): TranslateSettings {
      settings = sanitizeSettings({
        ...settings,
        glossaryTerms: settings.glossaryTerms.filter((term) => term.id !== id),
      });
      return persist();
    },

    isActiveForPage(pageUrlOrOrigin: string): boolean {
      return ports.isExtensionEnabled() && isTranslateEnabledForOrigin(settings, pageUrlOrOrigin);
    },

    setPageState(state: TranslatePageState | null): void {
      activePage = clonePageState(state);
    },

    pageState(): TranslatePageState | null {
      return clonePageState(activePage);
    },
  };
}
