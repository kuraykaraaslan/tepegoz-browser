import { describe, it, expect } from 'vitest';
import { resolveNodePath } from './dom-path.js';

/** Minimal DOM-shaped node for testing the resolver without a real DOM (it is duck-typed). */
interface TestNode {
  id: string;
  children: TestNode[];
  shadowRoot?: TestNode | null;
  contentDocument?: TestNode | null;
  tagName?: string;
}
const node = (id: string, children: TestNode[] = [], extra: Partial<TestNode> = {}): TestNode => ({
  id,
  children,
  ...extra,
});
const resolve = (root: TestNode, path: number[][]): string | null =>
  (resolveNodePath(root, path) as unknown as TestNode | null)?.id ?? null;

describe('resolveNodePath', () => {
  // document -> html -> [head, body -> [a, b, target]]
  const target = node('target');
  const body = node('body', [node('a'), node('b'), target]);
  const html = node('html', [node('head'), body]);
  const doc = node('#document', [html]);

  it('walks child-index steps within one root (light DOM)', () => {
    expect(resolve(doc, [[0, 1, 2]])).toBe('target'); // html[0].body[1].target[2]
    expect(resolve(doc, [[0, 1, 0]])).toBe('a');
  });

  it('returns null for an out-of-range index (stale path)', () => {
    expect(resolve(doc, [[0, 1, 9]])).toBeNull();
    expect(resolve(doc, [[5]])).toBeNull();
  });

  it('returns null for an empty segment or empty path', () => {
    expect(resolve(doc, [[]])).toBeNull();
    expect(resolve(doc, [])).toBeNull();
  });

  it('crosses an OPEN shadow root between segments (shadow preferred over children)', () => {
    const shadowBtn = node('shadow-btn');
    const host = node('host', [node('light-child')], { shadowRoot: node('#shadow', [shadowBtn]) });
    const root = node('#document', [node('html', [host])]);
    // seg0 -> host; cross into host.shadowRoot; seg1 -> its first child
    expect(resolve(root, [[0, 0], [0]])).toBe('shadow-btn');
  });

  it('crosses a same-origin iframe via contentDocument', () => {
    const framedLink = node('framed-link');
    const iframe = node('iframe', [], {
      tagName: 'IFRAME',
      contentDocument: node('#idoc', [node('ihtml', [framedLink])]),
    });
    const root = node('#document', [node('html', [node('body', [iframe])])]);
    // html[0].body[0].iframe[0] -> into contentDocument -> ihtml[0].framed-link[0]
    expect(
      resolve(root, [
        [0, 0, 0],
        [0, 0],
      ]),
    ).toBe('framed-link');
  });

  it('returns null when a mid-path node has no shadow root or frame to cross', () => {
    const root = node('#document', [node('html', [node('plain', [node('leaf')])])]);
    expect(resolve(root, [[0, 0], [0]])).toBeNull(); // "plain" has neither shadowRoot nor contentDocument
  });
});
