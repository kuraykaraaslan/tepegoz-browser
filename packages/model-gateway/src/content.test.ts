import { describe, it, expect } from 'vitest';
import type { CanonContentBlock } from '@tepegoz/shared-types';
import { contentLength, contentToText, egressTextOf, isBlockContent } from './content';

const blocks: CanonContentBlock[] = [
  { type: 'text', text: 'read the page' },
  { type: 'image', mediaType: 'image/png', data: 'QUJDREVG' },
  { type: 'tool_use', id: 'tu_1', name: 'browser_get_elements', input: { tabId: 't1' } },
  { type: 'tool_result', toolUseId: 'tu_1', content: '[3] button "Accept"' },
];

describe('content helpers over the widened CanonMessage.content', () => {
  it('treats a plain string as content (the normalized default is untouched)', () => {
    expect(isBlockContent('hi')).toBe(false);
    expect(contentToText('hi')).toBe('hi');
    expect(contentLength('hi')).toBe(2);
    expect(egressTextOf('hi')).toBe('hi');
  });

  it('flattens an image to an explicit marker rather than dropping it silently', () => {
    const text = contentToText(blocks);
    expect(text).toContain('read the page');
    expect(text).toContain('[image: image/png');
    // The bytes themselves must NOT ride along on a text-only transport.
    expect(text).not.toContain('QUJDREVG');
  });

  it('carries tool use and tool results through the text flattening', () => {
    const text = contentToText(blocks);
    expect(text).toContain('browser_get_elements');
    expect(text).toContain('"tabId":"t1"');
    expect(text).toContain('[3] button "Accept"');
  });

  it('marks a failed tool result so a text-only model can tell it apart from a success', () => {
    const failed: CanonContentBlock[] = [
      { type: 'tool_result', toolUseId: 'tu_1', content: 'element not found', isError: true },
    ];
    expect(contentToText(failed)).toContain('[tool_error]');
  });

  it('counts image bytes in the token proxy (an image is what the request actually carries)', () => {
    expect(contentLength(blocks)).toBeGreaterThan('QUJDREVG'.length);
    expect(contentLength([{ type: 'image', mediaType: 'image/png', data: 'QUJDREVG' }])).toBe(8);
  });

  it('gives the egress inspector tool arguments and results, but never raw image bytes', () => {
    const payload = egressTextOf([
      { type: 'text', text: 'plain' },
      { type: 'image', mediaType: 'image/png', data: 'c2stYW50LVNFQ1JFVA' },
      { type: 'tool_use', id: 'tu_2', name: 'http_post', input: { token: 'sk-ant-SECRET' } },
      { type: 'tool_result', toolUseId: 'tu_2', content: 'leaked sk-ant-OTHER' },
    ]);
    expect(payload).toContain('sk-ant-SECRET');
    expect(payload).toContain('sk-ant-OTHER');
    expect(payload).not.toContain('c2stYW50LVNFQ1JFVA');
  });
});
