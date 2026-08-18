import { describe, expect, it } from 'vitest';
import { findByLocators, type PathNode } from './dom-path.js';

/** A duck-typed element the resolver accepts, matching what a real DOM node exposes. */
interface FakeEl extends PathNode {
  tagName?: string;
  innerText?: string;
  getAttribute?: (name: string) => string | null;
  children: FakeEl[];
  shadowRoot?: FakeEl | null;
  contentDocument?: FakeEl | null;
}

function el(
  tagName: string,
  text: string,
  attrs: Record<string, string> = {},
  children: FakeEl[] = [],
): FakeEl {
  return {
    tagName,
    innerText: text,
    children,
    getAttribute: (n: string) => attrs[n] ?? null,
    shadowRoot: null,
    contentDocument: null,
  };
}

const root = (children: FakeEl[]): FakeEl => ({ children, shadowRoot: null, contentDocument: null });

describe('locator cascade', () => {
  it('re-finds an element by tag, role and name after its path went stale', () => {
    const target = el('BUTTON', 'Accept all', { role: 'button' });
    const doc = root([el('DIV', '', {}, [el('SPAN', 'noise'), target])]);
    expect(findByLocators(doc, { tag: 'button', role: 'button', name: 'Accept all' })).toBe(target);
  });

  it('matches a control with no explicit role attribute (the common case)', () => {
    const target = el('BUTTON', 'Save');
    const doc = root([target]);
    expect(findByLocators(doc, { tag: 'button', role: 'button', name: 'Save' })).toBe(target);
  });

  it('prefers aria-label over text, matching how the scan named it', () => {
    const target = el('BUTTON', 'X', { 'aria-label': 'Close dialog' });
    const doc = root([target]);
    expect(findByLocators(doc, { tag: 'button', role: '', name: 'Close dialog' })).toBe(target);
  });

  it('REFUSES to choose between two identical controls', () => {
    const doc = root([el('BUTTON', 'Add to cart'), el('BUTTON', 'Add to cart')]);
    expect(findByLocators(doc, { tag: 'button', role: 'button', name: 'Add to cart' })).toBeNull();
  });

  it('returns null when nothing matches, rather than the closest thing', () => {
    const doc = root([el('BUTTON', 'Accept all')]);
    expect(findByLocators(doc, { tag: 'button', role: 'button', name: 'Reject all' })).toBeNull();
    expect(findByLocators(doc, { tag: 'a', role: 'link', name: 'Accept all' })).toBeNull();
  });

  it('does not match an element whose explicit role disagrees', () => {
    const doc = root([el('DIV', 'Menu', { role: 'presentation' })]);
    expect(findByLocators(doc, { tag: 'div', role: 'button', name: 'Menu' })).toBeNull();
  });

  it('pierces an open shadow root', () => {
    const target = el('BUTTON', 'Inside shadow');
    const host = el('DIV', '');
    host.shadowRoot = root([target]);
    expect(findByLocators(root([host]), { tag: 'button', role: '', name: 'Inside shadow' })).toBe(target);
  });

  it('pierces a same-origin iframe document', () => {
    const target = el('BUTTON', 'Inside frame');
    const frame = el('IFRAME', '');
    frame.tagName = 'IFRAME';
    frame.contentDocument = root([target]);
    expect(findByLocators(root([frame]), { tag: 'button', role: '', name: 'Inside frame' })).toBe(target);
  });

  it('collapses whitespace the way the scan does, so a reformatted label still matches', () => {
    const target = el('BUTTON', '  Accept   all\n');
    expect(findByLocators(root([target]), { tag: 'button', role: '', name: 'Accept all' })).toBe(target);
  });
});
