// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import { FindBar } from './find-bar';

function renderBar(over: Partial<Parameters<typeof FindBar>[0]> = {}) {
  const props = {
    query: 'alpha',
    activeMatch: 1,
    totalMatches: 3,
    matchCase: false,
    onQueryChange: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onToggleMatchCase: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider locale="en">
      <FindBar {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(cleanup);

describe('FindBar', () => {
  it('shows the active match over the total', () => {
    renderBar();
    expect(screen.getByLabelText('Match count').textContent).toBe('1/3');
  });

  it('reports no results instead of 0/0 when the query matches nothing', () => {
    renderBar({ query: 'zzz', activeMatch: 0, totalMatches: 0 });
    expect(screen.getByLabelText('Match count').textContent).toBe('No results');
  });

  it('leaves the counter empty while the query is empty', () => {
    renderBar({ query: '', activeMatch: 0, totalMatches: 0 });
    expect(screen.getByLabelText('Match count').textContent).toBe('');
  });

  it('focuses and selects the input on mount so Ctrl+F retypes over the last query', () => {
    renderBar();
    const input = screen.getByLabelText('Find in page');
    expect(document.activeElement).toBe(input);
  });

  it('cycles matches with Enter and Shift+Enter', () => {
    const props = renderBar();
    const input = screen.getByLabelText('Find in page');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const props = renderBar();
    fireEvent.keyDown(screen.getByLabelText('Find in page'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the step buttons when there is nothing to step through', () => {
    renderBar({ query: 'zzz', activeMatch: 0, totalMatches: 0 });
    expect(screen.getByLabelText('Next match').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Previous match').hasAttribute('disabled')).toBe(true);
  });

  it('exposes match-case as a toggle button', () => {
    const props = renderBar({ matchCase: true });
    const toggle = screen.getByLabelText('Match case');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(props.onToggleMatchCase).toHaveBeenCalledTimes(1);
  });
});
