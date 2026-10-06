import { AppError } from '@tepegoz/libs';
import TabManager from '../tabs';
import CdpDriver from './cdp-driver.electron';
import AgentTabGroup from './agent-tab-group.electron';
import { buildArticleTextExpression } from './article-text-script.js';
import { runExtraction } from './extraction-sandbox.electron.js';
import { buildWaitConditionExpression, clampWaitMs } from './wait-condition-script.js';
import { currentGroupId, setRunCurrentTab } from './browser-host-run-scope.electron';
import { requireWc, requireWcUntranslated, waitForLoad } from './browser-host-tab.electron';

export async function navigate(
  url: string,
  tabId?: string,
): Promise<{ url: string; title: string }> {
  if (tabId === undefined) {
    // When the active tab is the view-less internal newtab, `navigateActive` would fork the navigation
    // into a brand-new UNGROUPED web tab (leaving the newtab orphaned) — which desyncs the agent's
    // active-tab target and produces "No active page" on the next read. Instead, open the page as a real
    // web tab INSIDE this run's group (create-or-reuse + ownership), then close the orphan so the result
    // replaces the newtab in place (Chrome parity). Only for an active agent run (group known).
    const orphanId = TabManager.viewlessActiveTabId();
    const runGroupId = currentGroupId();
    if (orphanId !== null && runGroupId !== null) {
      const newId = AgentTabGroup.openTab(runGroupId, url); // activates newId; throws if blocked
      TabManager.closeTab(orphanId); // orphan is no longer active → no reselection churn
      setRunCurrentTab(newId); // the run's page replaced the newtab — follow it there
      const wc = requireWc(newId);
      await waitForLoad(wc);
      if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
      return { url: wc.getURL(), title: wc.getTitle() };
    }
    TabManager.navigateActive(url); // live web view (in-place), or no active run — scheme allow-list inside
  } else if (!TabManager.navigateTab(tabId, url)) {
    throw new AppError(`No web tab to navigate: ${tabId}`, 409);
  }
  const wc = requireWc(tabId);
  await waitForLoad(wc);
  // The tab may have been closed (webContents destroyed) during the up-to-15s wait — never call
  // methods on a destroyed WebContents (throws an opaque "Object has been destroyed").
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle() };
}

export async function readPage(
  tabId?: string,
): Promise<{ url: string; title: string; text: string; sig: string }> {
  // ADR-0042 §3: the agent reads untranslated source. If the tab is showing a page translation,
  // restore it before perceiving, so a run never depends on model output that was never in the page.
  const wc = await requireWcUntranslated(tabId);
  const url = wc.getURL();
  const title = wc.getTitle();
  // Read the visible text AND a structural signature of the on-screen actionable elements in one eval.
  // The signature hashes each visible interactive element's structural identity (tag · role · href-path ·
  // digit-masked label), in traversal order — NOT its position — so an in-place SPA toggle that slides a
  // drawer/menu/panel into the viewport changes it (the revealed controls become visible) while incidental
  // repaints/animations and live clock/counter labels do not. It pierces OPEN shadow roots and SAME-ORIGIN
  // iframes so it observes the same clickable surface AI-2 perception (buildDomTree) exposes to the model.
  // This is what lets browser_update_page tell a real state change from a genuine no-op. See
  // `packages/browser-tools`'s pageChanged.
  const result: unknown = await wc.executeJavaScript(
    `(() => {
      const text = document.body ? document.body.innerText : '';
      let sig = '';
      try {
        const SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[onclick],[tabindex]';
        const CAP = 800;
        const parts = [];
        // Rendered? checkVisibility (Chromium 105+) also catches ANCESTOR opacity:0 / display:none /
        // content-visibility — the common CSS fade-in drawer/menu pattern a per-element style read misses.
        const shown = (el, win) => {
          if (typeof el.checkVisibility === 'function') {
            return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
          }
          const st = win.getComputedStyle(el);
          return !(st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0);
        };
        const visit = (root, win) => {
          if (!root || !win || parts.length >= CAP) return;
          const vw = win.innerWidth || 0;
          const vh = win.innerHeight || 0;
          let nodes;
          try { nodes = root.querySelectorAll(SEL); } catch (_e) { nodes = []; }
          for (let i = 0; i < nodes.length && parts.length < CAP; i++) {
            const el = nodes[i];
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;                                  // zero-area
            if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) continue; // off-viewport
            if (!shown(el, win)) continue;
            // Identity = tag · role · href(query dropped) · label(digits masked); el.value is excluded so a
            // live clock/counter/re-tokenized URL does not flip sig on a genuine no-op.
            let href = el.getAttribute('href') || '';
            const q = href.indexOf('?'); if (q >= 0) href = href.slice(0, q);
            const label = (el.getAttribute('aria-label') || el.textContent || '')
              .replace(/\\s+/g, ' ').trim().slice(0, 40).replace(/\\d+/g, '#');
            parts.push(el.tagName + '|' + (el.getAttribute('role') || '') + '|' + href + '|' + label);
          }
          // Open shadow roots (closed roots expose no .shadowRoot, so are invisible here — as intended).
          let hosts;
          try { hosts = root.querySelectorAll('*'); } catch (_e) { hosts = []; }
          for (let i = 0; i < hosts.length && parts.length < CAP; i++) {
            if (hosts[i].shadowRoot) visit(hosts[i].shadowRoot, win);
          }
          // Same-origin iframes (cross-origin contentDocument access throws → skipped).
          let frames;
          try { frames = root.querySelectorAll('iframe'); } catch (_e) { frames = []; }
          for (let i = 0; i < frames.length && parts.length < CAP; i++) {
            let doc = null, fwin = null;
            try { doc = frames[i].contentDocument; fwin = frames[i].contentWindow; } catch (_e) { doc = null; }
            if (doc && fwin) visit(doc, fwin);
          }
        };
        visit(document, window);
        // djb2 over the joined parts — a compact, order-sensitive fingerprint (not sent to the model).
        const s = parts.join('\\n');
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        sig = (h >>> 0).toString(36) + ':' + parts.length;
      } catch (_e) {
        sig = '';
      }
      return { text: typeof text === 'string' ? text : '', sig };
    })()`,
    true,
  );
  const shaped = (result ?? {}) as { text?: unknown; sig?: unknown };
  return {
    url,
    title,
    text: typeof shaped.text === 'string' ? shaped.text : '',
    sig: typeof shaped.sig === 'string' ? shaped.sig : '',
  };
}

/**
 * Move a tab through its own history, or reload it (S3 PR1).
 *
 * `moved` comes from the browser's own `canGoBack`/`canGoForward`, not from comparing URLs afterwards:
 * a site that pushes the same URL twice makes a real back step look like a no-op, and a genuine no-op
 * look like a step. Reload always counts as moved — it did do something.
 */
export async function historyGo(
  direction: 'back' | 'forward' | 'reload',
  tabId?: string,
): Promise<{ url: string; title: string; moved: boolean }> {
  const wc = requireWc(tabId);
  let moved = true;
  if (direction === 'reload') {
    wc.reload();
  } else if (direction === 'back') {
    moved = wc.navigationHistory.canGoBack();
    if (moved) wc.navigationHistory.goBack();
  } else {
    moved = wc.navigationHistory.canGoForward();
    if (moved) wc.navigationHistory.goForward();
  }
  if (moved) await waitForLoad(wc);
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during history navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle(), moved };
}

/**
 * Wait until a condition holds, bounded by an explicit timeout (S3 PR1).
 *
 * `network_idle` reuses the driver's existing settle logic (load-stop → network idle → DOM quiescence)
 * rather than inventing a second definition of "quiet" that could disagree with the one every
 * interaction is already judged by. `text`/`selector` poll inside the page.
 *
 * An unsatisfied wait is a RESULT, never an error: the model needs to know it waited and the thing did
 * not arrive, so it can act differently instead of retrying blind.
 *
 * A `text` wait matches against the page's visible text, so it must read the UNTRANSLATED source
 * (ADR-0042 §3) — the model reasons in the page's own language, and a run that waits for a
 * source-language string would never match a page the user had translated in place. `selector` and
 * `network_idle` are structural and unaffected.
 */
export async function waitForCondition(
  condition: { kind: 'text' | 'selector' | 'network_idle'; value?: string; timeoutMs: number },
  tabId?: string,
): Promise<{ satisfied: boolean; waitedMs: number }> {
  const wc = condition.kind === 'text' ? await requireWcUntranslated(tabId) : requireWc(tabId);
  const timeoutMs = clampWaitMs(condition.timeoutMs);
  const started = Date.now();
  if (condition.kind === 'network_idle') {
    await CdpDriver.waitForPageSettled(wc, timeoutMs);
    return { satisfied: true, waitedMs: Date.now() - started };
  }
  const value = condition.value ?? '';
  if (value.length === 0) return { satisfied: false, waitedMs: 0 };
  const raw: unknown = await wc.executeJavaScript(
    buildWaitConditionExpression(condition.kind, value, timeoutMs),
    true,
  );
  const shaped = (raw ?? {}) as { satisfied?: unknown; waitedMs?: unknown };
  return {
    satisfied: shaped.satisfied === true,
    waitedMs: typeof shaped.waitedMs === 'number' ? shaped.waitedMs : Date.now() - started,
  };
}

/**
 * Read the page's article text (S2 PR4): the content root the page declares, minus the chrome every page
 * agrees on. Runs in the page's main world like {@link readPage} — it only reads, and it clones before it
 * strips, so nothing is mutated. A malformed result degrades to empty text labelled `'body'` rather than
 * to a claim that an article was found.
 */
export async function readArticleText(
  tabId?: string,
): Promise<{ url: string; title: string; text: string; source: string }> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — untranslated source
  const result: unknown = await wc.executeJavaScript(buildArticleTextExpression(), true);
  const shaped = (result ?? {}) as { text?: unknown; source?: unknown };
  return {
    url: wc.getURL(),
    title: wc.getTitle(),
    text: typeof shaped.text === 'string' ? shaped.text : '',
    source: typeof shaped.source === 'string' ? shaped.source : 'body',
  };
}

/** Content-addressed reveal: scroll the `nth` on-page occurrence of `text` into view via the browser's
 *  native find (which searches same-origin frames), then EXPLICITLY scroll the matched node to centre —
 *  a `scrollIntoView` is focus/visibility-independent, unlike `window.find`'s implicit selection-scroll —
 *  and clear the selection so no highlight lingers and no later keypress operates on the selected range.
 *  Deterministic and rule-based (no wheel-delta guesswork). Resolves `{ found, count }`: `count` is how
 *  many occurrences were located (≤ nth), so a shortfall is reported honestly rather than as "no match".
 *  The text is embedded with JSON.stringify so it can never break out of the string literal. */
export async function scrollToText(
  text: string,
  nth?: number,
  tabId?: string,
): Promise<{ found: boolean; count: number }> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — match against untranslated text
  const n =
    nth !== undefined && Number.isFinite(nth) && nth > 0 ? Math.min(Math.floor(nth), 50) : 1;
  const raw: unknown = await wc.executeJavaScript(
    `(() => {
      try {
        const t = ${JSON.stringify(text)};
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel) sel.removeAllRanges();               // start the search from the top of the document
        let count = 0;
        for (let i = 0; i < ${String(n)}; i++) {
          // window.find(text, caseSensitive, backwards, wrapAround, wholeWord, searchInFrames, showDialog)
          if (window.find(t, false, false, false, false, true, false)) count++;
          else break;                                 // fewer than nth matches -> stop; count is the total
        }
        if (count > 0 && sel && sel.rangeCount > 0) {
          const node = sel.getRangeAt(0).startContainer;
          const el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
          if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'nearest' });
          sel.removeAllRanges();                       // drop the highlight; no lingering selection to act on
        }
        return { found: count > 0, count: count };
      } catch (_e) {
        return { found: false, count: 0 };
      }
    })()`,
    true,
  );
  const shaped = (raw as { found?: unknown; count?: unknown } | null) ?? {};
  const count =
    typeof shaped.count === 'number' && Number.isFinite(shaped.count) ? shaped.count : 0;
  return { found: shaped.found === true, count };
}

/**
 * Run a model-authored extraction script (S5).
 *
 * The page HTML is read out here and COPIED into the sandbox — the script never touches the live
 * page, and the sandbox it does run in has no network. Both properties are measured, not asserted:
 * see `e2e/spike-code-exec-sandbox.spec.ts`.
 */
export async function runExtractionScript(script: string, tabId?: string): Promise<unknown> {
  const wc = await requireWcUntranslated(tabId); // ADR-0042 §3 — extract from untranslated DOM
  const html: unknown = await wc.executeJavaScript('document.documentElement.outerHTML', true);
  return runExtraction({ html: typeof html === 'string' ? html : '', script });
}
