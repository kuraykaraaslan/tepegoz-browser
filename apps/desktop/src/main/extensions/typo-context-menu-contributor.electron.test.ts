import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `typoContextMenuContributor` — the page-context-menu "Spelling: <word>" submenu. Pinned: `collect`
 * bails ([]) for a non-editable field, an inactive page, or a destroyed WebContents; a valid
 * `__tepegozTypoIssueAt` result with suggestions yields one top-placed contribution whose items carry
 * the apply-suggestion action + payload; a null / unparseable / empty-suggestions result yields [];
 * the title is localized from the locale preference (system falling back to the OS locale); and
 * `runAction` only relays an `apply-suggestion` with a schema-valid payload to a live tab.
 */

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ locale: 'en' })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const app = vi.hoisted(() => ({ getLocale: vi.fn(() => 'en-US') }));
vi.mock('electron', () => ({ app }));

vi.mock('@tepegoz/ext-typo/host', () => ({ TYPO_EXTENSION_ID: 'ext-typo' }));

const typoHost = vi.hoisted(() => ({ isActiveForPage: vi.fn(() => true) }));
vi.mock('./typo-host.electron', () => ({ default: typoHost }));

const { default: contributor } = await import('./typo-context-menu-contributor.electron');

const ISSUE = { text: '  teh  ', start: 5, end: 8, suggestions: ['the', 'tech'] };
function ctx(over: Record<string, unknown> = {}) {
  return {
    isEditable: true,
    pageUrl: 'https://doc.test/edit',
    x: 12,
    y: 34,
    webContents: {
      isDestroyed: vi.fn(() => false),
      executeJavaScript: vi.fn((): Promise<unknown> => Promise.resolve(ISSUE)),
    },
    ...over,
  };
}
type Ctx = Parameters<typeof contributor.collect>[0];
const asCtx = (c: ReturnType<typeof ctx>) => c as unknown as Ctx;
const asInput = <T>(i: T) => i as Parameters<typeof contributor.runAction>[0];

beforeEach(() => {
  vi.clearAllMocks();
  prefs.getAll.mockReturnValue({ locale: 'en' });
  app.getLocale.mockReturnValue('en-US');
  typoHost.isActiveForPage.mockReturnValue(true);
});

describe('collect', () => {
  it('returns a top-placed submenu whose items carry the apply-suggestion payload', async () => {
    const [menu] = await contributor.collect(asCtx(ctx()));
    expect(menu).toMatchObject({
      id: 'typo-suggestions',
      contributorId: 'ext-typo',
      placement: 'top',
      priority: 0,
      title: 'Spelling: teh',
    });
    expect(menu!.items).toEqual([
      {
        id: 'suggestion-0',
        label: 'the',
        actionId: 'apply-suggestion',
        payload: { start: 5, end: 8, suggestion: 'the' },
      },
      {
        id: 'suggestion-1',
        label: 'tech',
        actionId: 'apply-suggestion',
        payload: { start: 5, end: 8, suggestion: 'tech' },
      },
    ]);
  });

  it('bails for a non-editable field / inactive page / destroyed tab', async () => {
    expect(await contributor.collect(asCtx(ctx({ isEditable: false })))).toEqual([]);
    typoHost.isActiveForPage.mockReturnValue(false);
    expect(await contributor.collect(asCtx(ctx()))).toEqual([]);
    typoHost.isActiveForPage.mockReturnValue(true);
    expect(
      await contributor.collect(
        asCtx(ctx({ webContents: { isDestroyed: () => true, executeJavaScript: vi.fn() } })),
      ),
    ).toEqual([]);
  });

  it('returns [] for a null, unparseable, or empty-suggestions issue', async () => {
    expect(await contributor.collect(asCtx(ctx({ webContents: probe(null) })))).toEqual([]);
    expect(await contributor.collect(asCtx(ctx({ webContents: probe({ bad: true }) })))).toEqual(
      [],
    );
    expect(
      await contributor.collect(asCtx(ctx({ webContents: probe({ ...ISSUE, suggestions: [] }) }))),
    ).toEqual([]);
  });

  it('localizes the title: tr preference, en preference, and system → OS locale', async () => {
    prefs.getAll.mockReturnValue({ locale: 'tr' });
    expect((await contributor.collect(asCtx(ctx())))[0]!.title).toBe('Yazım: teh');

    prefs.getAll.mockReturnValue({ locale: 'system' });
    app.getLocale.mockReturnValue('tr-TR');
    expect((await contributor.collect(asCtx(ctx())))[0]!.title).toBe('Yazım: teh');

    app.getLocale.mockReturnValue('fr-FR');
    expect((await contributor.collect(asCtx(ctx())))[0]!.title).toBe('Spelling: teh');
  });
});

describe('runAction', () => {
  it('relays a schema-valid apply-suggestion to a live tab', async () => {
    const c = ctx();
    await contributor.runAction(
      asInput({ actionId: 'apply-suggestion', payload: { start: 1, end: 4, suggestion: 'fix' } }),
      asCtx(c),
    );
    expect(c.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('__tepegozTypoApplySuggestion'),
      true,
    );
  });

  it('ignores a foreign actionId, a destroyed tab, and a malformed payload', async () => {
    const c = ctx();
    await contributor.runAction(asInput({ actionId: 'other', payload: {} }), asCtx(c));
    await contributor.runAction(
      asInput({ actionId: 'apply-suggestion', payload: { start: -1 } }),
      asCtx(c),
    );
    await contributor.runAction(
      asInput({ actionId: 'apply-suggestion', payload: { start: 1, end: 4, suggestion: 'x' } }),
      asCtx(ctx({ webContents: { isDestroyed: () => true, executeJavaScript: vi.fn() } })),
    );
    expect(c.webContents.executeJavaScript).not.toHaveBeenCalled();
  });
});

/** A webContents whose issue-probe resolves to `value`. */
function probe(value: unknown) {
  return {
    isDestroyed: () => false,
    executeJavaScript: vi.fn(() => Promise.resolve(value)),
  };
}
