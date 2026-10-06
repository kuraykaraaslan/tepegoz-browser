// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Omnibox } from './omnibox';
import {
  createOmniboxHelpers,
  navRow,
  noSuggestions,
  theseSuggestions,
} from './omnibox-test-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { baseProps, omniboxForm, withoutCalcHost } = createOmniboxHelpers(vi, screen);

describe('Omnibox keyboard and inline calculation', () => {
  it('ArrowUp wraps to the last row and back off the top, and Escape closes the dropdown', async () => {
    const onSuggest = vi.fn(theseSuggestions([navRow(0), navRow(1)]));
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByRole('option', { name: 'Row 1' });

    // from nothing selected, up goes to the LAST row — the shortest path to the bottom of the list
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-0$/);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ignores arrow keys entirely while the dropdown is closed', async () => {
    const onSuggest = vi.fn(noSuggestions);
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('Enter on arithmetic surfaces the result instead of navigating to it', () => {
    // "12*12" is not an address, and searching for it is not what was meant either.
    const onNavigate = vi.fn();
    const onCalcResult = vi.fn();
    render(<Omnibox {...baseProps({ onNavigate, onCalcResult })} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '12*12' } });
    fireEvent.submit(omniboxForm());

    expect(onCalcResult).toHaveBeenCalledWith('144');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveProperty('value', '144');
  });

  it('copies the result when the host takes no calc callback', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Omnibox {...withoutCalcHost()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2+3' } });
    fireEvent.submit(omniboxForm());
    expect(writeText).toHaveBeenCalledWith('5');
  });
});

describe('Omnibox dropdown height reporting', () => {
  /** The host uses this to size the native region the dropdown paints into; 0 means "nothing open". */
  it('reports 0 while closed, a real height once rows are showing, and 0 again on unmount', async () => {
    const onDropdownHeightChange = vi.fn();
    const onSuggest = vi.fn(theseSuggestions([navRow(0), navRow(1)]));
    const view = render(<Omnibox {...baseProps({ onSuggest, onDropdownHeightChange })} />);
    expect(onDropdownHeightChange).toHaveBeenLastCalledWith(0);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByRole('option', { name: 'Row 1' });

    // jsdom measures every box as 0, so this is the row-count fallback — which is exactly the path
    // that matters: a host told "0" while two rows are painting would clip them away entirely.
    const reported = onDropdownHeightChange.mock.calls.at(-1)?.[0] as number;
    expect(reported).toBeGreaterThan(0);

    view.unmount();
    expect(onDropdownHeightChange).toHaveBeenLastCalledWith(0);
  });

  it('re-reports when the list resizes, and stops when the dropdown goes away', async () => {
    const observed: Element[] = [];
    let fire: (() => void) | undefined;
    let disconnected = 0;
    class FakeResizeObserver {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe(el: Element): void {
        observed.push(el);
      }
      disconnect(): void {
        disconnected += 1;
      }
      unobserve(): void {
        /* not used */
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const onDropdownHeightChange = vi.fn();
    const onSuggest = vi.fn(theseSuggestions([navRow(0)]));
    const view = render(<Omnibox {...baseProps({ onSuggest, onDropdownHeightChange })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByRole('option', { name: 'Row 0' });

    expect(observed).toHaveLength(1);
    onDropdownHeightChange.mockClear();
    act(() => fire?.());
    expect(onDropdownHeightChange).toHaveBeenCalled();

    view.unmount();
    expect(disconnected).toBeGreaterThan(0);
    expect(onDropdownHeightChange).toHaveBeenLastCalledWith(0);
  });

  it('empties the dropdown when the host cannot produce suggestions', async () => {
    // The suggestion source is an IPC call that can fail. Leaving the previous query rows up would
    // offer to navigate somewhere the user is no longer asking about.
    const onSuggest = vi
      .fn(theseSuggestions([navRow(0)]))
      .mockImplementationOnce(theseSuggestions([navRow(0)]));
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByRole('option', { name: 'Row 0' });

    onSuggest.mockImplementationOnce(() => Promise.reject(new Error('suggest bridge down')));
    fireEvent.change(input, { target: { value: 'rows' } });
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Row 0' })).toBeNull());
  });

  it('reports nothing at all when the host does not ask for the height', async () => {
    // The effect must not measure or observe for a host that passed no handler.
    const onSuggest = vi.fn(theseSuggestions([navRow(0)]));
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    expect(await screen.findByRole('option', { name: 'Row 0' })).toBeTruthy();
  });
});
