import { READER_LIMITS, type ReaderArticle, type ReaderBlock } from './article';

/**
 * Article extraction — Readability-style scoring, written against a plain `Document`.
 *
 * No `@mozilla/readability`, and no jsdom, on purpose. This runs INSIDE the page, where a real DOM
 * already exists, so pulling in a DOM implementation to parse a document the browser has already
 * parsed would be pure weight. Taking a `Document` as a parameter is what keeps it testable: vitest's
 * jsdom environment supplies one, so the scoring is exercised directly rather than through a browser.
 *
 * The heuristic, in one paragraph: score every candidate container by how much of it is prose — text
 * length in paragraphs, discounted by link density, penalised for the class/id names that mark
 * navigation and boilerplate — then take the best-scoring container and walk it into blocks. This is
 * the shape Readability settled on after a decade of pages, and the parts worth copying are the link
 * density and the negative-name penalty; the exact constants are not sacred and are named here so they
 * can be tuned against real pages rather than guessed at twice.
 */

/** Containers worth scoring. Anything else is reached through these. */
const CANDIDATE_SELECTOR = 'article, main, section, div, td';

/** Names that almost always mark boilerplate. Matched case-insensitively on class AND id. */
const NEGATIVE =
  /(^|[\s_-])(comment|meta|footer|foot|header|nav|sidebar|side-bar|menu|banner|promo|ad|ads|advert|share|social|related|recommend|newsletter|subscribe|cookie|consent|breadcrumb|pagination|widget|popup|modal|masthead|skip|toolbar)([\s_-]|$)/i;
/** Names that mark the real thing. */
const POSITIVE = /(^|[\s_-])(article|body|content|entry|main|page|post|story|text|blog)([\s_-]|$)/i;

/** Elements that never contribute text, whatever their score. */
const STRIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'FORM',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'SVG',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'NAV',
  'ASIDE',
  'FOOTER',
  'HEADER',
  'TEMPLATE',
]);

/** A container must hold at least this much prose to be an article at all. */
const MIN_ARTICLE_CHARS = 250;
/** Paragraphs shorter than this are usually captions, bylines or nav crumbs. */
const MIN_PARAGRAPH_CHARS = 25;
/** Above this share of link text, a block is a link list rather than prose. */
const MAX_LINK_DENSITY = 0.5;

/**
 * An element's readable text, skipping subtrees that are never content.
 *
 * `textContent` is not good enough and a test caught it: a `<script>` inside a `<p>` put `alert(1)`
 * into the extracted paragraph. Harmless as rendered — the model carries text, not markup — but it is
 * still the script's source appearing in the middle of someone's article, and the same leak applies to
 * `<style>` rules and to `aria-hidden` decorations.
 */
function text(el: Element): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    if (STRIP.has(e.tagName) || e.getAttribute('aria-hidden') === 'true') return;
    for (const child of e.childNodes) walk(child);
  };
  for (const child of el.childNodes) walk(child);
  return out.replace(/\s+/g, ' ').trim();
}

/** Raw text with whitespace kept, for `<pre>`. Same subtree skipping. */
function rawText(el: Element): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    if (STRIP.has(e.tagName)) return;
    for (const child of e.childNodes) walk(child);
  };
  for (const child of el.childNodes) walk(child);
  return out;
}

/** Share of a container's text that sits inside anchors. Nav and related-links score near 1. */
function linkDensity(el: Element): number {
  const total = text(el).length;
  if (total === 0) return 0;
  let linked = 0;
  for (const a of el.querySelectorAll('a')) linked += text(a).length;
  return linked / total;
}

function nameScore(el: Element): number {
  const name = `${el.className} ${el.id}`;
  let score = 0;
  if (NEGATIVE.test(name)) score -= 25;
  if (POSITIVE.test(name)) score += 25;
  if (el.tagName === 'ARTICLE') score += 30;
  if (el.tagName === 'MAIN') score += 20;
  return score;
}

/**
 * Score one container. Paragraph text counts; everything else is context.
 *
 * `sqrt` on the character count rather than the raw length, so a page's single enormous wrapper (which
 * contains the article AND the navigation AND the footer) does not automatically beat the article
 * element inside it just by being bigger.
 */
function score(el: Element): number {
  const paragraphs = [...el.querySelectorAll('p')].filter(
    (p) => text(p).length >= MIN_PARAGRAPH_CHARS,
  );
  if (paragraphs.length === 0) return -Infinity;
  const chars = paragraphs.reduce((n, p) => n + text(p).length, 0);
  if (chars < MIN_ARTICLE_CHARS) return -Infinity;
  const density = linkDensity(el);
  if (density > MAX_LINK_DENSITY) return -Infinity;
  return Math.sqrt(chars) * (1 - density) + paragraphs.length * 3 + nameScore(el);
}

/** The best-scoring container, or null when the page has no article in it. */
export function findArticleRoot(doc: Document): Element | null {
  let best: Element | null = null;
  let bestScore = -Infinity;
  for (const el of doc.querySelectorAll(CANDIDATE_SELECTOR)) {
    if (STRIP.has(el.tagName)) continue;
    const s = score(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }
  return bestScore === -Infinity ? null : best;
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Only http(s) and inline images. A `javascript:` or `blob:` src must never reach the chrome. */
function safeSrc(raw: string | null): string | null {
  if (raw === null) return null;
  const src = raw.trim();
  if (src.length === 0 || src.length > READER_LIMITS.maxSrcChars) return null;
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src) ? src : null;
}

function blockFor(el: Element): ReaderBlock | null {
  const tag = el.tagName;
  if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
    const t = text(el);
    // H1 renders as level 2: the article's own title is already the page heading, so a second level-1
    // inside the body would be two competing titles.
    return t.length === 0
      ? null
      : { kind: 'heading', level: tag === 'H4' ? 3 : 2, text: cap(t, READER_LIMITS.maxBlockChars) };
  }
  if (tag === 'BLOCKQUOTE') {
    const t = text(el);
    return t.length === 0 ? null : { kind: 'quote', text: cap(t, READER_LIMITS.maxBlockChars) };
  }
  if (tag === 'PRE') {
    // `rawText`, not the collapsed `text()`: whitespace IS the content in a code block. Still not
    // `textContent` — a `<script>` inside a `<pre>` would otherwise put its source in the listing.
    const t = rawText(el).replace(/\r\n/g, '\n');
    return t.trim().length === 0
      ? null
      : { kind: 'code', text: cap(t, READER_LIMITS.maxBlockChars) };
  }
  if (tag === 'UL' || tag === 'OL') {
    const items = [...el.querySelectorAll(':scope > li')]
      .map((li) => text(li))
      .filter((t) => t.length > 0)
      .slice(0, READER_LIMITS.maxListItems)
      .map((t) => cap(t, READER_LIMITS.maxBlockChars));
    return items.length === 0 ? null : { kind: 'list', ordered: tag === 'OL', items };
  }
  if (tag === 'IMG') {
    const src = safeSrc(el.getAttribute('src'));
    return src === null
      ? null
      : { kind: 'image', src, alt: cap(text(el) || el.getAttribute('alt') || '', 300) };
  }
  if (tag === 'P') {
    const t = text(el);
    if (t.length < MIN_PARAGRAPH_CHARS) return null;
    // A "paragraph" that is mostly links is a nav row that happens to use <p>.
    if (linkDensity(el) > MAX_LINK_DENSITY) return null;
    return { kind: 'paragraph', text: cap(t, READER_LIMITS.maxBlockChars) };
  }
  return null;
}

function collect(root: Element): ReaderBlock[] {
  const out: ReaderBlock[] = [];
  const walk = (el: Element): void => {
    if (out.length >= READER_LIMITS.maxBlocks) return;
    if (STRIP.has(el.tagName) || el.getAttribute('aria-hidden') === 'true') return;
    const block = blockFor(el);
    if (block !== null) {
      out.push(block);
      // A block owns its subtree — descending into a <ul> after emitting it would emit every <li>
      // again, and into a <p> would re-emit any nested markup as its own paragraph.
      return;
    }
    for (const child of el.children) walk(child);
  };
  for (const child of root.children) walk(child);
  return out;
}

/** The page's own idea of its title/byline/site, preferred over anything inferred. */
function meta(doc: Document, name: string): string {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ?? doc.querySelector(`meta[name="${name}"]`);
  return (el?.getAttribute('content') ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract the readable article, or `null` when the document does not hold one.
 *
 * Returning null is a real answer and the caller must honour it: a reading view that renders whatever
 * it found on a page with no article — a search results list, a dashboard, an app — is worse than a
 * button that declines to turn on, because the user cannot tell the difference between "this page has
 * no article" and "the reader is broken".
 */
export function extractArticle(doc: Document): ReaderArticle | null {
  const root = findArticleRoot(doc);
  if (root === null) return null;

  const blocks = collect(root);
  if (blocks.length === 0) return null;

  const prose = blocks
    .filter((b) => b.kind === 'paragraph' || b.kind === 'quote')
    .reduce((n, b) => n + ('text' in b ? b.text.length : 0), 0);
  if (prose < MIN_ARTICLE_CHARS) return null;

  const wordCount = blocks.reduce((n, b) => {
    const t = b.kind === 'list' ? b.items.join(' ') : 'text' in b ? b.text : '';
    return n + (t.trim().length === 0 ? 0 : t.trim().split(/\s+/).length);
  }, 0);

  const heading = root.querySelector('h1');
  return {
    title: cap(
      meta(doc, 'og:title') || (heading === null ? '' : text(heading)) || doc.title,
      READER_LIMITS.maxTitleChars,
    ),
    byline: cap(meta(doc, 'article:author') || meta(doc, 'author'), READER_LIMITS.maxBylineChars),
    siteName: cap(meta(doc, 'og:site_name'), READER_LIMITS.maxBylineChars),
    blocks,
    wordCount,
  };
}
