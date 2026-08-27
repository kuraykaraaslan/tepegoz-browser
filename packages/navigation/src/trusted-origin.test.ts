import { describe, it, expect } from 'vitest';
import { isTrustedAppUrl } from './trusted-origin';

const CHROME = 'file:///C:/app/out/renderer/index.html';

describe('isTrustedAppUrl', () => {
  it('trusts the chrome document itself', () => {
    expect(isTrustedAppUrl(CHROME, { isPackaged: true, chromeUrl: CHROME })).toBe(true);
    expect(isTrustedAppUrl(CHROME, { isPackaged: false, chromeUrl: CHROME })).toBe(true);
  });

  it('ignores the surface query and the hash — same document', () => {
    // The chrome is loaded as `index.html?surface=onboarding`, `?surface=ext&id=…`, and so on.
    expect(
      isTrustedAppUrl(`${CHROME}?surface=onboarding`, { isPackaged: true, chromeUrl: CHROME }),
    ).toBe(true);
    expect(
      isTrustedAppUrl(`${CHROME}?surface=ext&id=com.x#top`, {
        isPackaged: true,
        chromeUrl: CHROME,
      }),
    ).toBe(true);
  });

  it('does NOT trust another local file', () => {
    // The reason this parameter exists. The check used to be `rawUrl.startsWith('file://')`, so every
    // document on the user's disk answered "yes, I am the app chrome" to the IPC sender allow-list.
    expect(
      isTrustedAppUrl('file:///C:/Users/victim/Downloads/evil.html', {
        isPackaged: true,
        chromeUrl: CHROME,
      }),
    ).toBe(false);
    expect(isTrustedAppUrl('file:///etc/passwd', { isPackaged: false, chromeUrl: CHROME })).toBe(
      false,
    );
  });

  it('does not let a sibling file in the same directory pass', () => {
    expect(
      isTrustedAppUrl('file:///C:/app/out/renderer/other.html', {
        isPackaged: true,
        chromeUrl: CHROME,
      }),
    ).toBe(false);
  });

  it('folds case ONLY where the filesystem does', () => {
    const differentlyCased = 'file:///c:/APP/out/renderer/INDEX.HTML';
    // Windows: the same file, so the same document.
    expect(
      isTrustedAppUrl(differentlyCased, {
        isPackaged: true,
        chromeUrl: CHROME,
        caseInsensitivePaths: true,
      }),
    ).toBe(true);
    // Linux: a DIFFERENT file. Folding case here would hand the IPC sender allow-list to a document
    // that merely looks like the chrome, which is the bug this whole parameter exists to avoid.
    expect(
      isTrustedAppUrl(differentlyCased, {
        isPackaged: true,
        chromeUrl: CHROME,
        caseInsensitivePaths: false,
      }),
    ).toBe(false);
    // Strict by default.
    expect(isTrustedAppUrl(differentlyCased, { isPackaged: true, chromeUrl: CHROME })).toBe(false);
  });

  it('trusts the localhost dev server ONLY when not packaged', () => {
    expect(
      isTrustedAppUrl('http://localhost:5173/', { isPackaged: false, chromeUrl: CHROME }),
    ).toBe(true);
    expect(
      isTrustedAppUrl('http://127.0.0.1:5173/', { isPackaged: false, chromeUrl: CHROME }),
    ).toBe(true);
    expect(isTrustedAppUrl('http://localhost:5173/', { isPackaged: true, chromeUrl: CHROME })).toBe(
      false,
    );
  });

  it('rejects spoofed hosts via exact host matching (not a string prefix)', () => {
    expect(
      isTrustedAppUrl('http://localhost.evil.com/', { isPackaged: false, chromeUrl: CHROME }),
    ).toBe(false);
    expect(
      isTrustedAppUrl('https://evil.com/?x=localhost', { isPackaged: false, chromeUrl: CHROME }),
    ).toBe(false);
  });

  it('trusts an allow-listed tepegoz:// internal-page host, in every build', () => {
    expect(
      isTrustedAppUrl('tepegoz://settings/', {
        isPackaged: true,
        chromeUrl: CHROME,
        internalPageHosts: ['settings', 'history'],
      }),
    ).toBe(true);
    expect(
      isTrustedAppUrl('tepegoz://settings/', {
        isPackaged: false,
        chromeUrl: CHROME,
        internalPageHosts: ['settings', 'history'],
      }),
    ).toBe(true);
  });

  it('does not trust a tepegoz:// host outside the allow-list', () => {
    expect(
      isTrustedAppUrl('tepegoz://tasks/', {
        isPackaged: true,
        chromeUrl: CHROME,
        internalPageHosts: ['settings', 'history'],
      }),
    ).toBe(false);
  });

  it('does not trust ANY tepegoz:// host when the caller supplies no allow-list', () => {
    expect(isTrustedAppUrl('tepegoz://settings/', { isPackaged: true, chromeUrl: CHROME })).toBe(
      false,
    );
  });

  it('rejects malformed input', () => {
    expect(isTrustedAppUrl('not a url', { isPackaged: false, chromeUrl: CHROME })).toBe(false);
    expect(isTrustedAppUrl('', { isPackaged: false, chromeUrl: CHROME })).toBe(false);
  });

  it('falls back to scheme-wide trust only when no chrome URL is supplied', () => {
    // Documented escape hatch, not a recommendation: every caller in this repo passes chromeUrl.
    expect(isTrustedAppUrl('file:///anything.html', { isPackaged: true })).toBe(true);
  });
});
