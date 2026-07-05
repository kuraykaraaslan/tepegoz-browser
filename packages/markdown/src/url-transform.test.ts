import { describe, it, expect } from 'vitest';
import { fileUrlTransform } from './url-transform';
import { FILE_LINK_SCHEME } from './remark-file-links';

describe('fileUrlTransform', () => {
  it('preserves the internal file scheme (so onOpenFile can fire)', () => {
    const url = `${FILE_LINK_SCHEME}C:\\Users\\kuray\\tepegoz\\notes.txt`;
    expect(fileUrlTransform(url)).toBe(url);
    expect(fileUrlTransform(`${FILE_LINK_SCHEME}/home/kuray/a.md`)).toBe(
      `${FILE_LINK_SCHEME}/home/kuray/a.md`,
    );
  });

  it('keeps safe web schemes', () => {
    expect(fileUrlTransform('https://example.com')).toBe('https://example.com');
    expect(fileUrlTransform('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('strips unsafe schemes (javascript:/data:) via the default transform', () => {
    expect(fileUrlTransform('javascript:alert(1)')).toBe('');
    expect(fileUrlTransform('data:text/html,<script>')).toBe('');
  });
});
