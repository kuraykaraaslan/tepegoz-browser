import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildDomTreeExpression } from './build-dom-tree-script.js';

/**
 * Two-tier interactivity in the DEFAULT (render-DOM) scan — the fix for the perception-economy failure a
 * real LinkedIn people-search snapshot exposed (`ai_agent_export_2026-08-21_13-24-16`): 200 indexed
 * elements covered only four-and-a-half result rows, a third of them nameless `svg`/`path`/`span`, and the
 * word "Connect" appeared fourteen times because `cursor` is an INHERITED CSS property and every glyph
 * inside the button reported `pointer`.
 *
 * Like the sibling `build-dom-tree-names.test.ts`, these run the REAL injected script inside a `vm` over a
 * minimal fake DOM. What is faked is geometry and hit-testing; what is real is the traversal and the
 * strong/weak decision under test — and, unlike the names harness, `cursor` here is per-element and
 * INHERITED from the parent unless overridden, because that inheritance is the whole bug.
 */

interface FakeElement {
  tagName: string;
  attrs?: Record<string, string>;
  text?: string;
  /** Overrides the cursor for this element AND (by inheritance) its subtree. */
  cursor?: string;
  /** Mirrors a DOM `value` PROPERTY — `HTMLLIElement.value` is 0 on an ordinary <li>. */
  value?: number | string;
  children?: FakeElement[];
}

interface EmittedNode {
  tag: string;
  name: string;
  value?: string;
}

function runScript(roots: FakeElement[]): EmittedNode[] {
  const styles = new WeakMap<object, { cursor: string }>();

  const wrap = (spec: FakeElement, inheritedCursor: string): Record<string, unknown> => {
    const cursor = spec.cursor ?? inheritedCursor;
    const el: Record<string, unknown> = {
      tagName: spec.tagName,
      children: (spec.children ?? []).map((c) => wrap(c, cursor)),
      innerText: spec.text ?? '',
      textContent: spec.text ?? '',
      isContentEditable: false,
      onclick: null,
      shadowRoot: null,
      getAttribute: (n: string) => spec.attrs?.[n] ?? null,
      hasAttribute: (n: string) => spec.attrs !== undefined && n in spec.attrs,
      // A 20×20 box at the origin: well under the wrapper-area fraction, visible, and (via contains) on top.
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
    if (spec.value !== undefined) el['value'] = spec.value;
    styles.set(el, { visibility: 'visible', display: 'block', opacity: '1', cursor } as never);
    return el;
  };

  const wrapped = roots.map((r) => wrap(r, 'auto'));
  const root: Record<string, unknown> = {
    children: wrapped,
    getElementById: () => null,
    elementFromPoint: () => ({ nodeName: 'STUB' }),
    location: { href: 'http://fixture/' },
    title: 'Fixture',
  };
  const attach = (el: Record<string, unknown>): void => {
    el['ownerDocument'] = root;
    el['getRootNode'] = (): unknown => root;
    for (const kid of el['children'] as Record<string, unknown>[]) attach(kid);
  };
  for (const el of wrapped) attach(el);

  const win: Record<string, unknown> = {
    innerWidth: 800,
    innerHeight: 600,
    getComputedStyle: (el: object) =>
      styles.get(el) ?? { visibility: 'visible', display: 'block', opacity: '1', cursor: 'auto' },
  };
  root['defaultView'] = win;

  const context = vm.createContext({ document: root, window: win });
  const result = vm.runInContext(buildDomTreeExpression(), context) as { nodes: EmittedNode[] };
  return result.nodes;
}

const el = (
  tagName: string,
  attrs: Record<string, string>,
  children: FakeElement[] = [],
  text?: string,
): FakeElement => ({ tagName, attrs, children, ...(text !== undefined ? { text } : {}) });

/** One LinkedIn search-result row: a whole-card link, and a Connect button wrapped in labelled divs. */
const resultRow = (person: string): FakeElement => ({
  tagName: 'DIV',
  attrs: {},
  cursor: 'pointer', // the card region is clickable — every descendant inherits this
  children: [
    el('A', { href: `/in/${person}` }, [], `${person} • 2nd Software Engineer İzmir Connect`),
    el('DIV', {}, [
      el('DIV', {}, [
        el('BUTTON', { 'aria-label': `Invite ${person} to connect` }, [
          el('SVG', {}, [el('PATH', {})]),
          el('SPAN', {}, [], 'Connect'),
        ]),
      ]),
    ]),
    el('P', {}, [el('SPAN', {}, [], 'İzmir, Türkiye')], 'İzmir, Türkiye'),
  ],
});

describe('two-tier interactivity (perception economy)', () => {
  it('indexes a result row as its two real controls, not as every glyph and wrapper', () => {
    const nodes = runScript([resultRow('berkay-akar')]);
    expect(nodes.map((n) => n.tag)).toEqual(['a', 'button']);
    expect(nodes[1]?.name).toBe('Invite berkay-akar to connect');
  });

  it('costs a constant few elements per row, so a 10-row page fits the budget', () => {
    const rows = Array.from({ length: 10 }, (_, i) => resultRow(`person-${String(i)}`));
    const nodes = runScript(rows);
    // Before the fix the same shape emitted 8 nodes per row (card link, 3 wrapper divs, button, svg,
    // path, span) plus the text elements — the budget ran out around row four on the real page.
    expect(nodes).toHaveLength(20);
  });

  it('keeps a genuine div-button that no real control sits above or below', () => {
    const nodes = runScript([
      el('DIV', {}, [{ tagName: 'DIV', attrs: {}, cursor: 'pointer', text: 'Show more results' }]),
    ]);
    expect(nodes.map((n) => n.name)).toEqual(['Show more results']);
  });

  it('retracts a pointer-cursor wrapper once a real control turns up inside it', () => {
    const nodes = runScript([
      {
        tagName: 'DIV',
        attrs: {},
        cursor: 'pointer',
        text: 'Card wrapper',
        children: [el('BUTTON', { 'aria-label': 'Apply now' })],
      },
    ]);
    expect(nodes.map((n) => n.name)).toEqual(['Apply now']);
  });

  it('does not report a bogus value for a non-form element that happens to have one', () => {
    const nodes = runScript([
      {
        tagName: 'LI',
        attrs: {},
        cursor: 'pointer',
        text: 'Second',
        value: 0, // HTMLLIElement.value — the model used to be shown `= "0"` for every list item
        children: [],
      },
    ]);
    expect(nodes[0]?.value).toBeUndefined();
  });
});
