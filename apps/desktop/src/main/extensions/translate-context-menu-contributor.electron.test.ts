import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `translateContextMenuContributor` — the page-context-menu "Translate" submenu. Pinned: `collect`
 * bails [] for an inactive page / destroyed tab; the base menu is just "translate page"; a non-empty
 * selection prepends "translate selection"; a currently-translated page with a non-empty origin
 * appends "restore original"; and `runAction` routes translate-page / restore-original to the
 * injector and translate-selection through the full-selection read → translateText → a result
 * dialog (skipping an empty selection).
 */

const dialog = vi.hoisted(() => ({ showMessageBox: vi.fn(() => Promise.resolve()) }));
vi.mock('electron', () => ({ dialog }));

vi.mock('@tepegoz/ext-translate/host', () => ({ TRANSLATE_EXTENSION_ID: 'ext-translate' }));

const host = vi.hoisted(() => ({
  isActiveForPage: vi.fn(() => true),
  pageState: vi.fn((): unknown => null),
  translateText: vi.fn(() => Promise.resolve({ translatedText: 'ÇEVRİLDİ' })),
}));
vi.mock('./translate-host.electron', () => ({ default: host }));

const injector = vi.hoisted(() => ({
  translateWebContents: vi.fn(() => Promise.resolve()),
  restoreWebContents: vi.fn(() => Promise.resolve()),
}));
vi.mock('./translate-page-injector-controller.electron', () => ({ default: injector }));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    translate: {
      native: {
        translatePage: 'Translate page',
        translateSelection: 'Translate selection',
        restoreOriginal: 'Restore original',
        menuTitle: 'Translate',
        resultTitle: 'Translation',
      },
    },
  }),
}));

const { default: contributor } = await import('./translate-context-menu-contributor.electron');

function ctx(over: Record<string, unknown> = {}) {
  return {
    pageUrl: 'https://news.test/story',
    selectionText: '',
    parent: { __win: true },
    webContents: {
      isDestroyed: vi.fn(() => false),
      executeJavaScript: vi.fn((): Promise<unknown> => Promise.resolve('')),
    },
    ...over,
  };
}
type Ctx = Parameters<typeof contributor.collect>[0];
const asCtx = (c: ReturnType<typeof ctx>) => c as unknown as Ctx;
const asInput = <T>(i: T) => i as Parameters<typeof contributor.runAction>[0];
const actionIds = (menu: { items: { actionId: string }[] } | undefined) =>
  (menu?.items ?? []).map((i) => i.actionId);

beforeEach(() => {
  vi.clearAllMocks();
  host.isActiveForPage.mockReturnValue(true);
  host.pageState.mockReturnValue(null);
});

const collect = async (c: ReturnType<typeof ctx>) => contributor.collect(asCtx(c));

describe('collect', () => {
  it('bails [] for an inactive page or a destroyed tab', async () => {
    host.isActiveForPage.mockReturnValue(false);
    expect(await collect(ctx())).toEqual([]);
    host.isActiveForPage.mockReturnValue(true);
    expect(await collect(ctx({ webContents: { isDestroyed: () => true } }))).toEqual([]);
  });

  it('base menu is just "translate page", top-placed at priority 10', async () => {
    const [menu] = await collect(ctx());
    expect(menu).toMatchObject({
      id: 'translate',
      contributorId: 'ext-translate',
      placement: 'top',
      priority: 10,
      title: 'Translate',
    });
    expect(actionIds(menu)).toEqual(['translate-page']);
  });

  it('a non-empty selection prepends "translate selection"', async () => {
    const [menu] = await collect(ctx({ selectionText: '  hello  ' }));
    expect(actionIds(menu)).toEqual(['translate-selection', 'translate-page']);
  });

  it('a translated page with a non-empty origin appends "restore original"', async () => {
    host.pageState.mockReturnValue({ status: 'translated', origin: 'en' });
    const [menu] = await collect(ctx());
    expect(actionIds(menu)).toEqual(['translate-page', 'restore-original']);

    host.pageState.mockReturnValue({ status: 'translated', origin: '' });
    expect(actionIds((await collect(ctx()))[0])).toEqual(['translate-page']);
  });
});

describe('runAction', () => {
  it('does nothing for a destroyed tab', async () => {
    await contributor.runAction(
      asInput({ actionId: 'translate-page' }),
      asCtx(ctx({ webContents: { isDestroyed: () => true } })),
    );
    expect(injector.translateWebContents).not.toHaveBeenCalled();
  });

  it('routes translate-page / restore-original to the injector', async () => {
    const c = ctx();
    await contributor.runAction(asInput({ actionId: 'translate-page' }), asCtx(c));
    await contributor.runAction(asInput({ actionId: 'restore-original' }), asCtx(c));
    expect(injector.translateWebContents).toHaveBeenCalledWith(c.webContents);
    expect(injector.restoreWebContents).toHaveBeenCalledWith(c.webContents);
  });

  it('translate-selection: reads the live selection, translates it, and shows the result dialog', async () => {
    const c = ctx({ selectionText: 'fallback' });
    c.webContents.executeJavaScript.mockResolvedValue('the full paragraph the user picked');
    await contributor.runAction(asInput({ actionId: 'translate-selection' }), asCtx(c));
    expect(host.translateText).toHaveBeenCalledWith({
      text: 'the full paragraph the user picked',
      origin: 'https://news.test/story',
      reason: 'selection',
    });
    expect(dialog.showMessageBox).toHaveBeenCalledWith(c.parent, {
      type: 'info',
      title: 'Translation',
      message: 'ÇEVRİLDİ',
    });
  });

  it('translate-selection falls back to ctx.selectionText and skips an empty selection', async () => {
    const c = ctx({ selectionText: 'from ctx' });
    c.webContents.executeJavaScript.mockResolvedValue('   ');
    await contributor.runAction(asInput({ actionId: 'translate-selection' }), asCtx(c));
    expect(host.translateText).toHaveBeenCalledWith(expect.objectContaining({ text: 'from ctx' }));

    host.translateText.mockClear();
    const empty = ctx({ selectionText: '   ' });
    empty.webContents.executeJavaScript.mockResolvedValue('');
    await contributor.runAction(asInput({ actionId: 'translate-selection' }), asCtx(empty));
    expect(host.translateText).not.toHaveBeenCalled();
  });
});
