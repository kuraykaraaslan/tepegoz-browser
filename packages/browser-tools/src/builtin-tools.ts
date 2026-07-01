import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import { buildPageSnapshot } from './perception';

/**
 * The browser operations the built-in tools need, abstracted away from Electron. The desktop app
 * implements this over its TabManager + WebContentsView; a headless/remote browser-agent could
 * implement it differently. Keeping the tools behind this seam is what lets `@tepegoz/browser-tools`
 * stay Electron-free.
 */
export interface BrowserHost {
  /** Navigate the active tab to `url` (scheme allow-list enforced by the host) and resolve once
   *  loading settles, with the final url + title. */
  navigateActive(url: string): Promise<{ url: string; title: string }>;
  /** Read the active page: its url, title, and the raw (unsanitized) visible text. */
  readActivePage(): Promise<{ url: string; title: string; text: string }>;
  /** List the open tabs. */
  listTabs(): { id: string; title: string; url: string }[];
  /** Open a new tab, optionally at a URL; returns its id. */
  createTab(url?: string): string;
}

/**
 * Built-in browser/tab tools (L5). Each registers as a uniform ToolDescriptor + zod validator +
 * handler and is reached ONLY through the ToolGateway PEP (Policy Kernel + HITL). Tool names follow
 * `{domain}_{verb}_{noun}` with an approved verb; the argument shape is described in the description
 * text so the planner (which only sees id/dangerClass/description) can produce valid args.
 *
 * Read tools are 'read' (auto-allowed); navigation/tab-open mutate state ('state_changing' → HITL).
 * The concrete browser operations are injected via `BrowserHost`, so this package stays Electron-free.
 */
let registered = false;

const NavigateArgs = z.object({ url: z.string().min(1).max(4096) });
const CreateTabArgs = z.object({ url: z.string().min(1).max(4096).optional() });
const NoArgs = z.object({}).strip();

function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
): ToolDescriptor {
  return { id, description, dangerClass, source: 'builtin', inputSchema: { type: 'object' }, requiresIdempotencyKey: false };
}

/** Idempotent: register the built-in tools exactly once into the CapabilityRegistry. */
export function registerBuiltinTools(host: BrowserHost): void {
  if (registered) return;
  registered = true;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_page',
      'read',
      'Read the visible text of the current page. args: {} — returns { url, title, content }.',
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
      'Navigate the active tab to a web URL. args: { url: string } — returns { url, title }.',
    ),
    inputSchema: NavigateArgs,
    handler: (args) => host.navigateActive(args.url),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'tab_list_items',
      'read',
      'List the open browser tabs. args: {} — returns an array of { id, title, url }.',
    ),
    inputSchema: NoArgs,
    handler: () => host.listTabs(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'tab_create_item',
      'state_changing',
      'Open a new browser tab, optionally at a URL. args: { url?: string } — returns { id }.',
    ),
    inputSchema: CreateTabArgs,
    handler: (args) => ({ id: host.createTab(args.url) }),
  });
}

/** Test seam: allow re-registration after CapabilityRegistry.reset(). */
export function resetBuiltinToolsForTest(): void {
  registered = false;
}
