// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { CursorOverlay } from './CursorOverlay';

/**
 * The synthetic cursor drawn during macro/agent runs. It renders nothing until main pushes a
 * `visible` position, then a `position:fixed`, `pointer-events:none` arrow at those coordinates. It
 * unsubscribes from the channel on unmount.
 */

type PosListener = (p: { x: number; y: number; visible: boolean }) => void;

let listener: PosListener = () => {};
const unsubscribe = vi.fn();
const onCursorPosition = vi.fn((cb: PosListener) => {
  listener = cb;
  return unsubscribe;
});

beforeEach(() => {
  unsubscribe.mockClear();
  onCursorPosition.mockClear();
  Object.defineProperty(window, 'tepegoz', { configurable: true, value: { onCursorPosition } });
});
afterEach(cleanup);

describe('CursorOverlay', () => {
  it('renders nothing until a visible position arrives', () => {
    const { container } = render(<CursorOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('draws the arrow at the pushed coordinates once visible', () => {
    const { container } = render(<CursorOverlay />);
    act(() => listener({ x: 40, y: 60, visible: true }));

    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.pointerEvents).toBe('none');
    expect(overlay.style.left).toBe('40px');
    expect(overlay.style.top).toBe('60px');
    expect(overlay.querySelector('svg path')).not.toBeNull();
  });

  it('hides again when a not-visible position arrives', () => {
    const { container } = render(<CursorOverlay />);
    act(() => listener({ x: 10, y: 10, visible: true }));
    expect(container.firstChild).not.toBeNull();
    act(() => listener({ x: 10, y: 10, visible: false }));
    expect(container.firstChild).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<CursorOverlay />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
