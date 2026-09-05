// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubJsdomLayout } from './jsdom-layout';

/**
 * The stub itself: called explicitly (not as an import side effect) by every test that renders a
 * component relying on layout APIs jsdom doesn't implement. What matters here is the stub's own
 * contract — a no-op scroll, a `ResizeObserver` polyfill installed only when one isn't already present
 * — since every OTHER test file exercises it only incidentally through whatever it happens to call.
 */

describe('stubJsdomLayout', () => {
  afterEach(() => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('makes scrollIntoView a no-op instead of throwing', () => {
    stubJsdomLayout();
    const el = document.createElement('div');
    expect(() => el.scrollIntoView()).not.toThrow();
  });

  it('installs a ResizeObserver polyfill when none exists, and its methods are no-ops', () => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    stubJsdomLayout();
    expect('ResizeObserver' in globalThis).toBe(true);

    const observer = new (globalThis as unknown as { ResizeObserver: new (cb: () => void) => {
      observe: (el: Element) => void;
      unobserve: (el: Element) => void;
      disconnect: () => void;
    } }).ResizeObserver(vi.fn());
    const el = document.createElement('div');
    expect(() => observer.observe(el)).not.toThrow();
    expect(() => observer.unobserve(el)).not.toThrow();
    expect(() => observer.disconnect()).not.toThrow();
  });

  it('does not overwrite an existing ResizeObserver', () => {
    const existing = class {};
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = existing;
    stubJsdomLayout();
    expect(globalThis.ResizeObserver).toBe(existing);
  });
});
