import { describe, it, expect } from 'vitest';
import { linkifyText, remarkFileLinks, FILE_LINK_SCHEME } from './remark-file-links';

describe('linkifyText', () => {
  it('linkifies a Windows absolute path', () => {
    const parts = linkifyText('saved to C:\\Users\\kuray\\tepegoz\\notes.txt now');
    expect(parts).not.toBeNull();
    const link = parts!.find((p) => p.type === 'link');
    expect(link?.url).toBe(`${FILE_LINK_SCHEME}C:\\Users\\kuray\\tepegoz\\notes.txt`);
  });

  it('linkifies a POSIX absolute path (>= 2 segments)', () => {
    const parts = linkifyText('wrote /home/kuray/tepegoz/a.md ok');
    const link = parts!.find((p) => p.type === 'link');
    expect(link?.url).toBe(`${FILE_LINK_SCHEME}/home/kuray/tepegoz/a.md`);
  });

  it('strips trailing sentence punctuation from the path', () => {
    const parts = linkifyText('saved to /home/kuray/a.txt.');
    const link = parts!.find((p) => p.type === 'link');
    expect(link?.url).toBe(`${FILE_LINK_SCHEME}/home/kuray/a.txt`);
    // the period stays as trailing text, not part of the link
    const tail = parts!.at(-1);
    expect(tail?.type).toBe('text');
    expect(tail?.value).toBe('.');
  });

  it('does not match a lone /word or plain prose', () => {
    expect(linkifyText('this is /just prose here')).toBeNull();
    expect(linkifyText('no paths at all')).toBeNull();
  });
});

describe('remarkFileLinks plugin', () => {
  it('rewrites path text nodes but leaves code nodes untouched', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'open /home/k/x.txt please' }] },
        { type: 'code', lang: 'sh', value: 'cat /home/k/secret.txt' },
      ],
    };
    remarkFileLinks()(tree);
    const para = tree.children[0] as { children: { type: string; url?: string }[] };
    expect(
      para.children.some((c) => c.type === 'link' && c.url?.startsWith(FILE_LINK_SCHEME)),
    ).toBe(true);
    // the fenced code block value is unchanged (not a `text` node)
    expect((tree.children[1] as { value: string }).value).toBe('cat /home/k/secret.txt');
  });
});
