// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserMenuButton } from './UserMenuButton';

/**
 * The avatar/profile button. Same native-popup toggle contract as the other caption-row buttons, plus
 * it renders the letter-avatar placeholder from `name` while there is no real picture.
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

describe('UserMenuButton', () => {
  it('renders the letter-avatar placeholder from the name', () => {
    render(<UserMenuButton label="Account" name="kuray" />);
    expect(screen.getByRole('button', { name: 'Account' }).textContent).toBe('K');
  });

  it('opens the native user-menu popup on click and toggles it closed', () => {
    render(<UserMenuButton label="Account" name="Ada" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(bridge.openPopup).toHaveBeenCalledWith('user-menu', expect.any(Object), expect.any(Object));
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(bridge.closePopup).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('syncs aria-expanded when main reports the user-menu popup closed', () => {
    render(<UserMenuButton label="Account" name="Ada" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    act(() => closedListener('user-menu'));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders the picture instead of the placeholder when a URL is given', () => {
    const { container } = render(
      <UserMenuButton label="Account" name="Ada" pictureUrl="https://example/a.png" />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example/a.png');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<UserMenuButton label="Account" name="Ada" />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
