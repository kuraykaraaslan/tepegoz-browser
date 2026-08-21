import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildDomTreeExpression } from './build-dom-tree-script.js';

/**
 * Accessible-name resolution in the DEFAULT (render-DOM) scan pass — S2 PR3.
 *
 * The sibling `build-dom-tree-script.test.ts` only COMPILES the injection string, which proves nothing
 * about behaviour. Naming, unlike geometry, needs no layout engine: it is plain traversal over
 * `getAttribute`, `getRootNode`, and `el.labels`. So these tests **run** the real script inside a
 * `vm` context over a minimal fake DOM — the same script byte-for-byte that is injected into a page.
 *
 * What is deliberately faked (geometry, styles, hit-testing) is exactly what a real page provides and
 * what the eval harness exercises end to end; what is real here is the code path under test.
 */

interface FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  text?: string;
  children: FakeElement[];
  labels?: FakeElement[];
}

/** Build the fake element tree + the globals the script's traversal touches. */
function runScript(roots: FakeElement[]): { name: string; tag: string }[] {
  const byId = new Map<string, unknown>();

  const wrap = (spec: FakeElement): Record<string, unknown> => {
    const kids = spec.children.map(wrap);
    const el: Record<string, unknown> = {
      tagName: spec.tagName,
      children: kids,
      innerText: spec.text ?? '',
      textContent: spec.text ?? '',
      isContentEditable: false,
      onclick: null,
      shadowRoot: null,
      getAttribute: (n: string) => spec.attrs[n] ?? null,
      hasAttribute: (n: string) => n in spec.attrs,
      // Everything is a 20×20 box at the origin, visible and on top: geometry is not what is under test.
      getBoundingClientRect: () => ({
        width: 20,
        height: 20,
        top: 0,
        left: 0,
        right: 20,
        bottom: 20,
      }),
      contains: () => true,
    };
    if (spec.attrs['id'] !== undefined) byId.set(spec.attrs['id'], el);
    if (spec.labels !== undefined) el['labels'] = spec.labels.map(wrap);
    return el;
  };

  const wrapped = roots.map(wrap);
  const root: Record<string, unknown> = {
    children: wrapped,
    getElementById: (id: string) => byId.get(id) ?? null,
    // The script hit-tests through the element's own root; `contains()` above answers "on top", so any
    // non-null hit is accepted. Occlusion is a geometry concern and is not what these tests cover.
    elementFromPoint: () => ({ nodeName: 'STUB' }),
    location: { href: 'http://fixture/' },
    title: 'Fixture',
  };
  for (const el of wrapped) {
    el['ownerDocument'] = root;
    el['getRootNode'] = () => root;
    const stack = [...(el['children'] as Record<string, unknown>[])];
    while (stack.length > 0) {
      const child = stack.pop();
      if (child === undefined) continue;
      child['ownerDocument'] = root;
      child['getRootNode'] = () => root;
      stack.push(...(child['children'] as Record<string, unknown>[]));
    }
  }

  const win: Record<string, unknown> = {
    innerWidth: 800,
    innerHeight: 600,
    getComputedStyle: () => ({
      visibility: 'visible',
      display: 'block',
      opacity: '1',
      cursor: 'auto',
    }),
  };
  root['defaultView'] = win;

  const context = vm.createContext({ document: root, window: win });
  const result = vm.runInContext(buildDomTreeExpression(), context) as {
    nodes: { name: string; tag: string }[];
  };
  return result.nodes.map((n) => ({ name: n.name, tag: n.tag }));
}

const input = (attrs: Record<string, string>, labels?: FakeElement[]): FakeElement => ({
  tagName: 'INPUT',
  attrs,
  children: [],
  ...(labels !== undefined ? { labels } : {}),
});
const span = (id: string, text: string): FakeElement => ({
  tagName: 'SPAN',
  attrs: { id },
  text,
  children: [],
});
const label = (text: string): FakeElement => ({ tagName: 'LABEL', attrs: {}, text, children: [] });

describe('accessible-name resolution in the default scan pass', () => {
  it('names a field from a detached <label for=…> (the case the default path used to miss)', () => {
    const nodes = runScript([
      { tagName: 'FORM', attrs: {}, children: [input({ id: 'f1' }, [label('Company name')])] },
    ]);
    expect(nodes.find((n) => n.tag === 'input')?.name).toBe('Company name');
  });

  it('names a field from aria-labelledby pointing at a separate element', () => {
    const nodes = runScript([
      {
        tagName: 'FORM',
        attrs: {},
        children: [span('lbl', 'Contact person'), input({ id: 'f2', 'aria-labelledby': 'lbl' })],
      },
    ]);
    expect(nodes.find((n) => n.tag === 'input')?.name).toBe('Contact person');
  });

  it('joins multiple aria-labelledby ids IN ORDER', () => {
    const nodes = runScript([
      {
        tagName: 'FORM',
        attrs: {},
        children: [
          span('a', 'Invoice'),
          span('b', 'e-mail address'),
          input({ id: 'f3', 'aria-labelledby': 'a b' }),
        ],
      },
    ]);
    expect(nodes.find((n) => n.tag === 'input')?.name).toBe('Invoice e-mail address');
  });

  it('prefers aria-labelledby over aria-label, and aria-label over the native label', () => {
    const nodes = runScript([
      {
        tagName: 'FORM',
        attrs: {},
        children: [
          span('r', 'Referenced'),
          input({ id: 'x', 'aria-labelledby': 'r', 'aria-label': 'Direct' }, [label('Native')]),
          input({ id: 'y', 'aria-label': 'Direct' }, [label('Native')]),
        ],
      },
    ]);
    const inputs = nodes.filter((n) => n.tag === 'input');
    expect(inputs[0]?.name).toBe('Referenced');
    expect(inputs[1]?.name).toBe('Direct');
  });

  it('falls back to the placeholder only when nothing names the field', () => {
    const nodes = runScript([
      { tagName: 'FORM', attrs: {}, children: [input({ id: 'z', placeholder: 'Search…' })] },
    ]);
    expect(nodes.find((n) => n.tag === 'input')?.name).toBe('Search…');
  });

  it('ignores an aria-labelledby that points at nothing rather than inventing a name', () => {
    const nodes = runScript([
      { tagName: 'FORM', attrs: {}, children: [input({ id: 'q', 'aria-labelledby': 'missing' })] },
    ]);
    expect(nodes.find((n) => n.tag === 'input')?.name).toBe('');
  });
});
