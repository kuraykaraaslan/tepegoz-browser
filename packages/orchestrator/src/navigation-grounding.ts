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

/** A link the resolver can reason about: only `href`, `role`/`tag`, and `name` matter. */
export type NavLink = Pick<InteractableElement, 'role' | 'name' | 'href' | 'tag'>;

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
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'this', 'that', 'my', 'me', 'i',
  'find', 'open', 'go', 'get', 'read', 'tell', 'show', 'page', 'site', 'website', 'please', 'its',
  've', 'bir', 'bu', 'şu', 'o', 'ile', 'için', 'bana', 'aç', 'bul', 'git', 'oku', 'sayfa', 'site',
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

/** Score the visible on-page links against the goal, deduping by destination (excludes `seen`). */
function visibleLinkCandidates(
  elements: readonly NavLink[],
  currentUrl: string,
  keywords: readonly string[],
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
    const score = relevance(keywords, [...tokenize(label), ...urlTokens(url, currentUrl)]);
    if (score > 0) out.push({ url, label, evidence: 'visible-link', score });
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
  const seen = new Set<string>([normalizeForCompare(input.currentUrl)]);
  return [
    ...visibleLinkCandidates(input.elements, input.currentUrl, keywords, seen),
    ...sitemapCandidates(input.sitemapUrls ?? [], input.currentUrl, keywords, seen),
  ];
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

export function buildNavigationGuidance(input: NavGroundingInput): string | null {
  const [top] = rankNavigationCandidates(input);
  if (top === undefined) return null;
  const label = top.label.length > MAX_HINT_LABEL ? `${top.label.slice(0, MAX_HINT_LABEL)}…` : top.label;
  const evidence = top.evidence === 'visible-link' ? 'a link visible on this page' : "the site's sitemap";
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
