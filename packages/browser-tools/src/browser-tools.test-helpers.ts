import type { BrowserHost } from './host';
import type { NetworkObservation } from './network-verify';

/** What the default fake host's `fillElement` last wrote — so `readElementValue` can echo it back the way
 *  a real, working field would. */
let lastFilled: string | null = null;

export function fakeHost(overrides?: Partial<BrowserHost>): BrowserHost {
  lastFilled = null;
  return {
    navigate: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    readPage: () => Promise.resolve({ url: 'https://x', title: 'X', text: 'hello', sig: 's1' }),
    waitForLoad: () => Promise.resolve({ url: 'https://x', title: 'X' }),
    snapshotElements: () => Promise.resolve({ url: 'https://x', title: 'X', elements: [] }),
    clickElement: () => Promise.resolve({ occludedBy: null }),
    hoverElement: () => Promise.resolve(),
    dragElement: () => Promise.resolve({ mode: 'pointer' }),
    listOpenTabs: () => [{ id: 't1', url: 'https://x', title: 'X' }],
    fillElement: (_ref: number, text: string) => {
      lastFilled = text;
      return Promise.resolve({ widget: null });
    },
    pressKey: () => Promise.resolve({ sent: 1, unsupported: [] }),
    sendKeys: () => Promise.resolve({ sent: 1, unsupported: [] }),
    scrollPage: () => Promise.resolve(),
    scrollToText: () => Promise.resolve({ found: true, count: 1 }),
    selectOption: () => Promise.resolve({ selected: 'Türkiye', options: ['Germany', 'Türkiye'] }),
    networkSince: () => Promise.resolve([]),
    historyGo: () => Promise.resolve({ url: 'https://x/prev', title: 'Prev', moved: true }),
    waitForCondition: () => Promise.resolve({ satisfied: true, waitedMs: 40 }),
    // Default: the field ends up holding whatever was typed (the ordinary, working case).
    readElementValue: () => Promise.resolve(lastFilled),
    ...overrides,
  };
}

/** One observed HTTP response, as the AI-8B recorder would hand it over. */
export function response(over: Partial<NetworkObservation> = {}): NetworkObservation {
  return {
    method: 'POST',
    url: 'https://x/api/save',
    status: 500,
    type: 'Fetch',
    ts: 1_000,
    redirects: 0,
    ...over,
  };
}
