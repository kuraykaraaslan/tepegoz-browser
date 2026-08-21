import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { buildArticleTextExpression } from './article-text-script.js';

/**
 * Article extraction runs the REAL injected script over a small fake DOM (`vm`), for the same reason as
 * the naming tests: text extraction needs no layout engine, and a compile check would prove nothing.
 *
 * The fake implements only what the script touches — `querySelector`, `querySelectorAll`, `cloneNode`,
 * `removeChild`, `textContent` — so what is exercised is the selection and stripping logic itself.
 */

interface Node {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  children?: Node[];
}

function build(node: Node): Record<string, unknown> {
  const children = (node.children ?? []).map(build);
  const self: Record<string, unknown> = {
    tag: node.tag,
    attrs: node.attrs ?? {},
    ownText: node.text ?? '',
    children,
    parentNode: null,
  };
  for (const c of children) c['parentNode'] = self;
  self['cloneNode'] = () => build(node);
  self['matches'] = (sel: string) => matches(self, sel);
  Object.defineProperty(self, 'textContent', {
    get: () => collect(self),
  });
  self['querySelectorAll'] = (sel: string) => descendants(self).filter((d) => matchesAny(d, sel));
  self['querySelector'] = (sel: string) =>
    descendants(self).find((d) => matchesAny(d, sel)) ?? null;
  self['removeChild'] = (child: Record<string, unknown>) => {
    const kids = self['children'] as Record<string, unknown>[];
    const at = kids.indexOf(child);
    if (at >= 0) kids.splice(at, 1);
  };
  return self;
}

function descendants(node: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const c of node['children'] as Record<string, unknown>[]) {
    out.push(c, ...descendants(c));
  }
  return out;
}

/** Supports exactly the selector forms the script uses: `tag`, `#id`, `.class`, `[attr="value"]`. */
function matches(node: Record<string, unknown>, sel: string): boolean {
  const attrs = node['attrs'] as Record<string, string>;
  const trimmed = sel.trim();
  if (trimmed.startsWith('#')) return attrs['id'] === trimmed.slice(1);
  if (trimmed.startsWith('.')) return (attrs['class'] ?? '').split(' ').includes(trimmed.slice(1));
  if (trimmed.startsWith('[')) {
    const m = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(trimmed);
    if (m === null) return false;
    const [, name, value] = m;
    if (name === undefined) return false;
    return value === undefined ? name in attrs : attrs[name] === value;
  }
  return (node['tag'] as string) === trimmed;
}

function matchesAny(node: Record<string, unknown>, sel: string): boolean {
  return sel.split(',').some((one) => matches(node, one));
}

function collect(node: Record<string, unknown>): string {
  const own = node['ownText'] as string;
  const kids = (node['children'] as Record<string, unknown>[]).map(collect).join('\n');
  return [own, kids].filter((s) => s.length > 0).join('\n');
}

function run(body: Node): { text: string; source: string } {
  const bodyEl = build(body);
  const document = {
    body: bodyEl,
    querySelector: (sel: string) =>
      descendants(bodyEl).find((d) => matchesAny(d, sel)) ??
      (matchesAny(bodyEl, sel) ? bodyEl : null),
  };
  const context = vm.createContext({ document });
  return vm.runInContext(buildArticleTextExpression(), context) as { text: string; source: string };
}

const para = (text: string): Node => ({ tag: 'p', text });
const long = (label: string): Node => para(`${label} ${'sentence '.repeat(40)}`);

describe('article-text extraction', () => {
  it('prefers the article root and strips navigation, header and footer', () => {
    const result = run({
      tag: 'body',
      children: [
        { tag: 'nav', children: [para('Home Products Support')] },
        {
          tag: 'article',
          children: [long('The real content.'), { tag: 'footer', children: [para('© Acme')] }],
        },
        { tag: 'footer', children: [para('Cookie notice and legal links')] },
      ],
    });
    expect(result.source).toBe('article');
    expect(result.text).toContain('The real content.');
    expect(result.text).not.toContain('Home Products Support');
    expect(result.text).not.toContain('© Acme');
  });

  it('falls back through the selector list to main', () => {
    const result = run({
      tag: 'body',
      children: [{ tag: 'main', children: [long('Main content.')] }],
    });
    expect(result.source).toBe('main');
    expect(result.text).toContain('Main content.');
  });

  it('refuses a stub content root and reports the whole body honestly', () => {
    // A <main> holding a spinner would otherwise hide the entire page behind an empty "article".
    const result = run({
      tag: 'body',
      children: [
        { tag: 'main', children: [para('Loading…')] },
        { tag: 'div', children: [long('The page that actually rendered elsewhere.')] },
      ],
    });
    expect(result.source).toBe('body');
    expect(result.text).toContain('The page that actually rendered elsewhere.');
  });

  it('accepts a genuinely short article by its share of the page', () => {
    const result = run({
      tag: 'body',
      children: [
        { tag: 'article', children: [para('Short but this is the whole page.')] },
        { tag: 'footer', children: [para('x')] },
      ],
    });
    expect(result.source).toBe('article');
  });

  it('drops aria-hidden content the page does not intend a reader to see', () => {
    const result = run({
      tag: 'body',
      children: [
        {
          tag: 'article',
          children: [
            long('Visible body.'),
            {
              tag: 'div',
              attrs: { 'aria-hidden': 'true' },
              children: [para('SEO keyword stuffing')],
            },
          ],
        },
      ],
    });
    expect(result.text).not.toContain('SEO keyword stuffing');
  });

  it('reports empty text rather than throwing when there is no body', () => {
    const context = vm.createContext({ document: { body: null, querySelector: () => null } });
    const result = vm.runInContext(buildArticleTextExpression(), context) as {
      text: string;
      source: string;
    };
    expect(result).toEqual({ text: '', source: 'body' });
  });

  it('compiles as a self-contained expression', () => {
    expect(() => new vm.Script(`(${buildArticleTextExpression()})`)).not.toThrow();
  });
});
