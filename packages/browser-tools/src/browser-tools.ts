import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import { buildElementsSnapshot, buildPageSnapshot } from './perception';
import type { BrowserHost } from './host';

/**
 * The agent's built-in **`browser_*` capabilities** — read the page, navigate the active tab, snapshot
 * actionable elements, and perform one interaction (click/fill/press/scroll). Registered directly into
 * the single `CapabilityRegistry` behind the ToolGateway PEP as always-on `source: 'builtin'` tools
 * (the `@tepegoz/file-operations` pattern), bound to an injected {@link BrowserHost} so this package
 * stays Electron-free. Moved off the Agent extension (ADR-0021/0024 update): these are browser-domain
 * operations, not agent-owned, and no longer vanish when `com.tepegoz.agent` is disabled.
 */

const NoArgs = z.object({}).strip();
const NavigateArgs = z.object({ url: z.string().min(1).max(4096) });
const Ref = z.number().int().positive().max(10_000);
/** One page interaction, discriminated by `action` so each variant validates its own args. */
const UpdatePageArgs = z.discriminatedUnion('action', [
  z.object({ action: z.literal('click'), ref: Ref }),
  z.object({ action: z.literal('fill'), ref: Ref, text: z.string().max(10_000) }),
  z.object({ action: z.literal('press'), key: z.string().min(1).max(40) }),
  z.object({
    action: z.literal('scroll'),
    direction: z.enum(['up', 'down']),
    amount: z.number().int().positive().max(100_000).optional(),
  }),
]);

/** Build a `browser_*` builtin ToolDescriptor (mirrors `@tepegoz/file-operations`'s local helper). */
function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  opts: { aiTask?: ToolDescriptor['aiTask'] } = {},
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: opts.aiTask ?? 'none',
    category: 'browser',
  };
}

/** Registers the `browser_*` agent tools into the `CapabilityRegistry`, bound to `deps.host`. */
export function registerBrowserTools(deps: { host: BrowserHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_page',
      'read',
      'Read the visible text of the current page. args: {} — returns { url, title, content }.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: NoArgs,
    handler: async () => {
      const { url, title, text } = await host.readActivePage();
      return buildPageSnapshot(text, url, title);
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_location',
      'state_changing',
      'The DEFAULT way to open a page: navigate the CURRENT active tab to a web URL (reuses the tab). ' +
        'args: { url: string } — returns { url, title }.',
    ),
    inputSchema: NavigateArgs,
    handler: (args) => host.navigateActive(args.url),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_elements',
      'read',
      "Read the current page's actionable elements (buttons, links, inputs) from the accessibility " +
        'tree. args: {} — returns { url, title, elements: [{ ref, role, name, value?, disabled? }], content }. ' +
        "Use each element's `ref` with browser_update_page to click or fill it. Re-read after any " +
        'navigation or page change — refs are only valid for the latest snapshot.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: NoArgs,
    handler: async () => {
      const { url, title, elements } = await host.snapshotElements();
      return buildElementsSnapshot(elements, url, title);
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_page',
      'state_changing',
      'Perform ONE interaction on the current page, using a `ref` from browser_get_elements. args: ' +
        'one of { action: "click", ref } · { action: "fill", ref, text } · { action: "press", key } ' +
        '(e.g. "Enter", "Tab", "Escape", "ArrowDown") · { action: "scroll", direction: "up"|"down", amount? }. ' +
        'Returns { ok: true }.',
    ),
    inputSchema: UpdatePageArgs,
    handler: async (args) => {
      switch (args.action) {
        case 'click':
          await host.clickElement(args.ref);
          break;
        case 'fill':
          await host.fillElement(args.ref, args.text);
          break;
        case 'press':
          await host.pressKey(args.key);
          break;
        case 'scroll':
          await host.scrollPage(args.direction, args.amount);
          break;
      }
      return { ok: true };
    },
  });
}
