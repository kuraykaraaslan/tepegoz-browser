import { beforeEach, describe, expect, it, vi } from 'vitest';

const sbService = vi.hoisted(() => ({ checkNavigation: vi.fn(() => Promise.resolve('safe')) }));
vi.mock('./safe-browsing-service.electron', () => ({ default: sbService }));

type GuardOpts = {
  checkNavigation: (u: string) => unknown;
  onBlock: (u: string) => void;
};
const guardReg = vi.hoisted(() => ({ opts: [] as GuardOpts[], count: 0 }));
vi.mock('./safe-browsing-nav-guard', () => ({
  SafeBrowsingNavGuard: class {
    allowOnce = vi.fn();
    onWillNavigate = vi.fn(() => Promise.resolve());
    constructor(opts: GuardOpts) {
      guardReg.opts.push(opts);
      guardReg.count += 1;
    }
  },
}));

vi.mock('../lib/i18n-main', () => ({ mainLocale: () => 'en' }));
vi.mock('../lib/navigation-url', () => ({ isWebUrl: (u: string) => u.startsWith('http') }));

const { interstitialHtml, parseProceedSentinel, PROCEED_FRAGMENT, handleSafeBrowsingNavigation } =
  await import('./safe-browsing-interstitial.electron');

const URL = 'http://malware.example/x?y=1';

interface FakeWc {
  isDestroyed: () => boolean;
  stop: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
}
function fakeWc(destroyed = false): FakeWc {
  return { isDestroyed: () => destroyed, stop: vi.fn(), loadURL: vi.fn(() => Promise.resolve()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  guardReg.opts.length = 0;
  guardReg.count = 0;
});

describe('parseProceedSentinel', () => {
  it('returns null for an ordinary URL', () => {
    expect(parseProceedSentinel(URL)).toBeNull();
    expect(parseProceedSentinel('https://example.com/')).toBeNull();
  });

  it('strips the sentinel fragment to recover the clean URL', () => {
    expect(parseProceedSentinel(URL + PROCEED_FRAGMENT)).toBe(URL);
  });
});

describe('interstitialHtml', () => {
  it('is a self-contained document naming the blocked URL and both actions', () => {
    const html = interstitialHtml(URL, 'en');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('malware.example');
    expect(html).toContain('Back to safety');
    expect(html).toContain('Continue anyway');
    expect(html).toContain(`href="${URL}${PROCEED_FRAGMENT}"`);
    // No external resource — it must render inside a data: URL.
    expect(html).not.toMatch(/src=["']https?:/);
  });

  it('localizes to Turkish', () => {
    const html = interstitialHtml(URL, 'tr');
    expect(html).toContain('Güvenli sayfaya dön');
    expect(html).toContain('lang="tr"');
  });

  it('escapes a hostile URL so it cannot break out of the markup', () => {
    const evil = 'http://x/"><script>alert(1)</script>';
    const html = interstitialHtml(evil, 'en');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('handleSafeBrowsingNavigation', () => {
  it('recognises a "proceed anyway" sentinel: allows once, re-loads the clean URL, says "proceed"', () => {
    const wc = fakeWc();
    const outcome = handleSafeBrowsingNavigation(wc as never, URL + PROCEED_FRAGMENT);
    expect(outcome).toBe('proceed');
    expect(guardReg.opts).toHaveLength(1);
    expect(wc.loadURL).toHaveBeenCalledWith(URL);
  });

  it('does not re-load a destroyed WebContents on the proceed path', () => {
    const wc = fakeWc(true);
    expect(handleSafeBrowsingNavigation(wc as never, URL + PROCEED_FRAGMENT)).toBe('proceed');
    expect(wc.loadURL).not.toHaveBeenCalled();
  });

  it('ignores a non-http(s) URL', () => {
    const wc = fakeWc();
    expect(handleSafeBrowsingNavigation(wc as never, 'about:blank')).toBe('ignore');
    expect(guardReg.count).toBe(0);
  });

  it('starts a background check for an http(s) URL and says "checking"', () => {
    const wc = fakeWc();
    expect(handleSafeBrowsingNavigation(wc as never, 'https://site.test/')).toBe('checking');
    expect(guardReg.count).toBe(1);
  });

  it('reuses the same per-WebContents guard across calls', () => {
    const wc = fakeWc();
    handleSafeBrowsingNavigation(wc as never, 'https://a.test/');
    handleSafeBrowsingNavigation(wc as never, 'https://b.test/');
    expect(guardReg.count).toBe(1); // one guard, memoised in the WeakMap
  });

  it('the guard is wired: checkNavigation → the service, onBlock → stop + the interstitial data: URL', () => {
    const wc = fakeWc();
    handleSafeBrowsingNavigation(wc as never, 'https://site.test/');
    const opts = guardReg.opts[0]!;

    opts.checkNavigation('https://check.test/');
    expect(sbService.checkNavigation).toHaveBeenCalledWith('https://check.test/');

    opts.onBlock('http://bad.test/');
    expect(wc.stop).toHaveBeenCalled();
    const loaded = wc.loadURL.mock.calls[0]![0] as string;
    expect(loaded.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(loaded)).toContain('bad.test');
  });

  it('onBlock is inert when the WebContents is already gone', () => {
    const wc = fakeWc();
    handleSafeBrowsingNavigation(wc as never, 'https://site.test/');
    const opts = guardReg.opts[0]!;
    (wc as { isDestroyed: () => boolean }).isDestroyed = () => true;

    opts.onBlock('http://bad.test/');
    expect(wc.stop).not.toHaveBeenCalled();
    expect(wc.loadURL).not.toHaveBeenCalled();
  });
});
