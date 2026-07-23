/**
 * AI-7 (`s31`) escape metric — pure + Playwright-free so it is unit-testable without launching the app.
 * "Escape" is the anti-pattern the navigation-grounding fix targets: the agent LEAVES the task's site
 * (off-origin navigation) or reaches for `web_search` instead of persisting on the on-page route. A
 * SAME-SITE navigation — even a guessed path that 404s — is deliberately NOT an escape: that is a URL
 * fabrication, measured by the scenario's own pass/fail, not here.
 */

/** The minimal per-step shape the metric reads (a subset of the eval out-JSON `steps`). */
export interface EscapeStep {
  tool: string;
  targetUrl?: string | undefined;
}

/** Tools whose `targetUrl` leaving the site counts as an escape: same-tab navigation, off-page fetch, and
 *  opening a NEW TAB at a URL (bailing off the on-page route by spawning a tab is just as much an escape).
 *  A urlless new tab (about:blank) has no `targetUrl`, so the guard below correctly ignores it. */
const NAV_TOOLS: ReadonlySet<string> = new Set(['browser_update_location', 'web_get_page', 'tab_create_item']);

/**
 * Did this run escape the on-page route? True if it called `web_search_items`, or navigated/fetched to a
 * URL outside the task's site. `siteBase` is the fixture directory (the sub-path "site"); `entryUrl`
 * resolves relative targets and pins the origin. Only meaningful for fixture scenarios — a genuinely
 * off-site task must be excluded by the caller (open-web nav is legitimate there).
 */
export function tripEscaped(
  steps: readonly EscapeStep[] | undefined,
  siteBase: string,
  entryUrl: string,
): boolean {
  let origin = '';
  try {
    origin = new URL(entryUrl).origin;
  } catch {
    return false;
  }
  for (const step of steps ?? []) {
    if (step.tool === 'web_search_items') return true;
    if (NAV_TOOLS.has(step.tool) && step.targetUrl !== undefined) {
      let target: URL;
      try {
        target = new URL(step.targetUrl, entryUrl);
      } catch {
        continue;
      }
      if (target.origin !== origin || !target.href.startsWith(siteBase)) return true;
    }
  }
  return false;
}
