// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MainMenuButton } from './MainMenuButton';

/**
 * The hamburger button. It opens the main menu as a NATIVE popup (not a DOM dropdown) so it floats
 * above the tab's WebContentsView; a second click closes it, and main's `onPopupClosed('main-menu')`
 * keeps `aria-expanded` truthful when the popup is dismissed by a click elsewhere.
 */

type ClosedListener = (surface: string) => void;
let closedListener: ClosedListener = () => {};
const unsubscribe = vi.fn();

const bridge = {
  onPopupClosed: vi.fn((cb: ClosedListener) => {
    closedListener = cb;
    return unsubscribe;
  }),
  openPopup: vi.fn(),
  closePopup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: bridge });
});
afterEach(cleanup);

describe('MainMenuButton', () => {
  it('is collapsed on mount', () => {
    render(<MainMenuButton label="Main menu" />);
    expect(screen.getByRole('button', { name: 'Main menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('opens the native main-menu popup on click', () => {
    render(<MainMenuButton label="Main menu" />);
    fireEvent.click(screen.getByRole('button'));
    expect(bridge.openPopup).toHaveBeenCalledWith('main-menu', expect.any(Object), expect.any(Object));
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes it again on the second click', () => {
    render(<MainMenuButton label="Main menu" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('syncs aria-expanded when main reports the popup closed', () => {
    render(<MainMenuButton label="Main menu" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    act(() => closedListener('main-menu'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores an onPopupClosed for a different surface', () => {
    render(<MainMenuButton label="Main menu" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    act(() => closedListener('user-menu'));
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<MainMenuButton label="Main menu" />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
