import { describe, expect, it } from 'vitest';
import { dataUrlMime, isLocalMediaUrl, isSafeMediaResource, mediaCategory } from './media';

describe('mediaCategory', () => {
  it('classifies by MIME top-level type, case-insensitively', () => {
    expect(mediaCategory('image/png')).toBe('image');
    expect(mediaCategory('VIDEO/mp4')).toBe('video');
    expect(mediaCategory('audio/ogg')).toBe('audio');
    expect(mediaCategory('application/pdf')).toBe('file');
    expect(mediaCategory('')).toBe('file');
  });
});

describe('dataUrlMime', () => {
  it('reads the MIME from a data URL, base64 or not, and is empty otherwise', () => {
    expect(dataUrlMime('data:image/png;base64,AAAA')).toBe('image/png');
    expect(dataUrlMime('data:text/plain,hi')).toBe('text/plain');
    expect(dataUrlMime('DATA:IMAGE/JPEG;base64,AAAA')).toBe('image/jpeg');
    expect(dataUrlMime('blob:abc')).toBe('');
    expect(dataUrlMime('data:base64stuff')).toBe('');
  });
});

describe('isLocalMediaUrl', () => {
  it('accepts only blob: and data: URLs', () => {
    expect(isLocalMediaUrl('blob:nulldeadbeef')).toBe(true);
    expect(isLocalMediaUrl('  data:image/png;base64,AAA')).toBe(true);
    for (const bad of ['https://evil.example/x.png', 'http://x', 'file:///etc', 'javascript:1', '//x']) {
      expect(isLocalMediaUrl(bad)).toBe(false);
    }
  });
});

describe('isSafeMediaResource', () => {
  it('requires a local URL and a non-empty MIME', () => {
    expect(isSafeMediaResource({ url: 'blob:x', mime: 'image/png', name: 'a' })).toBe(true);
    expect(isSafeMediaResource({ url: 'https://x/a.png', mime: 'image/png', name: 'a' })).toBe(false);
    expect(isSafeMediaResource({ url: 'blob:x', mime: '  ', name: 'a' })).toBe(false);
  });
});
