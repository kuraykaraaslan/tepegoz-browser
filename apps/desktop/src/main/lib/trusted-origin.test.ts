import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * The desktop adapter over `@tepegoz/navigation`'s pure `isTrustedAppUrl` (which owns its own suite).
 * What this pins is the binding the adapter adds: the packaged flag comes from Electron's `app`, the
 * chrome document URL is resolved per call, path case-folding is on ONLY on Windows (folding on Linux
 * would make a differently-cased path — a genuinely different file — compare equal to the chrome), and
 * the internal-page allow-list is the SAME `REAL_PAGE_HOSTS` set protocol.ts serves.
 */

const isTrusted = vi.hoisted(() =>
  vi.fn<(url: string, opts: Record<string, unknown>) => boolean>(() => true),
);
vi.mock('@tepegoz/navigation', () => ({ isTrustedAppUrl: isTrusted }));

const appState = vi.hoisted(() => ({ isPackaged: false }));
vi.mock('electron', () => ({ app: appState }));

const chromeDocumentUrl = vi.hoisted(() => vi.fn(() => 'file:///app/out/chrome.html'));
vi.mock('../chrome-url', () => ({ chromeDocumentUrl }));
vi.mock('../internal-pages/real-page-hosts', () => ({
  REAL_PAGE_HOSTS: new Set(['settings', 'downloads', 'history']),
}));

const { isTrustedAppUrl } = await import('./trusted-origin');

const realPlatform = process.platform;
const setPlatform = (p: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
};

beforeEach(() => {
  isTrusted.mockClear().mockReturnValue(true);
  chromeDocumentUrl.mockClear();
  appState.isPackaged = false;
});
afterEach(() => setPlatform(realPlatform));

const optsOf = () => isTrusted.mock.calls[0]![1];

it('forwards the raw URL and returns the pure helper verdict', () => {
  isTrusted.mockReturnValue(false);
  expect(isTrustedAppUrl('file:///somewhere/else.html')).toBe(false);
  expect(isTrusted.mock.calls[0]![0]).toBe('file:///somewhere/else.html');
});

it('binds isPackaged to Electron app and resolves the chrome URL per call', () => {
  appState.isPackaged = true;
  isTrustedAppUrl('x');
  expect(optsOf().isPackaged).toBe(true);
  expect(optsOf().chromeUrl).toBe('file:///app/out/chrome.html');
  expect(chromeDocumentUrl).toHaveBeenCalledTimes(1);
});

it('folds path case on Windows', () => {
  setPlatform('win32');
  isTrustedAppUrl('x');
  expect(optsOf().caseInsensitivePaths).toBe(true);
});

it('does NOT fold path case on Linux', () => {
  setPlatform('linux');
  isTrustedAppUrl('x');
  expect(optsOf().caseInsensitivePaths).toBe(false);
});

it('passes the REAL_PAGE_HOSTS set as the internal-page allow-list', () => {
  isTrustedAppUrl('x');
  expect(optsOf().internalPageHosts).toEqual(['settings', 'downloads', 'history']);
});
