// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { CommandPalette } from './command-palette';
import type { PaletteCommand, PaletteSources } from './command-palette-core';

/**
 * The palette as a user meets it. The arithmetic is tested in `command-palette-core.test.ts`; what is
 * asserted here is that the surface is wired to it — that the keyboard reaches the right command, and
 * that a long list does not put 5000 buttons in the DOM.
 */
function cmd(
  id: string,
  title: string,
  run = vi.fn(),
): PaletteCommand & { run: ReturnType<typeof vi.fn> } {
  return { id, title, run };
}

function sourcesWith(
  chat: PaletteCommand[],
  overrides: Partial<PaletteSources> = {},
): PaletteSources {
  return { chat, do: [], make: [], tasks: [], ...overrides };
}

function open(sources: PaletteSources, onClose = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <CommandPalette open onClose={onClose} sources={sources} />
    </I18nProvider>,
  );
  return { onClose, input: screen.getByRole('combobox') };
}

afterEach(cleanup);

describe('CommandPalette', () => {
  it('shows the four modes and starts in chat', () => {
    open(sourcesWith([cmd('a', 'Alpha')]));
    for (const label of ['Chat', 'Do', 'Make', 'Tasks']) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined();
    }
    expect(screen.getByRole('tab', { name: 'Chat' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Tab cycles the mode instead of moving focus, and swaps the command list', () => {
    open(sourcesWith([cmd('a', 'Alpha')], { do: [cmd('b', 'Bravo')] }));
    expect(screen.getByText('Alpha')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' });
    expect(screen.getByRole('tab', { name: 'Do' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Bravo')).toBeDefined();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('Enter runs the highlighted command and closes first', () => {
    const alpha = cmd('a', 'Alpha');
    const bravo = cmd('b', 'Bravo');
    const { onClose, input } = open(sourcesWith([alpha, bravo]));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(bravo.run).toHaveBeenCalledOnce();
    expect(alpha.run).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('runs the TOP result after typing, not whatever was highlighted before', () => {
    // The regression this guards: type, the list re-filters, the old index now points at a different
    // command, and Enter runs something the user never looked at.
    const alpha = cmd('a', 'Alpha');
    const zeta = cmd('z', 'Zeta');
    const { input } = open(sourcesWith([alpha, zeta]));
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight Zeta
    fireEvent.change(input, { target: { value: 'alpha' } }); // Zeta is filtered out
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alpha.run).toHaveBeenCalledOnce();
    expect(zeta.run).not.toHaveBeenCalled();
  });

  it('finds a Turkish command from an ASCII query', () => {
    const ist = cmd('i', 'İSTANBUL raporu');
    const { input } = open(sourcesWith([ist, cmd('o', 'Other')]));
    fireEvent.change(input, { target: { value: 'istanbul' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ist.run).toHaveBeenCalledOnce();
  });

  it('renders a slice of a long list, not the whole thing', () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      cmd(`c${String(i)}`, `Command ${String(i)}`),
    );
    open(sourcesWith(many));
    const rendered = screen.getAllByRole('option').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(40); // a 320px viewport of 44px rows, plus overscan
  });

  it('keeps the scrollbar sized for the whole list while windowing', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      cmd(`c${String(i)}`, `Command ${String(i)}`),
    );
    open(sourcesWith(many));
    const spacer = screen.getByRole('listbox').firstElementChild as HTMLElement;
    expect(spacer.style.height).toBe(`${String(1000 * 44)}px`);
  });

  it('says so when nothing matches, rather than showing an empty box', () => {
    const { input } = open(sourcesWith([cmd('a', 'Alpha')]));
    fireEvent.change(input, { target: { value: 'nothing here' } });
    expect(screen.getByText('No matching command')).toBeDefined();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('Enter on an empty result set does nothing at all', () => {
    const alpha = cmd('a', 'Alpha');
    const { onClose, input } = open(sourcesWith([alpha]));
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alpha.run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('points aria-activedescendant at the highlighted option', () => {
    const { input } = open(sourcesWith([cmd('a', 'Alpha'), cmd('b', 'Bravo')]));
    expect(input.getAttribute('aria-activedescendant')).toBe('cp-a');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('cp-b');
  });
});
