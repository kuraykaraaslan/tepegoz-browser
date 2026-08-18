/**
 * The in-page **article-text** extraction script (S2 PR4).
 *
 * `browser_get_page` returns `document.body.innerText` — the whole page, navigation and cookie banners
 * and footers included. On a content page that is mostly boilerplate the model pays for it in tokens and
 * has to find the article inside the noise. This script picks the content root the page itself declares,
 * strips the parts every page agrees are chrome, and reports **which root it used** so a caller never has
 * to guess whether it got an article or the whole page.
 *
 * Read-only, like every perception path: the candidate is cloned before anything is removed, so the live
 * page is never mutated.
 */

/** Content roots in descending order of how explicitly the page declares "this is the content". */
const CONTENT_SELECTORS = ['article', 'main', '[role="main"]', '#content', '#main', '.post', '.article'];

/** Elements that are chrome on essentially every page. Removed from the CLONE, never from the page. */
const CHROME_SELECTORS = [
  'nav',
  'aside',
  'footer',
  'header',
  'script',
  'style',
  'noscript',
  'template',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
];

/** A candidate must carry at least this much text to be believed over the full body. */
const MIN_CANDIDATE_CHARS = 200;
/** …or at least this share of the body's text, for a genuinely short article. */
const MIN_CANDIDATE_SHARE = 0.25;
/** Hard cap on the returned text; the perception layer caps again when it wraps it. */
const MAX_ARTICLE_CHARS = 40_000;

/**
 * Build the injectable expression. Returns `{ text, source }` where `source` names the selector the text
 * came from, or `'body'` when no candidate was convincing — the honest signal that this is the whole
 * page, not an article.
 */
export function buildArticleTextExpression(): string {
  return `(() => {
  const CONTENT = ${JSON.stringify(CONTENT_SELECTORS)};
  const CHROME = ${JSON.stringify(CHROME_SELECTORS)}.join(',');
  const MIN_CHARS = ${String(MIN_CANDIDATE_CHARS)};
  const MIN_SHARE = ${String(MIN_CANDIDATE_SHARE)};
  const MAX_CHARS = ${String(MAX_ARTICLE_CHARS)};

  // Collapse runs of spaces within a line and runs of blank lines between them: paragraph structure is
  // worth keeping (it is how a model tells a heading from a sentence), incidental whitespace is not.
  const tidy = (s) => (s || '')
    .replace(/[ \\t\\u00a0]+/g, ' ')
    .replace(/\\s*\\n\\s*/g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();

  // Clone first: removing chrome from the live DOM would be a page mutation, and perception is read-only.
  const cleanTextOf = (el) => {
    let clone;
    try { clone = el.cloneNode(true); } catch (e) { return tidy(el.innerText || el.textContent || ''); }
    let junk;
    try { junk = clone.querySelectorAll(CHROME); } catch (e) { junk = []; }
    for (let i = junk.length - 1; i >= 0; i--) { const n = junk[i]; if (n.parentNode) n.parentNode.removeChild(n); }
    // A detached clone has no layout, so innerText is empty — textContent is what a clone can give.
    return tidy(clone.textContent || '');
  };

  const body = document.body;
  if (!body) return { text: '', source: 'body' };
  const bodyText = cleanTextOf(body);

  for (let i = 0; i < CONTENT.length; i++) {
    let el = null;
    try { el = document.querySelector(CONTENT[i]); } catch (e) { el = null; }
    if (!el) continue;
    const text = cleanTextOf(el);
    // Believe the candidate only when it actually holds the page's substance. A stub <main> wrapping a
    // spinner would otherwise hide the whole page behind an empty "article".
    if (text.length >= MIN_CHARS || (bodyText.length > 0 && text.length / bodyText.length >= MIN_SHARE)) {
      return { text: text.slice(0, MAX_CHARS), source: CONTENT[i] };
    }
  }
  return { text: bodyText.slice(0, MAX_CHARS), source: 'body' };
})()`;
}
