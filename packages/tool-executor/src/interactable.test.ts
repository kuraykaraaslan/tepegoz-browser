import { describe, it, expect } from 'vitest';
import {
  isInteractableRole,
  isEditableRole,
  finalizeElements,
  renderElementsText,
  MAX_INTERACTABLE_ELEMENTS,
  type RawInteractable,
} from './interactable.js';

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
});
