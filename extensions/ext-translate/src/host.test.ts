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
    isSensitiveOrigin: () => false,
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

  it('asks once per origin for a page split across many sub-batches', async () => {
    let asks = 0;
    const host = createTranslateHost(
      ports({
        localAvailable: () => false,
        requestCloudFallback: (request) => {
          asks += 1;
          return Promise.resolve({ requestId: request.requestId, allow: true, remember: false });
        },
      }),
    );
    host.init();
    const items = Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`,
      text: `Sentence number ${i} with enough length to force many batches.`,
    }));
    const result = await host.translateBatch({
      items,
      sourceLanguage: 'en',
      origin: 'https://example.com',
      reason: 'page',
    });
    expect(asks).toBe(1);
    expect(result.items.every((item) => item.engine === 'external-ai')).toBe(true);
  });

  it('shares one prompt across concurrent batches for the same origin', async () => {
    let asks = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host = createTranslateHost(
      ports({
        localAvailable: () => false,
        requestCloudFallback: async (request) => {
          asks += 1;
          await gate;
          return { requestId: request.requestId, allow: true, remember: false };
        },
      }),
    );
    host.init();
    const call = (id: string): Promise<unknown> =>
      host.translateBatch({
        items: [{ id, text: `Hello ${id}` }],
        sourceLanguage: 'en',
        origin: 'https://example.com',
        reason: 'page',
      });
    const pending = Promise.all([call('a'), call('b'), call('c')]);
    release();
    await pending;
    expect(asks).toBe(1);
  });

  it('stops asking after a not-now choice for the rest of the session', async () => {
    let asks = 0;
    const host = createTranslateHost(
      ports({
        localAvailable: () => false,
        requestCloudFallback: (request) => {
          asks += 1;
          return Promise.resolve({ requestId: request.requestId, allow: false, remember: false });
        },
      }),
    );
    host.init();
    const first = await host.translateText({
      text: 'Hello',
      sourceLanguage: 'en',
      origin: 'https://example.com',
    });
    const second = await host.translateText({
      text: 'World',
      sourceLanguage: 'en',
      origin: 'https://example.com',
    });
    expect(asks).toBe(1);
    expect(first.engine).toBe('none');
    expect(second.engine).toBe('none');
    expect(host.get().cloudFallbackMode).toBe('ask');
  });

  it('never reaches the cloud path on a sensitive origin, and shows no prompt', async () => {
    let asks = 0;
    const host = createTranslateHost(
      ports({
        localAvailable: () => false,
        isSensitiveOrigin: () => true,
        requestCloudFallback: (request) => {
          asks += 1;
          return Promise.resolve({ requestId: request.requestId, allow: true, remember: false });
        },
      }),
    );
    host.init();
    const result = await host.translateText({
      text: 'Bakiye',
      sourceLanguage: 'tr',
      origin: 'https://www.garanti.com.tr',
    });
    expect(asks).toBe(0);
    expect(result.translatedText).toBe('Bakiye');
    expect(result.engine).toBe('none');
    expect(host.get().cloudFallbackMode).toBe('ask');
  });

  it('still translates a sensitive origin with the on-device model', async () => {
    let asks = 0;
    const host = createTranslateHost(
      ports({
        isSensitiveOrigin: () => true,
        requestCloudFallback: (request) => {
          asks += 1;
          return Promise.resolve({ requestId: request.requestId, allow: true, remember: false });
        },
      }),
    );
    host.init();
    const result = await host.translateText({
      text: 'Bakiye',
      sourceLanguage: 'tr',
      origin: 'https://www.garanti.com.tr',
    });
    expect(asks).toBe(0);
    expect(result.translatedText).toBe('L:Bakiye');
    expect(result.engine).toBe('local-llm');
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
