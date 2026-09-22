import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { wholeWordFindScript } from './whole-word-find-script';
import { buildWholeWordPattern } from './whole-word-pattern';

/**
 * Runs the REAL injected script against a hand-built fake DOM via `vm.runInContext` — the same
 * technique `build-dom-tree-script.test.ts`/`build-dom-tree-noise.test.ts` use to run the perception
 * script for real without Electron. A hand-built tree, not real jsdom, for the same reason those files
 * use one: `apps/desktop/src/main` compiles under `tsconfig.node.json`, which deliberately excludes the
 * DOM lib ("enforces that privileged code never touches DOM globals") — importing a real `document`
 * here would fight that boundary instead of respecting it. What's faked is the DOM API surface (a
 * minimal mutable node tree: parent/child/sibling links, `splitText`, `createElement`, insert/remove);
 * what's REAL is the injected script's own traversal, matching, and highlighting logic under test.
 */

type FakeNode = FakeText | FakeElement;

class FakeText {
  readonly nodeType = 3 as const;
  data: string;
  parentNode: FakeElement | null = null;
  nextSibling: FakeNode | null = null;
  previousSibling: FakeNode | null = null;

  constructor(data: string) {
    this.data = data;
  }

  get parentElement(): FakeElement | null {
    return this.parentNode;
  }

  splitText(offset: number): FakeText {
    const tail = new FakeText(this.data.slice(offset));
    this.data = this.data.slice(0, offset);
    this.parentNode?.insertAfter(tail, this);
    return tail;
  }
}

class FakeElement {
  readonly nodeType = 1 as const;
  tagName: string;
  parentNode: FakeElement | null = null;
  nextSibling: FakeNode | null = null;
  previousSibling: FakeNode | null = null;
  firstChild: FakeNode | null = null;
  lastChild: FakeNode | null = null;
  private readonly attrs = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get parentElement(): FakeElement | null {
    return this.parentNode;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  appendChild(child: FakeNode): void {
    this.insertBefore(child, null);
  }

  insertBefore(child: FakeNode, ref: FakeNode | null): void {
    detach(child);
    child.parentNode = this;
    if (ref === null) {
      child.previousSibling = this.lastChild;
      child.nextSibling = null;
      if (this.lastChild !== null) this.lastChild.nextSibling = child;
      else this.firstChild = child;
      this.lastChild = child;
    } else {
      const prev = ref.previousSibling;
      child.previousSibling = prev;
      child.nextSibling = ref;
      ref.previousSibling = child;
      if (prev !== null) prev.nextSibling = child;
      else this.firstChild = child;
    }
  }

  insertAfter(child: FakeNode, ref: FakeNode): void {
    this.insertBefore(child, ref.nextSibling);
  }

  removeChild(child: FakeNode): void {
    detach(child);
  }

  replaceChild(next: FakeNode, old: FakeNode): void {
    this.insertBefore(next, old);
    this.removeChild(old);
  }

  normalize(): void {
    // No-op: nothing under test asserts merged adjacent text nodes.
  }

  scrollIntoView(): void {
    // No-op: geometry/scrolling is not observable from this fake tree.
  }
}

function detach(node: FakeNode): void {
  const parent = node.parentNode;
  if (parent === null) return;
  const prev = node.previousSibling;
  const next = node.nextSibling;
  if (prev !== null) prev.nextSibling = next;
  else parent.firstChild = next;
  if (next !== null) next.previousSibling = prev;
  else parent.lastChild = prev;
  node.parentNode = null;
  node.previousSibling = null;
  node.nextSibling = null;
}

function el(tagName: string, opts: { style?: string; children?: FakeNode[] } = {}): FakeElement {
  const e = new FakeElement(tagName);
  if (opts.style !== undefined) e.setAttribute('style', opts.style);
  for (const child of opts.children ?? []) e.appendChild(child);
  return e;
}

function text(data: string): FakeText {
  return new FakeText(data);
}

function textContentOf(node: FakeNode): string {
  if (node.nodeType === 3) return node.data;
  let out = '';
  for (let c = node.firstChild; c !== null; c = c.nextSibling) out += textContentOf(c);
  return out;
}

/** Minimal fake `getComputedStyle`: reads the same inline `style="..."` string the tests set, exactly
 *  like the real thing would for inline styles — no cascade, which nothing here needs. */
function getComputedStyle(target: FakeElement): {
  display: string;
  visibility: string;
  opacity: string;
} {
  const style = target.getAttribute('style') ?? '';
  return {
    display: style.includes('display:none') ? 'none' : 'block',
    visibility: style.includes('visibility:hidden') ? 'hidden' : 'visible',
    opacity: style.includes('opacity:0') ? '0' : '1',
  };
}

let body: FakeElement;
let fakeWindow: Record<string, unknown>;

function mount(...children: FakeNode[]): void {
  body = el('BODY', { children });
  // ONE object reused across every `run()` call in the test — `window[NS]` state (the match set + the
  // active index) has to persist across commands exactly like it would across two
  // `executeJavaScriptInIsolatedWorld` calls on the same real frame/world, and a fresh object per call
  // would silently reset it instead.
  fakeWindow = { getComputedStyle };
}

function run(
  command: 'search' | 'step' | 'clear',
  args: Parameters<typeof wholeWordFindScript>[1] = {},
) {
  const script = wholeWordFindScript(command, args);
  const fakeDocument = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
  };
  const context = vm.createContext({ document: fakeDocument, window: fakeWindow });
  return vm.runInContext(script, context) as { matches: number; activeMatchOrdinal: number };
}

function marks(): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (node: FakeNode): void => {
    if (node.nodeType === 1) {
      if (node.tagName === 'MARK' && node.hasAttribute('data-tepegoz-wwf')) out.push(node);
      for (let c = node.firstChild; c !== null; c = c.nextSibling) walk(c);
    }
  };
  walk(body);
  return out;
}

describe('wholeWordFindScript — compiles', () => {
  it('produces a syntactically valid, self-invoked expression for every command', () => {
    for (const cmd of ['search', 'step', 'clear'] as const) {
      const expr = wholeWordFindScript(cmd, { source: '\\bcat\\b', flags: 'gi' });
      expect(() => new vm.Script(expr)).not.toThrow();
    }
  });
});

describe('wholeWordFindScript — search', () => {
  it('finds only whole-word occurrences, case-insensitively by default', () => {
    mount(el('P', { children: [text('the cat sat on the mat. Category is not cat.')] }));
    const { source, flags } = buildWholeWordPattern('cat', false);
    const result = run('search', { source, flags });

    // "Category" contains "cat" but is not a whole-word match; the two real occurrences are.
    expect(result).toEqual({ matches: 2, activeMatchOrdinal: 1 });
    expect(marks()).toHaveLength(2);
    expect(marks().map((m) => textContentOf(m))).toEqual(['cat', 'cat']);
  });

  it('is case-sensitive when matchCase is true', () => {
    mount(el('P', { children: [text('Cat and cat.')] }));
    const { source, flags } = buildWholeWordPattern('Cat', true);
    expect(run('search', { source, flags })).toEqual({ matches: 1, activeMatchOrdinal: 1 });
  });

  it('reports zero matches without touching the DOM when nothing matches', () => {
    mount(el('P', { children: [text('no relevant text here')] }));
    const { source, flags } = buildWholeWordPattern('cat', false);
    expect(run('search', { source, flags })).toEqual({ matches: 0, activeMatchOrdinal: 0 });
    expect(marks()).toHaveLength(0);
  });

  it('skips text hidden via display:none or visibility:hidden', () => {
    mount(
      el('DIV', { style: 'display:none', children: [text('cat')] }),
      el('DIV', { style: 'visibility:hidden', children: [text('cat')] }),
      el('DIV', { children: [text('cat')] }),
    );
    const { source, flags } = buildWholeWordPattern('cat', false);
    expect(run('search', { source, flags })).toEqual({ matches: 1, activeMatchOrdinal: 1 });
  });

  it('never descends into <script> or <style> text', () => {
    mount(
      el('SCRIPT', { children: [text('var cat = 1;')] }),
      el('STYLE', { children: [text('.cat{}')] }),
      el('P', { children: [text('cat')] }),
    );
    const { source, flags } = buildWholeWordPattern('cat', false);
    expect(run('search', { source, flags })).toEqual({ matches: 1, activeMatchOrdinal: 1 });
  });

  it('escapes regex metacharacters in the query instead of treating them as a pattern', () => {
    // "." would match ANY character if not escaped — "a.bc" would then wrongly count too. It does not
    // (only the standalone "a.b" does), which is only true because `buildWholeWordPattern` escapes it.
    mount(el('P', { children: [text('the value a.b is set, unlike a.bc or ab')] }));
    const { source, flags } = buildWholeWordPattern('a.b', false);
    expect(run('search', { source, flags })).toEqual({ matches: 1, activeMatchOrdinal: 1 });
  });

  it('marks the FIRST match active and leaves the rest unhighlighted-but-marked', () => {
    mount(el('P', { children: [text('cat cat cat')] }));
    const { source, flags } = buildWholeWordPattern('cat', false);
    run('search', { source, flags });
    const styles = marks().map((m) => m.getAttribute('style'));
    expect(styles[0]).toContain('outline'); // active style
    expect(styles[1]).not.toContain('outline');
    expect(styles[2]).not.toContain('outline');
  });

  it('a second search clears the previous highlight set instead of stacking marks', () => {
    mount(el('P', { children: [text('cat cat')] }));
    const first = buildWholeWordPattern('cat', false);
    run('search', { source: first.source, flags: first.flags });
    expect(marks()).toHaveLength(2);

    const second = buildWholeWordPattern('dog', false); // no matches this time
    const result = run('search', { source: second.source, flags: second.flags });
    expect(result).toEqual({ matches: 0, activeMatchOrdinal: 0 });
    expect(marks()).toHaveLength(0);
    expect(textContentOf(body)).toBe('cat cat'); // original text restored, not lost
  });

  it('handles Turkish text', () => {
    mount(el('P', { children: [text('Kedi bahçede oturuyor. Bahçe güzel.')] }));
    const { source, flags } = buildWholeWordPattern('kedi', false);
    expect(run('search', { source, flags })).toEqual({ matches: 1, activeMatchOrdinal: 1 });
  });
});

describe('wholeWordFindScript — step', () => {
  function search(query: string) {
    const { source, flags } = buildWholeWordPattern(query, false);
    return run('search', { source, flags });
  }

  it('steps forward through matches and wraps past the last one', () => {
    mount(el('P', { children: [text('cat cat cat')] }));
    search('cat');
    expect(run('step', { forward: true })).toEqual({ matches: 3, activeMatchOrdinal: 2 });
    expect(run('step', { forward: true })).toEqual({ matches: 3, activeMatchOrdinal: 3 });
    expect(run('step', { forward: true })).toEqual({ matches: 3, activeMatchOrdinal: 1 }); // wraps
  });

  it('steps backward and wraps past the first one', () => {
    mount(el('P', { children: [text('cat cat cat')] }));
    search('cat');
    expect(run('step', { forward: false })).toEqual({ matches: 3, activeMatchOrdinal: 3 }); // wraps
  });

  it('moves the active highlight when stepping', () => {
    mount(el('P', { children: [text('cat cat')] }));
    search('cat');
    run('step', { forward: true });
    const styles = marks().map((m) => m.getAttribute('style'));
    expect(styles[0]).not.toContain('outline');
    expect(styles[1]).toContain('outline');
  });

  it('is a no-op when there is nothing to step through', () => {
    mount(el('P', { children: [text('no match')] }));
    search('cat');
    expect(run('step', { forward: true })).toEqual({ matches: 0, activeMatchOrdinal: 0 });
  });
});

describe('wholeWordFindScript — clear', () => {
  it('removes every mark and restores the original text', () => {
    mount(el('P', { children: [text('the cat sat')] }));
    const { source, flags } = buildWholeWordPattern('cat', false);
    run('search', { source, flags });
    expect(marks()).toHaveLength(1);

    const result = run('clear');
    expect(result).toEqual({ matches: 0, activeMatchOrdinal: 0 });
    expect(marks()).toHaveLength(0);
    expect(textContentOf(body)).toBe('the cat sat');
  });

  it('tolerates being called with nothing to clear', () => {
    mount(el('P', { children: [text('nothing searched yet')] }));
    expect(run('clear')).toEqual({ matches: 0, activeMatchOrdinal: 0 });
  });
});
