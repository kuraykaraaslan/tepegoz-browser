import type { Rectangle } from 'electron';

/**
 * Decide the rectangle a tab's `WebContentsView` should be sized with. Pure + Electron-free so the
 * core rule is unit-testable without mocking a window.
 *
 * The renderer's measured content region (`current`) is authoritative once it exists. Until then
 * `current` is 0×0, and a `WebContentsView` laid out at 0×0 gives its page `innerWidth/innerHeight === 0`
 * — which makes the agent's render-DOM perception reject every element (the "no interactable elements"
 * blindness the AI-1 harness surfaced). So when `current` has no positive area, fall back to the native
 * window's own content size (origin at the content-area top-left → `x/y = 0`), floored to 1×1 so the
 * result is never zero-area even on a destroyed/odd window (`contentSize === null`).
 */
export function resolveViewBounds(
  current: Rectangle,
  contentSize: readonly number[] | null,
): Rectangle {
  if (current.width > 0 && current.height > 0) return current;
  const width = Math.max(1, contentSize?.[0] ?? 1);
  const height = Math.max(1, contentSize?.[1] ?? 1);
  return { x: 0, y: 0, width, height };
}
