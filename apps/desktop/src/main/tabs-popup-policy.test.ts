import { describe, expect, it } from 'vitest';
import type { HandlerDetails } from 'electron';
import {
  asGroupColor,
  originOf,
  popupTargetUrl,
  needsNativeWindow,
  wantsNativeWindow,
  blockNonWeb,
  isActivatingInput,
  GESTURE_ACTIVATION_MS,
} from './tabs-popup-policy';

/**
 * The pure popup/navigation-safety predicates behind `TabManager`'s view wiring. Two of these are
 * load-bearing for security — `needsNativeWindow` / `wantsNativeWindow` decide whether a `window.open`
 * becomes a scriptable native window or one of our tabs, and `blockNonWeb` is the will-navigate /
 * will-redirect scheme guard — so every branch is pinned here.
 */

describe('asGroupColor', () => {
  it('passes a known Chrome group colour through', () => {
    expect(asGroupColor('purple')).toBe('purple');
  });
  it('defaults an unknown / corrupted persisted value to blue', () => {
    expect(asGroupColor('chartreuse')).toBe('blue');
    expect(asGroupColor('')).toBe('blue');
  });
});

describe('originOf', () => {
  it('returns the origin of a parseable URL', () => {
    expect(originOf('https://example.com/a/b?c=1')).toBe('https://example.com');
  });
  it('returns empty string when the URL cannot be parsed', () => {
    expect(originOf('not a url')).toBe('');
  });
});

describe('popupTargetUrl', () => {
  it('maps an empty / whitespace target to about:blank (the window.open default)', () => {
    expect(popupTargetUrl('')).toBe('about:blank');
    expect(popupTargetUrl('   ')).toBe('about:blank');
  });
  it('leaves a real URL untouched', () => {
    expect(popupTargetUrl('https://example.com/')).toBe('https://example.com/');
  });
});

describe('needsNativeWindow', () => {
  it('is true for the schemes that need a live scriptable opener reference', () => {
    for (const u of ['', 'about:blank', 'ABOUT:BLANK', 'data:text/html,x', 'javascript:void 0']) {
      expect(needsNativeWindow(u)).toBe(true);
    }
  });
  it('is false for a plain http(s) popup, which can open as a tab', () => {
    expect(needsNativeWindow('https://example.com/')).toBe(false);
    expect(needsNativeWindow('  http://example.com  ')).toBe(false);
  });
});

describe('wantsNativeWindow', () => {
  const details = (over: Record<string, unknown>): HandlerDetails =>
    ({
      disposition: 'foreground-tab',
      postBody: null,
      features: '',
      ...over,
    }) as unknown as HandlerDetails;

  it('is true for an explicit new-window disposition', () => {
    expect(wantsNativeWindow(details({ disposition: 'new-window' }))).toBe(true);
  });
  it('is true when there is a POST body (a form target=_blank we must not drop)', () => {
    expect(wantsNativeWindow(details({ postBody: { data: [] } }))).toBe(true);
  });
  it('is true when the features string asks for geometry, case-insensitively', () => {
    expect(wantsNativeWindow(details({ features: 'width=400,height=300' }))).toBe(true);
    expect(wantsNativeWindow(details({ features: 'innerWidth=400' }))).toBe(true);
  });
  it('is false for a plain foreground-tab open with no geometry and no body', () => {
    expect(wantsNativeWindow(details({ features: 'noopener,noreferrer' }))).toBe(false);
  });
});

describe('blockNonWeb', () => {
  const run = (url: string): boolean => {
    let prevented = false;
    blockNonWeb({ preventDefault: () => (prevented = true) }, url);
    return prevented;
  };

  it('allows http(s) and about: navigations', () => {
    expect(run('https://example.com')).toBe(false);
    expect(run('http://example.com')).toBe(false);
    expect(run('about:blank')).toBe(false);
  });
  it('blocks every other scheme', () => {
    for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://settings', 'data:x']) {
      expect(run(u)).toBe(true);
    }
  });
});

describe('isActivatingInput', () => {
  it('counts discrete inputs (clicks, keys, taps) as a user gesture', () => {
    for (const t of [
      'mouseDown',
      'keyDown',
      'rawKeyDown',
      'pointerDown',
      'touchStart',
      'gestureTap',
    ]) {
      expect(isActivatingInput(t)).toBe(true);
    }
  });
  it('does NOT count scroll / move — matching the browser', () => {
    for (const t of ['mouseMove', 'mouseWheel', 'pointerMove', 'scroll']) {
      expect(isActivatingInput(t)).toBe(false);
    }
  });
  it('keeps the transient-activation window short', () => {
    expect(GESTURE_ACTIVATION_MS).toBe(1000);
  });
});
