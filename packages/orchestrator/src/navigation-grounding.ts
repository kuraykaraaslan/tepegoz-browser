import { z } from 'zod';
import type { InteractableElement } from '@tepegoz/tool-executor';
import type { StepOutcome } from './executor';

/**
 * AI-7 navigation grounding — the pure core that keeps the agent from FABRICATING a URL or bailing to
 * `web_search` when the real route is on the page. Given the goal + the AI-2 element snapshot (with each
 * link's `href`) and, optionally, the origin's `sitemap.xml` entries, it ranks the routes the agent could
 * take, **each tagged with the evidence that grounds it** — a link it can see, or a sitemap-backed path.
 *
 * The cardinal rule (`s01`): an origin+path with **no** DOM/sitemap backing is NEVER returned as a
 * candidate — the resolver only ever surfaces URLs it can point at real evidence for, so the model has a
 * grounded route to prefer over a blind `/blog` guess. No model call and no network here (the sitemap is
 * fetched by the host and passed in) — deterministic and unit-testable, so every model benefits.
 *
 * The second rule, learnt from a real failure: **not every goal is a navigation.** "Connect gönder" is
 * performed by a control on the page the agent already stands on, and a resolver that only knows how to
 * name URLs will happily ground one — LinkedIn's result cards carry the word "Connect" inside the wrapper
 * link's accessible name, so the top "route" was the profile of someone the user was already connected
 * to. So a card blob can no longer be grounded by an action verb alone ({@link rankNavigationCandidates}),
 * and the controls that do perform the goal are ranked separately ({@link rankActionCandidates}) into a
 * click steer that OUTRANKS the navigation one.
 */

/** Where a candidate's URL came from. There is deliberately no "guessed" source — see the module note. */
export type NavEvidence = 'visible-link' | 'sitemap';

/** One grounded route the agent could navigate to, with the evidence that justifies it. */
export interface NavCandidate {
  /** Absolute URL, resolved against the current page. */
  url: string;
  /** Label for the route: the link text, or the sitemap entry's last path segment. */
  label: string;
  /** The evidence that grounds this URL — never a bare origin+path guess. */
  evidence: NavEvidence;
  /** Goal-relevance score (higher = better match); only candidates that actually match the goal survive. */
  score: number;
}

/** A link the resolver can reason about: only `href`, `role`/`tag`, `name` — and `ref`, so an on-page
 *  action control can be named by the handle the model actually clicks with. */
export type NavLink = Pick<InteractableElement, 'role' | 'name' | 'href' | 'tag'> &
  Partial<Pick<InteractableElement, 'ref'>>;

/** One on-page control that PERFORMS the goal where the agent already stands (click, never navigate). */
export interface ActionCandidate {
  /** Snapshot ref — the handle `browser_update_page` clicks with. */
  ref: number;
  /** The control's accessible name (page-controlled; capped before it reaches the hint). */
  label: string;
  /** How many of the goal's action keywords the label carries (higher = better match). */
  score: number;
}

export interface NavGroundingInput {
  /** The user goal (drives relevance scoring). */
  goal: string;
  /** The URL the snapshot was taken on — resolves relative hrefs and excludes the current page. */
  currentUrl: string;
  /** The AI-2 element snapshot; only href-bearing links are considered. */
  elements: readonly NavLink[];
  /** Absolute URLs from the origin's `sitemap.xml` (optional; evidence source `sitemap`). */
  sitemapUrls?: readonly string[];
}

/** Very common English/Turkish words that carry no navigation intent — dropped before scoring. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'this',
  'that',
  'my',
  'me',
  'i',
  'find',
  'open',
  'go',
  'get',
  'read',
  'tell',
  'show',
  'page',
  'site',
  'website',
  'please',
  'its',
  've',
  'bir',
  'bu',
  'şu',
  'o',
  'ile',
  'için',
  'bana',
  'aç',
  'bul',
  'git',
  'oku',
  'sayfa',
  'site',
]);

/** Split a string into lower-cased alphanumeric tokens (Unicode letters kept, so Turkish survives). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Meaningful goal keywords: tokens that are not stopwords and are long enough to disambiguate. */
function goalKeywords(goal: string): string[] {
  return [...new Set(tokenize(goal).filter((t) => t.length >= 2 && !STOPWORDS.has(t)))];
}

/**
 * Verb stems for things done **on the page the agent is already on** — the Connect/Follow/Apply class —
 * as opposed to the "take me somewhere" intent this resolver exists to ground. English + Turkish stems;
 * Turkish is agglutinative, so a stem of 5+ characters also matches by prefix (`gönder` ⊂ `gönderiyor`)
 * while short stems match whole-token only (`add` must not fire on `address`).
 */
const ACTION_STEMS: readonly string[] = [
  'connect',
  'invite',
  'send',
  'follow',
  'unfollow',
  'like',
  'share',
  'comment',
  'apply',
  'subscribe',
  'submit',
  'save',
  'add',
  'buy',
  'purchase',
  'order',
  'checkout',
  'book',
  'reserve',
  'register',
  'message',
  'accept',
  'decline',
  'approve',
  'confirm',
  'join',
  'upload',
  'download',
  'rsvp',
  'gönder',
  'bağlan',
  'ekle',
  'takip',
  'beğen',
  'paylaş',
  'yorum',
  'başvur',
  'abone',
  'satın',
  'sipariş',
  'sepet',
  'kaydet',
  'rezerv',
  'mesaj',
  'davet',
  'onayla',
  'kabul',
  'katıl',
  'indir',
  'yükle',
  'kayıt',
  'iste',
];

/** True when a token is an on-page ACTION verb rather than a destination word. Prefix-matches long stems. */
function isActionToken(token: string): boolean {
  return ACTION_STEMS.some(
    (stem) => token === stem || (stem.length >= 5 && token.startsWith(stem)),
  );
}

/**
 * A control's accessible name is a LABEL; a search-result card's wrapper link carries the whole card as
 * its name (person + headline + location + the word "Connect" + mutual connections). Only the former can
 * be an action control — this token budget is what tells them apart, and it is why the LinkedIn card link
 * whose blob happens to contain "Connect" is never offered as the thing to click.
 */
const MAX_ACTION_LABEL_TOKENS = 12;

/** Real controls the model can press, ranked ahead of the `div`/`span` wrappers that merely carry the
 *  same word — a page renders one `<button aria-label="Invite X to connect">` and half a dozen nested
 *  `<div>Connect</div>` around it, and only the first one says WHO it acts on. */
const CONTROL_ROLES: ReadonlySet<string> = new Set(['button', 'link', 'menuitem', 'tab', 'option']);
const CONTROL_TAGS: ReadonlySet<string> = new Set(['button', 'a', 'input', 'summary']);

/** 0 for an element that is a real control, 1 for a wrapper that only looks like one (sorts first). */
function controlRank(el: NavLink): 0 | 1 {
  const role = el.role.toLowerCase();
  const tag = (el.tag ?? '').toLowerCase();
  return CONTROL_ROLES.has(role) || CONTROL_TAGS.has(tag) ? 0 : 1;
}

/**
 * The path tokens of a URL that DISTINGUISH it from the current page — i.e. the pathname with the current
 * page's directory prefix stripped (`/blog/latest.html` → ['blog','latest','html']). Scoring the relative
 * remainder, not the absolute path, means the shared site prefix (e.g. a section you're already in, or the
 * eval's per-fixture sub-directory) does not add spurious matches to EVERY candidate. When the candidate is
 * cross-origin or shares no prefix, the full pathname is used.
 */
function urlTokens(url: string, currentUrl?: string): string[] {
  try {
    const u = new URL(url);
    let path = decodeURIComponent(u.pathname);
    if (currentUrl !== undefined) {
      const cur = new URL(currentUrl);
      const dir = decodeURIComponent(cur.pathname).replace(/[^/]*$/, ''); // current page's directory
      if (cur.origin === u.origin && dir.length > 1 && path.startsWith(dir)) {
        path = path.slice(dir.length);
      }
    }
    return tokenize(path);
  } catch {
    return tokenize(url);
  }
}

/**
 * Goal-relevance of a candidate: whole-token overlap between the goal keywords and the candidate's
 * (label + URL-PATH) tokens, plus a small prefix bonus so `blog` matches `blogposts`. Scored over the
 * TOKENS only — never the raw URL string — so a keyword that merely appears inside the host/scheme/query
 * (e.g. `example` in `example.com`) or inside an unrelated word (`news` in `renews`) does NOT inflate the
 * score and surface an irrelevant route. Pure.
 */
function relevance(keywords: readonly string[], candidateTokens: string[]): number {
  if (keywords.length === 0) return 0;
  const tokenSet = new Set(candidateTokens);
  let score = 0;
  for (const kw of keywords) {
    if (tokenSet.has(kw)) score += 1;
    else if (kw.length >= 4 && candidateTokens.some((tok) => tok.startsWith(kw))) score += 0.5;
  }
  return score;
}

/** The last non-empty path segment of a URL, decoded, as a human label (falls back to the host). */
function lastPathSegment(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').findLast((s) => s.length > 0);
    return seg !== undefined ? decodeURIComponent(seg) : u.hostname;
  } catch {
    return url;
  }
}

/** True for an href we can actually navigate to: absolute-or-relative http(s), not a fragment/mailto/js. */
function isNavigableHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) return false;
  return !/^(javascript:|mailto:|tel:|data:|blob:)/i.test(trimmed);
}

/** Resolve an href against the current page; null when it is not a valid http(s) URL. */
function resolveHref(href: string, currentUrl: string): string | null {
  try {
    const resolved = new URL(href, currentUrl);
    if (!/^https?:$/i.test(resolved.protocol)) return null;
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Normalize a URL for identity comparison (drop the trailing slash + hash), so self-links are excluded. */
function normalizeForCompare(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const path = u.pathname.replace(/\/$/, '');
    return `${u.origin}${path}${u.search}`;
  } catch {
    return url;
  }
}

/** True for an element that is a hyperlink with a navigable href. */
function isNavigableLink(el: NavLink): el is NavLink & { href: string } {
  return (
    el.href !== undefined &&
    el.href.length > 0 &&
    isNavigableHref(el.href) &&
    (el.role === 'link' || el.tag === 'a')
  );
}

/**
 * Score the visible on-page links against the goal, deduping by destination (excludes `seen`).
 *
 * `destinationKeywords` is the goal minus its action verbs, and it exists to reject ONE specific shape:
 * a link whose accessible name is a whole card blob that scores only because the card happens to contain
 * the word the user's action verb also uses. That is a LinkedIn search result — the wrapper link around
 * "Berkay Akar • 2nd … **Connect** … are mutual connections" — and grounding "connect gönder" on it is
 * exactly how the agent left the list it could act on. A short label like "Checkout" is left alone: it is
 * genuinely ambiguous between a route and a control, and {@link buildNavigationGuidance} settles that by
 * preferring the click steer when the control is addressable.
 */
function visibleLinkCandidates(
  elements: readonly NavLink[],
  currentUrl: string,
  keywords: readonly string[],
  destinationKeywords: readonly string[],
  seen: Set<string>,
): NavCandidate[] {
  const out: NavCandidate[] = [];
  for (const el of elements) {
    if (!isNavigableLink(el)) continue;
    const url = resolveHref(el.href, currentUrl);
    if (url === null) continue;
    const key = normalizeForCompare(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const label = el.name.trim().length > 0 ? el.name.trim() : lastPathSegment(url);
    const labelTokens = tokenize(label);
    const candidateTokens = [...labelTokens, ...urlTokens(url, currentUrl)];
    const score = relevance(keywords, candidateTokens);
    if (score <= 0) continue;
    const isBlob = labelTokens.length > MAX_ACTION_LABEL_TOKENS;
    if (isBlob && relevance(destinationKeywords, candidateTokens) <= 0) continue;
    out.push({ url, label, evidence: 'visible-link', score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The origin of a URL, or null when unparseable — for the same-origin sitemap guard. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Score the sitemap-backed paths against the goal, deduping by destination (excludes `seen`). A sitemap
 *  entry is only accepted when it is SAME-ORIGIN as the current page — defense-in-depth so even a reader
 *  bug can never turn a cross-origin `<loc>` into a grounded navigation candidate. */
function sitemapCandidates(
  sitemapUrls: readonly string[],
  currentUrl: string,
  keywords: readonly string[],
  seen: Set<string>,
): NavCandidate[] {
  const currentOrigin = originOf(currentUrl);
  const out: NavCandidate[] = [];
  for (const raw of sitemapUrls) {
    const url = resolveHref(raw, currentUrl);
    if (url === null) continue;
    if (currentOrigin === null || originOf(url) !== currentOrigin) continue;
    const key = normalizeForCompare(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const score = relevance(keywords, urlTokens(url, currentUrl));
    if (score > 0) out.push({ url, label: lastPathSegment(url), evidence: 'sitemap', score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Rank the grounded routes for the goal: visible on-page links first (strongest evidence — the agent can
 * see and load them directly), then sitemap-backed paths. Only candidates that actually match the goal
 * (score > 0) are returned, most-relevant first; the current page and non-navigable hrefs are excluded.
 * An ungrounded origin+path is never synthesized here.
 */
export function rankNavigationCandidates(input: NavGroundingInput): NavCandidate[] {
  const keywords = goalKeywords(input.goal);
  const destinationKeywords = keywords.filter((k) => !isActionToken(k));
  const seen = new Set<string>([normalizeForCompare(input.currentUrl)]);
  return [
    ...visibleLinkCandidates(input.elements, input.currentUrl, keywords, destinationKeywords, seen),
    ...sitemapCandidates(input.sitemapUrls ?? [], input.currentUrl, keywords, seen),
  ];
}

/**
 * Rank the on-page controls that PERFORM the goal here — the counterpart to the navigation ranking. A
 * control qualifies when its accessible name carries one of the goal's action verbs AND reads as a label
 * rather than a card blob ({@link MAX_ACTION_LABEL_TOKENS}). Only elements with a `ref` are returned:
 * a "click this" steer the model cannot address is worse than silence. Ordered by match strength, then
 * real controls ahead of look-alike wrappers, then the shorter label. Pure.
 */
export function rankActionCandidates(input: NavGroundingInput): ActionCandidate[] {
  const actionKeywords = goalKeywords(input.goal).filter(isActionToken);
  if (actionKeywords.length === 0) return [];
  const out: (ActionCandidate & { tokenCount: number; control: 0 | 1 })[] = [];
  const seenRefs = new Set<number>();
  for (const el of input.elements) {
    if (el.ref === undefined || seenRefs.has(el.ref)) continue;
    const label = el.name.trim();
    if (label.length === 0) continue;
    const tokens = tokenize(label);
    if (tokens.length === 0 || tokens.length > MAX_ACTION_LABEL_TOKENS) continue;
    const tokenSet = new Set(tokens);
    const score = actionKeywords.filter((kw) => tokenSet.has(kw)).length;
    if (score === 0) continue;
    seenRefs.add(el.ref);
    out.push({ ref: el.ref, label, score, tokenCount: tokens.length, control: controlRank(el) });
  }
  out.sort(
    (a, b) =>
      b.score - a.score || a.control - b.control || a.tokenCount - b.tokenCount || a.ref - b.ref,
  );
  return out.map(({ ref, label, score }) => ({ ref, label, score }));
}

/**
 * The deterministic, model-facing navigation steer for THIS observation. When a grounded route matches
 * the goal, it names that route (with its evidence) so the model navigates there instead of fabricating a
 * URL or leaving the page to search — the concrete anti-escape nudge that replaces the `/blog`-guessing
 * prose. Returns null when there is no grounded route to offer (the general system-prompt ordering then
 * governs), so the guidance is sparse and high-signal. English (internal model-facing text).
 */
/** Cap on the page-controlled label interpolated into the hint — keeps the steer far below the reactor's
 *  transient-state collapse threshold so a hostile 600-char link name can never bloat the hint into a
 *  "page-state" blob that evicts the real element snapshot. */
const MAX_HINT_LABEL = 120;

/** How many action controls the click steer names. Enough to show the goal repeats over a list, few
 *  enough that a page full of "Connect" buttons cannot crowd out the element snapshot. */
const MAX_ACTION_HINT_CONTROLS = 3;

/** Cap one page-controlled label for interpolation into a hint. */
function hintLabel(label: string): string {
  return label.length > MAX_HINT_LABEL ? `${label.slice(0, MAX_HINT_LABEL)}…` : label;
}

/**
 * The click steer that OUTRANKS the navigation one: when the control that performs the goal is on this
 * very page, naming a URL to open is the wrong move — it is how the agent ends up on the profile of
 * someone it is already connected to instead of pressing Connect in the list it can see.
 */
function buildActionGuidance(candidates: readonly ActionCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const shown = candidates.slice(0, MAX_ACTION_HINT_CONTROLS);
  const list = shown.map((c) => `[${String(c.ref)}] ${hintLabel(c.label)}`).join('; ');
  const more =
    candidates.length > shown.length
      ? ` (+${String(candidates.length - shown.length)} more like it in this snapshot)`
      : '';
  return (
    `Action hint: your goal is performed ON THIS PAGE by ${list}${more}. Click by ref with ` +
    "browser_update_page — do NOT navigate to a control's href, and do NOT open a profile/detail page " +
    'to look for the same control there. Re-read browser_get_elements after each click (refs change), ' +
    'and scroll to reach further rows before deciding the page is done.'
  );
}

export function buildNavigationGuidance(input: NavGroundingInput): string | null {
  const action = buildActionGuidance(rankActionCandidates(input));
  if (action !== null) return action;
  const [top] = rankNavigationCandidates(input);
  if (top === undefined) return null;
  const label = hintLabel(top.label);
  const evidence =
    top.evidence === 'visible-link' ? 'a link visible on this page' : "the site's sitemap";
  return (
    `Navigation hint: "${label}" (${top.url}) matches your goal and is grounded by ${evidence}. ` +
    'Navigate there with browser_update_location instead of guessing a URL or leaving the page to ' +
    'web_search — those are only for a destination that genuinely is not reachable from this site.'
  );
}

/** The subset of a `browser_get_elements` result the grounding hook reads. Page-controlled (untrusted),
 *  so it is `safeParse`d before use — a shape mismatch simply yields no hint, never a throw. */
const ElementsResultSchema = z.object({
  url: z.string(),
  elements: z.array(
    z.object({
      ref: z.number().optional(),
      role: z.string(),
      name: z.string(),
      href: z.string().optional(),
      tag: z.string().optional(),
    }),
  ),
});

/** Discovers same-origin sitemap page URLs for the page the agent is on (host-injected; see web-tools). */
export type SitemapDiscovery = (pageUrl: string) => Promise<readonly string[]>;

/**
 * Build the reactor's {@link ReactOptions.groundNavigation} hook: after a `browser_get_elements` read, it
 * turns the (zod-validated) element snapshot — optionally enriched with the origin's sitemap — into the
 * deterministic navigation steer. Kept here (not in the Electron-free runtime) so the zod boundary + the
 * resolver live together. `discoverSitemap` is optional: absent ⇒ visible-link grounding only.
 */
export function buildNavigationGroundingHook(
  discoverSitemap?: SitemapDiscovery,
): (outcome: StepOutcome, goal: string) => Promise<string | null> {
  return async (outcome, goal) => {
    if (!outcome.ok || outcome.tool !== 'browser_get_elements') return null;
    const parsed = ElementsResultSchema.safeParse(outcome.result);
    if (!parsed.success || parsed.data.url.length === 0) return null;
    let sitemapUrls: readonly string[] | undefined;
    if (discoverSitemap !== undefined) {
      try {
        sitemapUrls = await discoverSitemap(parsed.data.url);
      } catch {
        sitemapUrls = undefined;
      }
    }
    // Map to clean NavLink objects (drop absent optionals) for exactOptionalPropertyTypes.
    const elements: NavLink[] = parsed.data.elements.map((e) => ({
      role: e.role,
      name: e.name,
      ...(e.ref !== undefined ? { ref: e.ref } : {}),
      ...(e.href !== undefined ? { href: e.href } : {}),
      ...(e.tag !== undefined ? { tag: e.tag } : {}),
    }));
    return buildNavigationGuidance({
      goal,
      currentUrl: parsed.data.url,
      elements,
      ...(sitemapUrls !== undefined && sitemapUrls.length > 0 ? { sitemapUrls } : {}),
    });
  };
}
