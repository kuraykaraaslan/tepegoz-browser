/**
 * A minimal, incremental XML parser for an XMPP stream (RFC 6120 §11). Not a general XML parser: it
 * handles exactly what an XMPP stream carries — an optional `<?xml?>` declaration, one long-lived
 * `<stream:stream>` open tag, then a sequence of top-level stanzas, then `</stream:stream>`.
 *
 * Pure and total: `feed()` never throws — a malformed byte sequence produces an `error` event and
 * the parser refuses further input. Bounded: the pending buffer, element depth, and attribute count
 * are capped so a hostile server cannot exhaust memory mid-stanza.
 *
 * Namespaces are tracked coarsely: the parser keeps the raw element name (prefix included, e.g.
 * `stream:features`) and resolves `xmlns` / `xmlns:*` onto each element so adapters can match on
 * `(localName, namespace)` without a full Infoset.
 */

const MAX_BUFFER = 1 << 20; // 1 MiB of un-parsed input
const MAX_DEPTH = 32;
const MAX_ATTRS = 64;
const MAX_CHILDREN = 4096;

export interface XmlElement {
  /** Raw tag name, prefix included (`message`, `stream:features`). */
  name: string;
  /** Local name (after the last `:`). */
  local: string;
  /** Resolved element namespace (default `xmlns`, or the prefix's binding), or `null`. */
  ns: string | null;
  attrs: Record<string, string>;
  children: Array<XmlElement | string>;
}

export type XmlStreamEvent =
  | { type: 'open'; name: string; attrs: Record<string, string> }
  | { type: 'stanza'; element: XmlElement }
  | { type: 'close' }
  | { type: 'error'; message: string };

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Decode the five predefined entities + numeric character references. Total. */
export function decodeXmlText(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function safeFromCodePoint(code: number): string {
  if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function encodeXmlText(input: string): string {
  return input.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

interface Frame {
  element: XmlElement;
  /** xmlns bindings introduced at this frame (prefix → uri; '' key = default). */
  nsBindings: Map<string, string>;
}

export class XmlStreamParser {
  private buffer = '';
  private stack: Frame[] = [];
  private failed = false;
  /** Prefix → uri, walked from the stack; the stream root's bindings live here. */
  private rootNs = new Map<string, string>();

  constructor(private readonly emit: (event: XmlStreamEvent) => void) {}

  feed(chunk: string): void {
    if (this.failed) return;
    if (this.buffer.length + chunk.length > MAX_BUFFER) {
      this.fail('xml stream buffer overflow');
      return;
    }
    this.buffer += chunk;
    this.drain();
  }

  private fail(message: string): void {
    this.failed = true;
    this.emit({ type: 'error', message });
  }

  private drain(): void {
    while (!this.failed) {
      const lt = this.buffer.indexOf('<');
      if (lt === -1) {
        this.consumeText(this.buffer);
        this.buffer = '';
        return;
      }
      if (lt > 0) {
        this.consumeText(this.buffer.slice(0, lt));
        this.buffer = this.buffer.slice(lt);
      }
      // buffer now starts with '<'
      if (this.buffer.startsWith('<![CDATA[')) {
        const end = this.buffer.indexOf(']]>');
        if (end === -1) return; // incomplete CDATA — wait for more
        this.consumeCData(this.buffer.slice(9, end));
        this.buffer = this.buffer.slice(end + 3);
        continue;
      }
      if (this.buffer.startsWith('<!--')) {
        const end = this.buffer.indexOf('-->');
        if (end === -1) return;
        this.buffer = this.buffer.slice(end + 3);
        continue;
      }
      const gt = this.findTagEnd(this.buffer);
      if (gt === -1) return; // incomplete tag — wait for more
      const raw = this.buffer.slice(0, gt + 1);
      this.buffer = this.buffer.slice(gt + 1);
      this.consumeTag(raw);
    }
  }

  /** Index of the '>' that closes the tag starting at position 0, respecting quotes. -1 if none yet. */
  private findTagEnd(s: string): number {
    let quote: string | null = null;
    for (let i = 1; i < s.length; i += 1) {
      const ch = s[i];
      if (quote !== null) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        return i;
      }
    }
    return -1;
  }

  private consumeText(text: string): void {
    if (this.stack.length === 0 || text.length === 0) return;
    const top = this.stack[this.stack.length - 1];
    if (top === undefined) return;
    const decoded = decodeXmlText(text);
    const last = top.element.children[top.element.children.length - 1];
    if (typeof last === 'string') {
      top.element.children[top.element.children.length - 1] = last + decoded;
    } else {
      if (top.element.children.length >= MAX_CHILDREN) {
        this.fail('xml element has too many children');
        return;
      }
      top.element.children.push(decoded);
    }
  }

  private consumeTag(raw: string): void {
    if (raw.startsWith('<?')) return; // <?xml … ?> declaration — ignore (CDATA/comments in drain())
    if (raw.startsWith('</')) {
      this.consumeCloseTag(raw.slice(2, -1).trim());
      return;
    }
    const selfClosing = raw.endsWith('/>');
    const inner = raw.slice(1, selfClosing ? -2 : -1).trim();
    const parsed = this.parseOpenTag(inner);
    if (parsed === null) return;
    const { name, attrs } = parsed;

    if (name === 'stream:stream') {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'xmlns') this.rootNs.set('', v);
        else if (k.startsWith('xmlns:')) this.rootNs.set(k.slice(6), v);
      }
      this.emit({ type: 'open', name, attrs });
      return;
    }

    const nsBindings = new Map<string, string>();
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'xmlns') nsBindings.set('', v);
      else if (k.startsWith('xmlns:')) nsBindings.set(k.slice(6), v);
    }
    const local = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
    const prefix = name.includes(':') ? name.slice(0, name.indexOf(':')) : '';
    const element: XmlElement = {
      name,
      local,
      ns: this.resolveNs(prefix, nsBindings),
      attrs,
      children: [],
    };

    if (this.stack.length + 1 > MAX_DEPTH) {
      this.fail('xml nesting too deep');
      return;
    }

    if (selfClosing) {
      this.attachOrEmit(element);
    } else {
      this.stack.push({ element, nsBindings });
    }
  }

  private consumeCData(content: string): void {
    if (this.stack.length === 0) return;
    const top = this.stack[this.stack.length - 1];
    if (top === undefined) return;
    top.element.children.push(content);
  }

  private consumeCloseTag(name: string): void {
    if (name === 'stream:stream') {
      this.emit({ type: 'close' });
      return;
    }
    const frame = this.stack.pop();
    if (frame === undefined || frame.element.name !== name) {
      this.fail(`xml close tag mismatch: </${name}>`);
      return;
    }
    this.attachOrEmit(frame.element);
  }

  private attachOrEmit(element: XmlElement): void {
    const parent = this.stack[this.stack.length - 1];
    if (parent === undefined) {
      this.emit({ type: 'stanza', element });
      return;
    }
    if (parent.element.children.length >= MAX_CHILDREN) {
      this.fail('xml element has too many children');
      return;
    }
    parent.element.children.push(element);
  }

  private resolveNs(prefix: string, local: Map<string, string>): string | null {
    if (local.has(prefix)) return local.get(prefix) ?? null;
    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      const frame = this.stack[i];
      if (frame !== undefined && frame.nsBindings.has(prefix)) {
        return frame.nsBindings.get(prefix) ?? null;
      }
    }
    return this.rootNs.get(prefix) ?? null;
  }

  private parseOpenTag(inner: string): { name: string; attrs: Record<string, string> } | null {
    const nameMatch = /^([^\s/]+)/.exec(inner);
    if (nameMatch?.[1] === undefined) {
      this.fail('malformed xml tag');
      return null;
    }
    const name = nameMatch[1];
    const attrs: Record<string, string> = {};
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = attrRe.exec(inner.slice(name.length))) !== null) {
      count += 1;
      if (count > MAX_ATTRS) {
        this.fail('xml tag has too many attributes');
        return null;
      }
      const key = m[1];
      const value = m[3] ?? m[4] ?? '';
      if (key !== undefined) attrs[key] = decodeXmlText(value);
    }
    return { name, attrs };
  }
}

// ── element helpers ─────────────────────────────────────────────────────────

/** First child element with the given local name (and optional namespace). */
export function child(el: XmlElement, local: string, ns?: string): XmlElement | null {
  for (const c of el.children) {
    if (typeof c !== 'string' && c.local === local && (ns === undefined || c.ns === ns)) return c;
  }
  return null;
}

/** All child elements with the given local name (and optional namespace). */
export function children(el: XmlElement, local: string, ns?: string): XmlElement[] {
  return el.children.filter(
    (c): c is XmlElement =>
      typeof c !== 'string' && c.local === local && (ns === undefined || c.ns === ns),
  );
}

/** Concatenated text content of an element (direct text nodes only). */
export function text(el: XmlElement): string {
  return el.children.filter((c): c is string => typeof c === 'string').join('');
}

/** Text of the first matching child, or `''`. */
export function childText(el: XmlElement, local: string, ns?: string): string {
  const c = child(el, local, ns);
  return c === null ? '' : text(c);
}
