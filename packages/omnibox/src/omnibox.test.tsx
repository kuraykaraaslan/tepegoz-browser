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

/**
 * Three branches stay uncovered here, all of them jsdom measuring every box as zero: the lead-icon
 * ResizeObserver (there is no width to observe), the padding inset it feeds, and `dropdownHeight`'s
 * zero-row fallback (the dropdown only opens with rows). They are geometry, and geometry is what the
 * Playwright specs are for — a jsdom number here would assert a fiction.
 */

const noSuggestions = (): Promise<OmniboxSuggestion[]> => Promise.resolve([]);
const oneSuggestion = (s: OmniboxSuggestion) => (): Promise<OmniboxSuggestion[]> =>
  Promise.resolve([s]);
const theseSuggestions = (list: OmniboxSuggestion[]) => (): Promise<OmniboxSuggestion[]> =>
  Promise.resolve(list);

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
  vi.unstubAllGlobals();
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
    await screen.findByText('Row 1');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/);

    fireEvent.submit(omniboxForm());
    expect(onNavigate).toHaveBeenCalledWith('https://row-1.test/');
  });

  it('shows a lock for a secure page and no "Not secure" text', () => {
    const { container } = render(
      <Omnibox
        {...baseProps({ securityLevel: 'secure', securityLabels, onOpenSiteInfo: vi.fn() })}
      />,
    );
    expect(container.querySelector('svg[data-icon="lock"]')).not.toBeNull();
    expect(screen.queryByText('Not secure')).toBeNull();
    expect(screen.getByRole('button', { name: 'View site information' })).toBeTruthy();
  });

  it('shows a red "Not secure" label + triangle for an http page and opens the bubble with a rect', () => {
    const onOpenSiteInfo =
      vi.fn<(a: { x: number; y: number; width: number; height: number }) => void>();
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
      <Omnibox
        {...baseProps({ securityLevel: 'unknown', securityLabels, onOpenSiteInfo: vi.fn() })}
      />,
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

  it('shows a row favicon as an <img> in place of the kind glyph', async () => {
    const favicon = 'data:image/png;base64,iVBORw0KGgo=';
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'h',
              kind: 'history',
              title: 'Example Blog',
              faviconUrl: favicon,
              action: { type: 'navigate', input: 'https://example.com/blog' },
            }),
          ),
        })}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'example' } });
    await screen.findByText('Example Blog');

    const img = container.querySelector('li img');
    expect(img?.getAttribute('src')).toBe(favicon);
    expect(container.querySelector('li svg[data-icon="clock-rotate-left"]')).toBeNull();
  });

  it('falls back to the kind glyph when the favicon image fails to decode', async () => {
    const { container } = render(
      <Omnibox
        {...baseProps({
          onSuggest: vi.fn(
            oneSuggestion({
              key: 'h',
              kind: 'history',
              title: 'Broken Icon',
              faviconUrl: 'data:image/png;base64,zzzz',
              action: { type: 'navigate', input: 'https://broken.test/' },
            }),
          ),
        })}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'broken' } });
    await screen.findByText('Broken Icon');

    fireEvent.error(container.querySelector('li img')!);
    expect(container.querySelector('li img')).toBeNull();
    expect(container.querySelector('li svg[data-icon="clock-rotate-left"]')).not.toBeNull();
  });
});

/** Props with  genuinely ABSENT —  forbids passing it undefined. */
function withoutCalcHost(over: Partial<OmniboxProps> = {}): OmniboxProps {
  const { onCalcResult, ...rest } = baseProps(over);
  void onCalcResult;
  return rest;
}

describe('Omnibox suggestion dispatch', () => {
  /** Open the dropdown on one suggestion and click its row. */
  async function pick(s: OmniboxSuggestion, over: Partial<OmniboxProps> = {}): Promise<void> {
    render(<Omnibox {...baseProps({ onSuggest: vi.fn(oneSuggestion(s)), ...over })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'q' } });
    const row = await screen.findByRole('option', { name: new RegExp(s.title) });
    fireEvent.mouseDown(row);
  }

  it('activates an open tab instead of navigating to it again', async () => {
    // Switching to the tab you already have open is the point of the row; navigating would leave two.
    const onActivateTab = vi.fn();
    const onNavigate = vi.fn();
    await pick(
      { key: 't', kind: 'tab', title: 'Open tab', action: { type: 'activateTab', tabId: 'tab-9' } },
      { onActivateTab, onNavigate },
    );
    expect(onActivateTab).toHaveBeenCalledWith('tab-9');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('hands a calc row to the host, and copies it only when there is no host to hand it to', async () => {
    const onCalcResult = vi.fn();
    const calcRow: OmniboxSuggestion = {
      key: 'c',
      kind: 'calc',
      title: '= 4',
      action: { type: 'calc', formatted: '4' },
    };
    await pick(calcRow, { onCalcResult });
    expect(onCalcResult).toHaveBeenCalledWith('4');
    cleanup();

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await pickWithoutCalcHost(calcRow);
    expect(writeText).toHaveBeenCalledWith('4');
  });

  it('routes the quick-setting, agent-task, download and skill rows to their own handlers', async () => {
    const cases = [
      {
        s: {
          key: 'q',
          kind: 'setting',
          title: 'Quick setting',
          action: { type: 'openQuickSetting', target: 'appearance' },
        },
        prop: 'onOpenQuickSetting',
        arg: 'appearance',
      },
      {
        s: {
          key: 'a',
          kind: 'agent',
          title: 'Agent task',
          action: { type: 'agentTask', task: 'summarise this' },
        },
        prop: 'onAgentTask',
        arg: 'summarise this',
      },
      {
        s: {
          key: 'd',
          kind: 'download',
          title: 'A download',
          action: { type: 'openDownload', id: 'dl-1' },
        },
        prop: 'onOpenDownload',
        arg: 'dl-1',
      },
      {
        s: { key: 's', kind: 'skill', title: 'A skill', action: { type: 'runSkill', id: 'sk-1' } },
        prop: 'onRunSkill',
        arg: 'sk-1',
      },
    ] as const;

    for (const { s, prop, arg } of cases) {
      const handler = vi.fn();
      await pick(s as unknown as OmniboxSuggestion, { [prop]: handler });
      expect(handler, prop).toHaveBeenCalledWith(arg);
      cleanup();
    }
  });

  /** Open on one suggestion and click it, with no calc host wired. */
  async function pickWithoutCalcHost(s: OmniboxSuggestion): Promise<void> {
    render(<Omnibox {...withoutCalcHost({ onSuggest: vi.fn(oneSuggestion(s)) })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'q' } });
    const row = await screen.findByRole('option', { name: new RegExp(s.title) });
    fireEvent.mouseDown(row);
  }

  it('a fillCommand row fills the box and leaves the dropdown OPEN for the argument', async () => {
    // Discovery, not execution: the row teaches the prefix, then waits for what follows it.
    await pick({
      key: 'f',
      kind: 'command',
      title: 'A command',
      action: { type: 'fillCommand', prefix: '@tab ' },
    });
    expect(screen.getByRole('combobox')).toHaveProperty('value', '@tab ');
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('an empty fillCommand prefix leaves what the user typed alone', async () => {
    await pick({
      key: 'f',
      kind: 'command',
      title: 'Nothing to pick',
      action: { type: 'fillCommand', prefix: '' },
    });
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'q');
  });

  it('shows a row subtitle beside its title', async () => {
    const s: OmniboxSuggestion = {
      key: 'n',
      kind: 'history',
      title: 'Row 0',
      subtitle: 'example.test',
      action: { type: 'navigate', input: 'https://row-0.test/' },
    };
    render(<Omnibox {...baseProps({ onSuggest: vi.fn(oneSuggestion(s)) })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'q' } });

    // asserted while the dropdown is still OPEN — picking the row closes it
    await screen.findByRole('option', { name: /Row 0/ });
    expect(screen.getByText('example.test')).toBeTruthy();
  });
});

describe('Omnibox keyboard and inline calculation', () => {
  it('ArrowUp wraps to the last row and back off the top, and Escape closes the dropdown', async () => {
    const onSuggest = vi.fn(theseSuggestions([navRow(0), navRow(1)]));
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    await screen.findByText('Row 1');

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
    await screen.findByText('Row 1');

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
    await screen.findByText('Row 0');

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
    await screen.findByText('Row 0');

    onSuggest.mockImplementationOnce(() => Promise.reject(new Error('suggest bridge down')));
    fireEvent.change(input, { target: { value: 'rows' } });
    await waitFor(() => expect(screen.queryByText('Row 0')).toBeNull());
  });

  it('reports nothing at all when the host does not ask for the height', async () => {
    // The effect must not measure or observe for a host that passed no handler.
    const onSuggest = vi.fn(theseSuggestions([navRow(0)]));
    render(<Omnibox {...baseProps({ onSuggest })} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'row' } });
    expect(await screen.findByText('Row 0')).toBeTruthy();
  });
});
