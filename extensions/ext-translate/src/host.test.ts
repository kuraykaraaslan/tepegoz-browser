import { describe, expect, it } from 'vitest';
import { createTranslateHost, type TranslateHostPorts } from './host';
import { DEFAULT_TRANSLATE_SETTINGS, type TranslateSettings } from './types';

function ports(overrides: Partial<TranslateHostPorts> = {}): TranslateHostPorts {
  let persisted: TranslateSettings = DEFAULT_TRANSLATE_SETTINGS;
  const memory = new Map<string, string>();
  return {
    getPersisted: () => persisted,
    setPersisted: (settings) => {
      persisted = settings;
    },
    isExtensionEnabled: () => true,
    getResolvedLocale: () => 'tr',
    localAvailable: () => true,
    runLocalBatch: (input) =>
      Promise.resolve({
        sourceLanguage: input.sourceLanguage ?? 'en',
        targetLanguage: input.targetLanguage ?? 'tr',
        items: input.items.map((item) => ({
          id: item.id,
          text: item.text,
          translatedText: `L:${item.text}`,
          engine: 'local-llm',
        })),
        engine: 'local-llm',
        durationMs: 1,
      }),
    runCloudBatch: (input) =>
      Promise.resolve({
        sourceLanguage: input.sourceLanguage ?? 'en',
        targetLanguage: input.targetLanguage ?? 'tr',
        items: input.items.map((item) => ({
          id: item.id,
          text: item.text,
          translatedText: `C:${item.text}`,
          engine: 'external-ai',
        })),
        engine: 'external-ai',
        durationMs: 1,
      }),
    requestCloudFallback: (request) =>
      Promise.resolve({ requestId: request.requestId, allow: true, remember: true }),
    memoryLookup: (key) => memory.get(key) ?? null,
    memoryStore: (key, value) => {
      memory.set(key, value);
    },
    ...overrides,
  };
}

describe('translate host', () => {
  it('uses local first when available', async () => {
    const host = createTranslateHost(ports());
    host.init();
    const result = await host.translateText({ text: 'Hello', sourceLanguage: 'en' });
    expect(result.translatedText).toBe('L:Hello');
    expect(result.engine).toBe('local-llm');
  });

  it('asks and remembers cloud fallback when local is unavailable', async () => {
    const host = createTranslateHost(ports({ localAvailable: () => false }));
    host.init();
    const result = await host.translateText({ text: 'Hello', sourceLanguage: 'en' });
    expect(result.translatedText).toBe('C:Hello');
    expect(host.get().cloudFallbackMode).toBe('allow');
  });

  it('denies cloud fallback when the user rejects it', async () => {
    const host = createTranslateHost(
      ports({
        localAvailable: () => false,
        requestCloudFallback: (request) =>
          Promise.resolve({ requestId: request.requestId, allow: false, remember: true }),
      }),
    );
    host.init();
    const result = await host.translateText({ text: 'Hello', sourceLanguage: 'en' });
    expect(result.translatedText).toBe('Hello');
    expect(result.engine).toBe('none');
    expect(host.get().cloudFallbackMode).toBe('deny');
  });
});
