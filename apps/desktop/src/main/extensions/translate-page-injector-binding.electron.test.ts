import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `translate-page-injector-binding.electron` — the CDP `Runtime.bindingCalled` listener the injected
 * translate script posts through. Pinned: `originOf` normalizes a URL to an origin (or undefined);
 * the listener ignores anything but a `Runtime.bindingCalled` for the `__tepegozTranslatePost` binding,
 * silently drops a payload that fails its schema, and — on a valid payload for an active origin —
 * publishes a `translating` page state, runs `translateHost.translateBatch`, then publishes
 * `translated` + posts the result back to the page (or `error` + a log when the batch throws).
 */

vi.mock('electron', () => ({}));
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const engine = vi.hoisted(() => ({
  normalizeTranslateLanguage: vi.fn((x?: string, fb?: string) => x ?? fb ?? 'auto'),
  normalizeTranslateOrigin: vi.fn((u: string): string | undefined =>
    u.startsWith('http') ? 'https://site.test' : undefined,
  ),
}));
vi.mock('@tepegoz/ext-translate/engine', () => engine);

const translateHost = vi.hoisted(() => ({
  isActiveForPage: vi.fn(() => true),
  targetLanguage: vi.fn(() => 'tr'),
  translateBatch: vi.fn(() =>
    Promise.resolve({
      items: [
        { id: '1', engine: 'local' },
        { id: '2', engine: 'none' },
      ],
      sourceLanguage: 'en',
      targetLanguage: 'tr',
      engine: 'local',
    }),
  ),
}));
const setTranslatePageState = vi.hoisted(() => vi.fn());
vi.mock('./translate-host.electron', () => ({ default: translateHost, setTranslatePageState }));

const mod = await import('./translate-page-injector-binding.electron');

const mkWc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  getURL: () => 'https://site.test/page',
  isDestroyed: () => false,
  executeJavaScript: vi.fn(() => Promise.resolve()),
  ...over,
});
const validParams = (over: Record<string, unknown> = {}) => ({
  name: mod.BINDING,
  payload: JSON.stringify({
    requestId: 'r1',
    items: [{ id: '1', text: 'hello' }],
    targetLanguage: 'tr',
    reason: 'page',
    ...over,
  }),
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  engine.normalizeTranslateOrigin.mockImplementation((u: string) =>
    u.startsWith('http') ? 'https://site.test' : undefined,
  );
  translateHost.isActiveForPage.mockReturnValue(true);
  translateHost.translateBatch.mockResolvedValue({
    items: [
      { id: '1', engine: 'local' },
      { id: '2', engine: 'none' },
    ],
    sourceLanguage: 'en',
    targetLanguage: 'tr',
    engine: 'local',
  });
});

describe('originOf', () => {
  it('normalizes a URL to an origin, or undefined', () => {
    expect(mod.originOf('https://site.test/x')).toBe('https://site.test');
    expect(mod.originOf('about:blank')).toBeUndefined();
  });
});

describe('makeBindingListener — the ignore paths', () => {
  it('ignores a non-bindingCalled method and a foreign binding name', () => {
    const listener = mod.makeBindingListener(mkWc() as never);
    listener(null, 'Runtime.consoleAPICalled', validParams());
    listener(null, 'Runtime.bindingCalled', { name: 'somethingElse', payload: '{}' });
    listener(null, 'Runtime.bindingCalled', { bad: true });
    expect(setTranslatePageState).not.toHaveBeenCalled();
  });

  it('drops a payload that is not valid JSON or fails the schema', () => {
    const listener = mod.makeBindingListener(mkWc() as never);
    listener(null, 'Runtime.bindingCalled', { name: mod.BINDING, payload: 'not json' });
    listener(null, 'Runtime.bindingCalled', {
      name: mod.BINDING,
      payload: JSON.stringify({ requestId: 'r1' }), // missing items/targetLanguage
    });
    expect(setTranslatePageState).not.toHaveBeenCalled();
  });

  it('does nothing for an unparseable origin or a page the host is not active for', () => {
    engine.normalizeTranslateOrigin.mockReturnValue(undefined);
    mod.makeBindingListener(mkWc() as never)(null, 'Runtime.bindingCalled', validParams());

    engine.normalizeTranslateOrigin.mockReturnValue('https://site.test');
    translateHost.isActiveForPage.mockReturnValue(false);
    mod.makeBindingListener(mkWc() as never)(null, 'Runtime.bindingCalled', validParams());

    expect(setTranslatePageState).not.toHaveBeenCalled();
  });
});

describe('makeBindingListener — the happy path', () => {
  it('publishes translating → runs the batch → publishes translated + posts the result back', async () => {
    const wc = mkWc();
    mod.makeBindingListener(wc as never)(null, 'Runtime.bindingCalled', validParams());

    expect(setTranslatePageState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'translating',
        totalItems: 1,
        origin: 'https://site.test',
      }),
    );
    expect(translateHost.translateBatch).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'https://site.test', reason: 'page' }),
    );

    await flush();
    expect(setTranslatePageState).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'translated', translatedItems: 1, engine: 'local' }),
    );
    expect((wc.executeJavaScript as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain(
      '__tepegozTranslateReceive',
    );
  });

  it('publishes error + logs when the batch throws', async () => {
    translateHost.translateBatch.mockRejectedValue(new Error('provider down'));
    mod.makeBindingListener(mkWc() as never)(null, 'Runtime.bindingCalled', validParams());

    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      'Translate page batch failed',
      expect.objectContaining({ err: expect.stringContaining('provider down') as string }),
    );
    expect(setTranslatePageState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.stringContaining('provider down') as string,
      }),
    );
  });

  it('skips the translated update when the tab was destroyed mid-batch', async () => {
    const wc = mkWc({ isDestroyed: () => true });
    mod.makeBindingListener(wc as never)(null, 'Runtime.bindingCalled', validParams());
    await flush();
    // only the initial 'translating' publish happened
    expect(setTranslatePageState).toHaveBeenCalledTimes(1);
    expect(setTranslatePageState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'translating' }),
    );
  });
});
