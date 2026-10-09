import { vi } from 'vitest';

/** Fake `WebContents` + wiring-host fixtures shared by the `tabs-view-wiring` suites. */

export function fakeWc(url = 'https://page.test/') {
  return {
    id: 1,
    on: vi.fn<(event: string, listener: (...a: unknown[]) => unknown) => void>(),
    removeAllListeners: vi.fn<(event: string) => void>(),
    setWindowOpenHandler: vi.fn<(fn: (d: unknown) => unknown) => void>(),
    getURL: () => url,
    getTitle: () => 'Page Title',
    isLoadingMainFrame: () => false,
    isDestroyed: () => false,
    navigationHistory: { canGoBack: () => true, canGoForward: () => false },
    session: { __session: true },
  };
}
export type FakeWc = ReturnType<typeof fakeWc>;
export const host = () => ({
  win: { __win: true, isDestroyed: () => false },
  store: { activeId: 'other-tab', update: vi.fn() },
  getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
  createTab: vi.fn(),
  emitState: vi.fn(),
  closeTab: vi.fn(),
  activateAdjacentTab: vi.fn(),
  activateTabAtPosition: vi.fn(),
  isPrivate: false,
});
export const handlerFor = (wc: FakeWc, ev: string) =>
  wc.on.mock.calls.find((c) => c[0] === ev)?.[1] as ((...a: unknown[]) => unknown) | undefined;
export const handlersFor = (wc: FakeWc, ev: string) =>
  wc.on.mock.calls.filter((c) => c[0] === ev).map((c) => c[1]) as ((...a: unknown[]) => unknown)[];
