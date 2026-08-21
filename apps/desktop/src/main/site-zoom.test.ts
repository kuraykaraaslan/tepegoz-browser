import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Input, WebContents } from 'electron';

const prefs: { siteZoomFactors: Record<string, number> } = { siteZoomFactors: {} };

vi.mock('@tepegoz/preferences', () => ({
  default: {
    getAll: () => prefs,
    update: (patch: Record<string, unknown>) => Object.assign(prefs, patch),
  },
}));

const { applyStoredZoom, handleZoomShortcut } = await import('./site-zoom');

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
  return { type: 'keyDown', key, control: true, meta: false, alt: false, shift: false, ...over } as Input;
}

beforeEach(() => {
  prefs.siteZoomFactors = {};
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

  it('is a no-op with no active tab', () => {
    expect(handleZoomShortcut(ctrl('='), null)).toBe(false);
  });

  it('does not zoom internal pages', () => {
    const wc = makeWebContents('tepegoz://settings', 1);
    handleZoomShortcut(ctrl('='), asWc(wc));
    expect(wc.setZoomFactor).not.toHaveBeenCalled();
  });
});
