import { detectHandoff, type HandoffSignal } from '@tepegoz/security-policy';
import type { StepOutcome } from '@tepegoz/orchestrator';
import type { AgentRunDeps } from './agent-runtime-types';
import { contentFromResult, listTabs, tabIdFromArgs, urlFromResult } from './agent-runtime-tool-io';

/** Model-facing nudge injected (as a steer message) when the user resumes after a login handoff-hold:
 *  re-perceive the now-authenticated page and continue the ORIGINAL task rather than restart. English to
 *  match the other reactor-injected control messages (the model reasons in English internally). */
export const RESUME_AFTER_LOGIN =
  'I have completed the sign-in on this page. Re-read the current page with browser_get_elements, then ' +
  'continue the original task from where you left off — do not start over.';

/**
 * Tools whose result `content` is diagnostics or off-page text — NOT the browser page the agent is
 * perceiving in order to act. The handoff guard must skip these: `browser_get_console` routinely logs a
 * `recaptcha/api.js` script URL for a site that merely protects a newsletter form, `browser_get_network`
 * lists request URLs, and a `web_search_items` / `web_get_page` snippet can quote "verify you are human"
 * as page text from some OTHER site. Scanning any of them fired a bogus CAPTCHA/login handoff that killed
 * a legitimate run. Taint recording in `onOutcome` still covers this content (it is still untrusted) —
 * only the handoff scan is scoped out.
 */
const NON_PERCEPTION_TOOLS: ReadonlySet<string> = new Set([
  'browser_get_console',
  'browser_get_network',
  'web_search_items',
  'web_get_page',
]);

/**
 * The human-handoff signal for a completed step, or null. Wraps {@link detectHandoff} with the
 * {@link NON_PERCEPTION_TOOLS} gate: only content that IS the browser page the agent is acting on can
 * trip the wall. Exported for its unit test — the reactor's `guard` closure adds the login-hold vs
 * terminal-stop decision on top of this.
 */
export function perceivedHandoffSignal(o: StepOutcome): HandoffSignal | null {
  if (NON_PERCEPTION_TOOLS.has(o.tool)) return null;
  const content = contentFromResult(o.result);
  if (content === undefined) return null;
  return detectHandoff(content, urlFromResult(o.result));
}

/**
 * The Human Handoff console/notification message for a detected signal (Phase 5 compatibility
 * disclosure). A CAPTCHA hit on a tab routed through a tunnel (VPN/Tor/chained — any non-Direct
 * resolved binding) gets {@link AgentRunDeps.captchaTunnelDisclosure} appended: the shared exit address,
 * not the user, is the likely reason the site is challenging it, and an agent run reuses that same
 * address far more repetitively than a human browsing normally does.
 *
 * Deliberately narrow: 2FA/OTP and login-wall handoffs are unrelated to the exit IP and are NEVER
 * touched, and a CAPTCHA on a Direct tab is left exactly as it reads today — appending the disclosure
 * there would misattribute an ordinary challenge to a tunnel the tab isn't even using. Absent
 * `deps.tabTunneled` / `deps.captchaTunnelDisclosure` (host hasn't wired Phase 5) degrades to today's
 * plain message, same as every other optional {@link AgentRunDeps} seam.
 */
export function handoffMessageFor(
  signal: HandoffSignal,
  o: StepOutcome,
  deps: AgentRunDeps,
): string {
  const base = deps.handoffStrings[signal.kind];
  if (signal.kind !== 'captcha') return base;
  if (deps.tabTunneled === undefined || deps.captchaTunnelDisclosure === undefined) return base;
  const tabId = tabIdFromArgs(o.args) ?? listTabs(deps).find((t) => t.active)?.id;
  if (tabId === undefined || !deps.tabTunneled(tabId)) return base;
  return `${base} ${deps.captchaTunnelDisclosure}`;
}
