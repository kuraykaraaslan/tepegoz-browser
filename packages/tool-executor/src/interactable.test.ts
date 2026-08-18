import { describe, it, expect } from 'vitest';
import {
  isInteractableRole,
  isEditableRole,
  finalizeElements,
  MAX_INTERACTABLE_ELEMENTS,
  type RawInteractable,
} from './interactable.js';
import { renderElementsText } from './element-render.js';

describe('isInteractableRole', () => {
  it('accepts interactive control roles (case-insensitive)', () => {
    expect(isInteractableRole('button')).toBe(true);
    expect(isInteractableRole('link')).toBe(true);
    expect(isInteractableRole('TEXTBOX')).toBe(true);
  });

  it('rejects static/structural roles', () => {
    expect(isInteractableRole('heading')).toBe(false);
    expect(isInteractableRole('paragraph')).toBe(false);
    expect(isInteractableRole('img')).toBe(false);
  });
});

describe('isEditableRole', () => {
  it('marks text-entry roles editable', () => {
    expect(isEditableRole('textbox')).toBe(true);
    expect(isEditableRole('searchbox')).toBe(true);
    expect(isEditableRole('button')).toBe(false);
  });
});

describe('finalizeElements', () => {
  it('assigns sequential 1-based refs preserving input order', () => {
    const raw: RawInteractable[] = [
      { role: 'button', name: 'Login' },
      { role: 'textbox', name: 'Email' },
    ];
    const { elements } = finalizeElements(raw);
    expect(elements.map((e) => e.ref)).toEqual([1, 2]);
    expect(elements[1]?.name).toBe('Email');
  });

  it('strips zero-width injection from labels and reports the flag', () => {
    const raw: RawInteractable[] = [{ role: 'button', name: 'Cli' + String.fromCharCode(0x200b) + 'ck me' }];
    const { elements, flags } = finalizeElements(raw);
    expect(elements[0]?.name).toBe('Click me');
    expect(flags).toContain('zero_width');
  });

  it('keeps non-empty input values but drops empty ones', () => {
    const raw: RawInteractable[] = [
      { role: 'textbox', name: 'Email', value: 'a@b.com' },
      { role: 'textbox', name: 'Password', value: '' },
    ];
    const { elements } = finalizeElements(raw);
    expect(elements[0]?.value).toBe('a@b.com');
    expect(elements[1]?.value).toBeUndefined();
  });

  it('flags disabled controls', () => {
    const { elements } = finalizeElements([{ role: 'button', name: 'Submit', disabled: true }]);
    expect(elements[0]?.disabled).toBe(true);
  });

  it('carries render-DOM tag + sanitized href through', () => {
    const { elements } = finalizeElements([
      { role: 'link', name: 'Blog', tag: 'A', href: 'https://x/blog' },
    ]);
    expect(elements[0]).toMatchObject({ tag: 'a', href: 'https://x/blog' });
  });

  it('keeps only allow-listed attributes and drops the rest', () => {
    const { elements } = finalizeElements([
      {
        role: 'button',
        name: 'Menu',
        tag: 'button',
        attributes: { 'aria-expanded': 'false', onclick: 'evil()', style: 'x', 'data-testid': 'nav' },
      },
    ]);
    expect(elements[0]?.attributes).toEqual({ 'aria-expanded': 'false', 'data-testid': 'nav' });
  });

  it('sanitizes attribute values and reports the flag', () => {
    const { elements, flags } = finalizeElements([
      { role: 'button', name: 'x', tag: 'button', attributes: { title: 'a' + String.fromCharCode(0x200b) + 'b' } },
    ]);
    expect(elements[0]?.attributes?.title).toBe('ab');
    expect(flags).toContain('zero_width');
  });

  it('caps the element set to guard against hostile pages', () => {
    const raw: RawInteractable[] = Array.from({ length: MAX_INTERACTABLE_ELEMENTS + 50 }, () => ({
      role: 'button',
      name: 'x',
    }));
    const { elements } = finalizeElements(raw);
    expect(elements).toHaveLength(MAX_INTERACTABLE_ELEMENTS);
  });
});

describe('renderElementsText', () => {
  it('renders a compact, ref-prefixed listing', () => {
    const { elements } = finalizeElements([
      { role: 'button', name: 'Login' },
      { role: 'textbox', name: 'Email', value: 'a@b.com' },
      { role: 'button', name: 'Off', disabled: true },
    ]);
    expect(renderElementsText(elements)).toBe(
      '[1] button "Login"\n[2] textbox "Email" = "a@b.com"\n[3] button "Off" (disabled)',
    );
  });

  it('handles the empty case', () => {
    expect(renderElementsText([])).toBe('(no interactable elements found)');
  });

  it('renders render-DOM elements as pseudo-HTML with href + attributes', () => {
    const { elements } = finalizeElements([
      { role: 'link', name: 'Blog', tag: 'a', href: 'blog.html' },
      { role: 'button', name: 'Menu', tag: 'button', attributes: { 'aria-expanded': 'false' } },
    ]);
    expect(renderElementsText(elements)).toBe(
      '[1]<a href="blog.html">Blog</a>\n[2]<button aria-expanded="false">Menu</button>',
    );
  });

  it('surfaces an overriding role but suppresses a tag-implicit one', () => {
    const { elements } = finalizeElements([
      { role: 'button', name: 'Subscribe', tag: 'div' }, // div acting as a button → role shown
      { role: 'link', name: 'Home', tag: 'a', href: 'i.html' }, // a→link is implicit → role hidden
    ]);
    expect(renderElementsText(elements)).toBe(
      '[1]<div role="button">Subscribe</div>\n[2]<a href="i.html">Home</a>',
    );
  });

  it('self-closes an unnamed tagged element', () => {
    const { elements } = finalizeElements([
      { role: 'textbox', name: '', tag: 'input', attributes: { placeholder: 'Search' } },
    ]);
    expect(renderElementsText(elements)).toBe('[1]<input placeholder="Search" />');
  });

  it('prefixes new-since-last-snapshot elements with * (both formats)', () => {
    const { elements } = finalizeElements([
      { role: 'link', name: 'Blog', tag: 'a', href: 'b.html', isNew: true },
      { role: 'button', name: 'Old' }, // a11y (legacy) element, not new
      { role: 'link', name: 'New', isNew: true }, // a11y element, new
    ]);
    expect(renderElementsText(elements)).toBe(
      '*[1]<a href="b.html">Blog</a>\n[2] button "Old"\n*[3] link "New"',
    );
  });
});
