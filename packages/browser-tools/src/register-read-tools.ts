import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import {
  sanitizeContent,
  wrapUntrustedContent,
  acceptScript,
  capResult,
} from '@tepegoz/tool-executor';
import { buildPageSnapshot } from './perception';
import { summarizeNetwork } from './network-verify';
import { levelsAtOrAbove, summarizeConsole } from './console-log';
import { summarizeStyle } from './style-inspector';
import { summarizeQuery, MAX_QUERY_MATCHES } from './dom-query';
import { descriptor } from './descriptor';
import {
  TargetTabArgs,
  ExtractionArgs,
  GetConsoleArgs,
  GetStylesArgs,
  SearchNodesArgs,
} from './tool-args';
import type { BrowserHost } from './host';

/**
 * The read-only and host-gated `browser_*` tools: page/article reads, sandboxed extraction, PDF export,
 * device emulation, sitemap listing and the console/network/style/DOM-query diagnostics. Split out of
 * `browser-tools.ts`; registration order is preserved by the composer.
 */

/** Registers the page-reading and diagnostic tools into the `CapabilityRegistry`, bound to `host`. */
export function registerReadTools(host: BrowserHost): void {
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
      'browser_get_article',
      'read',
      "Read a page's ARTICLE text — the main content with navigation, headers, footers and sidebars " +
        'removed. args: { tabId?: string } — omit tabId for the active tab. Returns ' +
        '{ url, title, content, source }. Prefer this over browser_get_page when you want to READ or ' +
        'summarise a page; `source` names the content root that was used, and `source: "body"` means no ' +
        'article was found and this is the whole page. Use browser_get_page when you need every visible ' +
        'string (including nav and banners), and browser_get_elements to ACT on the page.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: TargetTabArgs,
    handler: async (args) => {
      // A host without content extraction degrades to the same text browser_get_page returns, labelled
      // 'body' — never a silent claim that an article was extracted when it was not.
      const page =
        host.readArticleText === undefined
          ? { ...(await host.readPage(args.tabId)), source: 'body' }
          : await host.readArticleText(args.tabId);
      return { ...buildPageSnapshot(page.text, page.url, page.title), source: page.source };
    },
  });

  // S5: model-authored extraction. Registered ONLY when the host can provide the proven sandbox —
  // a missing sandbox means no tool, never a script run somewhere more convenient.
  if (host.runExtractionScript !== undefined) {
    const runScript = host.runExtractionScript.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_analyze_page',
        'read',
        'Run a small JavaScript expression over a COPY of the page and return what it evaluates to. args: { script: string, tabId?: string }. Use this to pull many values at once — every row of a table, every price in a list — instead of clicking through them one at a time. The script runs against a snapshot in a sandbox with no network and no access to the real page: it can read the DOM (querySelectorAll, textContent, attributes) and MUST NOT try to change the page, store anything, or fetch anything. Return a string or an array of strings. Results are capped and will say so when truncated.',
        { aiTask: 'read_understand', capability: 'code_exec_read' },
      ),
      inputSchema: ExtractionArgs,
      handler: async (args) => {
        const accepted = acceptScript(args.script);
        // A refusal is RETURNED, not thrown: the model wrote this script and can rewrite it, so the
        // reason is more useful to it than an error is to the run.
        if (!accepted.ok) return { refused: accepted.reason, content: '' };
        // The hash reaches the journal through the tool result; the BODY never does. A
        // model-authored script is composed from page content, so logging it verbatim would copy an
        // injection payload into the audit record.
        const raw = await runScript(accepted.script, args.tabId);
        const capped = capResult(raw);
        // S5 DoD: the extraction's OUTPUT is page-derived data like any other read, whatever the
        // sandbox does to the SCRIPT — a table cell or list item can carry the same zero-width/bidi/
        // homoglyph injection shapes a page's visible text can. Sanitized + fenced exactly like
        // browser_get_page/browser_get_article, so it feeds the same taint tracker
        // (`contentFromResult` in agent-runtime-loop.ts reads this same `content` field) and carries
        // the same anti-injection footer the model already recognizes from every other page read.
        const guarded = sanitizeContent(capped.value);
        return {
          scriptHash: accepted.hash,
          content: wrapUntrustedContent(guarded.text),
          truncated: capped.truncated,
          flags: guarded.flags,
          ...(capped.items !== undefined ? { items: capped.items } : {}),
        };
      },
    });
  }

  // Save the current page as a PDF. Registered ONLY when the host can put the bytes through the
  // download lifecycle — quarantine, hash, trust check, human release. A host without that seam gets
  // no tool rather than a direct write.
  if (host.savePageAsPdf !== undefined) {
    const savePdf = host.savePageAsPdf.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_export_pdf',
        // `state_changing`, so it goes through the ToolGateway's HITL like every other act that leaves
        // something behind. Reading a page is free; putting a file on the user's disk is not.
        'state_changing',
        'Save a page as a PDF file. args: { tabId?: string } — omit tabId for the active tab. The ' +
          'file lands in the browser download list in quarantine and needs the human to release it, ' +
          'exactly like any other download. Returns { downloadId, filename, bytes }. There is no path ' +
          'and no way to open the file from here.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: TargetTabArgs,
      handler: async (args) => savePdf(args.tabId),
    });
  }

  // Device emulation (S3 PR7c / browserskill parity P4). Registered ONLY when the host can actually
  // emulate — a host without the seam gets no tool rather than a claim that nothing changed.
  if (host.setDeviceEmulation !== undefined) {
    const setDeviceEmulation = host.setDeviceEmulation.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_update_emulation',
        // `state_changing`: it changes how the page renders/behaves on this tab, the same class as a
        // click or a scroll in browser_update_page.
        'state_changing',
        'Switch a tab between its normal desktop rendering and a mobile emulation (narrow viewport + ' +
          'mobile user agent), to check a page\'s mobile layout/behaviour. args: { device: "mobile" | ' +
          '"desktop", tabId? } — omit tabId for the active tab; "desktop" reverts to normal. Two fixed ' +
          'presets, not arbitrary width/height — this checks mobile responsiveness, it does not spoof ' +
          'a specific device. Touch-event emulation is not included.',
        { aiTask: 'none' },
      ),
      inputSchema: TargetTabArgs.extend({ device: z.enum(['mobile', 'desktop']) }),
      handler: async (args) => {
        await setDeviceEmulation(args.device, args.tabId);
        return { device: args.device };
      },
    });
  }

  // S2: "find the pricing page" used to mean a blind multi-click crawl even though the site's own
  // sitemap already names it. Registered ONLY when the host has a sitemap reader wired — a host without
  // one gets no tool rather than a claim that a site publishes no other pages.
  if (host.discoverSitemap !== undefined) {
    const discoverSitemap = host.discoverSitemap.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_list_pages',
        'read',
        "List other pages the CURRENT tab's site publishes, via its robots.txt/sitemap.xml — cheaper " +
          'and more reliable than guessing a URL or crawling links to find e.g. a pricing or contact ' +
          'page. args: { tabId? } — omit tabId for the active tab. Returns { url, pages }: `pages` is ' +
          'every same-origin URL the sitemap declares (bounded, deduplicated), or `[]` when the site ' +
          "publishes no sitemap or none could be reached — that is NOT proof the page doesn't exist, " +
          'only that it is not sitemap-discoverable; fall back to on-page links or browser_get_elements. ' +
          'Can only ever return URLs on the SAME origin as the current tab.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: TargetTabArgs,
      handler: async (args) => {
        const page = await host.readPage(args.tabId);
        const pages = await discoverSitemap(page.url);
        return { url: page.url, pages };
      },
    });
  }

  // P3-d read-only diagnostics — the console half. Registered ONLY when the host observes the page's
  // console; a host that does not gets no tool rather than a claim that the page logged nothing. This
  // reads the page's OWN console output as it happened — it is not DevTools and not script execution
  // (ADR-0029 is untouched).
  if (host.consoleSince !== undefined) {
    const consoleSince = host.consoleSince.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_get_console',
        'read',
        "Read the page's own console output (console.log/warn/error) for debugging. args: " +
          "{ tabId?: string, level?: 'debug'|'info'|'warning'|'error' } — omit tabId for the active " +
          "tab; `level` is the MINIMUM severity to list ('warning' lists warnings and errors). Returns " +
          '{ url, title, count, totalObserved, truncated, levels, content }. `levels` counts every ' +
          'observed message by severity even when older lines were trimmed from `content`. An empty ' +
          'result means nothing was observed (the tab may not have been attached long) — NOT that the ' +
          'page is error-free. This does not run any code on the page.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: GetConsoleArgs,
      handler: async (args) => {
        // Tolerant like the network signal: a host/tab that cannot answer yields an empty log, never an
        // error that fails an otherwise-fine step.
        const messages = await consoleSince(0, args.tabId).catch(() => []);
        const page = await host.readPage(args.tabId).catch(() => ({ url: '', title: '' }));
        return summarizeConsole(
          messages,
          page.url,
          page.title,
          args.level === undefined ? undefined : levelsAtOrAbove(args.level),
        );
      },
    });
  }

  // P3-d read-only diagnostics — the network half. Registered ONLY when the host observes the page's
  // XHR/fetch/document traffic. Shows method/status/timing, never bodies or headers — a narrow
  // read-only carve-out, not DevTools (ADR-0029 is untouched).
  if (host.networkRequestsSince !== undefined) {
    const networkRequestsSince = host.networkRequestsSince.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_get_network',
        'read',
        "List the page's recent XHR/fetch/document requests for debugging. args: { tabId?: string } " +
          '— omit tabId for the active tab. Returns { url, count, totalObserved, truncated, failed, ' +
          'content }; each line is `METHOD path → status (Nms)`. Only XHR/fetch/document requests are ' +
          'shown (not images/scripts/fonts), and never request or response BODIES or headers. An ' +
          'empty result means nothing was observed (the tab may not have been attached long) — NOT ' +
          'that the page made no requests. Use this to check whether a form submit or save actually ' +
          'reached the server and what it returned.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: TargetTabArgs,
      handler: async (args) => {
        const observations = await networkRequestsSince(0, args.tabId).catch(() => []);
        const page = await host.readPage(args.tabId).catch(() => ({ url: '' }));
        return summarizeNetwork(observations, page.url);
      },
    });
  }

  // P3-d read-only diagnostics — the style/box-model half, and the ONLY one of the three that needs no
  // CDP at all (not even the `Network`/console-event plumbing the other two piggyback on). Registered
  // ONLY when the host can resolve a ref this way; a host without it gets no tool rather than one that
  // can only ever answer "not found".
  if (host.styleOfRef !== undefined) {
    const styleOfRef = host.styleOfRef.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_get_styles',
        'read',
        "Read ONE element's computed CSS + box model, to debug why it looks wrong (invisible, " +
          'misplaced, wrong color) — NOT a general page or DOM dump. args: { ref: number, tabId?: ' +
          'string }; `ref` is from browser_get_elements on the same tab. Returns a fixed set of ' +
          'properties: display, visibility, opacity, position, zIndex, color, backgroundColor, a ' +
          'bounding box { x, y, width, height }, and `visible` (rendered AND on-screen — check ' +
          'display/visibility/opacity/the box yourself to see which half is false). `found: false` ' +
          'means the ref could not be resolved (stale, or read while a different perception mode is ' +
          'active) — re-read browser_get_elements and try again; it is never a fabricated style. Use ' +
          'browser_get_elements for what is on the page and how to act on it, and browser_analyze_page ' +
          'to pull values out of MANY elements at once; use this only to diagnose one element.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: GetStylesArgs,
      handler: async (args) => {
        // Tolerant like the console/network siblings: a stale ref or an unreachable tab yields "not
        // found", never an error that fails an otherwise-fine diagnostic read.
        const probe = await styleOfRef(args.ref, args.tabId).catch(() => null);
        const page = await host.readPage(args.tabId).catch(() => ({ url: '' }));
        return summarizeStyle(probe, args.ref, page.url);
      },
    });
  }

  // S2/PR7 P3-a — a bounded DOM query, broader than browser_search_elements: it runs the query through
  // the browser's NATIVE querySelectorAll/document.evaluate rather than filtering the actionable-element
  // set, so it can find a node with no interactable role at all. Registered ONLY when the host can
  // resolve this without CDP (mirrors browser_get_styles's isolated-world-only discipline) — a host
  // without it gets no tool rather than a claim that the page has no matching nodes.
  if (host.queryElements !== undefined) {
    const queryElements = host.queryElements.bind(host);
    CapabilityRegistry.register({
      descriptor: descriptor(
        'browser_search_nodes',
        'read',
        'Find DOM nodes on the page by a CSS selector or an XPath expression — broader than ' +
          'browser_search_elements: it searches the whole native DOM, not just actionable ' +
          '(button/link/input) elements, so it can find a plain container, a landmark, or a table cell ' +
          `that has no interactable role. args: { query: string, queryType?: 'css' | 'xpath', tabId? } ` +
          "— queryType defaults to 'css'; omit tabId for the active tab. Returns { url, query, " +
          'queryType, ok, count, totalMatches, truncated, matches: [{ tag, ref, attributes }], content }. ' +
          `Matches are capped at ${String(MAX_QUERY_MATCHES)} (truncated reports whether more exist); no ` +
          'innerHTML or text content is ever returned — only the tag and its attributes. `ref` is in the ' +
          'SAME space as browser_get_elements/browser_update_page: an already-known element keeps its ' +
          'ref, a newly-found one gets a fresh ref you can act on immediately, and `ref: null` means the ' +
          'node was found but cannot be addressed (rare). `ok: false` means the selector/XPath itself was ' +
          'invalid (see `error`) — never a thrown error. Use browser_get_elements for what you can click ' +
          'or fill; use this to check whether specific markup/text-bearing structure exists at all.',
        { aiTask: 'read_understand' },
      ),
      inputSchema: SearchNodesArgs,
      handler: async (args) => {
        const queryType = args.queryType ?? 'css';
        // Tolerant like the console/network/style siblings: an infra failure (destroyed tab, isolated
        // world rejecting) degrades to a clean ok:false result, never an error that fails an otherwise
        // fine read.
        const probe = await queryElements(args.query, queryType, args.tabId).catch(() => ({
          ok: false as const,
          error: 'the query could not be run',
          total: 0,
          matches: [],
        }));
        const page = await host.readPage(args.tabId).catch(() => ({ url: '' }));
        return summarizeQuery(probe, args.query, queryType, page.url);
      },
    });
  }
}
