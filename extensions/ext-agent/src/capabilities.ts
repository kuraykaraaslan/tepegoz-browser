import { z } from 'zod';
import {
  capability,
  defineCapabilities,
  type ExtensionCapabilitySet,
} from '@tepegoz/extension-sdk';
import {
  buildElementsSnapshot,
  buildPageSnapshot,
  type BrowserHost,
  type JournalReader,
} from '@tepegoz/browser-tools';
import { agentManifest } from './manifest';

/**
 * The Agent extension's **built-in browser/tab capabilities** (ADR-0021 + ADR-0024) — the agent's core
 * toolset (read page, navigate, list/create tabs, read its own audit journal), declared on the reusable
 * `defineCapabilities` standard exactly like `@tepegoz/ext-macros`'s `macrosCapabilities`. Registering
 * them THROUGH the extension (rather than hardcoded at startup) is what makes disabling
 * `com.tepegoz.agent` a real kill-switch: `ExtensionCapabilitySupervisor` unregisters them, so they
 * vanish from `CapabilityRegistry.list()` (the planner + Settings "run locally" list) when the agent is
 * off. The concrete browser operations + journal reader are injected as the host `H` by the main
 * process (`apps/desktop/src/main/index.ts`), so this package stays Electron-free.
 */

/** The host injected into the agent's built-in tools: the Electron-free browser ops + journal reader. */
export type AgentToolHost = BrowserHost & JournalReader;

const NoArgs = z.object({}).strip();
const NavigateArgs = z.object({ url: z.string().min(1).max(4096) });
const CreateTabArgs = z.object({
  url: z.string().min(1).max(4096).optional(),
  groupName: z.string().min(1).max(60).optional(),
});
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
const JournalQueryArgs = z.object({
  limit: z.number().int().positive().max(200).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

export function agentBuiltinCapabilities(): ExtensionCapabilitySet<AgentToolHost> {
  return defineCapabilities(agentManifest.id, [
    capability<z.infer<typeof NoArgs>, AgentToolHost>({
      id: 'browser_get_page',
      description:
        'Read the visible text of the current page. args: {} — returns { url, title, content }.',
      dangerClass: 'read',
      aiTask: 'read_understand',
      category: 'browser',
      inputSchema: NoArgs,
      handler: async (_args, host) => {
        const { url, title, text } = await host.readActivePage();
        return buildPageSnapshot(text, url, title);
      },
    }),
    capability<z.infer<typeof NavigateArgs>, AgentToolHost>({
      id: 'browser_update_location',
      description:
        'The DEFAULT way to open a page: navigate the CURRENT active tab to a web URL (reuses the tab). ' +
        'args: { url: string } — returns { url, title }.',
      dangerClass: 'state_changing',
      category: 'browser',
      inputSchema: NavigateArgs,
      handler: (args, host) => host.navigateActive(args.url),
    }),
    capability<z.infer<typeof NoArgs>, AgentToolHost>({
      id: 'browser_get_elements',
      description:
        "Read the current page's actionable elements (buttons, links, inputs) from the accessibility " +
        'tree. args: {} — returns { url, title, elements: [{ ref, role, name, value?, disabled? }], content }. ' +
        "Use each element's `ref` with browser_update_page to click or fill it. Re-read after any " +
        'navigation or page change — refs are only valid for the latest snapshot.',
      dangerClass: 'read',
      aiTask: 'read_understand',
      category: 'browser',
      inputSchema: NoArgs,
      handler: async (_args, host) => {
        const { url, title, elements } = await host.snapshotElements();
        return buildElementsSnapshot(elements, url, title);
      },
    }),
    capability<z.infer<typeof UpdatePageArgs>, AgentToolHost>({
      id: 'browser_update_page',
      description:
        'Perform ONE interaction on the current page, using a `ref` from browser_get_elements. args: ' +
        'one of { action: "click", ref } · { action: "fill", ref, text } · { action: "press", key } ' +
        '(e.g. "Enter", "Tab", "Escape", "ArrowDown") · { action: "scroll", direction: "up"|"down", amount? }. ' +
        'Returns { ok: true }.',
      dangerClass: 'state_changing',
      category: 'browser',
      inputSchema: UpdatePageArgs,
      handler: async (args, host) => {
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
    }),
    capability<z.infer<typeof NoArgs>, AgentToolHost>({
      id: 'tab_list_items',
      description: 'List the open browser tabs. args: {} — returns an array of { id, title, url }.',
      dangerClass: 'read',
      category: 'browser',
      inputSchema: NoArgs,
      handler: (_args, host) => host.listTabs(),
    }),
    capability<z.infer<typeof CreateTabArgs>, AgentToolHost>({
      id: 'tab_create_item',
      description:
        'Open a NEW browser tab — use ONLY when the current page must be preserved or you need a ' +
        'side-by-side comparison; otherwise navigate the current tab with browser_update_location. ' +
        'ALWAYS pass a short groupName naming the current task/topic (e.g. "Atatürk") so the new tab is ' +
        'grouped. args: { url?: string, groupName?: string } — returns { id }.',
      dangerClass: 'state_changing',
      category: 'browser',
      inputSchema: CreateTabArgs,
      handler: (args, host) => ({ id: host.createTab(args.url, args.groupName) }),
    }),
    capability<z.infer<typeof JournalQueryArgs>, AgentToolHost>({
      id: 'journal_search_events',
      description:
        "Read recent audit events from the Event Journal (this run by default). " +
        'args: { limit?: number (default 20, max 200), correlationId?: string } — ' +
        'returns an array of { type, ts, actor, correlationId, summary }, newest first.',
      dangerClass: 'read',
      category: 'journal',
      inputSchema: JournalQueryArgs,
      handler: (args, host) => host.recentEvents(args.limit ?? 20, args.correlationId),
    }),
  ]);
}
