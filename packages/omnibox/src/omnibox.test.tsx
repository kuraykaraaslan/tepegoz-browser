// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Omnibox, type OmniboxProps, type OmniboxSecurityLabels } from './omnibox';
import type { OmniboxSuggestion } from './omnibox-suggest';

const securityLabels: OmniboxSecurityLabels = {
  button: 'View site information',
  secure: 'Connection is secure',
  notSecure: 'Not secure',
  dangerous: 'Dangerous',
  internal: 'Tepegöz page',
  file: 'Local file',
};

const noSuggestions = (): Promise<OmniboxSuggestion[]> => Promise.resolve([]);
const oneSuggestion =
  (s: OmniboxSuggestion) => (): Promise<OmniboxSuggestion[]> => Promise.resolve([s]);
const theseSuggestions =
  (list: OmniboxSuggestion[]) => (): Promise<OmniboxSuggestion[]> => Promise.resolve(list);

const navRow = (i: number): OmniboxSuggestion => ({
  key: `r${i}`,
  kind: 'history',
  title: `Row ${i}`,
  action: { type: 'navigate', input: `https://row-${i}.test/` },
});

function baseProps(over: Partial<OmniboxProps> = {}): OmniboxProps {
  return {
    currentUrl: 'https://example.test/',
    placeholder: 'Search or enter address',
    onNavigate: vi.fn(),
    onCalcResult: vi.fn(),
    onSuggest: vi.fn(noSuggestions),
    ...over,
  };
}

/** Wraps Omnibox and counts every render so a runaway effect loop is observable, not just a timeout. */
function CountingOmnibox({ renders, ...props }: OmniboxProps & { renders: { current: number } }) {
  const count = useRef(0);
  count.current += 1;
  renders.current = count.current;
  return <Omnibox {...props} />;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The omnibox renders a single wrapping `<form>`; grab it for an explicit submit. */
function omniboxForm(): HTMLFormElement {
  const form = screen.getByRole('combobox').closest('form');
  if (form === null) throw new Error('omnibox form not found');
  return form;
}

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

    expect(await screen.findByText('Duck facts')).toBeTruthy();
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
    expect(await screen.findByText('Two plus two clubhouse')).toBeTruthy();

    fireEvent.change(input, { target: { value: '2+2' } });
    await waitFor(() => expect(screen.queryByText('Two plus two clubhouse')).toBeNull());
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
    expect(await screen.findByText('Duck facts')).toBeTruthy();

    fireEvent.submit(omniboxForm());

    expect(onNavigate).toHaveBeenCalledWith('duck');
    await waitFor(() => expect(screen.queryByText('Duck facts')).toBeNull());
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
    expect(await screen.findByText('Row 1')).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Row 1' }));
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(screen.getByRole('option', { name: 'Row 1' }).getAttribute('aria-selected')).toBe('false');

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
    await screen.findByText('Row 1');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/);

    fireEvent.submit(omniboxForm());
    expect(onNavigate).toHaveBeenCalledWith('https://row-1.test/');
  });

  it('shows a lock for a secure page and no "Not secure" text', () => {
    const { container } = render(
      <Omnibox {...baseProps({ securityLevel: 'secure', securityLabels, onOpenSiteInfo: vi.fn() })} />,
    );
    expect(container.querySelector('svg[data-icon="lock"]')).not.toBeNull();
    expect(screen.queryByText('Not secure')).toBeNull();
    expect(screen.getByRole('button', { name: 'View site information' })).toBeTruthy();
  });

  it('shows a red "Not secure" label + triangle for an http page and opens the bubble with a rect', () => {
    const onOpenSiteInfo = vi.fn<(a: { x: number; y: number; width: number; height: number }) => void>();
    const { container } = render(
      <Omnibox
        {...baseProps({
          currentUrl: 'http://localhost:3000/',
          securityLevel: 'not-secure',
          securityLabels,
          onOpenSiteInfo,
        })}
      />,
    );
    expect(container.querySelector('svg[data-icon="triangle-exclamation"]')).not.toBeNull();
    expect(screen.getByText('Not secure')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View site information' }));
    expect(onOpenSiteInfo).toHaveBeenCalledTimes(1);
    const anchor = onOpenSiteInfo.mock.calls[0]![0];
    expect(typeof anchor.x).toBe('number');
    expect(typeof anchor.y).toBe('number');
    expect(typeof anchor.width).toBe('number');
    expect(typeof anchor.height).toBe('number');
  });

  it('renders no site-info control for an unknown level or without labels', () => {
    const { container, rerender } = render(
      <Omnibox {...baseProps({ securityLevel: 'unknown', securityLabels, onOpenSiteInfo: vi.fn() })} />,
    );
    expect(screen.queryByRole('button', { name: 'View site information' })).toBeNull();
    rerender(<Omnibox {...baseProps({ securityLevel: 'secure', onOpenSiteInfo: vi.fn() })} />);
    expect(container.querySelector('svg[data-icon="lock"]')).toBeNull();
  });

  it('renders the glyph as a plain indicator (no button) when onOpenSiteInfo is omitted', () => {
    render(<Omnibox {...baseProps({ securityLevel: 'internal', securityLabels })} />);
    expect(screen.queryByRole('button', { name: 'View site information' })).toBeNull();
  });

  it('gives a navigation suggestion a globe, not the search glyph (§ A6)', async () => {
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'n',
              kind: 'navigate',
              title: 'example.com',
              action: { type: 'navigate', input: 'example.com' },
            }),
          ),
        })}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'example' } });
    await screen.findByText('example.com');

    expect(container.querySelector('li svg[data-icon="globe"]')).not.toBeNull();
    expect(container.querySelector('li svg[data-icon="magnifying-glass"]')).toBeNull();
  });
});
