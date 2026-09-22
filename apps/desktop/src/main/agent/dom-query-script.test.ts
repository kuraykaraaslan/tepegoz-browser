import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildDomQueryExpression, type ExistingPathEntry } from './dom-query-script.js';

/**
 * Runs the REAL injected script inside a `vm` over a minimal fake DOM — the same technique
 * `style-probe-script.test.ts`/`article-text-script.test.ts` use. `querySelectorAll` and `document.evaluate`
 * are faked just enough to exercise the selector forms these tests use (real Chromium supplies the actual
 * engines at runtime); what is real is the traversal (`resolveNodePath`, already unit-tested on its own)
 * and the cap/ref-resolution/`computeNodePath` logic under test here.
 */

interface FakeEl {
  tagName: string;
  nodeType: 1;
  attrsDict: Record<string, string>;
  attributes: { name: string; value: string }[];
  children: FakeEl[];
  parentNode: FakeEl | FakeDoc | null;
}
interface FakeDoc {
  children: FakeEl[];
  querySelectorAll: (sel: string) => FakeEl[];
  evaluate: (expr: string) => { snapshotLength: number; snapshotItem: (i: number) => unknown };
}

function makeEl(tag: string, attrs: Record<string, string> = {}, children: FakeEl[] = []): FakeEl {
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    attrsDict: attrs,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    children,
    parentNode: null,
  };
  for (const c of children) c.parentNode = el;
  return el;
}

function descendants(node: { children: FakeEl[] }): FakeEl[] {
  const out: FakeEl[] = [];
  for (const c of node.children) out.push(c, ...descendants(c));
  return out;
}

/** Supports exactly the selector forms these tests use: `tag`, `#id`, `.class`, `[attr]`, `[attr="v"]`. */
function matchesOne(el: FakeEl, sel: string): boolean {
  const trimmed = sel.trim();
  if (trimmed.startsWith('#')) return el.attrsDict['id'] === trimmed.slice(1);
  if (trimmed.startsWith('.')) return (el.attrsDict['class'] ?? '').split(' ').includes(trimmed.slice(1));
  if (trimmed.startsWith('[')) {
    const m = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(trimmed);
    if (m === null) return false;
    const [, name, value] = m;
    if (name === undefined) return false;
    return value === undefined ? name in el.attrsDict : el.attrsDict[name] === value;
  }
  if (trimmed === 'INVALID_SELECTOR[[[') throw new Error("'INVALID_SELECTOR[[[' is not a valid selector");
  return el.tagName.toLowerCase() === trimmed;
}

function fakeEvaluate(expr: string, root: FakeDoc): { snapshotLength: number; snapshotItem: (i: number) => unknown } {
  if (expr === 'INVALID[[[XPATH') throw new Error('The string did not match the expected pattern.');
  const m = /^\/\/([a-zA-Z][a-zA-Z0-9]*)(?:\[@([a-zA-Z-]+)="([^"]*)"\])?$/.exec(expr);
  const items: unknown[] = [];
  if (m !== null) {
    const tag = m[1] ?? '';
    const attr = m[2];
    const val = m[3];
    for (const el of descendants(root)) {
      if (el.tagName.toLowerCase() !== tag.toLowerCase()) continue;
      if (attr !== undefined && el.attrsDict[attr] !== val) continue;
      items.push(el);
    }
  }
  return { snapshotLength: items.length, snapshotItem: (i: number) => items[i] ?? null };
}

function buildDoc(tree: FakeEl): FakeDoc {
  const doc: FakeDoc = {
    children: [tree],
    querySelectorAll: (sel: string) => descendants(doc).filter((d) => matchesOne(d, sel)),
    evaluate: (expr: string) => fakeEvaluate(expr, doc),
  };
  // computeNodePath's up-walk terminates at `=== document`, so the top-level element's parentNode must
  // point back at the fake document (real `document` has no `.parentNode` at all, but `null` here would
  // make the walk bail with "no .children on the parent" before ever reaching the document check).
  tree.parentNode = doc;
  return doc;
}

function run(
  query: string,
  queryType: 'css' | 'xpath',
  doc: FakeDoc,
  existingPaths: readonly ExistingPathEntry[] = [],
  cap = 200,
): unknown {
  const context = vm.createContext({ document: doc });
  return vm.runInContext(buildDomQueryExpression(query, queryType, existingPaths, cap), context);
}

describe('buildDomQueryExpression', () => {
  it('produces a syntactically valid, self-contained JS expression', () => {
    expect(() => new vm.Script(`(${buildDomQueryExpression('div', 'css', [], 200)})`)).not.toThrow();
  });

  it('is an IIFE (evaluatable expression, not a statement)', () => {
    const expr = buildDomQueryExpression('div', 'css', [], 200);
    expect(expr.trimStart().startsWith('(')).toBe(true);
    expect(expr.trimEnd().endsWith(')')).toBe(true);
  });

  it('CSS: finds matches and reports {tag, attributes, existingRef: null, path} — no innerText/innerHTML', () => {
    const doc = buildDoc(makeEl('body', {}, [makeEl('div', { id: 'a' }), makeEl('div', { id: 'b' })]));
    const result = run('div', 'css', doc) as { ok: true; total: number; matches: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.total).toBe(2);
    expect(result.matches).toHaveLength(2);
    const first = result.matches[0] as Record<string, unknown>;
    expect(first['tag']).toBe('div');
    expect(first['attributes']).toEqual({ id: 'a' });
    expect(first['existingRef']).toBeNull();
    expect(first).not.toHaveProperty('innerText');
    expect(first).not.toHaveProperty('innerHTML');
    expect(Array.isArray(first['path'])).toBe(true);
  });

  it('a matched element reuses its EXISTING ref by identity instead of minting a new one', () => {
    const target = makeEl('div', { id: 'a' });
    const doc = buildDoc(makeEl('body', {}, [target]));
    // The existing ref's path resolves (via resolveNodePath) to the SAME element the query also finds:
    // document.children[0] is <body>, body.children[0] is `target` — one segment, two indices.
    const existingPaths: ExistingPathEntry[] = [{ ref: 7, path: [[0, 0]] }];
    const result = run('div', 'css', doc, existingPaths) as { matches: Record<string, unknown>[] };
    expect(result.matches[0]?.['existingRef']).toBe(7);
    // No path is computed for an already-tracked element — the host must not mint a second ref for it.
    expect(result.matches[0]?.['path']).toBeNull();
  });

  it('an untracked match gets path computed (light-DOM child-index address) for the host to mint a ref from', () => {
    const doc = buildDoc(makeEl('body', {}, [makeEl('div', {}, []), makeEl('span', { class: 'x' }, [])]));
    const result = run('.x', 'css', doc) as { matches: Record<string, unknown>[] };
    // document.children[0] is <body> (index 0), <span> is body's 2nd child (index 1) — one segment.
    expect(result.matches[0]?.['path']).toEqual([[0, 1]]);
  });

  it('computes the root element itself at path [[0]]', () => {
    const doc = buildDoc(makeEl('html', { id: 'root' }));
    const result = run('#root', 'css', doc) as { matches: Record<string, unknown>[] };
    expect(result.matches[0]?.['path']).toEqual([[0]]);
  });

  it('a node computeNodePath cannot address (e.g. across a shadow-root-like boundary) gets path: null', () => {
    const el = makeEl('div', { id: 'a' });
    // Simulate a shadow-root boundary: the parent has no `.children` (a ShadowRoot-ish stand-in), so the
    // light-DOM-only inverse walk must bail rather than guess.
    el.parentNode = { note: 'no .children here' } as unknown as FakeEl;
    const doc: FakeDoc = {
      children: [el],
      querySelectorAll: () => [el],
      evaluate: () => ({ snapshotLength: 0, snapshotItem: () => null }),
    };
    const result = run('div', 'css', doc) as { matches: Record<string, unknown>[] };
    expect(result.matches[0]?.['existingRef']).toBeNull();
    expect(result.matches[0]?.['path']).toBeNull();
  });

  it('caps matches while reporting the TRUE uncapped total', () => {
    const kids = Array.from({ length: 5 }, () => makeEl('li'));
    const doc = buildDoc(makeEl('ul', {}, kids));
    const result = run('li', 'css', doc, [], 3) as { total: number; matches: unknown[] };
    expect(result.total).toBe(5);
    expect(result.matches).toHaveLength(3);
  });

  it('a malformed CSS selector is caught and reported cleanly, never thrown', () => {
    const doc = buildDoc(makeEl('body'));
    const result = run('INVALID_SELECTOR[[[', 'css', doc) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not a valid selector');
  });

  it('XPath: finds matches via document.evaluate and reports the same shape as CSS', () => {
    const doc = buildDoc(makeEl('body', {}, [makeEl('div', { 'data-x': 'y' })]));
    const result = run('//div[@data-x="y"]', 'xpath', doc) as { ok: true; total: number; matches: Record<string, unknown>[] };
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.matches[0]?.['tag']).toBe('div');
  });

  it('XPath: a non-Element result (e.g. an attribute node) is filtered out, not fabricated into a match', () => {
    const attrNode = { nodeType: 2 };
    const doc: FakeDoc = {
      children: [],
      querySelectorAll: () => [],
      evaluate: () => ({ snapshotLength: 1, snapshotItem: () => attrNode }),
    };
    const result = run('//div/@data-x', 'xpath', doc) as { total: number; matches: unknown[] };
    expect(result.total).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it('an invalid XPath expression is caught and reported cleanly, never thrown', () => {
    const doc = buildDoc(makeEl('body'));
    const result = run('INVALID[[[XPATH', 'xpath', doc) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('caps the number of attributes read per element (defense in depth)', () => {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < 80; i++) attrs[`data-${String(i)}`] = 'v';
    const doc = buildDoc(makeEl('div', attrs));
    const result = run('div', 'css', doc) as { matches: Record<string, unknown>[] };
    const attributes = result.matches[0]?.['attributes'] as Record<string, string>;
    expect(Object.keys(attributes).length).toBeLessThanOrEqual(40);
  });

  it('no matches on the page reports total: 0 and an empty matches array', () => {
    const doc = buildDoc(makeEl('body'));
    const result = run('.nonexistent', 'css', doc) as { total: number; matches: unknown[] };
    expect(result.total).toBe(0);
    expect(result.matches).toEqual([]);
  });
});
