import { describe, expect, it } from 'vitest';
import {
  classifyMediaProbe,
  parseResolvableMediaUrl,
  resolveMedia,
  suggestMediaFilename,
  type MediaProbeResult,
} from './media-resolver';

function probe(overrides: Partial<MediaProbeResult> = {}): MediaProbeResult {
  return {
    status: 200,
    contentType: 'image/png',
    contentLengthBytes: 1024,
    finalUrl: 'https://cdn.example.com/pic.png',
    ...overrides,
  };
}

describe('parseResolvableMediaUrl', () => {
  it('accepts http and https', () => {
    expect(parseResolvableMediaUrl('https://example.com/a.png')).not.toBeNull();
    expect(parseResolvableMediaUrl('http://example.com/a.png')).not.toBeNull();
  });

  it('rejects other schemes and unparseable input', () => {
    expect(parseResolvableMediaUrl('file:///etc/passwd')).toBeNull();
    expect(parseResolvableMediaUrl('data:image/png;base64,AA==')).toBeNull();
    expect(parseResolvableMediaUrl('javascript:alert(1)')).toBeNull();
    expect(parseResolvableMediaUrl('not a url')).toBeNull();
  });
});

describe('suggestMediaFilename', () => {
  it('keeps the URL filename when it has a plausible extension', () => {
    expect(suggestMediaFilename('https://cdn.example.com/path/pic.png?x=1', 'image/png')).toBe(
      'pic.png',
    );
  });

  it('derives an extension from the MIME type when the URL has none', () => {
    expect(suggestMediaFilename('https://cdn.example.com/media/12345', 'image/jpeg')).toBe(
      '12345.jpg',
    );
  });

  it('falls back to a bare name when neither the URL nor the MIME map help', () => {
    expect(suggestMediaFilename('https://cdn.example.com/', 'application/x-unknown')).toBe('media');
  });
});

describe('classifyMediaProbe', () => {
  it('classifies an image/video/audio response as direct', () => {
    expect(classifyMediaProbe('https://cdn.example.com/pic.png', probe())).toEqual({
      kind: 'direct',
      url: 'https://cdn.example.com/pic.png',
      contentType: 'image/png',
      contentLengthBytes: 1024,
      suggestedFilename: 'pic.png',
    });
  });

  it('treats an HTML page as not_direct with a browsing hint', () => {
    const result = classifyMediaProbe(
      'https://example.com/watch',
      probe({ contentType: 'text/html; charset=utf-8', finalUrl: 'https://example.com/watch' }),
    );
    expect(result).toMatchObject({ kind: 'not_direct', reason: 'html_page' });
  });

  it('treats a non-2xx status as unreachable', () => {
    expect(classifyMediaProbe('https://example.com/x', probe({ status: 404 }))).toMatchObject({
      kind: 'not_direct',
      reason: 'unreachable',
    });
  });

  it('treats a null probe (transport failure) as unreachable', () => {
    expect(classifyMediaProbe('https://example.com/x', null)).toMatchObject({
      kind: 'not_direct',
      reason: 'unreachable',
    });
  });

  it('treats an unrecognized content type as unknown_type', () => {
    expect(
      classifyMediaProbe('https://example.com/x', probe({ contentType: 'application/json' })),
    ).toMatchObject({ kind: 'not_direct', reason: 'unknown_type' });
  });

  it('treats a missing content type as unknown_type', () => {
    expect(
      classifyMediaProbe('https://example.com/x', probe({ contentType: undefined })),
    ).toMatchObject({ kind: 'not_direct', reason: 'unknown_type' });
  });

  it('resolves the FINAL url (post-redirect), not the requested one', () => {
    const result = classifyMediaProbe(
      'https://short.link/abc',
      probe({ finalUrl: 'https://cdn.example.com/real.mp4', contentType: 'video/mp4' }),
    );
    expect(result).toMatchObject({ kind: 'direct', url: 'https://cdn.example.com/real.mp4' });
  });
});

describe('resolveMedia', () => {
  it('never calls the probe for a disallowed scheme', async () => {
    let called = false;
    const result = await resolveMedia('file:///etc/passwd', () => {
      called = true;
      return Promise.resolve(null);
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ kind: 'not_direct', reason: 'unsupported_scheme' });
  });

  it('reports invalid_url for unparseable input without probing', async () => {
    let called = false;
    const result = await resolveMedia('not a url at all', () => {
      called = true;
      return Promise.resolve(null);
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ kind: 'not_direct', reason: 'invalid_url' });
  });

  it('probes a well-formed http(s) URL and classifies the result', async () => {
    const result = await resolveMedia('https://cdn.example.com/pic.png', () =>
      Promise.resolve(probe()),
    );
    expect(result).toMatchObject({ kind: 'direct', contentType: 'image/png' });
  });
});
