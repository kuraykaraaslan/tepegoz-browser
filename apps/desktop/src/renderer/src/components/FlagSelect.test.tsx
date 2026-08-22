// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { FlagSelect, type FlagOption } from './FlagSelect';

/**
 * The first component test in `apps/desktop` — the renderer shipped at 0.67% statements, with `App.tsx`
 * and every component at a flat 0%.
 *
 * `FlagSelect` is the right place to start, and not because it is small. It is a CUSTOM listbox: a
 * `<div>` with hand-written `role="listbox"` / `role="option"` and a hand-written keyboard model,
 * written because a native `<option>` cannot render a flag. Everything a native `<select>` would have
 * given for free — arrow keys, Home/End, Escape, `aria-expanded`, `aria-selected` — is now this file's
 * responsibility, and none of it had ever executed. A keyboard-only or screen-reader user meets this
 * control on the language screen of a product that calls Turkish first-class, so a broken keyboard
 * model here is not a cosmetic defect: it is the language picker being unreachable without a mouse,
 * with every existing gate green.
 *
 * jsdom reports zeroes from `getBoundingClientRect`, which is fine — the panel is positioned from that
 * rect but its existence does not depend on the numbers, and position is not what is under test.
 */

stubJsdomLayout();

const OPTIONS: FlagOption[] = [
  { value: '', label: 'System default' },
  { value: 'tr', label: 'Türkçe', iso2: 'TR' },
  { value: 'en', label: 'English', iso2: 'GB' },
  { value: 'de', label: 'Deutsch', iso2: 'DE' },
];

function setup(over: { value?: string; searchable?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <FlagSelect
      label="Language"
      value={over.value ?? 'tr'}
      onChange={onChange}
      options={OPTIONS}
      searchable={over.searchable ?? false}
      searchPlaceholder="Search languages"
      noResultsLabel="No results"
      placeholder="Pick one"
    />,
  );
  return { onChange, trigger: screen.getByRole('button', { name: /Language/ }) };
}

/** The option buttons currently in the panel, in DOM order. */
function options(): HTMLElement[] {
  return within(screen.getByRole('listbox')).getAllByRole('option');
}

/** The option the keyboard model is currently highlighting (distinct from the SELECTED one). */
function activeOption(): HTMLElement | undefined {
  return options().find((o) => o.dataset.active === 'true');
}

afterEach(cleanup);

describe('the trigger', () => {
  it('announces itself as a collapsed listbox before it is opened', () => {
    const { trigger } = setup();

    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the selected option, not the raw value', () => {
    const { trigger } = setup({ value: 'tr' });

    expect(trigger.textContent).toContain('Türkçe');
  });

  it('falls back to the placeholder when the value matches no option', () => {
    const { trigger } = setup({ value: 'not-a-locale' });

    expect(trigger.textContent).toContain('Pick one');
  });

  it('ANNOUNCES the selected value, not only the field label', () => {
    // `<label for>` on a labelable element beats the element's own contents, so this button used to
    // compute an accessible name of just "Language": a screen-reader user on the language screen was
    // told which field they were on and never which language was selected. A native <select> reads
    // "Language, Türkçe". Naming from label + value span restores that.
    setup({ value: 'tr' });

    // Asserted through `getByRole({ name })`, which computes the accessible name exactly the way an
    // assistive technology does — not by reading the attributes back.
    expect(screen.getByRole('button', { name: 'Language Türkçe' })).toBeTruthy();
  });

  it('still has a name when the control ships without a visible label', () => {
    render(<FlagSelect value="en" onChange={vi.fn()} options={OPTIONS} placeholder="Pick one" />);

    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
  });

  it('flips aria-expanded when opened', () => {
    const { trigger } = setup();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});

describe('what a screen reader is told about the options', () => {
  it('marks exactly the selected option as selected', () => {
    const { trigger } = setup({ value: 'en' });
    fireEvent.click(trigger);

    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('English');
  });

  it('names the list, so it is not just "listbox"', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox').getAttribute('aria-label')).toBe('Language');
  });
});

describe('the keyboard model this component had to write itself', () => {
  it('opens highlighting the CURRENT value, not the first option', () => {
    // Arrowing from the top would make "next language" mean "second in the list" instead of
    // "next to the one I have".
    const { trigger } = setup({ value: 'de' });

    fireEvent.click(trigger);

    expect(activeOption()?.textContent).toContain('Deutsch');
  });

  it('moves the highlight down and up', () => {
    const { trigger } = setup({ value: '' });
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('Türkçe');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('English');

    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(activeOption()?.textContent).toContain('Türkçe');
  });

  it('stops at the ends instead of wrapping or running off the list', () => {
    const { trigger } = setup({ value: '' });
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(activeOption()?.textContent).toContain('System default');

    for (let i = 0; i < 10; i++) fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('Deutsch');
  });

  it('jumps to the ends with Home and End', () => {
    const { trigger } = setup({ value: 'tr' });
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 'End' });
    expect(activeOption()?.textContent).toContain('Deutsch');

    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(activeOption()?.textContent).toContain('System default');
  });

  it('commits the highlighted option on Enter and closes', () => {
    const { trigger, onChange } = setup({ value: '' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('tr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape without changing anything', () => {
    const { trigger, onChange } = setup({ value: 'tr' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a key it has no meaning for, rather than closing', () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 'a' });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('pointer selection', () => {
  it('commits the clicked option and closes', () => {
    const { trigger, onChange } = setup({ value: 'tr' });
    fireEvent.click(trigger);

    const english = options().find((o) => o.textContent?.includes('English'));
    fireEvent.click(english as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('commits the empty value of "system default" — a falsy value that must still be sent', () => {
    // `''` is a real choice here. Any `if (value)` guard on the way out would drop it and leave the
    // user unable to go back to following the OS language.
    const { trigger, onChange } = setup({ value: 'tr' });
    fireEvent.click(trigger);

    const system = options().find((o) => o.textContent?.includes('System default'));
    fireEvent.click(system as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('moves the highlight to the option under the pointer', () => {
    const { trigger } = setup({ value: '' });
    fireEvent.click(trigger);

    const german = options().find((o) => o.textContent?.includes('Deutsch'));
    fireEvent.mouseEnter(german as HTMLElement);

    expect(activeOption()?.textContent).toContain('Deutsch');
  });
});

describe('search', () => {
  it('is absent unless the control is searchable', () => {
    const { trigger } = setup({ searchable: false });
    fireEvent.click(trigger);

    expect(screen.queryByLabelText('Search languages')).toBeNull();
  });

  it('filters by label', () => {
    const { trigger } = setup({ searchable: true });
    fireEvent.click(trigger);

    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'eng' } });

    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain('English');
  });

  it('filters by country code too, since that is what people type for a flag list', () => {
    const { trigger } = setup({ searchable: true });
    fireEvent.click(trigger);

    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'tr' } });

    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining('Türkçe')]);
  });

  it('says so when nothing matches, instead of showing an empty box', () => {
    const { trigger } = setup({ searchable: true });
    fireEvent.click(trigger);

    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'zzzz' } });

    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('Enter commits the FILTERED option, not the one that index used to point at', () => {
    // The highlight is an index into the filtered list. If filtering did not reset it, Enter after a
    // search would select whatever sat at that index in the unfiltered list — a different language.
    const { trigger, onChange } = setup({ searchable: true, value: '' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'End' });

    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'eng' } });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('forgets the query when reopened', () => {
    const { trigger } = setup({ searchable: true });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'eng' } });
    fireEvent.keyDown(trigger, { key: 'Escape' });

    fireEvent.click(trigger);

    expect(options()).toHaveLength(OPTIONS.length);
  });
});
