import { describe, it, expect } from 'vitest';
import { parseDomTree, type DomTreeResult } from './dom-tree.js';
import { MAX_INTERACTABLE_ELEMENTS } from './interactable.js';

const result = (nodes: DomTreeResult['nodes']): DomTreeResult => ({
  url: 'https://x',
  title: 'X',
  nodes,
});

describe('parseDomTree', () => {
  it('maps nodes to raw interactables and an aligned xpath list', () => {
    const { interactables, xpaths } = parseDomTree(
      result([
        { tag: 'a', xpath: '/html[1]/body[1]/a[1]', role: 'link', name: 'Blog', href: 'blog.html' },
        { tag: 'button', xpath: '/html[1]/body[1]/button[1]', role: 'button', name: 'Menu' },
      ]),
    );
    expect(interactables).toHaveLength(2);
    expect(xpaths).toEqual(['/html[1]/body[1]/a[1]', '/html[1]/body[1]/button[1]']);
    expect(interactables[0]).toMatchObject({ tag: 'a', role: 'link', name: 'Blog', href: 'blog.html' });
  });

  it('carries tag / value / disabled / attributes through', () => {
    const { interactables } = parseDomTree(
      result([
        {
          tag: 'input',
          xpath: '/x',
          role: 'textbox',
          name: 'Email',
          value: 'a@b.com',
          disabled: true,
          attributes: { type: 'email', 'aria-label': 'Email' },
        },
      ]),
    );
    expect(interactables[0]).toEqual({
      tag: 'input',
      role: 'textbox',
      name: 'Email',
      value: 'a@b.com',
      disabled: true,
      attributes: { type: 'email', 'aria-label': 'Email' },
    });
  });

  it('derives a file-input action from inputType=file', () => {
    const { interactables } = parseDomTree(
      result([
        {
          tag: 'input',
          xpath: '/x',
          role: 'button',
          name: 'Upload',
          inputType: 'file',
          accept: 'image/*',
          multiple: true,
        },
      ]),
    );
    expect(interactables[0]).toMatchObject({ inputKind: 'file', accept: 'image/*', multiple: true });
  });

  it('does not treat a non-file input as a file picker', () => {
    const { interactables } = parseDomTree(
      result([{ tag: 'input', xpath: '/x', role: 'textbox', name: 'Q', inputType: 'text' }]),
    );
    expect(interactables[0]?.inputKind).toBeUndefined();
  });

  it('drops empty href/value/attributes rather than emitting empties', () => {
    const { interactables } = parseDomTree(
      result([{ tag: 'div', xpath: '/x', role: '', name: 'Click', href: '', value: '', attributes: {} }]),
    );
    expect(interactables[0]).toEqual({ tag: 'div', role: '', name: 'Click' });
  });

  it('caps nodes AND xpaths together so refs stay aligned', () => {
    const many = Array.from({ length: MAX_INTERACTABLE_ELEMENTS + 25 }, (_, i) => ({
      tag: 'button',
      xpath: `/b[${String(i)}]`,
      role: 'button',
      name: 'x',
    }));
    const { interactables, xpaths } = parseDomTree(result(many));
    expect(interactables).toHaveLength(MAX_INTERACTABLE_ELEMENTS);
    expect(xpaths).toHaveLength(MAX_INTERACTABLE_ELEMENTS);
  });
});
