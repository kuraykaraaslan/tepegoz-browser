import { describe, expect, it } from 'vitest';
import { diffElements, digestOf, renderDiffedElements } from './elements-diff.js';
import { renderElementTsv } from './element-render.js';
import type { InteractableElement } from './interactable.js';

function el(
  ref: number,
  name: string,
  over: Partial<InteractableElement> = {},
): InteractableElement {
  return { ref, role: 'button', name, tag: 'button', ...over };
}

/** The listing renderer the browser-tools layer uses, so the tests exercise the shipped shape. */
const render = (e: InteractableElement, change: 'added' | 'changed' | 'unchanged'): string =>
  change === 'changed' ? `~${renderElementTsv(e)}` : renderElementTsv(e);

describe('snapshot diffing', () => {
  it('calls everything added on a first look (never elides a page the model has not seen)', () => {
    const elements = [el(1, 'A'), el(2, 'B')];
    expect(diffElements(elements, null).status).toEqual(['added', 'added']);
  });

  it('reports added, changed, unchanged and removed against the previous snapshot', () => {
    const before = [el(1, 'A'), el(2, 'B'), el(3, 'C')];
    const digest = digestOf(before, 1);
    const after = [el(1, 'A'), el(2, 'B', { disabled: true }), el(4, 'D')];
    const diff = diffElements(after, digest);
    expect(diff.status).toEqual(['unchanged', 'changed', 'added']);
    expect(diff.removed).toEqual([{ ref: 3, label: 'C' }]);
    expect(diff.since).toBe(1);
  });

  it('treats a typed value as a change, not a new element', () => {
    const before = [el(1, 'Email', { role: 'textbox', tag: 'input' })];
    const after = [el(1, 'Email', { role: 'textbox', tag: 'input', value: 'a@b.test' })];
    expect(diffElements(after, digestOf(before, 1)).status).toEqual(['changed']);
  });
});

describe('unchanged-region elision', () => {
  const many = Array.from({ length: 12 }, (_, i) => el(i + 1, `Row ${String(i + 1)}`));

  it('collapses a long unchanged run into one marker that names the refs', () => {
    const digest = digestOf(many, 3);
    const out = renderDiffedElements(many, diffElements(many, digest), render);
    expect(out).toBe('§ 12 elements unchanged since step 3 (refs 1–12 still valid)');
  });

  it('never elides an element that changed, added, or went away', () => {
    const digest = digestOf(many, 3);
    // One relabelled row (a new identity, hence a new ref), one gone, nine untouched — the fixture shape.
    const after = [...many.slice(0, 5), el(99, 'Row 6 (moved)'), ...many.slice(7)];
    const out = renderDiffedElements(after, diffElements(after, digest), render);
    expect(out).toContain('Row 6 (moved)');
    expect(out).toContain('gone since step 3');
    expect(out).toContain('[6]');
    expect(out).toContain('[7]');
    // The untouched rows around the change are still collapsed.
    expect(out).toContain('elements unchanged since step 3');
  });

  it('leaves a short unchanged run listed — local context beats the tokens saved', () => {
    const before = [el(1, 'A'), el(2, 'B'), el(3, 'C')];
    const after = [el(1, 'A'), el(2, 'B'), el(3, 'C', { disabled: true })];
    const out = renderDiffedElements(after, diffElements(after, digestOf(before, 2)), render);
    expect(out).not.toContain('unchanged since');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  it('renders nothing-at-all honestly rather than as an empty diff', () => {
    expect(renderDiffedElements([], diffElements([], null), render)).toBe(
      '(no interactable elements found)',
    );
  });
});

describe('compact tabular rendering', () => {
  it('puts each column once and keeps the new-element marker', () => {
    const row = renderElementTsv(el(3, 'Accept', { isNew: true, href: 'https://x.test/' }));
    expect(row.split('\t')).toEqual(['*[3]', 'button', 'button', 'Accept', 'https://x.test/', '']);
  });

  it('strips tabs from page-controlled text so a page cannot forge a column', () => {
    const row = renderElementTsv(el(1, 'Ac\tcept\nnow'));
    expect(row.split('\t')[3]).toBe('Ac cept now');
  });

  it('folds value, disabled and attributes into one state column', () => {
    const row = renderElementTsv(
      el(2, 'Email', {
        role: 'textbox',
        tag: 'input',
        value: 'a@b',
        disabled: true,
        attributes: { required: 'true' },
      }),
    );
    expect(row.split('\t')[5]).toBe('value="a@b" disabled required="true"');
  });
});
