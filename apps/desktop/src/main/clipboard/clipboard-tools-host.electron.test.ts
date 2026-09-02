import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `clipboardToolsHost` — the Electron host for the `clipboard_*` agent tools. It stamps `actor:
 * 'agent'` and fills a missing `origin` from the active tab before handing off to `ClipboardService`.
 * Pinned: both tools forward the enriched input; a caller-supplied origin is kept; and `activeOrigin`
 * resolves the tab URL's origin, returning undefined for no tab / an unparseable URL.
 */

const svc = vi.hoisted(() => ({ readText: vi.fn(() => 'clip'), writeText: vi.fn() }));
vi.mock('./clipboard-service.electron', () => ({ default: svc }));

const tab = vi.hoisted((): { url: string | undefined } => ({ url: 'https://shop.test/cart' }));
vi.mock('../tabs', () => ({
  default: { activeWebContents: () => (tab.url === undefined ? null : { getURL: () => tab.url }) },
}));

const { clipboardToolsHost } = await import('./clipboard-tools-host.electron');

beforeEach(() => {
  vi.clearAllMocks();
  tab.url = 'https://shop.test/cart';
});

describe('readText', () => {
  it('stamps the agent actor and fills origin from the active tab', () => {
    clipboardToolsHost.readText({});
    expect(svc.readText).toHaveBeenCalledWith({ actor: 'agent', origin: 'https://shop.test' });
  });

  it('keeps a caller-supplied origin', () => {
    clipboardToolsHost.readText({ origin: 'https://given.test' });
    expect(svc.readText).toHaveBeenCalledWith({ actor: 'agent', origin: 'https://given.test' });
  });
});

describe('writeText', () => {
  it('stamps the agent actor and fills origin from the active tab', () => {
    clipboardToolsHost.writeText({ text: 'hi' });
    expect(svc.writeText).toHaveBeenCalledWith({
      text: 'hi',
      actor: 'agent',
      origin: 'https://shop.test',
    });
  });
});

describe('activeOrigin fallback', () => {
  it('is undefined when there is no active tab', () => {
    tab.url = undefined;
    clipboardToolsHost.readText({});
    expect(svc.readText).toHaveBeenCalledWith({ actor: 'agent', origin: undefined });
  });

  it('is undefined when the tab URL will not parse', () => {
    tab.url = 'not a url';
    clipboardToolsHost.readText({});
    expect(svc.readText).toHaveBeenCalledWith({ actor: 'agent', origin: undefined });
  });
});
