/**
 * Pure text/URL primitives behind AI-7 navigation grounding (see `navigation-grounding.ts`): goal
 * tokenisation, stopword + action-verb vocabulary, goal-relevance scoring and href/URL normalisation.
 * No types from the resolver and no I/O, so the resolver composes these without a dependency cycle.
 */

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
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** Meaningful goal keywords: tokens that are not stopwords and are long enough to disambiguate. */
export function goalKeywords(goal: string): string[] {
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
export function isActionToken(token: string): boolean {
  return ACTION_STEMS.some(
    (stem) => token === stem || (stem.length >= 5 && token.startsWith(stem)),
  );
}

/**
 * The path tokens of a URL that DISTINGUISH it from the current page — i.e. the pathname with the current
 * page's directory prefix stripped (`/blog/latest.html` → ['blog','latest','html']). Scoring the relative
 * remainder, not the absolute path, means the shared site prefix (e.g. a section you're already in, or the
 * eval's per-fixture sub-directory) does not add spurious matches to EVERY candidate. When the candidate is
 * cross-origin or shares no prefix, the full pathname is used.
 */
export function urlTokens(url: string, currentUrl?: string): string[] {
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
export function relevance(keywords: readonly string[], candidateTokens: string[]): number {
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
export function lastPathSegment(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').findLast((s) => s.length > 0);
    return seg !== undefined ? decodeURIComponent(seg) : u.hostname;
  } catch {
    return url;
  }
}

/** True for an href we can actually navigate to: absolute-or-relative http(s), not a fragment/mailto/js. */
export function isNavigableHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) return false;
  return !/^(javascript:|mailto:|tel:|data:|blob:)/i.test(trimmed);
}

/** Resolve an href against the current page; null when it is not a valid http(s) URL. */
export function resolveHref(href: string, currentUrl: string): string | null {
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
export function normalizeForCompare(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const path = u.pathname.replace(/\/$/, '');
    return `${u.origin}${path}${u.search}`;
  } catch {
    return url;
  }
}

/** The origin of a URL, or null when unparseable — for the same-origin sitemap guard. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
