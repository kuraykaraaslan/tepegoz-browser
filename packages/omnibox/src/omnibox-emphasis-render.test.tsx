// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Omnibox } from './omnibox';
import type { OmniboxSuggestion } from './omnibox-suggest';
import { createOmniboxHelpers, oneSuggestion } from './omnibox-test-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { baseProps } = createOmniboxHelpers(vi, screen);

describe('Omnibox matched-substring emphasis', () => {
  /** Type `query`, wait for the one suggestion row, return its `<li>`. */
  async function rowFor(s: OmniboxSuggestion, query: string): Promise<HTMLElement> {
    render(<Omnibox {...baseProps({ onSuggest: vi.fn(oneSuggestion(s)) })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: query } });
    return screen.findByRole('option', { name: s.subtitle ? `${s.title} ${s.subtitle}` : s.title });
  }

  it('wraps the matched span of the title in the emphasis class, original case kept', async () => {
    const row = await rowFor(
      {
        key: 'h',
        kind: 'history',
        title: 'Example Blog',
        action: { type: 'navigate', input: 'https://example.com/blog' },
      },
      'exam',
    );
    const bold = row.querySelectorAll('.font-semibold');
    expect(Array.from(bold, (b) => b.textContent)).toEqual(['Exam']);
    // The row is still exactly its own text — nothing added, nothing lost.
    expect(row.textContent).toBe('Example Blog');
  });

  it('emphasises the URL / secondary line too', async () => {
    const row = await rowFor(
      {
        key: 'h',
        kind: 'history',
        title: 'Docs',
        subtitle: 'https://example.com/guide',
        action: { type: 'navigate', input: 'https://example.com/guide' },
      },
      'example',
    );
    const bold = Array.from(row.querySelectorAll('.font-semibold'), (b) => b.textContent);
    expect(bold).toContain('example');
  });

  it('renders segments as plain text nodes — never raw HTML', async () => {
    const row = await rowFor(
      {
        key: 'h',
        kind: 'history',
        title: '<b>pwn</b> and world',
        action: { type: 'navigate', input: 'https://x.test/' },
      },
      'world',
    );
    // The angle-bracket text survived as literal text, and no <b> element was injected.
    expect(row.textContent).toBe('<b>pwn</b> and world');
    expect(row.querySelector('b')).toBeNull();
    expect(row.innerHTML).not.toContain('<b>pwn');
  });

  it('is Turkish-correct: typing "sisli" emphasises "Şişli"', async () => {
    const row = await rowFor(
      {
        key: 'b',
        kind: 'bookmark',
        title: 'Şişli Belediyesi',
        action: { type: 'navigate', input: 'https://sisli.bel.tr/' },
      },
      'sisli',
    );
    const bold = Array.from(row.querySelectorAll('.font-semibold'), (b) => b.textContent);
    expect(bold).toEqual(['Şişli']);
  });

  it('adds no emphasis when nothing matches', async () => {
    const row = await rowFor(
      {
        key: 'h',
        kind: 'history',
        title: 'Totally unrelated',
        action: { type: 'navigate', input: 'https://u.test/' },
      },
      'zzz',
    );
    expect(row.querySelector('.font-semibold')).toBeNull();
  });
});
