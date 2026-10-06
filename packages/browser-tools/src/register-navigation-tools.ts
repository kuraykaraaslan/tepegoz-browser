import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { checkForm, wrapUntrustedContent, MAX_INTERACTABLE_ELEMENTS } from '@tepegoz/tool-executor';
import { CredentialFillIntentSchema } from '@tepegoz/shared-types';
import { buildElementsSnapshot, type ElementsDiffMemory } from './perception';
import { interceptionNote } from './action-signals';
import { descriptor } from './descriptor';
import {
  TargetTabArgs,
  NavigateArgs,
  ValidatePageArgs,
  SearchElementsArgs,
  HistoryArgs,
  WaitConditionArgs,
} from './tool-args';
import type { BrowserHost } from './host';

/**
 * The navigation, element-listing, validation and wait tools: `browser_update_location`,
 * `browser_get_elements`, `browser_search_elements`, `browser_validate_*`, `credential_update_field`,
 * `browser_update_history`. Split out of `browser-tools.ts`; registration order is preserved by the
 * composer.
 */

/** Viewport expansion (CSS px per edge) used by the whole-form check, so a required field below the fold
 *  is still inspected. Large enough for a normal long form without asking for the entire document. */
const WHOLE_PAGE_EXPANSION_PX = 20_000;
/** Max matches `browser_search_elements` returns — a query that hits everything on the page (e.g. a
 *  single common letter) should not become a second full listing. */
const MAX_SEARCH_MATCHES = 50;

/** Registers the navigation, element and validation tools into the `CapabilityRegistry`, bound to `host`. */
export function registerNavigationTools(host: BrowserHost): void {
  /**
   * What the model was last shown per tab, so the next listing can send only what moved (S2 PR2).
   * Lives in this closure because the tool handler is the only place that knows both the tabId and what
   * was rendered. Bounded by the number of tabs a run touches, and each entry is dropped the moment the
   * tab's URL changes (a ref from another page addresses nothing here).
   */
  const diffMemory = new Map<string, ElementsDiffMemory>();
  const ACTIVE_TAB = '<active>';

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_location',
      'state_changing',
      'The DEFAULT way to open a page: navigate a tab to a web URL (reuses the tab). ' +
        'args: { url: string, tabId?: string } — omit tabId for the active tab. Returns ' +
        '{ url, title, note? } — `note` explains a beforeunload prompt that blocked the navigation (S3 PR4).',
    ),
    inputSchema: NavigateArgs,
    handler: async (args) => {
      const actedAt = Date.now();
      const result = await host.navigate(args.url, args.tabId);
      const note = await interceptionNote(host, args.tabId, actedAt);
      return note === undefined ? result : { ...result, note };
    },
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
      const { url, title, elements, canvasFraction } = await host.snapshotElements(args.tabId);
      const key = args.tabId ?? ACTIVE_TAB;
      const snapshot = buildElementsSnapshot(
        elements,
        url,
        title,
        diffMemory.get(key),
        canvasFraction,
      );
      diffMemory.set(key, snapshot.memory);
      return snapshot;
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_search_elements',
      'read',
      'Find actionable elements (buttons, links, inputs) matching text, without paying for a full ' +
        'browser_get_elements listing — cheaper targeting on a large page when you already know roughly ' +
        'what you are looking for (e.g. "checkout", "unsubscribe", a product name). args: ' +
        '{ query: string, tabId? } — omit tabId for the active tab. `query` matches case-insensitively ' +
        "against each element's name, value, tag, role and link destination. Returns " +
        '{ url, title, query, matches: [{ ref, role, name, tag?, href?, value? }], count }. Matches are ' +
        `capped at ${String(MAX_SEARCH_MATCHES)}; a narrower query finds the rest. An empty result means ` +
        'no ACTIONABLE element matched — it is not proof the page lacks the text: plain prose (a ' +
        'paragraph, a price with no control around it) is not in this set at all, and ' +
        "browser_validate_page's `containsText` answers that question instead. Use each match's `ref` " +
        'with browser_update_page exactly like a browser_get_elements ref — re-read (either tool) after ' +
        'any navigation or page change.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: SearchElementsArgs,
    handler: async (args) => {
      const { url, title, elements } = await host.snapshotElements(args.tabId);
      const snapshot = buildElementsSnapshot(elements, url, title);
      const needle = args.query.toLowerCase();
      const matchesField = (value: string | undefined): boolean =>
        value !== undefined && value.toLowerCase().includes(needle);
      const matches = snapshot.elements
        .filter(
          (el) =>
            matchesField(el.name) ||
            matchesField(el.value) ||
            matchesField(el.tag) ||
            matchesField(el.role) ||
            matchesField(el.href),
        )
        .slice(0, MAX_SEARCH_MATCHES)
        .map((el) => ({
          ref: el.ref,
          role: el.role,
          name: el.name,
          ...(el.tag !== undefined ? { tag: el.tag } : {}),
          ...(el.href !== undefined ? { href: el.href } : {}),
          ...(el.value !== undefined ? { value: el.value } : {}),
        }));
      return { url, title, query: args.query, matches, count: matches.length };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_form',
      'read',
      'Pre-submit form check (AI-4 s16). Call this BEFORE clicking a submit/save/sign-up button to catch ' +
        'problems that would silently fail the submission. args: { tabId?: string } — omit tabId for the ' +
        'active tab. Returns { ok, coverage, content, requiredEmpty, flaggedInvalid, visibleErrors }. ' +
        'BLOCKING: requiredEmpty (fill those, then re-check). ADVISORY only: flaggedInvalid and ' +
        'visibleErrors — a page usually sets those on a failed submit and refreshes them on the NEXT one, ' +
        'so they may be left over from an earlier attempt; do not loop on them once the fields are correct. ' +
        'If coverage is "partial" the check could NOT see every field — scroll through the form and verify ' +
        'the rest yourself instead of treating it as a green light. NOTE: this re-reads the page, so element ' +
        'refs are refreshed — use the refs from THIS report, and re-read browser_get_elements before acting ' +
        'on refs from an older listing.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      // Widen the viewport test so required fields BELOW THE FOLD are inspected too: a clean result from a
      // viewport-only snapshot would be exactly the false "OK to submit" this tool exists to prevent.
      const [{ url, title, elements }, page] = await Promise.all([
        host.snapshotElements(args.tabId, { viewportExpansionPx: WHOLE_PAGE_EXPANSION_PX }),
        host.readPage(args.tabId),
      ]);
      const snapshot = buildElementsSnapshot(elements, url, title);
      // Only claim full coverage when the snapshot was not truncated by the element cap; `checkForm`
      // independently degrades to `partial` when no validation constraints were captured at all (e.g. the
      // accessibility-tree fallback, which carries no attributes).
      const truncated = snapshot.elements.length >= MAX_INTERACTABLE_ELEMENTS;
      const report = checkForm(snapshot.elements, page.text, {
        coverage: truncated ? 'partial' : 'complete',
      });
      // The report embeds page-controlled labels/error text, so it crosses the AI-5 boundary exactly like
      // every other page read: injection-redacted inside checkForm, then fenced as untrusted here.
      return {
        url,
        title,
        ok: report.ok,
        coverage: report.coverage,
        content: wrapUntrustedContent(report.summary, url),
        requiredEmpty: report.requiredEmpty,
        flaggedInvalid: report.flaggedInvalid,
        visibleErrors: report.visibleErrors,
      };
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

  // S6 PR6: registered ONLY when the host can broker a credential. A tool the agent can call but that
  // can never succeed is worse than no tool — it invites retries and hides the real blocker.
  if (host.fillCredential !== undefined) {
    CapabilityRegistry.register({
      descriptor: descriptor(
        'credential_update_field',
        'state_changing',
        'Fill a saved username or password into a login field WITHOUT ever seeing it. args: ' +
          "{ ref: number, field: 'username'|'password', tabId?: string } — ref from " +
          'browser_get_elements. The browser resolves the site from the current tab, finds the saved ' +
          'credential for it, asks the user to confirm, and types the value itself. You never receive ' +
          'the secret, so do not ask for it and do not try to read it back. Returns ' +
          '{ filled, field, origin, reason? }; when filled is false the reason says why — hand off to ' +
          'the user rather than retrying.',
      ),
      inputSchema: CredentialFillIntentSchema,
      handler: async (args) => {
        // Re-checked rather than captured, so the closure cannot hold a seam the host later removed.
        if (host.fillCredential === undefined) {
          return {
            filled: false,
            field: args.field,
            origin: '',
            reason: 'credential filling is unavailable',
          };
        }
        return host.fillCredential(args.ref, args.field, args.tabId);
      },
    });
  }

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_update_history',
      'state_changing',
      "Move a tab through its own history, or reload it. args: { direction: 'back'|'forward'|'reload', " +
        'tabId?: string } — omit tabId for the active tab. Returns { url, title, moved, note? }. ' +
        '`moved: false` means there was nowhere to go (e.g. no previous page), NOT that the page failed ' +
        'to change. Use this to leave a page you opened by mistake instead of guessing its previous URL. ' +
        '`note` explains a beforeunload prompt that blocked the move (S3 PR4).',
    ),
    inputSchema: HistoryArgs,
    handler: async (args) => {
      const actedAt = Date.now();
      const result = await host.historyGo(args.direction, args.tabId);
      const note = await interceptionNote(host, args.tabId, actedAt);
      return note === undefined ? result : { ...result, note };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'browser_validate_condition',
      'read',
      'Wait until something is true, instead of guessing how long a page needs. args: ' +
        "{ condition: 'text'|'selector'|'network_idle', value?: string, timeoutMs?: number, tabId?: " +
        'string }. `value` is the text to appear (condition "text") or the CSS selector to become ' +
        'VISIBLE (condition "selector"); "network_idle" needs no value. Returns ' +
        '{ satisfied, waitedMs, condition }. `satisfied: false` is a real answer — it waited and the ' +
        'thing did not arrive — so change approach rather than repeating the same wait.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: WaitConditionArgs,
    handler: async (args) => {
      const timeoutMs = args.timeoutMs ?? 5_000;
      const result = await host.waitForCondition(
        {
          kind: args.condition,
          ...(args.value !== undefined ? { value: args.value } : {}),
          timeoutMs,
        },
        args.tabId,
      );
      return { ...result, condition: args.condition };
    },
  });
}
