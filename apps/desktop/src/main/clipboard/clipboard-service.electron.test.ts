import { createHash } from 'node:crypto';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ClipboardService` — the main-process clipboard surface. Every operation does the Electron action
 * then writes ONE redacted `ClipboardAccessed` journal entry. Pinned: each editing command drives the
 * matching `WebContents` method and audits under the right operation name; the origin is taken from a
 * live tab and omitted for a missing / destroyed one; `writeText` / `readText` hash and size the text
 * (sha only when non-empty); and the audit is a silent no-op with no database and swallows an append
 * failure with a warning.
 */

const clip = vi.hoisted(() => ({ writeText: vi.fn(), readText: vi.fn(() => '') }));
vi.mock('electron', () => ({ clipboard: clip }));

vi.mock('@tepegoz/clipboard', () => ({
  // passthrough so the test can assert exactly what the service computed
  createClipboardAuditMetadata: (m: Record<string, unknown>) => ({ ts: 111, ...m }),
}));

const journal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const { default: ClipboardService } = await import('./clipboard-service.electron');

/** The metadata payload of the single journal entry the last call wrote. */
function lastPayload(): Record<string, unknown> {
  const entry = journal.append.mock.calls.at(-1)![1] as { payload: Record<string, unknown> };
  return entry.payload;
}

function fakeWc(url = 'https://shop.test/cart', destroyed = false) {
  const wc = {
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    copyImageAt: vi.fn(),
    isDestroyed: () => destroyed,
    getURL: () => url,
  };
  return wc as unknown as WebContents & typeof wc;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  clip.readText.mockReturnValue('');
});

describe('editing commands', () => {
  it.each([
    ['copy', 'copy'],
    ['cut', 'cut'],
    ['paste', 'paste'],
    ['selectAll', 'select-all'],
  ] as const)('%s drives the WebContents method and audits as "%s"', (method, op) => {
    const wc = fakeWc();
    (ClipboardService[method] as (w: unknown) => void)(wc);
    expect(wc[method]).toHaveBeenCalledTimes(1);
    expect(journal.append).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toMatchObject({
      operation: op,
      actor: 'user',
      origin: 'https://shop.test',
    });
    expect(journal.append.mock.calls[0]![1]).toMatchObject({
      type: 'ClipboardAccessed',
      redacted: true,
    });
  });

  it('copyImageAt rounds the coordinates and records an image kind', () => {
    const wc = fakeWc();
    ClipboardService.copyImageAt(wc, 10.6, 20.2);
    expect(wc.copyImageAt).toHaveBeenCalledWith(11, 20);
    expect(lastPayload()).toMatchObject({ operation: 'copy-image', contentKind: 'image' });
  });

  it('tolerates a missing WebContents — still audits, with no origin', () => {
    expect(() => ClipboardService.copy(undefined)).not.toThrow();
    expect(lastPayload()).toMatchObject({ operation: 'copy' });
    expect(lastPayload().origin).toBeUndefined();
  });

  it('does not read the URL of a destroyed WebContents', () => {
    const wc = fakeWc('https://shop.test/cart', true);
    const spy = vi.spyOn(wc, 'getURL');
    ClipboardService.paste(wc);
    expect(spy).not.toHaveBeenCalled();
    expect(lastPayload().origin).toBeUndefined();
  });

  it('omits the origin when the live tab URL will not parse', () => {
    ClipboardService.copy(fakeWc('http://['));
    expect(lastPayload()).toMatchObject({ operation: 'copy' });
    expect(lastPayload().origin).toBeUndefined();
  });
});

describe('writeText / readText', () => {
  it('writeText copies then audits length + sha, honouring a non-default actor/origin', () => {
    ClipboardService.writeText({ text: 'hello', actor: 'agent', origin: 'https://a.test' });
    expect(clip.writeText).toHaveBeenCalledWith('hello');
    expect(lastPayload()).toMatchObject({
      operation: 'write-text',
      actor: 'agent',
      origin: 'https://a.test',
      contentKind: 'text',
      contentLength: 5,
      contentSha256: createHash('sha256').update('hello').digest('hex'),
    });
  });

  it('writeText of an empty string records an empty kind and defaults the actor to user', () => {
    ClipboardService.writeText({ text: '' });
    expect(lastPayload()).toMatchObject({
      operation: 'write-text',
      actor: 'user',
      contentKind: 'empty',
      contentLength: 0,
    });
  });

  it('readText returns the clipboard text and audits it with a sha', () => {
    clip.readText.mockReturnValue('copied');
    expect(ClipboardService.readText()).toBe('copied');
    expect(lastPayload()).toMatchObject({
      operation: 'read-text',
      contentKind: 'text',
      contentLength: 6,
      contentSha256: createHash('sha256').update('copied').digest('hex'),
    });
  });

  it('readText of an empty clipboard omits the sha', () => {
    clip.readText.mockReturnValue('');
    expect(ClipboardService.readText({ actor: 'agent' })).toBe('');
    const p = lastPayload();
    expect(p).toMatchObject({ operation: 'read-text', actor: 'agent', contentKind: 'empty' });
    expect(p.contentSha256).toBeUndefined();
  });
});

describe('audit resilience', () => {
  it('is a no-op when there is no database', () => {
    db.value = null;
    ClipboardService.copy(fakeWc());
    expect(journal.append).not.toHaveBeenCalled();
  });

  it('swallows an append failure with a warning', () => {
    journal.append.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => ClipboardService.copy(fakeWc())).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Clipboard audit append failed',
      expect.objectContaining({ err: expect.stringContaining('disk full') as string }),
    );
  });
});
