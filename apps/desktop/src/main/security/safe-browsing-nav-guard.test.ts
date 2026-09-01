import { describe, expect, it, vi } from 'vitest';
import type { NavigationVerdict } from '@tepegoz/security-policy';
import { SafeBrowsingNavGuard } from './safe-browsing-nav-guard';

const BAD = 'http://malware.example/x';
const OK = 'https://example.com/';

function guard(verdicts: Record<string, NavigationVerdict>) {
  const onBlock = vi.fn<(url: string) => void>();
  const checkNavigation = vi.fn<(url: string) => Promise<NavigationVerdict>>((url) =>
    Promise.resolve(verdicts[url] ?? 'unknown'),
  );
  return { g: new SafeBrowsingNavGuard({ checkNavigation, onBlock }), onBlock, checkNavigation };
}

describe('SafeBrowsingNavGuard', () => {
  it('calls onBlock exactly once for a confirmed unsafe URL', async () => {
    const { g, onBlock } = guard({ [BAD]: 'block' });
    await g.onWillNavigate(BAD);
    expect(onBlock).toHaveBeenCalledExactlyOnceWith(BAD);
  });

  it('does nothing for allow or unknown — navigation fails open', async () => {
    const { g, onBlock } = guard({ [OK]: 'allow', 'http://x/': 'unknown' });
    await g.onWillNavigate(OK);
    await g.onWillNavigate('http://x/');
    expect(onBlock).not.toHaveBeenCalled();
  });

  it('does not block a URL the user chose to proceed to, and consumes that grant', async () => {
    const { g, onBlock, checkNavigation } = guard({ [BAD]: 'block' });
    g.allowOnce(BAD);
    await g.onWillNavigate(BAD);
    expect(onBlock).not.toHaveBeenCalled();
    expect(checkNavigation).not.toHaveBeenCalled();

    // Grant consumed — a later visit is checked and blocked again.
    await g.onWillNavigate(BAD);
    expect(onBlock).toHaveBeenCalledOnce();
  });

  it('honours a proceed-anyway that arrives while the check is in flight', async () => {
    const onBlock = vi.fn<(url: string) => void>();
    let release: (v: NavigationVerdict) => void = () => undefined;
    const checkNavigation = vi.fn(
      () => new Promise<NavigationVerdict>((r) => { release = r; }),
    );
    const g = new SafeBrowsingNavGuard({ checkNavigation, onBlock });

    const pending = g.onWillNavigate(BAD);
    g.allowOnce(BAD);
    release('block');
    await pending;
    expect(onBlock).not.toHaveBeenCalled();
  });

  it('de-duplicates concurrent checks for the same URL', async () => {
    const { g, checkNavigation } = guard({ [BAD]: 'block' });
    await Promise.all([g.onWillNavigate(BAD), g.onWillNavigate(BAD), g.onWillNavigate(BAD)]);
    expect(checkNavigation).toHaveBeenCalledOnce();
  });

  it('never throws out of onWillNavigate when the check rejects', async () => {
    const onBlock = vi.fn<(url: string) => void>();
    const checkNavigation = vi.fn(() => Promise.reject(new Error('boom')));
    const g = new SafeBrowsingNavGuard({ checkNavigation, onBlock });
    await expect(g.onWillNavigate(BAD)).resolves.toBeUndefined();
    expect(onBlock).not.toHaveBeenCalled();
  });
});
