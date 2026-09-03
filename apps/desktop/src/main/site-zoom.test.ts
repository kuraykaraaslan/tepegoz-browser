import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Input, WebContents } from 'electron';

const prefs: { siteZoomFactors: Record<string, number>; defaultPageZoom: number } = {
  siteZoomFactors: {},
  defaultPageZoom: 1,
};

vi.mock('@tepegoz/preferences', () => ({
  default: {
    getAll: () => prefs,
    update: (patch: Record<string, unknown>) => Object.assign(prefs, patch),
  },
}));

const { applyStoredZoom, applyZoomCommand, handleZoomShortcut, reapplyZoomEverywhere } =
  await import('./site-zoom');

function makeWebContents(url: string, factor = 1) {
  return {
    isDestroyed: () => false,
    getURL: () => url,
    getZoomFactor: () => factor,
    setZoomFactor: vi.fn(),
  };
}

const asWc = (wc: ReturnType<typeof makeWebContents>) => wc as unknown as WebContents;

/** A Ctrl+key keyDown, the shape `before-input-event` delivers. */
function ctrl(key: string, over: Partial<Input> = {}): Input {
  return {
    type: 'keyDown',
    key,
    control: true,
    meta: false,
    alt: false,
    shift: false,
    ...over,
  } as Input;
}

beforeEach(() => {
  prefs.siteZoomFactors = {};
  prefs.defaultPageZoom = 1;
});

describe('applyStoredZoom', () => {
  it('restores the origin\u2019s remembered factor', () => {
    prefs.siteZoomFactors = { 'https://example.com': 1.5 };
    const wc = makeWebContents('https://example.com/page');
    applyStoredZoom(asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1.5);
  });

  it('resets to 100% for an origin with nothing stored — the previous site\u2019s zoom must not carry over', () => {
    prefs.siteZoomFactors = { 'https://example.com': 1.5 };
    const wc = makeWebContents('https://other.com/');
    applyStoredZoom(asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1);
  });

  it('leaves non-web pages alone', () => {
    const wc = makeWebContents('tepegoz://settings');
    applyStoredZoom(asWc(wc));
    expect(wc.setZoomFactor).not.toHaveBeenCalled();
  });
});

describe('handleZoomShortcut', () => {
  it('steps up the ladder and remembers the new level for the origin', () => {
    const wc = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('='), asWc(wc))).toBe(true);
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1.1);
    expect(prefs.siteZoomFactors['https://example.com']).toBe(1.1);
  });

  it('steps down the ladder', () => {
    const wc = makeWebContents('https://example.com/', 1);
    handleZoomShortcut(ctrl('-'), asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(0.9);
  });

  it('clamps at the ends instead of running off the ladder', () => {
    const top = makeWebContents('https://example.com/', 5);
    handleZoomShortcut(ctrl('='), asWc(top));
    expect(top.setZoomFactor).toHaveBeenCalledWith(5);

    const bottom = makeWebContents('https://example.com/', 0.25);
    handleZoomShortcut(ctrl('-'), asWc(bottom));
    expect(bottom.setZoomFactor).toHaveBeenCalledWith(0.25);
  });

  it('Ctrl+0 returns to 100% and FORGETS the origin, so prefs cannot accumulate every site visited', () => {
    prefs.siteZoomFactors = { 'https://example.com': 1.5 };
    const wc = makeWebContents('https://example.com/', 1.5);
    handleZoomShortcut(ctrl('0'), asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1);
    expect('https://example.com' in prefs.siteZoomFactors).toBe(false);
  });

  it('stores nothing when a step lands back exactly on 100%', () => {
    prefs.siteZoomFactors = { 'https://example.com': 0.9 };
    const wc = makeWebContents('https://example.com/', 0.9);
    handleZoomShortcut(ctrl('='), asWc(wc));
    expect('https://example.com' in prefs.siteZoomFactors).toBe(false);
  });

  it('accepts the shifted + and _ that the same physical keys produce', () => {
    const plus = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('+', { shift: true }), asWc(plus))).toBe(true);
    const under = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('_', { shift: true }), asWc(under))).toBe(true);
  });

  it('ignores the keys without a modifier, so typing "-" into a page is not a zoom', () => {
    const wc = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('-', { control: false }), asWc(wc))).toBe(false);
    expect(wc.setZoomFactor).not.toHaveBeenCalled();
  });

  it('ignores Ctrl+Alt combinations, which belong to the page', () => {
    const wc = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('=', { alt: true }), asWc(wc))).toBe(false);
  });

  it('leaves a Ctrl+<non-zoom-key> chord for someone else to handle', () => {
    const wc = makeWebContents('https://example.com/', 1);
    expect(handleZoomShortcut(ctrl('a'), asWc(wc))).toBe(false);
  });

  it('is a no-op with no active tab', () => {
    expect(handleZoomShortcut(ctrl('='), null)).toBe(false);
  });

  it('does not zoom internal pages', () => {
    const wc = makeWebContents('tepegoz://settings', 1);
    handleZoomShortcut(ctrl('='), asWc(wc));
    expect(wc.setZoomFactor).not.toHaveBeenCalled();
  });
});

describe('applyZoomCommand (omnibox zoom indicator buttons)', () => {
  it('steps up the same ladder as Ctrl+= and persists', () => {
    const wc = makeWebContents('https://example.com/', 1);
    applyZoomCommand(asWc(wc), 'in');
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1.1);
    expect(prefs.siteZoomFactors['https://example.com']).toBe(1.1);
  });

  it('steps down on "out"', () => {
    const wc = makeWebContents('https://example.com/', 1);
    applyZoomCommand(asWc(wc), 'out');
    expect(wc.setZoomFactor).toHaveBeenCalledWith(0.9);
  });

  it('"reset" returns to 100% and forgets the origin', () => {
    prefs.siteZoomFactors = { 'https://example.com': 1.5 };
    const wc = makeWebContents('https://example.com/', 1.5);
    applyZoomCommand(asWc(wc), 'reset');
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1);
    expect('https://example.com' in prefs.siteZoomFactors).toBe(false);
  });

  it('is a no-op for a view-less internal tab (null webContents)', () => {
    expect(() => applyZoomCommand(null, 'in')).not.toThrow();
  });

  it('does not zoom internal pages', () => {
    const wc = makeWebContents('tepegoz://settings', 1);
    applyZoomCommand(asWc(wc), 'in');
    expect(wc.setZoomFactor).not.toHaveBeenCalled();
  });
});

/**
 * The DEFAULT level is a preference (Accessibility → default page zoom), not the constant 1.
 *
 * Which makes the per-site store's rule subtler than it looks: "store nothing at the default" has to
 * mean the USER's default, or a page left exactly where they asked every page to be would be written
 * down as an exception — and the record this store exists not to become is a list of every site
 * visited.
 */
describe('the default zoom is a preference', () => {
  it('applies the preferred default to an origin with nothing stored', () => {
    prefs.defaultPageZoom = 1.25;
    const wc = makeWebContents('https://example.com/');
    applyStoredZoom(asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1.25);
  });

  it('lets a per-site level still override the default', () => {
    prefs.defaultPageZoom = 1.25;
    prefs.siteZoomFactors = { 'https://example.com': 0.9 };
    const wc = makeWebContents('https://example.com/');
    applyStoredZoom(asWc(wc));
    expect(wc.setZoomFactor).toHaveBeenCalledWith(0.9);
  });

  it('stores nothing when a site lands on the user\u2019s own default', () => {
    prefs.defaultPageZoom = 1.25;
    prefs.siteZoomFactors = { 'https://example.com': 1.1 };
    // 1.1 -> the next step up is 1.25, which IS the default: that is not an exception worth keeping.
    handleZoomShortcut(ctrl('='), asWc(makeWebContents('https://example.com/', 1.1)));
    expect('https://example.com' in prefs.siteZoomFactors).toBe(false);
  });

  it('reset returns to the preferred default, not to 100%', () => {
    prefs.defaultPageZoom = 1.5;
    prefs.siteZoomFactors = { 'https://example.com': 0.75 };
    const wc = makeWebContents('https://example.com/', 0.75);
    applyZoomCommand(asWc(wc), 'reset');
    expect(wc.setZoomFactor).toHaveBeenCalledWith(1.5);
    expect('https://example.com' in prefs.siteZoomFactors).toBe(false);
  });

  it('re-applies to every open page, skipping the ones that are not web pages', () => {
    prefs.defaultPageZoom = 2;
    const page = makeWebContents('https://example.com/');
    const internal = makeWebContents('tepegoz://settings');
    reapplyZoomEverywhere([asWc(page), asWc(internal)]);
    expect(page.setZoomFactor).toHaveBeenCalledWith(2);
    expect(internal.setZoomFactor).not.toHaveBeenCalled();
  });
});
