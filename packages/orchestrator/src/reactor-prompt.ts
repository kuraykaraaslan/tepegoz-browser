import { SECURITY_PREAMBLE } from '@tepegoz/tool-executor';
import type { ReactRequest } from './reactor-types';

/** Coreference guidance — emitted only when there ARE earlier turns, so a follow-up like "research this"
 *  resolves its pronoun to the real subject instead of being taken literally. */
const COREFERENCE_INSTRUCTION =
  '\nThe messages before the goal are earlier turns of the SAME conversation. Resolve any pronoun or ' +
  'deictic in the goal (English: this/that/it/them; Turkish: bunu/şunu/onu/o/bunları) to the concrete ' +
  'subject from those earlier turns BEFORE choosing a tool, and never use a bare pronoun as a search ' +
  'query or fill text.';

/** Browsing strategy — reuse the current tab by default; a new tab is the exception, not the habit. */
const BROWSING_STRATEGY =
  '\nPrefer to stay in the CURRENT tab: navigate it with browser_update_location. Open a new tab with ' +
  'tab_create_item ONLY when the current page must stay open or you need a side-by-side comparison — ' +
  'and when you do, pass a short groupName naming the task so the new tab is grouped. New tabs open ' +
  'in the background by default; pass the returned id as `tabId` to browser_* tools when working on ' +
  'that tab. Use tab_update_item only when the tab must become visible/focused. Close tabs you opened ' +
  'with tab_delete_item when they are no longer needed. After browser_update_page or navigation, verify ' +
  'the result with browser_validate_page, browser_get_page, or browser_get_elements before continuing. ' +
  // AI-8A: do NOT steer to browser_get_screenshot "as a visual fallback" — the image is not sent to the
  // model (CanonMessage is text-only), so it reveals nothing about the page. Point at real capabilities.
  'If browser_get_page/browser_get_elements do not expose enough information, the target is usually just ' +
  'not in view or not revealed yet: scroll, use browser_update_page with scroll_to_text to bring a known ' +
  'string into view, or open the menu/panel that holds it — then re-read. ' +
  'If browser_update_page returns changed=false, do not repeat the same ref blindly; ' +
  're-read browser_get_elements and try a different actionable ref or finish with a clear limitation.' +
  // AI-7 navigation grounding: prefer a route you can SEE or VERIFY; never fabricate a URL. The escape
  // vectors (guessing a path, bailing to web_search) are gated behind exhausting the on-page route.
  '\nWhen you cannot find a target section or link on the page, do NOT give up after reading only the ' +
  'landing page, and do NOT invent a URL. First REVEAL hidden navigation: a site\'s links are often behind ' +
  'a menu / hamburger / drawer or an overflow ("☰", "Menu", "More") toggle, or below the fold — click that ' +
  'toggle with browser_update_page (or scroll), then re-read browser_get_elements, because a collapsed ' +
  'menu\'s links are NOT listed until it is opened. Prefer a route you can SEE or VERIFY: a link in ' +
  'browser_get_elements (a "Navigation hint" observation points you to the best match) — navigate to its ' +
  'href with browser_update_location. Use a conventional path (e.g. /blog) ONLY when a link or the site\'s ' +
  'sitemap actually shows it — never by blindly appending a guess to the origin (a fabricated path that ' +
  '404s wastes steps). If the destination is genuinely OFF this site or its URL is unknown, use ' +
  'web_search_items to find it instead of typing a guessed URL. Leaving the page (web_search or off-site ' +
  'navigation) is a LAST resort once the on-page route is exhausted — it is never a shortcut around a ' +
  'menu, modal, or form you should just operate.' +
  // AI-4 s16: don't submit a form blind — a silent validation failure looks like a no-op and wastes steps.
  '\nBefore submitting a form (a submit / save / sign-up / continue button), call browser_validate_form. ' +
  'Its `requiredEmpty` list is BLOCKING — fill those fields, then re-check. Its `flaggedInvalid` and ' +
  '`visibleErrors` are ADVISORY: a page usually sets them on a failed submit and only refreshes them on the ' +
  'NEXT submit, so once the fields actually hold correct values, go ahead and submit rather than looping on ' +
  'a stale warning. If it reports coverage "partial" it could not see every field — scroll through the rest ' +
  'of the form and check them yourself instead of treating the result as a green light.';

export function systemPrompt(req: ReactRequest): string {
  const toolList = req.tools.map((t) => `- ${t.id} (${t.dangerClass}): ${t.description}`).join('\n');
  const outline = req.outline && req.outline.length > 0 ? `\nSuggested approach:\n${req.outline.join('\n')}` : '';
  const avoid = req.avoid && req.avoid.length > 0 ? `\nDo NOT do (the user removed these): ${req.avoid.join('; ')}` : '';
  const coref = req.history && req.history.length > 0 ? COREFERENCE_INSTRUCTION : '';
  return (
    `${SECURITY_PREAMBLE}\n\n` +
    'You are an agent driving a web browser one action at a time. Given the goal and everything ' +
    'observed so far, decide the SINGLE next step. To interact with a page, first call ' +
    'browser_get_elements to see the actionable elements and their refs, then use browser_update_page ' +
    'with a ref. Output ONLY JSON, no prose or markdown fences, of exactly one of:\n' +
    '{"action":"act","tool":"<id>","args":{…},"rationale":"<why>","evaluation_previous_goal":"<did the last action achieve its goal? success/failure and why>","memory":"<concrete progress so far, counting explicitly e.g. \'opened 2 of 5 products\'>","next_goal":"<the immediate objective of THIS step>"}\n' +
    '{"action":"finish","summary":"<what you accomplished>","memory":"<final progress>"}\n' +
    'Always fill evaluation_previous_goal / memory / next_goal — memory is your running progress ledger: ' +
    'carry forward what you have already done and what remains (with counts) so you never repeat a step or ' +
    'give up while items remain. Finish as soon as the goal is met or is genuinely impossible. ' +
    'Use ONLY these tools (by exact id):\n' +
    toolList +
    BROWSING_STRATEGY +
    coref +
    outline +
    avoid
  );
}
