import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../i18n/en';
import { tr } from '../../i18n/tr';

const locale = vi.hoisted(() => ({ value: 'en' }));
vi.mock('../lib/i18n-main', () => ({
  mainLocale: () => locale.value,
  mainStrings: () => ({ httpsOnly: locale.value === 'en' ? en.httpsOnly : tr.httpsOnly }),
}));

const sessions = vi.hoisted(() => {
  const state: { partition: string | null } = { partition: 'persist:tepegoz-web--conn-tor1' };
  return state;
});
vi.mock('../network/browsing-sessions.electron', () => ({
  default: { partitionOf: () => sessions.partition },
}));

const state = vi.hoisted(() => ({
  addHttpsOnlyBypass: vi.fn(),
  tunnelKindOfPartition: vi.fn(() => 'tor'),
  tunnelLabel: (k: string) => (k === 'tor' ? 'Tor' : 'VPN'),
}));
vi.mock('../network/https-only.electron', () => state);

const journal = vi.hoisted(() => ({ journalHttpsOnlyBypass: vi.fn() }));
vi.mock('./https-only-journal', () => journal);

const {
  BYPASS_FRAGMENT_KEY,
  handleHttpsOnlyNavigation,
  httpsOnlyInterstitialHtml,
  showHttpsOnlyInterstitial,
} = await import('./https-only-interstitial.electron');

function fakeWc(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    stop: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    session: { __s: true },
  };
}
type Wc = ReturnType<typeof fakeWc>;

/** Show a bypass page and return the link the user would click. */
function showBypass(wc: Wc, host = 'old.example', url = 'http://old.example/p?q=1#frag'): string {
  showHttpsOnlyInterstitial(wc as never, 'bypass', host, url, 'tor');
  const data = (wc.loadURL.mock.calls.at(-1) as unknown as [string])[0];
  const html = decodeURIComponent(data.slice(data.indexOf(',') + 1));
  const m = /class="btn go" href="([^"]+)"/.exec(html);
  if (m === null) throw new Error('no proceed link');
  return m[1]!.replaceAll('&amp;', '&');
}

beforeEach(() => {
  vi.clearAllMocks();
  locale.value = 'en';
  sessions.partition = 'persist:tepegoz-web--conn-tor1';
  state.tunnelKindOfPartition.mockReturnValue('tor');
});

describe('httpsOnlyInterstitialHtml', () => {
  const base = { host: 'old.example', url: 'http://old.example/', tunnel: 'Tor' } as const;

  it('renders a host with replacement-pattern characters literally', () => {
    const html = httpsOnlyInterstitialHtml({
      ...base,
      host: 'a$&b.example',
      kind: 'bypass',
      proceedHref: `http://a.example/${BYPASS_FRAGMENT_KEY}n`,
    });
    expect(html).toContain('a$&amp;b.example');
    expect(html).not.toContain('{host}');
  });

  it('the no-tunnel (HTTPS-first) page does not mention a tunnel, but still names the host', () => {
    const html = httpsOnlyInterstitialHtml({
      ...base,
      tunnel: '',
      direct: true,
      kind: 'bypass',
      proceedHref: `http://old.example/${BYPASS_FRAGMENT_KEY}n`,
    });
    expect(html).toContain(en.httpsOnly.bodyDirect.replace('{host}', 'old.example'));
    expect(html).not.toContain('{tunnel}');
    expect(html).not.toContain('Tor');
    expect(html).toContain(en.httpsOnly.proceed);
  });

  it('bypass variant names host and tunnel, warns about interference and offers both actions', () => {
    const html = httpsOnlyInterstitialHtml({
      ...base,
      kind: 'bypass',
      proceedHref: `http://old.example/${BYPASS_FRAGMENT_KEY}n`,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('old.example');
    expect(html).toContain('Tor');
    expect(html).toContain('interfering');
    expect(html).toContain(en.httpsOnly.back);
    expect(html).toContain(en.httpsOnly.proceed);
    expect(html).not.toContain('{host}');
    expect(html).not.toMatch(/src=["']https?:/);
  });

  it('tunnel-down and non-get variants carry NO proceed link', () => {
    for (const kind of ['tunnel-down', 'non-get'] as const) {
      const html = httpsOnlyInterstitialHtml({ ...base, kind, proceedHref: 'http://x/#y' });
      expect(html).not.toContain(en.httpsOnly.proceed);
      expect(html).not.toContain('class="btn go"');
      expect(html).toContain(en.httpsOnly.back);
    }
    expect(httpsOnlyInterstitialHtml({ ...base, kind: 'tunnel-down' })).toContain(
      en.httpsOnly.tunnelDownTitle,
    );
    expect(httpsOnlyInterstitialHtml({ ...base, kind: 'tunnel-down' })).not.toContain(
      en.httpsOnly.interferenceWarning,
    );
  });

  it('escapes a hostile host and URL so they cannot break out of the markup', () => {
    const evil = '"><script>alert(1)</script>';
    const html = httpsOnlyInterstitialHtml({
      kind: 'bypass',
      host: evil,
      url: `http://x/${evil}`,
      tunnel: '<img src=x onerror=alert(2)>',
      proceedHref: `http://x/${evil}`,
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('localizes to Turkish', () => {
    locale.value = 'tr';
    const html = httpsOnlyInterstitialHtml({ ...base, kind: 'bypass', proceedHref: 'http://x/#y' });
    expect(html).toContain('lang="tr"');
    expect(html).toContain(tr.httpsOnly.back);
    expect(html).toContain(tr.httpsOnly.proceed);
  });
});

describe('showHttpsOnlyInterstitial', () => {
  it('stops the load and loads a data: page; the link carries the clean URL plus a nonce', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    expect(wc.stop).toHaveBeenCalled();
    expect((wc.loadURL.mock.calls[0] as unknown as [string])[0]).toMatch(/^data:text\/html/);
    expect(href).toMatch(
      /^http:\/\/old\.example\/p\?q=1#__tepegoz_https_only_bypass__=[0-9a-f-]{36}$/,
    );
  });

  it('does nothing for a destroyed contents', () => {
    const wc = fakeWc(true);
    expect(() => {
      showHttpsOnlyInterstitial(wc as never, 'bypass', 'a.example', 'http://a.example/', 'tor');
    }).not.toThrow();
    expect(wc.loadURL).not.toHaveBeenCalled();
  });

  it('swallows a loadURL rejection', async () => {
    const wc = fakeWc();
    wc.loadURL.mockReturnValue(Promise.reject(new Error('aborted')));
    showHttpsOnlyInterstitial(wc as never, 'tunnel-down', 'a.example', 'http://a.example/', 'tor');
    await Promise.resolve();
  });
});

describe('handleHttpsOnlyNavigation', () => {
  it('a valid nonce proceeds, adds the bypass, journals host and kind only, and loads the clean URL', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    wc.loadURL.mockClear();
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('proceed');
    expect(state.addHttpsOnlyBypass).toHaveBeenCalledWith(
      'persist:tepegoz-web--conn-tor1',
      'old.example',
    );
    expect(journal.journalHttpsOnlyBypass).toHaveBeenCalledWith('old.example', 'tor');
    expect(JSON.stringify(journal.journalHttpsOnlyBypass.mock.calls)).not.toContain('q=1');
    expect(wc.loadURL).toHaveBeenCalledWith('http://old.example/p?q=1');
  });

  it('ignores a navigation with no sentinel', () => {
    const wc = fakeWc();
    showBypass(wc);
    expect(handleHttpsOnlyNavigation(wc as never, 'http://old.example/p')).toBe('ignore');
    expect(state.addHttpsOnlyBypass).not.toHaveBeenCalled();
  });

  it('ignores a forged nonce and does not burn the real one', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    const forged = `http://old.example/${BYPASS_FRAGMENT_KEY}00000000-0000-0000-0000-000000000000`;
    expect(handleHttpsOnlyNavigation(wc as never, forged)).toBe('ignore');
    expect(state.addHttpsOnlyBypass).not.toHaveBeenCalled();
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('proceed');
  });

  it('ignores a sentinel when no interstitial was ever shown for that tab', () => {
    const wc = fakeWc();
    expect(
      handleHttpsOnlyNavigation(wc as never, `http://bank.example/${BYPASS_FRAGMENT_KEY}abc`),
    ).toBe('ignore');
    expect(wc.loadURL).not.toHaveBeenCalled();
  });

  it('a nonce is single-use', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('proceed');
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('ignore');
    expect(state.addHttpsOnlyBypass).toHaveBeenCalledTimes(1);
  });

  it('a nonce from another tab is ignored', () => {
    const a = fakeWc();
    const b = fakeWc();
    const href = showBypass(a);
    showBypass(b, 'other.example', 'http://other.example/');
    expect(handleHttpsOnlyNavigation(b as never, href)).toBe('ignore');
    expect(state.addHttpsOnlyBypass).not.toHaveBeenCalled();
  });

  it('a valid nonce replayed against a different host is ignored', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    const nonce = href.slice(href.indexOf(BYPASS_FRAGMENT_KEY));
    expect(handleHttpsOnlyNavigation(wc as never, `http://evil.example/${nonce}`)).toBe('ignore');
    expect(state.addHttpsOnlyBypass).not.toHaveBeenCalled();
  });

  it('a newer interstitial replaces the older nonce', () => {
    const wc = fakeWc();
    const first = showBypass(wc);
    const second = showBypass(wc);
    expect(handleHttpsOnlyNavigation(wc as never, first)).toBe('ignore');
    expect(handleHttpsOnlyNavigation(wc as never, second)).toBe('proceed');
  });

  it('a back-only page disarms an earlier nonce', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    showHttpsOnlyInterstitial(
      wc as never,
      'tunnel-down',
      'old.example',
      'http://old.example/',
      'tor',
    );
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('ignore');
  });

  it('ignores a sentinel on a non-http scheme', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    const nonce = href.slice(href.indexOf(BYPASS_FRAGMENT_KEY));
    expect(handleHttpsOnlyNavigation(wc as never, `https://old.example/${nonce}`)).toBe('ignore');
  });

  it('ignores when the contents has no known browsing partition', () => {
    const wc = fakeWc();
    const href = showBypass(wc);
    sessions.partition = null;
    expect(handleHttpsOnlyNavigation(wc as never, href)).toBe('ignore');
    expect(state.addHttpsOnlyBypass).not.toHaveBeenCalled();
  });

  it('does not throw for a destroyed contents or an unparseable URL', () => {
    const wc = fakeWc();
    showBypass(wc);
    expect(handleHttpsOnlyNavigation(fakeWc(true) as never, `x${BYPASS_FRAGMENT_KEY}1`)).toBe(
      'ignore',
    );
    expect(handleHttpsOnlyNavigation(wc as never, `not a url${BYPASS_FRAGMENT_KEY}1`)).toBe(
      'ignore',
    );
  });
});
