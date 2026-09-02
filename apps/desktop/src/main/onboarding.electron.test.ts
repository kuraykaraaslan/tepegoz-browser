import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `onboarding.electron` — the single place that decides where a chrome window's HTML comes from:
 * the Vite dev server when `ELECTRON_RENDERER_URL` is set, `chromeFilePath()` otherwise. Pinned:
 * `loadChrome` dev vs prod + query handling; `shouldShowOnboarding` reads the preference;
 * `loadOnboarding` / `loadBrowser` load the right surface query (kiosk → `?kiosk=1`).
 */

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ onboardingCompleted: false })) }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
vi.mock('./chrome-url', () => ({ chromeFilePath: () => '/app/chrome.html' }));

const mod = await import('./onboarding.electron');

const win = () => ({
  loadURL: vi.fn(() => Promise.resolve()),
  loadFile: vi.fn(() => Promise.resolve()),
});
type Win = ReturnType<typeof win>;
const asWin = (w: Win) => w as never;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['ELECTRON_RENDERER_URL'];
  prefs.getAll.mockReturnValue({ onboardingCompleted: false });
});
afterEach(() => {
  delete process.env['ELECTRON_RENDERER_URL'];
});

describe('loadChrome', () => {
  it('DEV: loads the dev server URL, appending a query string when given', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const a = win();
    mod.loadChrome(asWin(a));
    expect(a.loadURL).toHaveBeenCalledWith('http://localhost:5173');

    const b = win();
    mod.loadChrome(asWin(b), { surface: 'onboarding' });
    expect(b.loadURL).toHaveBeenCalledWith('http://localhost:5173?surface=onboarding');
  });

  it('PROD: loads the bundled file, passing { query } only when given', () => {
    const a = win();
    mod.loadChrome(asWin(a));
    expect(a.loadFile).toHaveBeenCalledWith('/app/chrome.html', undefined);

    const b = win();
    mod.loadChrome(asWin(b), { k: 'v' });
    expect(b.loadFile).toHaveBeenCalledWith('/app/chrome.html', { query: { k: 'v' } });
  });
});

describe('shouldShowOnboarding', () => {
  it('mirrors !onboardingCompleted', () => {
    expect(mod.shouldShowOnboarding()).toBe(true);
    prefs.getAll.mockReturnValue({ onboardingCompleted: true });
    expect(mod.shouldShowOnboarding()).toBe(false);
  });
});

describe('surface loaders', () => {
  it('loadOnboarding loads the onboarding surface', () => {
    const w = win();
    mod.loadOnboarding(asWin(w));
    expect(w.loadFile).toHaveBeenCalledWith('/app/chrome.html', {
      query: { surface: 'onboarding' },
    });
  });

  it('loadBrowser loads plain chrome, or the chromeless kiosk variant', () => {
    const plain = win();
    mod.loadBrowser(asWin(plain));
    expect(plain.loadFile).toHaveBeenCalledWith('/app/chrome.html', undefined);

    const kiosk = win();
    mod.loadBrowser(asWin(kiosk), { kiosk: true });
    expect(kiosk.loadFile).toHaveBeenCalledWith('/app/chrome.html', { query: { kiosk: '1' } });
  });
});
