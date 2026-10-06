// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Omnibox, type OmniboxProps } from './omnibox';
import type { OmniboxSuggestion } from './omnibox-suggest';
import { createOmniboxHelpers, oneSuggestion } from './omnibox-test-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const { baseProps, withoutCalcHost } = createOmniboxHelpers(vi, screen);

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

  it('routes the quick-setting, agent-task, download, skill and palette rows to their own handlers', async () => {
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
      {
        s: {
          key: 'p',
          kind: 'palette',
          title: 'Command palette',
          action: { type: 'openPalette', query: 'settings' },
        },
        prop: 'onOpenPalette',
        arg: 'settings',
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
