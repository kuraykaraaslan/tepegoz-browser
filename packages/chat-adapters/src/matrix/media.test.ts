import { describe, expect, it } from 'vitest';
import { MATRIX_MEDIA_UPLOAD_PATH, mxcDownloadUrl, mxcThumbnailUrl, parseMxc } from './media';

describe('parseMxc', () => {
  it('splits a well-formed mxc uri into server + media id', () => {
    expect(parseMxc('mxc://matrix.org/abc123')).toEqual({ serverName: 'matrix.org', mediaId: 'abc123' });
  });

  it('keeps a port on the server name', () => {
    expect(parseMxc('mxc://example.com:8448/AbC-_9')).toEqual({
      serverName: 'example.com:8448',
      mediaId: 'AbC-_9',
    });
  });

  it('rejects anything that is not exactly mxc://server/id', () => {
    for (const bad of [
      'https://matrix.org/abc',
      'mxc://matrix.org',
      'mxc://matrix.org/',
      'mxc:///abc',
      'mxc://matrix.org/a/b',
      'mxc://matrix.org/abc?x=1',
    ]) {
      expect(parseMxc(bad)).toBeNull();
    }
  });
});

describe('mxcDownloadUrl', () => {
  it('builds the authenticated CS-API v1 download URL and trims a trailing slash', () => {
    expect(mxcDownloadUrl('https://m.example/', 'mxc://m.example/xyz')).toBe(
      'https://m.example/_matrix/client/v1/media/download/m.example/xyz',
    );
  });

  it('returns null for a non-mxc ref', () => {
    expect(mxcDownloadUrl('https://m.example', 'http://evil/x')).toBeNull();
  });
});

describe('mxcThumbnailUrl', () => {
  it('adds width / height / method query params, defaulting to scale', () => {
    expect(mxcThumbnailUrl('https://m.example', 'mxc://m.example/xyz', { width: 96, height: 96 })).toBe(
      'https://m.example/_matrix/client/v1/media/thumbnail/m.example/xyz?width=96&height=96&method=scale',
    );
  });

  it('floors fractional sizes and clamps to at least 1, and honours crop', () => {
    expect(
      mxcThumbnailUrl('https://m.example', 'mxc://m.example/xyz', { width: 0, height: 33.7, method: 'crop' }),
    ).toBe(
      'https://m.example/_matrix/client/v1/media/thumbnail/m.example/xyz?width=1&height=33&method=crop',
    );
  });

  it('returns null for a malformed ref', () => {
    expect(mxcThumbnailUrl('https://m.example', 'mxc://m.example', { width: 1, height: 1 })).toBeNull();
  });
});

it('exposes the legacy upload path', () => {
  expect(MATRIX_MEDIA_UPLOAD_PATH).toBe('/_matrix/media/v3/upload');
});
