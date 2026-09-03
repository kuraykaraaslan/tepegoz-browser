import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `onboarding.electron` — the single place that decides where a chrome window's HTML comes from:
 * the Vite dev server when `ELECTRON_RENDERER_URL` is set, `chromeFilePath()` otherwise. Pinned:
 * `loadChrome` dev vs prod + query handling; `shouldShowOnboarding` reads the preference;
 * `loadOnboarding` / `loadBrowser` load the right surface query (kiosk → `?kiosk=1`).
 */

const prefs = vi.hoisted(() => ({ getAll: vi.fn(() => ({ onboardingCompleted: false })) }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('./chrome-url', () => ({ chromeFilePath: () => '/app/chrome.html' }));

const mod = await import('./onboarding.electron');

const win = () => ({
  isDestroyed: vi.fn(() => false),
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
  it('DEV: normalises the bare origin to a "/" path before the query', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const a = win();
    void mod.loadChrome(asWin(a));
    // electron-vite hands us `http://localhost:5173` with no trailing slash; the load must still target
    // `http://localhost:5173/`, never an authority followed straight by `?`.
    expect(a.loadURL).toHaveBeenCalledWith('http://localhost:5173/');

    const b = win();
    void mod.loadChrome(asWin(b), { surface: 'onboarding' });
    expect(b.loadURL).toHaveBeenCalledWith('http://localhost:5173/?surface=onboarding');
  });

  it('DEV: does not double the slash when the dev URL already ends in one', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173/';
    const a = win();
    void mod.loadChrome(asWin(a), { surface: 'onboarding' });
    expect(a.loadURL).toHaveBeenCalledWith('http://localhost:5173/?surface=onboarding');
  });

  it('DEV: retries a failed dev-server load, then resolves', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const w = win();
    w.loadURL.mockRejectedValueOnce(new Error('ERR_FAILED')).mockResolvedValueOnce(undefined);
    await mod.loadChrome(asWin(w));
    expect(w.loadURL).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Chrome dev-server load failed, retrying',
      expect.objectContaining({ attempt: 1 }),
    );
  });

  it('DEV: rejects after exhausting the retry budget', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const w = win();
    w.loadURL.mockRejectedValue(new Error('ERR_FAILED'));
    await expect(mod.loadChrome(asWin(w))).rejects.toThrow('ERR_FAILED');
    expect(w.loadURL).toHaveBeenCalledTimes(3);
  });

  it('DEV: stops retrying once the window is destroyed', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const w = win();
    w.loadURL.mockRejectedValue(new Error('ERR_FAILED'));
    w.isDestroyed.mockReturnValueOnce(false).mockReturnValue(true);
    await mod.loadChrome(asWin(w));
    expect(w.loadURL).toHaveBeenCalledTimes(1);
  });

  it('PROD: loads the bundled file, passing { query } only when given', async () => {
    const a = win();
    await mod.loadChrome(asWin(a));
    expect(a.loadFile).toHaveBeenCalledWith('/app/chrome.html', undefined);

    const b = win();
    await mod.loadChrome(asWin(b), { k: 'v' });
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
