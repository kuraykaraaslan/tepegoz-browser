import { describe, expect, it } from 'vitest';
import { parseBookmarksHtml } from './bookmark-import';

describe('parseBookmarksHtml', () => {
  it('parses nested Netscape bookmark folders', () => {
    const tree = parseBookmarksHtml(`
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Work &amp; Docs</H3>
        <DL><p>
          <DT><A HREF="https://example.com/docs">Docs</A>
          <DT><H3>Deep</H3>
          <DL><p>
            <DT><A HREF="https://example.com/deep">Deep Link</A>
          </DL><p>
        </DL><p>
      </DL><p>
    `);

    expect(tree.children[0]).toMatchObject({ type: 'folder', title: 'Work & Docs' });
    expect(JSON.stringify(tree)).toContain('https://example.com/deep');
  });
});
