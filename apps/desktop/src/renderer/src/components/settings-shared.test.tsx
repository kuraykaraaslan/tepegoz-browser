// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CrossLink, OptionList, Select } from './settings-shared';

/**
 * The three atoms split out of `SettingsPage.tsx` (ADR-0010 line cap). Nothing stateful — what is
 * worth pinning is that each one forwards the interaction it exists for: `Select` emits the raw
 * value string, `OptionList` emits the picked option's value and never fires for a `disabled` one,
 * and `CrossLink` is a real `#`-anchor (middle-clickable, copyable) rather than a scripted jump.
 */

afterEach(cleanup);

describe('Select', () => {
  it('emits the chosen value and carries an explicit aria-label when it has no visible label', () => {
    const onChange = vi.fn();
    render(
      <Select id="s1" ariaLabel="Pick one" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const select = screen.getByLabelText('Pick one');
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a visible label when given one and honours `disabled`', () => {
    render(
      <Select id="s2" label="Theme" value="a" disabled onChange={vi.fn()}>
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByText('Theme')).toBeTruthy();
    expect(screen.getByLabelText('Theme')).toHaveProperty('disabled', true);
  });
});

describe('OptionList', () => {
  const options = [
    { value: 'x', title: 'X', desc: 'the x one' },
    { value: 'y', title: 'Y', desc: 'the y one', disabled: true },
  ] as const;

  it('renders both the active row and a disabled row (distinct styling branches)', () => {
    render(<OptionList name="g" value="x" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /X/ })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: /Y/ })).toHaveProperty('disabled', true);
    expect(screen.getByText('the x one')).toBeTruthy();
  });

  it('fires onChange with the newly selected value', () => {
    const onChange = vi.fn();
    render(<OptionList name="g" value="y" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /X/ }));
    expect(onChange).toHaveBeenCalledWith('x');
  });
});

describe('CrossLink', () => {
  it('is a plain hash anchor to the target section', () => {
    render(<CrossLink sectionId="privacy">Privacy settings</CrossLink>);
    const link = screen.getByRole('link', { name: 'Privacy settings' });
    expect(link.getAttribute('href')).toBe('#privacy');
  });
});
