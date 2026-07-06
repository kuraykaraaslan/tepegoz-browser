import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';

/**
 * The agent's built-in **`tab_*` capabilities** — list the open tabs and open a new (task-grouped) tab.
 * Registered directly into the single `CapabilityRegistry` behind the ToolGateway PEP as always-on
 * `source: 'builtin'` tools (the `@tepegoz/file-operations` pattern), bound to an injected
 * {@link TabHost} so this package stays Electron-free. Moved off the Agent extension (ADR-0021/0024
 * update): tab enumeration/creation is a tab-domain operation, not agent-owned.
 *
 * Note: these tools drive the *live* browser tabs via the injected host (WebContentsView glue in the
 * app), which is a separate concern from `TabStore`'s pure record state — they only co-locate here
 * because both belong to the tab domain.
 */

/** The live-tab operations the `tab_*` tools need — implemented by the app over its TabManager. */
export interface TabHost {
  /** List the open tabs. */
  listTabs(): { id: string; title: string; url: string }[];
  /** Open a new tab, optionally at a URL and inside a named group (agent tabs are grouped by task);
   *  returns its id. */
  createTab(url?: string, groupName?: string): string;
}

const NoArgs = z.object({}).strip();
const CreateTabArgs = z.object({
  url: z.string().min(1).max(4096).optional(),
  groupName: z.string().min(1).max(60).optional(),
});

/** Build a `tab_*` builtin ToolDescriptor (mirrors `@tepegoz/file-operations`'s local helper). */
function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: 'none',
    category: 'browser',
  };
}

/** Registers the `tab_*` agent tools into the `CapabilityRegistry`, bound to `deps.host`. */
export function registerTabTools(deps: { host: TabHost }): void {
  const { host } = deps;

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
      'Open a NEW browser tab — use ONLY when the current page must be preserved or you need a ' +
        'side-by-side comparison; otherwise navigate the current tab with browser_update_location. ' +
        'ALWAYS pass a short groupName naming the current task/topic (e.g. "Atatürk") so the new tab is ' +
        'grouped. args: { url?: string, groupName?: string } — returns { id }.',
    ),
    inputSchema: CreateTabArgs,
    handler: (args) => ({ id: host.createTab(args.url, args.groupName) }),
  });
}
