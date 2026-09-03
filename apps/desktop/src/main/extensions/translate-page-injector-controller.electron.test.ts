import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `TranslatePageInjector` — the controller that decides when to inject/restore the translate page
 * script. Pinned: `start` wires the navigation auto-translate hook once; auto-translate bails on a
 * destroyed tab / an active agent run / an unparseable origin / a `shouldAutoTranslatePage` false;
 * `translateActive` / `translateWebContents` run `startTranslation` (which refuses a page the host is
 * not active for), injecting the script and returning the host's page state; and `restoreActive` /
 * `restoreWebContents` / `ensureUntranslatedForAgent` re-inject, read the saved state and publish a
 * `restored` `TranslatePageState`.
 */

vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));
const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ translate: { mode: 'auto' } })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const engine = vi.hoisted(() => ({
  normalizeTranslateLanguage: vi.fn((x?: string, fb?: string) => x ?? fb ?? 'auto'),
  shouldAutoTranslatePage: vi.fn(() => false),
}));
vi.mock('@tepegoz/ext-translate/engine', () => engine);

const TabManager = vi.hoisted(() => ({
  onNavigation: vi.fn<(cb: (url: string, wc: unknown) => void) => void>(),
  activeWebContents: vi.fn((): unknown => null),
}));
vi.mock('../tabs', () => ({ default: TabManager }));

const hasActiveAgentRun = vi.hoisted(() => vi.fn(() => false));
vi.mock('../agent/agent-run-lock.electron', () => ({ hasActiveAgentRun }));

const translateHost = vi.hoisted(() => ({
  isActiveForPage: vi.fn(() => true),
  targetLanguage: vi.fn(() => 'tr'),
  pageState: vi.fn((): unknown => ({ status: 'translated', origin: 'https://site.test' })),
}));
const setTranslatePageState = vi.hoisted(() => vi.fn());
vi.mock('./translate-host.electron', () => ({ default: translateHost, setTranslatePageState }));

const originOf = vi.hoisted(() => vi.fn((): string | undefined => 'https://site.test'));
vi.mock('./translate-page-injector-binding.electron', () => ({ originOf }));
const inject = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./translate-page-injector.electron', () => ({ inject }));

type Mod = typeof import('./translate-page-injector-controller.electron');
async function load(): Promise<Mod['default']> {
  vi.resetModules();
  return (await import('./translate-page-injector-controller.electron')).default;
}

const mkWc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  isDestroyed: () => false,
  getURL: () => 'https://site.test/page',
  executeJavaScript: vi.fn(() => Promise.resolve(null)),
  ...over,
});

let TPI: Mod['default'];
beforeEach(async () => {
  vi.clearAllMocks();
  originOf.mockReturnValue('https://site.test');
  translateHost.isActiveForPage.mockReturnValue(true);
  translateHost.pageState.mockReturnValue({ status: 'translated', origin: 'https://site.test' });
  hasActiveAgentRun.mockReturnValue(false);
  engine.shouldAutoTranslatePage.mockReturnValue(false);
  TabManager.activeWebContents.mockReturnValue(null);
  TPI = await load();
});

describe('start + auto-translate', () => {
  it('wires the navigation hook exactly once', () => {
    TPI.start();
    TPI.start();
    expect(TabManager.onNavigation).toHaveBeenCalledTimes(1);
  });

  it('auto-translate bails on an active agent run / unparseable origin / a false predicate', async () => {
    TPI.start();
    const nav = TabManager.onNavigation.mock.calls[0]![0];
    const wc = mkWc();

    hasActiveAgentRun.mockReturnValue(true);
    nav('https://site.test/', wc);
    await Promise.resolve();
    expect(inject).not.toHaveBeenCalled();

    hasActiveAgentRun.mockReturnValue(false);
    originOf.mockReturnValue(undefined);
    nav('bogus', wc);
    await Promise.resolve();
    expect(inject).not.toHaveBeenCalled();

    originOf.mockReturnValue('https://site.test');
    engine.shouldAutoTranslatePage.mockReturnValue(false);
    nav('https://site.test/', wc);
    await Promise.resolve();
    expect(inject).not.toHaveBeenCalled();
  });

  it('auto-translate injects when shouldAutoTranslatePage is true', async () => {
    engine.shouldAutoTranslatePage.mockReturnValue(true);
    TPI.start();
    const nav = TabManager.onNavigation.mock.calls[0]![0];
    const wc = mkWc();
    nav('https://site.test/', wc);
    await new Promise((r) => setTimeout(r, 0));
    expect(inject).toHaveBeenCalledWith(wc);
  });
});

describe('translateActive / translateWebContents', () => {
  it('translateActive returns null with no active tab, else runs startTranslation', async () => {
    expect(await TPI.translateActive()).toBeNull();

    const wc = mkWc();
    TabManager.activeWebContents.mockReturnValue(wc);
    translateHost.pageState.mockReturnValue({ status: 'translated' });
    const res = await TPI.translateActive();
    expect(inject).toHaveBeenCalledWith(wc);
    expect(res).toEqual({ status: 'translated' });
  });

  it('startTranslation refuses a page the host is not active for', async () => {
    const wc = mkWc();
    translateHost.isActiveForPage.mockReturnValue(false);
    expect(await TPI.translateWebContents(wc as never)).toBeNull();
    expect(inject).not.toHaveBeenCalled();
  });

  it('startTranslation returns null for a destroyed tab or an unparseable origin', async () => {
    expect(await TPI.translateWebContents(mkWc({ isDestroyed: () => true }) as never)).toBeNull();
    originOf.mockReturnValue(undefined);
    expect(await TPI.translateWebContents(mkWc() as never)).toBeNull();
  });
});

describe('restore paths', () => {
  it('restoreActive publishes a "restored" page state from the saved script state', async () => {
    const wc = mkWc({
      executeJavaScript: vi.fn(() =>
        Promise.resolve({ sourceLanguage: 'en', targetLanguage: 'tr' }),
      ),
    });
    TabManager.activeWebContents.mockReturnValue(wc);
    const res = await TPI.restoreActive();
    expect(inject).toHaveBeenCalledWith(wc);
    expect(setTranslatePageState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'restored', engine: 'none', translatedItems: 0 }),
    );
    expect(res).toMatchObject({ status: 'restored', origin: 'https://site.test' });
  });

  it('restoreActive is null with no active / a destroyed tab', async () => {
    expect(await TPI.restoreActive()).toBeNull();
    TabManager.activeWebContents.mockReturnValue(mkWc({ isDestroyed: () => true }));
    expect(await TPI.restoreActive()).toBeNull();
  });

  it('ensureUntranslatedForAgent restores only a same-origin translated page', async () => {
    const wc = mkWc();

    translateHost.pageState.mockReturnValue(null);
    await TPI.ensureUntranslatedForAgent(wc as never);
    expect(inject).not.toHaveBeenCalled();

    translateHost.pageState.mockReturnValue({ status: 'translated', origin: 'https://other.test' });
    await TPI.ensureUntranslatedForAgent(wc as never);
    expect(inject).not.toHaveBeenCalled();

    translateHost.pageState.mockReturnValue({ status: 'translated', origin: 'https://site.test' });
    await TPI.ensureUntranslatedForAgent(wc as never);
    expect(inject).toHaveBeenCalledWith(wc);
    expect(setTranslatePageState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'restored' }),
    );
  });

  it('restoreWebContents is a no-op for a destroyed tab', async () => {
    expect(await TPI.restoreWebContents(mkWc({ isDestroyed: () => true }) as never)).toBeNull();
    expect(inject).not.toHaveBeenCalled();
  });
});
