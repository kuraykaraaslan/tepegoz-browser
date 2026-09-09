import { describe, expect, it } from 'vitest';
import { linkifySegments, MAX_LINK_SEGMENTS } from './linkify';

describe('linkifySegments', () => {
  it('returns nothing for an empty body', () => {
    expect(linkifySegments('')).toEqual([]);
  });

  it('passes plain text through as one run', () => {
    expect(linkifySegments('just talking here')).toEqual([
      { kind: 'text', value: 'just talking here' },
    ]);
  });

  it('splits a URL out of the surrounding text', () => {
    expect(linkifySegments('see https://tepegoz.example/docs now')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'link', value: 'https://tepegoz.example/docs', href: 'https://tepegoz.example/docs' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('leaves trailing sentence punctuation as text', () => {
    expect(linkifySegments('read https://x.org/a.')).toEqual([
      { kind: 'text', value: 'read ' },
      { kind: 'link', value: 'https://x.org/a', href: 'https://x.org/a' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('handles two links in one message', () => {
    const segs = linkifySegments('http://a.example and https://b.example');
    expect(segs.filter((s) => s.kind === 'link').map((s) => s.value)).toEqual([
      'http://a.example',
      'https://b.example',
    ]);
  });

  it('does NOT linkify dangerous or bare schemes', () => {
    for (const body of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
      'go to tepegoz.example',
    ]) {
      expect(linkifySegments(body)).toEqual([{ kind: 'text', value: body }]);
    }
  });

  it('ignores a scheme with no host once trailing punctuation is stripped', () => {
    expect(linkifySegments('look: https://.')).toEqual([{ kind: 'text', value: 'look: https://.' }]);
  });

  it('caps the segment count for a pathological body', () => {
    const body = Array.from({ length: 5000 }, (_, i) => `https://x.example/${i}`).join(' ');
    expect(linkifySegments(body).length).toBeLessThanOrEqual(MAX_LINK_SEGMENTS);
  });
});
