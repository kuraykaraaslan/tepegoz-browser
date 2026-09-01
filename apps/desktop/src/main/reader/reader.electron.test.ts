import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderArticle } from '@tepegoz/reader';

/**
 * `readActiveTabArticle` re-validates whatever the in-page extractor returns before it crosses into
 * the trusted chrome — "we wrote the source" is explicitly NOT a reason to trust the value, because a
 * hostile page can patch the extractor's globals. These tests drive that boundary with crafted
 * payloads; the image `src` allow-list is the security-critical one (it becomes an `<img src>` in the
 * trusted chrome).
 */

const { mockFocused } = vi.hoisted(() => ({ mockFocused: vi.fn() }));

vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));
vi.mock('./reader-bundle', () => ({ READER_EXTRACTOR_SOURCE: '/* stub */ null' }));
vi.mock('../tabs', () => ({ default: { focused: mockFocused } }));

const { readActiveTabArticle } = await import('./reader.electron');

/** A focused tab whose active web contents runs the (stubbed) extractor and returns `payload`. */
function tabReturning(
  run: () => Promise<unknown>,
  opts: { destroyed?: boolean } = {},
): unknown {
  return {
    activeWebContents: () => ({
      isDestroyed: () => opts.destroyed ?? false,
      executeJavaScript: run,
    }),
  };
}

function withPayload(payload: unknown): void {
  mockFocused.mockReturnValue(tabReturning(() => Promise.resolve(payload)));
}

function article(over: Partial<ReaderArticle> = {}): ReaderArticle {
  return {
    title: 'A Real Article',
    byline: 'By Someone',
    siteName: 'example.com',
    wordCount: 400,
    blocks: [
      { kind: 'heading', level: 2, text: 'Section' },
      { kind: 'paragraph', text: 'A paragraph of prose long enough to be meaningful.' },
    ],
    ...over,
  };
}

beforeEach(() => {
  mockFocused.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('readActiveTabArticle', () => {
  it('returns a well-formed article unchanged', async () => {
    withPayload(article());
    await expect(readActiveTabArticle()).resolves.toEqual(article());
  });

  it('passes an image block through only for http(s) / data:image sources', async () => {
    withPayload(article({ blocks: [{ kind: 'image', src: 'https://cdn.example/a.png', alt: 'a' }] }));
    expect(await readActiveTabArticle()).not.toBeNull();

    withPayload(article({ blocks: [{ kind: 'image', src: 'data:image/png;base64,iVBOR', alt: '' }] }));
    expect(await readActiveTabArticle()).not.toBeNull();
  });

  it('rejects the whole article if any image src is not on the allow-list', async () => {
    for (const src of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:x',
      'file:///etc/passwd',
      ' https://evil.example/a.png', // leading space defeats a naive prefix check
    ]) {
      withPayload(article({ blocks: [{ kind: 'image', src, alt: '' }] }));
      // eslint-disable-next-line no-await-in-loop
      expect(await readActiveTabArticle()).toBeNull();
    }
  });

  it('rejects an over-long title and an over-large block count', async () => {
    withPayload(article({ title: 'x'.repeat(301) }));
    expect(await readActiveTabArticle()).toBeNull();

    withPayload(
      article({ blocks: Array.from({ length: 2_001 }, () => ({ kind: 'paragraph', text: 'p' })) }),
    );
    expect(await readActiveTabArticle()).toBeNull();
  });

  it('rejects an unknown block kind and a malformed heading level', async () => {
    withPayload(article({ blocks: [{ kind: 'marquee', text: 'hi' } as never] }));
    expect(await readActiveTabArticle()).toBeNull();

    withPayload(article({ blocks: [{ kind: 'heading', level: 4, text: 'too deep' } as never] }));
    expect(await readActiveTabArticle()).toBeNull();
  });

  it('treats null, a non-object, and a thrown error as "no article", not a crash', async () => {
    withPayload(null);
    expect(await readActiveTabArticle()).toBeNull();

    withPayload('not an object');
    expect(await readActiveTabArticle()).toBeNull();

    mockFocused.mockReturnValue(
      tabReturning(() => Promise.reject(new Error('page blew up'))),
    );
    expect(await readActiveTabArticle()).toBeNull();
  });

  it('returns null when there is no focused tab or the web contents is gone', async () => {
    mockFocused.mockReturnValue(null);
    expect(await readActiveTabArticle()).toBeNull();

    mockFocused.mockReturnValue(
      tabReturning(() => Promise.resolve(article()), { destroyed: true }),
    );
    expect(await readActiveTabArticle()).toBeNull();
  });

  it('gives up with null when extraction runs past the timeout', async () => {
    vi.useFakeTimers();
    mockFocused.mockReturnValue(tabReturning(() => new Promise(() => undefined)));
    const pending = readActiveTabArticle();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toBeNull();
  });
});
