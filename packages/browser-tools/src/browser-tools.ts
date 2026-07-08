import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import { buildElementsSnapshot, buildPageSnapshot } from './perception';
import type { BrowserHost } from './host';

/**
 * The agent's built-in **`browser_*` capabilities** — read the page, navigate a tab, snapshot
 * actionable elements, and perform one interaction (click/fill/press/scroll). Registered directly into
 * the single `CapabilityRegistry` behind the ToolGateway PEP as always-on `source: 'builtin'` tools
 * (the `@tepegoz/file-operations` pattern), bound to an injected {@link BrowserHost} so this package
 * stays Electron-free. Moved off the Agent extension (ADR-0021/0024 update): these are browser-domain
 * operations, not agent-owned, and no longer vanish when `com.tepegoz.agent` is disabled.
 */

const TargetTabArgs = z.object({ tabId: z.string().min(1).max(128).optional() }).strip();
const NavigateArgs = TargetTabArgs.extend({ url: z.string().min(1).max(4096) });
const ValidatePageArgs = TargetTabArgs.extend({
  containsText: z.string().min(1).max(500).optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});
const Ref = z.number().int().positive().max(10_000);
/** One page interaction, discriminated by `action` so each variant validates its own args. */
const UpdatePageArgs = z.discriminatedUnion('action', [
  TargetTabArgs.extend({ action: z.literal('click'), ref: Ref }),
  TargetTabArgs.extend({ action: z.literal('fill'), ref: Ref, text: z.string().max(10_000) }),
  TargetTabArgs.extend({ action: z.literal('press'), key: z.string().min(1).max(40) }),
  TargetTabArgs.extend({
    action: z.literal('scroll'),
    direction: z.enum(['up', 'down']),
    amount: z.number().int().positive().max(100_000).optional(),
  }),
]);

interface PageFingerprint {
  url: string;
  title: string;
  text: string;
  /** Structural signature of the VISIBLE actionable elements (host-computed). Catches state changes an
   *  in-place SPA toggle makes that leave url/title/innerText untouched — a drawer/menu/dropdown/accordion
   *  sliding into view, a tab panel swapping, a modal opening — where the revealed nodes already lived in
   *  the DOM (so `innerText` never moved) but were off-canvas/hidden until the interaction. */
  sig: string;
}

/** Did the interaction move the page? True on any url/title/visible-text change OR a change to the
 *  visible actionable-element set. The structural arm is what stops a menu-toggle click from reading as a
 *  no-op (the false `changed:false` that used to drive the agent into a re-click loop). */
function pageChanged(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.url !== after.url ||
    before.title !== after.title ||
    before.text !== after.text ||
    before.sig !== after.sig
  );
}

/** A change the structural signature caught but url/title/visible-text did not — i.e. the actionable set
 *  moved (a menu/panel opened) with no new visible prose. The model must re-read elements to see it. */
function structuralOnlyChange(before: PageFingerprint, after: PageFingerprint): boolean {
  return (
    before.sig !== after.sig &&
    before.url === after.url &&
    before.title === after.title &&
    before.text === after.text
  );
}

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
      'Read the visible text of a page. args: { tabId?: string } — omit tabId for the active tab. ' +
        'Returns { url, title, content }.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      const { url, title, text } = await host.readPage(args.tabId);
      return buildPageSnapshot(text, url, title);
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_location',
      'state_changing',
      'The DEFAULT way to open a page: navigate a tab to a web URL (reuses the tab). ' +
        'args: { url: string, tabId?: string } — omit tabId for the active tab. Returns { url, title }.',
    ),
    inputSchema: NavigateArgs,
    handler: (args) => host.navigate(args.url, args.tabId),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_get_elements',
      'read',
      "Read a page's actionable elements (buttons, links, inputs) from the accessibility " +
        'tree. args: { tabId?: string } — omit tabId for the active tab. Returns ' +
        '{ url, title, elements: [{ ref, role, name, value?, disabled? }], content }. ' +
        "Use each element's `ref` with browser_update_page to click or fill it. Re-read after any " +
        'navigation or page change — refs are only valid for the latest snapshot. ' +
        "A collapsed menu/drawer's items are NOT listed until it is open — click its menu/hamburger " +
        'toggle (or scroll), then re-read.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      const { url, title, elements } = await host.snapshotElements(args.tabId);
      return buildElementsSnapshot(elements, url, title);
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_page',
      'read',
      'Wait for a page load to settle and optionally verify visible text. args: ' +
        '{ tabId?: string, containsText?: string, timeoutMs?: number } — omit tabId for the active tab. ' +
        'Returns { url, title, ok, containsText? }.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: ValidatePageArgs,
    handler: async (args) => {
      await host.waitForLoad(args.tabId, args.timeoutMs);
      const { url, title, text } = await host.readPage(args.tabId);
      const ok = args.containsText === undefined || text.includes(args.containsText);
      return args.containsText === undefined
        ? { url, title, ok }
        : { url, title, ok, containsText: args.containsText };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_page',
      'state_changing',
      'Perform ONE interaction on a page, using a `ref` from browser_get_elements on the same tab. args: ' +
        'one of { action: "click", ref, tabId? } · { action: "fill", ref, text, tabId? } · ' +
        '{ action: "press", key, tabId? } (e.g. "Enter", "Tab", "Escape", "ArrowDown") · ' +
        '{ action: "scroll", direction: "up"|"down", amount?, tabId? }. Omit tabId for the active tab. ' +
        'File inputs must be handled through upload_create_item so path grants, approval, and audit apply. ' +
        'Returns { ok, url, title, changed, recoveryHint?, note? }. changed=true also fires when a click ' +
        'opens a menu/drawer/panel with no new page text (a `note` then says to re-read elements). If ' +
        'changed=false, re-read elements or use browser_get_screenshot before trying a different ref — ' +
        'never repeat the same ref blindly.',
    ),
    inputSchema: UpdatePageArgs,
    handler: async (args) => {
      const before = await host.readPage(args.tabId);
      switch (args.action) {
        case 'click':
          await host.clickElement(args.ref, args.tabId);
          break;
        case 'fill':
          await host.fillElement(args.ref, args.text, args.tabId);
          break;
        case 'press':
          await host.pressKey(args.key, args.tabId);
          break;
        case 'scroll':
          await host.scrollPage(args.direction, args.amount, args.tabId);
          break;
      }
      const after = await host.readPage(args.tabId);
      const changed = pageChanged(before, after);
      // A scroll's effect is a viewport move, not a content/state change. Report `changed` plainly and skip
      // BOTH the structural "a menu opened — do NOT repeat" note (false: scrolling changes the in-viewport
      // actionable set by design, and scrolling again is a normal way to reach content) and the "no change"
      // recovery hint. The model re-reads elements next to see what scrolled into view.
      if (args.action === 'scroll') {
        return { ok: true, url: after.url, title: after.title, changed };
      }
      if (!changed) {
        return {
          ok: true,
          url: after.url,
          title: after.title,
          changed,
          recoveryHint:
            'No visible or structural change was detected. Re-read browser_get_elements and try a different ref; use browser_get_screenshot if text/a11y is insufficient.',
        };
      }
      // Structural-only: the actionable set moved (a menu/drawer/panel opened) but no new prose appeared.
      // Tell the model so it re-reads elements and acts on the newly revealed controls instead of assuming
      // its click failed and repeating it — the exact loop this signal is here to break.
      if (structuralOnlyChange(before, after)) {
        return {
          ok: true,
          url: after.url,
          title: after.title,
          changed,
          note: 'The set of actionable elements changed (e.g. a menu/drawer/panel opened) with no new page text. Re-read browser_get_elements and act on the newly revealed controls — do NOT repeat this interaction.',
        };
      }
      return { ok: true, url: after.url, title: after.title, changed };
    },
  });
}
