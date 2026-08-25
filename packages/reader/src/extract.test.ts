// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractArticle, findArticleRoot } from './extract';
import { READER_LIMITS, readingMinutes } from './article';

/**
 * Extraction, tested against the page shapes it actually has to survive. jsdom gives a real
 * `Document`, which is the whole reason the extractor takes one as a parameter rather than reaching
 * for a global.
 */
function doc(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

/** Enough prose to clear the minimum — real articles are far longer, but the floor is what matters. */
const PROSE = 'A sentence with enough words in it to count as a real paragraph of prose. '.repeat(
  3,
);

function article(extra = ''): string {
  return `
    <nav class="site-nav"><a href="/a">Home</a><a href="/b">About</a><a href="/c">Contact</a></nav>
    <article class="post-content">
      <h1>The real title</h1>
      <p>${PROSE}</p>
      <p>${PROSE}</p>
      ${extra}
    </article>
    <aside class="related"><a href="/x">Related one</a><a href="/y">Related two</a></aside>
    <footer class="site-footer"><p>${PROSE}</p></footer>`;
}

describe('findArticleRoot', () => {
  it('picks the article over the navigation and the footer', () => {
    const root = findArticleRoot(doc(article()));
    expect(root?.tagName).toBe('ARTICLE');
  });

  it('returns null on a page with no article — a search page, a dashboard, an app', () => {
    // Returning null is a real answer the caller must honour. A reading view that renders whatever it
    // found here is worse than a button that declines to turn on.
    expect(findArticleRoot(doc('<div><a href="/1">One</a><a href="/2">Two</a></div>'))).toBeNull();
  });

  it('rejects a link list even when it is long', () => {
    const links = Array.from(
      { length: 60 },
      (_, i) => `<p><a href="/${String(i)}">A headline about something ${String(i)}</a></p>`,
    ).join('');
    expect(findArticleRoot(doc(`<div class="content">${links}</div>`))).toBeNull();
  });

  it('prefers the article element over the wrapper that contains it', () => {
    // The wrapper has strictly more text — the article plus the footer — so a raw length score would
    // pick it. `sqrt` plus the negative-name penalty is what stops that.
    const root = findArticleRoot(doc(`<div class="page-wrapper">${article()}</div>`));
    expect(root?.tagName).toBe('ARTICLE');
  });
});

describe('extractArticle', () => {
  it('keeps the prose and drops the boilerplate', () => {
    const out = extractArticle(doc(article()));
    expect(out).not.toBeNull();
    const text = JSON.stringify(out);
    expect(text).toContain('real paragraph of prose');
    expect(text).not.toContain('Related one');
    expect(text).not.toContain('About');
  });

  it('takes the title from the page’s own metadata first', () => {
    const d = doc(article());
    const m = d.createElement('meta');
    m.setAttribute('property', 'og:title');
    m.setAttribute('content', 'The metadata title');
    d.head.append(m);
    expect(extractArticle(d)?.title).toBe('The metadata title');
  });

  it('never guesses a byline it was not given', () => {
    expect(extractArticle(doc(article()))?.byline).toBe('');
  });

  describe('blocks, not HTML — the security property', () => {
    it('produces no field that could carry markup', () => {
      const out = extractArticle(doc(article('<p>' + PROSE + '<script>alert(1)</script></p>')));
      expect(JSON.stringify(out)).not.toContain('<script');
      expect(JSON.stringify(out)).not.toContain('alert(1)');
      // There is no `html` key anywhere in the model, which is what makes injection impossible rather
      // than filtered.
      expect(JSON.stringify(out)).not.toContain('"html"');
    });

    it('drops an image whose src is not http(s) or an inline image', () => {
      const out = extractArticle(
        doc(
          article(
            '<img src="javascript:alert(1)"><img src="blob:x"><img src="https://e.com/a.png">',
          ),
        ),
      );
      const images = (out?.blocks ?? []).filter((b) => b.kind === 'image');
      expect(images).toEqual([{ kind: 'image', src: 'https://e.com/a.png', alt: '' }]);
    });

    it('keeps a data: image, which is how inline figures arrive', () => {
      const out = extractArticle(
        doc(article('<img src="data:image/png;base64,AAA" alt="A chart">')),
      );
      expect(out?.blocks).toContainEqual({
        kind: 'image',
        src: 'data:image/png;base64,AAA',
        alt: 'A chart',
      });
    });
  });

  describe('block kinds', () => {
    it('reads a list once, not once per item', () => {
      const out = extractArticle(doc(article('<ul><li>First</li><li>Second</li></ul>')));
      const lists = (out?.blocks ?? []).filter((b) => b.kind === 'list');
      expect(lists).toEqual([{ kind: 'list', ordered: false, items: ['First', 'Second'] }]);
      // A block owns its subtree; descending after emitting it would emit every <li> again.
      expect(
        (out?.blocks ?? []).filter((b) => b.kind === 'paragraph' && b.text === 'First'),
      ).toEqual([]);
    });

    it('does not re-emit a list item’s own paragraph after the list', () => {
      // The shape that actually exercises "a block owns its subtree". A mutation check found the
      // earlier plain-text list test passing with the guard removed — an <li> holding only text has no
      // element children to descend into, so it proved nothing. This one does.
      const out = extractArticle(doc(article(`<ul><li><p>${PROSE}INSIDELIST</p></li></ul>`)));
      const paragraphs = (out?.blocks ?? []).filter(
        (b) => b.kind === 'paragraph' && b.text.includes('INSIDELIST'),
      );
      expect(paragraphs).toEqual([]);
    });

    it('preserves whitespace in code, where whitespace IS the content', () => {
      const out = extractArticle(doc(article('<pre>line one\n  indented</pre>')));
      expect(out?.blocks).toContainEqual({ kind: 'code', text: 'line one\n  indented' });
    });

    it('renders an in-article h1 as level 2 rather than a second title', () => {
      const out = extractArticle(doc(article()));
      const headings = (out?.blocks ?? []).filter((b) => b.kind === 'heading');
      expect(headings.every((h) => h.kind === 'heading' && h.level === 2)).toBe(true);
    });

    it('skips a paragraph that is really a row of links', () => {
      const out = extractArticle(doc(article('<p><a href="/1">One</a> <a href="/2">Two</a></p>')));
      expect(JSON.stringify(out)).not.toContain('"One"');
    });

    it('skips aria-hidden subtrees', () => {
      const out = extractArticle(
        doc(article(`<div aria-hidden="true"><p>${PROSE}HIDDENMARK</p></div>`)),
      );
      expect(JSON.stringify(out)).not.toContain('HIDDENMARK');
    });
  });

  describe('bounds — the page is untrusted input', () => {
    it('caps a single enormous paragraph', () => {
      const out = extractArticle(doc(article(`<p>${'x'.repeat(500_000)}</p>`)));
      const longest = Math.max(
        ...(out?.blocks ?? []).map((b) => ('text' in b ? b.text.length : 0)),
      );
      expect(longest).toBeLessThanOrEqual(READER_LIMITS.maxBlockChars);
    });

    it('caps the number of blocks', () => {
      // Short paragraphs, just over the minimum length: the cap is about the COUNT, and building
      // 2 200 full-length ones made this the slowest test in the repo — it passed locally and timed
      // out under coverage instrumentation, which is the kind of flake that gets a suite disabled.
      const one = '<p>A paragraph long enough to count.</p>';
      const many = one.repeat(READER_LIMITS.maxBlocks + 200);
      const out = extractArticle(doc(`<article class="post">${many}</article>`));
      expect((out?.blocks ?? []).length).toBe(READER_LIMITS.maxBlocks);
    }, // Still legitimately heavy — a 2 200-element DOM parsed and walked — so the budget is stated
    // rather than left to the default.
    15_000);

    it('caps list items', () => {
      const items = '<li>item</li>'.repeat(READER_LIMITS.maxListItems + 50);
      const out = extractArticle(doc(article(`<ul>${items}</ul>`)));
      const list = (out?.blocks ?? []).find((b) => b.kind === 'list');
      expect(list?.kind === 'list' && list.items.length).toBeLessThanOrEqual(
        READER_LIMITS.maxListItems,
      );
    });
  });
});

describe('readingMinutes', () => {
  it('never reports less than a minute', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(5)).toBe(1);
  });

  it('rounds up, so nobody is told a ten-minute piece takes two', () => {
    expect(readingMinutes(201)).toBe(2);
    expect(readingMinutes(2000)).toBe(10);
  });
});
