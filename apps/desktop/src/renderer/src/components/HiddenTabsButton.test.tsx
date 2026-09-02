// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HiddenTabsButton } from './HiddenTabsButton';

/**
 * The caption-row control shown only while tabs are hidden. It renders nothing at count 0, clamps the
 * badge to "99+", and opens the NATIVE hidden-tabs menu on click (native so it floats above the live
 * page view rather than being occluded by it).
 */

const showHiddenTabsMenu = vi.fn();

beforeEach(() => {
  showHiddenTabsMenu.mockClear();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { showHiddenTabsMenu } });
});
afterEach(cleanup);

describe('HiddenTabsButton', () => {
  it('renders nothing when no tabs are hidden', () => {
    const { container } = render(<HiddenTabsButton count={0} label="Hidden tabs" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a negative count', () => {
    const { container } = render(<HiddenTabsButton count={-1} label="Hidden tabs" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the exact count while at or below 99', () => {
    render(<HiddenTabsButton count={7} label="Hidden tabs" />);
    expect(screen.getByRole('button', { name: 'Hidden tabs' }).textContent).toBe('7');
  });

  it('clamps a count over 99 to "99+"', () => {
    render(<HiddenTabsButton count={150} label="Hidden tabs" />);
    expect(screen.getByRole('button').textContent).toBe('99+');
  });

  it('opens the native hidden-tabs menu on click', () => {
    render(<HiddenTabsButton count={3} label="Hidden tabs" />);
    fireEvent.click(screen.getByRole('button'));
    expect(showHiddenTabsMenu).toHaveBeenCalledTimes(1);
  });
});
