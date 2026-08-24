import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

vi.mock('electron', () => ({}));
vi.mock('./downloads/download-service.electron', () => ({ default: { downloadURL: vi.fn() } }));

const { toggleDevToolsGated, printPage, viewSourcePage } = await import('./page-commands');

/**
 * The sensitive-site DevTools gate, at the place a keypress reaches it.
 *
 * `devtools-policy.ts` states the guarantee as "nothing that reaches the chrome can open it on a
 * bank", and `openDevToolsActive` calls itself "the single place DevTools is opened, so the
 * sensitive-site gate cannot be routed around by a new caller". Both were false: the app never called
 * `Menu.setApplicationMenu`, so Electron's DEFAULT menu was live and bound Ctrl+Shift+I to its own
 * `toggleDevTools` role — which acts on the focused webContents and consults nothing. Measured in the
 * running app, not inferred: `Menu.getApplicationMenu()` returned a menu listing
 * `Toggle Developer Tools=Ctrl+Shift+I`. The app's own gated toggle had zero callers.
 */
function fakePage(url: string, devToolsOpen = false) {
  const calls: string[] = [];
  const wc = {
    calls,
    isDestroyed: () => false,
    getURL: () => url,
    isDevToolsOpened: () => devToolsOpen,
    openDevTools: () => calls.push('open'),
    closeDevTools: () => calls.push('close'),
    print: (_o: unknown, cb: (ok: boolean, reason: string) => void) => {
      calls.push('print');
      cb(true, '');
    },
    loadURL: (u: string) => {
      calls.push(`load:${u}`);
      return Promise.resolve();
    },
  };
  return wc as unknown as WebContents & { calls: string[] };
}

describe('toggleDevToolsGated', () => {
  /** Each of these is a real entry from the app's own sensitive-site map, one per category. */
  const sensitive = [
    ['a Turkish bank', 'https://www.garanti.com.tr/hesap'],
    ['anything with "bank" in the host', 'https://mybank.example.com/'],
    ['e-Devlet, and the whole gov.tr tree', 'https://turkiye.gov.tr/giris'],
    ['a crypto exchange', 'https://www.binance.com/en/my/wallet'],
    ['a password manager', 'https://vault.bitwarden.com/'],
    ['a health record', 'https://enabiz.gov.tr/'],
  ] as const;

  for (const [what, url] of sensitive) {
    it(`refuses on ${what}`, () => {
      const wc = fakePage(url);
      expect(toggleDevToolsGated(wc)).toEqual({ allowed: false, reason: 'sensitive_site' });
      expect(wc.calls).toEqual([]); // and did not open it anyway
    });
  }

  it('allows an ordinary page — the gate is a lockout, not a ban', () => {
    const wc = fakePage('https://example.com/docs');
    expect(toggleDevToolsGated(wc)).toEqual({ allowed: true });
    expect(wc.calls).toEqual(['open']);
  });

  it('closes DevTools when they are already open, so the key is a toggle', () => {
    const wc = fakePage('https://example.com/docs', true);
    expect(toggleDevToolsGated(wc)).toEqual({ allowed: true });
    expect(wc.calls).toEqual(['close']);
  });

  it('refuses with no page rather than throwing', () => {
    expect(toggleDevToolsGated(null)).toEqual({ allowed: false, reason: 'no_page' });
  });

  it('refuses a blank URL — an unloaded tab is not a safe default', () => {
    const wc = fakePage('');
    expect(toggleDevToolsGated(wc)).toEqual({ allowed: false, reason: 'no_page' });
    expect(wc.calls).toEqual([]);
  });
});

describe('the other page commands', () => {
  it('print passes a callback, so a failed print is not silent', () => {
    const wc = fakePage('https://example.com/');
    printPage(wc);
    expect(wc.calls).toEqual(['print']);
  });

  it('view-source refuses an internal page, which has no source to show', () => {
    const wc = fakePage('tepegoz://settings');
    viewSourcePage(wc);
    expect(wc.calls).toEqual([]);
  });

  it('view-source navigates a web page in place', () => {
    const wc = fakePage('https://example.com/a');
    viewSourcePage(wc);
    expect(wc.calls).toEqual(['load:view-source:https://example.com/a']);
  });
});
