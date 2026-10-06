// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Omnibox } from './omnibox';
import type { OmniboxSuggestion } from './omnibox-suggest';
import {
  CountingOmnibox,
  createOmniboxHelpers,
  navRow,
  noSuggestions,
  oneSuggestion,
  theseSuggestions,
} from './omnibox-test-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { baseProps, omniboxForm } = createOmniboxHelpers(vi, screen);

describe('Omnibox', () => {
  it('renders the input with the current URL', () => {
    render(<Omnibox {...baseProps()} />);
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'https://example.test/');
  });

  it('does not spin the suggestion effect when arithmetic is typed (renderer-hang regression)', () => {
    const renders = { current: 0 };
    const onSuggest = vi.fn(noSuggestions);
    render(<CountingOmnibox {...baseProps({ onSuggest })} renders={renders} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2+2' } });

    // Before the fix this branch re-queued itself forever: each render built a fresh `calc` object,
    // the effect cleared the (already empty) suggestions into a brand-new array, and that re-render
    // produced another fresh `calc`. The test worker died at the suite timeout, never the per-test one.
    expect(renders.current).toBeLessThan(15);
    // Arithmetic shows the inline result and never asks the host for suggestions.
    expect(screen.getByText('= 4')).toBeTruthy();
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it('focuses and selects the box when the host bumps focusToken (Ctrl+L, § A7)', () => {
    const { rerender } = render(<Omnibox {...baseProps({ focusToken: 0 })} />);
    const input = screen.getByRole<HTMLInputElement>('combobox');
    // 0 is ignored: a browser that grabbed the address bar on every mount would fight the page.
    expect(document.activeElement).not.toBe(input);

    rerender(<Omnibox {...baseProps({ focusToken: 1 })} />);
    expect(document.activeElement).toBe(input);
    // Selected, not just focused — Ctrl+L is how you REPLACE the URL, so typing must overwrite it.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('focuses again on a second press, which a boolean flag could not do', () => {
    const { rerender } = render(<Omnibox {...baseProps({ focusToken: 1 })} />);
    const input = screen.getByRole('combobox');
    input.blur();
    expect(document.activeElement).not.toBe(input);

    rerender(<Omnibox {...baseProps({ focusToken: 2 })} />);
    expect(document.activeElement).toBe(input);
  });

  it('still asks the host for suggestions on a normal query', async () => {
    const suggestion: OmniboxSuggestion = {
      key: 'h1',
      kind: 'history',
      title: 'Duck facts',
      action: { type: 'navigate', input: 'https://duck.test/' },
    };
    const onSuggest = vi.fn(oneSuggestion(suggestion));
    render(<Omnibox {...baseProps({ onSuggest })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'duck' } });

    expect(await screen.findByRole('option', { name: 'Duck facts' })).toBeTruthy();
    expect(onSuggest).toHaveBeenCalledWith('duck');
  });

  it('clears any open dropdown the moment the query becomes arithmetic', async () => {
    const suggestion: OmniboxSuggestion = {
      key: 'h1',
      kind: 'history',
      title: 'Two plus two clubhouse',
      action: { type: 'navigate', input: 'https://two.test/' },
    };
    const onSuggest = vi.fn(oneSuggestion(suggestion));
    render(<Omnibox {...baseProps({ onSuggest })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'two' } });
    expect(await screen.findByRole('option', { name: 'Two plus two clubhouse' })).toBeTruthy();

    fireEvent.change(input, { target: { value: '2+2' } });
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Two plus two clubhouse' })).toBeNull(),
    );
    expect(screen.getByText('= 4')).toBeTruthy();
  });

  it('closes the dropdown when Enter submits the typed value (§ A8)', async () => {
    const suggestion: OmniboxSuggestion = {
      key: 'h1',
      kind: 'history',
      title: 'Duck facts',
      action: { type: 'navigate', input: 'https://duck.test/' },
    };
    const onNavigate = vi.fn();
    const onSuggest = vi.fn(oneSuggestion(suggestion));
    render(<Omnibox {...baseProps({ onSuggest, onNavigate })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'duck' } });
    expect(await screen.findByRole('option', { name: 'Duck facts' })).toBeTruthy();

    fireEvent.submit(omniboxForm());

    expect(onNavigate).toHaveBeenCalledWith('duck');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Duck facts' })).toBeNull());
  });

  it('a debounced fetch in flight cannot reopen a dropdown that was already dismissed (§ A9)', async () => {
    vi.useFakeTimers();
    const suggestion: OmniboxSuggestion = {
      key: 'h1',
      kind: 'history',
      title: 'Duck facts',
      action: { type: 'navigate', input: 'https://duck.test/' },
    };
    const onSuggest = vi.fn(oneSuggestion(suggestion));
    render(<Omnibox {...baseProps({ onSuggest })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'duck' } });
    // The debounce timer is scheduled but has NOT fired yet — dismiss the box before it does.
    fireEvent.submit(omniboxForm());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // closeSuggestions cleared the pending timer, so the fetch never ran and nothing re-opened.
    expect(onSuggest).not.toHaveBeenCalled();
    expect(screen.queryByText('Duck facts')).toBeNull();
  });

  it('hovering a row never moves aria-activedescendant or re-targets Enter (§ A10)', async () => {
    const onNavigate = vi.fn();
    const onSuggest = vi.fn(theseSuggestions([navRow(0), navRow(1)]));
    render(<Omnibox {...baseProps({ onSuggest, onNavigate })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    expect(await screen.findByRole('option', { name: 'Row 1' })).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Row 1' }));
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(screen.getByRole('option', { name: 'Row 1' }).getAttribute('aria-selected')).toBe(
      'false',
    );

    fireEvent.submit(omniboxForm());
    // Enter ran the default (navigate the typed text), NOT the hovered row.
    expect(onNavigate).toHaveBeenCalledWith('row');
    expect(onNavigate).not.toHaveBeenCalledWith('https://row-1.test/');
  });

  it('arrow keys drive aria-activedescendant and what Enter opens (§ A10)', async () => {
    const onNavigate = vi.fn();
    const onSuggest = vi.fn(theseSuggestions([navRow(0), navRow(1)]));
    render(<Omnibox {...baseProps({ onSuggest, onNavigate })} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByRole('option', { name: 'Row 1' });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/);

    fireEvent.submit(omniboxForm());
    expect(onNavigate).toHaveBeenCalledWith('https://row-1.test/');
  });
});
