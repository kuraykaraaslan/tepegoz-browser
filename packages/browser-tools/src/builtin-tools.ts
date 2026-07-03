import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { RawInteractable } from '@tepegoz/tool-executor';
import { buildPageSnapshot, buildElementsSnapshot } from './perception';

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
  /** Read the active page's actionable elements (accessibility tree). The host keeps the
   *  `ref → node` map for the action calls below, so `ref`s stay valid until the next snapshot. */
  snapshotElements(): Promise<{ url: string; title: string; elements: RawInteractable[] }>;
  /** Click the element identified by `ref` from the most recent {@link snapshotElements}. */
  clickElement(ref: number): Promise<void>;
  /** Focus the input identified by `ref` and replace its value with `text`. */
  fillElement(ref: number, text: string): Promise<void>;
  /** Dispatch a single named key (Enter, Tab, Escape, ArrowDown, …) to the focused element. */
  pressKey(key: string): Promise<void>;
  /** Scroll the page up or down (`amount` in CSS px; host picks a sensible default). */
  scrollPage(direction: 'up' | 'down', amount?: number): Promise<void>;
}

/** One audit event as exposed to the agent — a compact, already-redacted projection. */
export interface JournalEntry {
  type: string;
  ts: number;
  actor: string;
  correlationId: string;
  summary: string;
}

/**
 * Read seam over the append-only Event Journal, injected so `@tepegoz/browser-tools` stays
 * Electron- and persistence-free. The desktop app implements it over `EventJournal` + the SQLite db.
 */
export interface JournalReader {
  /** Most recent events (newest first), optionally scoped to one run/correlationId. */
  recentEvents(limit: number, correlationId?: string): JournalEntry[];
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
  };
}

/** Idempotent: register the built-in tools exactly once into the CapabilityRegistry. */
export function registerBuiltinTools(host: BrowserHost, journal?: JournalReader): void {
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
      'browser_get_elements',
      'read',
      'Read the current page\'s actionable elements (buttons, links, inputs) from the accessibility ' +
        'tree. args: {} — returns { url, title, elements: [{ ref, role, name, value?, disabled? }], content }. ' +
        'Use each element\'s `ref` with browser_update_page to click or fill it. Re-read after any ' +
        'navigation or page change — refs are only valid for the latest snapshot.',
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

  // journal_* (L5): read-only access to the agent's own append-only audit trail. Registered only
  // when a reader is injected, so the package keeps no hard dependency on persistence.
  if (journal !== undefined) {
    CapabilityRegistry.register({
      descriptor: descriptor(
        'journal_search_events',
        'read',
        'Read recent audit events from the Event Journal (this run by default). ' +
          'args: { limit?: number (default 20, max 200), correlationId?: string } — ' +
          'returns an array of { type, ts, actor, correlationId, summary }, newest first.',
      ),
      inputSchema: JournalQueryArgs,
      handler: (args) => journal.recentEvents(args.limit ?? 20, args.correlationId),
    });
  }
}

/** Test seam: allow re-registration after CapabilityRegistry.reset(). */
export function resetBuiltinToolsForTest(): void {
  registered = false;
}
