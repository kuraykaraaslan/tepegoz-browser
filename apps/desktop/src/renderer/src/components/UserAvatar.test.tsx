// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

/**
 * The placeholder profile avatar. With a real picture URL it renders an `<img>`; with none it draws a
 * letter-avatar from the first initial of `name`, and degrades to `?` when there is no usable initial
 * (empty or whitespace-only name).
 */

afterEach(cleanup);

describe('UserAvatar', () => {
  it('renders the picture when a non-empty URL is given', () => {
    const { container } = render(<UserAvatar name="Kuray" pictureUrl="https://example/pic.png" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example/pic.png');
  });

  it('falls back to the uppercased first initial when there is no picture', () => {
    const { container } = render(<UserAvatar name="kuray" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('K');
  });

  it('treats an empty string picture URL as "no picture"', () => {
    const { container } = render(<UserAvatar name="Ada" pictureUrl="" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');
  });

  it('shows "?" when the name has no usable initial', () => {
    const { container } = render(<UserAvatar name="   " />);
    expect(container.textContent).toBe('?');
  });

  it('passes className through to size the element', () => {
    const { container } = render(<UserAvatar name="Ada" className="h-5 w-5" />);
    expect(container.firstElementChild?.className).toContain('h-5 w-5');
  });
});
