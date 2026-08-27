import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { chromeDocumentUrl, chromeFilePath } from './chrome-url';

/**
 * `chromeDocumentUrl` is what `isTrustedAppUrl` compares a sender frame against — the IPC allow-list
 * and the navigation guard both key on it. The property that matters: it names ONE exact document
 * (`out/renderer/index.html`), as a `file://` URL, with no query string an attacker could tack on.
 */
describe('chrome-url', () => {
  it('points at the renderer index one level up from out/main', () => {
    expect(chromeFilePath().replace(/\\/g, '/')).toMatch(/\/renderer\/index\.html$/);
    expect(chromeFilePath()).not.toMatch(/out[\\/]main[\\/]index\.html$/);
  });

  it('is a file:// URL with no query or hash', () => {
    const url = chromeDocumentUrl();
    expect(url.startsWith('file://')).toBe(true);
    expect(url).toContain('/renderer/index.html');
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });

  it('is exactly the file URL of the resolved path (the two halves cannot drift)', () => {
    expect(chromeDocumentUrl()).toBe(pathToFileURL(chromeFilePath()).toString());
  });
});
