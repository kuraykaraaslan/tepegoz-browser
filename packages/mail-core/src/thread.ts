/**
 * Conversation threading — the JWZ algorithm (https://www.jwz.org/doc/threading.html) over
 * `Message-ID` / `References` / `In-Reply-To`, with a subject-based fallback for clients that send
 * neither. Pure: give it a flat message list, get back a stable `threadId` per message and a tree
 * per thread.
 *
 * "Stable" means deterministic — the same set of messages always yields the same `threadId`s and the
 * same ordering — and monotonic under growth: `assignThreadId` places a newly-synced message into
 * the thread its parent already belongs to rather than renumbering the folder.
 *
 * Reply/forward prefixes are stripped in many languages (`Re:` `Fwd:` `Aw:` `Sv:` `Ynt:` `İlt:` …)
 * plus `Re[2]:` / `Re(2):` counters and a leading `[list-tag]`, so "Re: Rapor" and "Ynt: Rapor"
 * land in one thread.
 */

import type { MailMessage } from '@tepegoz/shared-types';

export interface ThreadableMessage {
  /** Local message id — the value that receives a `threadId`. */
  readonly id: string;
  /** RFC 5322 `Message-ID`, angle brackets stripped; `null` when the message carried none. */
  readonly messageId: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly subject: string;
  /** Ordering key within a thread (epoch ms). */
  readonly date: number;
}

export interface ThreadNode {
  /** The message here, or `null` for a container referenced by others but not itself present. */
  readonly message: ThreadableMessage | null;
  readonly children: ThreadNode[];
}

export interface ThreadResult {
  /** `message.id` → `threadId`. */
  readonly threadIdOf: Map<string, string>;
  /** `threadId` → the root of that thread's tree. */
  readonly threads: Map<string, ThreadNode>;
}

/** The `MailMessage` fields threading needs — accept the full schema type or a bare shape. */
export function toThreadable(
  m: Pick<MailMessage, 'id' | 'messageId' | 'inReplyTo' | 'references' | 'subject' | 'date'>,
): ThreadableMessage {
  return {
    id: m.id,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    subject: m.subject,
    date: m.date,
  };
}

// ---------------------------------------------------------------------------
// subject normalisation
// ---------------------------------------------------------------------------

const REPLY_TOKENS = new Set([
  're',
  'aw',
  'sv',
  'vs',
  'ref',
  'rif',
  'res',
  'odp',
  'ynt',
  'yan',
  'antw',
  'rép',
  'rep',
]);
const FORWARD_TOKENS = new Set([
  'fw',
  'fwd',
  'wg',
  'tr',
  'rv',
  'enc',
  'vs',
  'ilt',
  'ilet',
  'iletildi',
]);

const PREFIX_RE = /^\s*([\p{L}]{1,10})\s*(?:\[\d+\]|\(\d+\))?\s*:\s*/u;
const LIST_TAG_RE = /^\s*\[[^\]]{1,60}\]\s*/;

/** Case-fold a prefix token so Turkish dotted/dotless `i` compares as one letter. */
function foldToken(t: string): string {
  return t.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/ı/g, 'i');
}

interface StrippedSubject {
  readonly base: string;
  /** The original subject carried at least one reply/forward prefix. */
  readonly wasReply: boolean;
}

/** Strip every leading reply/forward prefix and `[list-tag]`, collapse whitespace. */
export function stripSubjectPrefixes(subject: string): StrippedSubject {
  let s = typeof subject === 'string' ? subject : '';
  let wasReply = false;
  for (let guard = 0; guard < 20; guard += 1) {
    const tag = LIST_TAG_RE.exec(s);
    if (tag !== null) {
      s = s.slice(tag[0].length);
      continue;
    }
    const m = PREFIX_RE.exec(s);
    if (m === null) break;
    const token = foldToken(m[1] ?? '');
    if (!REPLY_TOKENS.has(token) && !FORWARD_TOKENS.has(token)) break;
    wasReply = true;
    s = s.slice(m[0].length);
  }
  return { base: s.replace(/\s+/g, ' ').trim(), wasReply };
}

/** The subject with prefixes removed, lower-cased — the key threads are grouped by. */
export function normaliseSubject(subject: string): string {
  return stripSubjectPrefixes(subject).base.toLowerCase();
}

export function isReplySubject(subject: string): boolean {
  return stripSubjectPrefixes(subject).wasReply;
}

// ---------------------------------------------------------------------------
// stable ids
// ---------------------------------------------------------------------------

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// JWZ containers
// ---------------------------------------------------------------------------

interface Container {
  key: string | null; // the message-id this container is indexed by
  message: ThreadableMessage | null;
  parent: Container | null;
  children: Set<Container>;
}

function newContainer(key: string | null): Container {
  return { key, message: null, parent: null, children: new Set() };
}

/** True when `ancestor` already sits above `node` in the tree (so making it a child would loop). */
function isAncestor(ancestor: Container, node: Container): boolean {
  let c: Container | null = node.parent;
  while (c !== null) {
    if (c === ancestor) return true;
    c = c.parent;
  }
  return false;
}

/** JWZ step 1.B: link a References pair, but never overwrite an existing parent or make a loop. */
function link(parent: Container, child: Container): void {
  if (parent === child || child.parent !== null) return;
  if (isAncestor(child, parent)) return; // child is already above parent
  child.parent = parent;
  parent.children.add(child);
}

/** JWZ step 1.C: the real parent — throw away any presumed one, loop-guarded. */
function reparent(child: Container, parent: Container): void {
  if (parent === child || isAncestor(child, parent)) return; // child is already above parent
  if (child.parent !== null) child.parent.children.delete(child);
  child.parent = parent;
  parent.children.add(child);
}

/** JWZ step 4: splice through empty intermediate containers; fold empty root containers. */
function pruneEmpties(roots: Set<Container>): void {
  const spliceChildren = (container: Container): void => {
    for (const kid of [...container.children]) spliceChildren(kid);
    for (const kid of [...container.children]) {
      if (kid.message !== null) continue;
      if (kid.children.size === 0) {
        container.children.delete(kid);
        continue;
      }
      for (const grand of [...kid.children]) {
        grand.parent = container;
        container.children.add(grand);
      }
      kid.children.clear();
      container.children.delete(kid);
    }
  };
  for (const r of roots) spliceChildren(r);

  for (const r of [...roots]) {
    if (r.message !== null) continue;
    if (r.children.size === 0) {
      roots.delete(r);
    } else if (r.children.size === 1) {
      const [only] = [...r.children];
      if (only !== undefined) {
        only.parent = null;
        roots.delete(r);
        roots.add(only);
      }
    }
    // an empty root with >1 child stays as a grouping node
  }
}

// ---------------------------------------------------------------------------
// subject merge (JWZ step 5)
// ---------------------------------------------------------------------------

function containerIsReply(c: Container): boolean {
  return c.message !== null && isReplySubject(c.message.subject);
}

function containerBaseSubject(c: Container): string {
  if (c.message !== null) return normaliseSubject(c.message.subject);
  for (const kid of c.children) {
    const s = containerBaseSubject(kid);
    if (s.length > 0) return s;
  }
  return '';
}

function mergeBySubject(roots: Set<Container>): void {
  const table = new Map<string, Container>();
  for (const r of roots) {
    const base = containerBaseSubject(r);
    if (base.length === 0) continue;
    const prev = table.get(base);
    if (
      prev === undefined ||
      (r.message === null && prev.message !== null) ||
      (containerIsReply(prev) && !containerIsReply(r))
    ) {
      table.set(base, r);
    }
  }
  for (const r of [...roots]) {
    const base = containerBaseSubject(r);
    if (base.length === 0) continue;
    const other = table.get(base);
    if (other === undefined || other === r || !roots.has(other)) continue;

    if (other.message === null || (containerIsReply(r) && !containerIsReply(other))) {
      // `other` is the canonical root for this subject — nest `r` (or its children) under it.
      if (r.message === null) {
        for (const kid of [...r.children]) reparent(kid, other);
      } else {
        reparent(r, other);
      }
      roots.delete(r);
    } else {
      // Two real, same-subject roots and neither is a reply of the other — give them a shared
      // empty parent so neither is presented as the other's ancestor (JWZ §5).
      const grouping = newContainer(null);
      reparent(other, grouping);
      reparent(r, grouping);
      roots.delete(other);
      roots.delete(r);
      roots.add(grouping);
      table.set(base, grouping);
    }
  }
}

// ---------------------------------------------------------------------------
// tree build + id assignment
// ---------------------------------------------------------------------------

function earliestKey(c: Container): string {
  let bestDate = Number.POSITIVE_INFINITY;
  let bestKey: string | null = null;
  const visit = (node: Container): void => {
    if (node.message !== null && (bestKey === null || node.message.date < bestDate)) {
      bestDate = node.message.date;
      bestKey = node.message.messageId ?? node.message.id;
    }
    for (const kid of node.children) visit(kid);
  };
  visit(c);
  return bestKey ?? c.key ?? 'empty';
}

function toNode(c: Container, threadId: string, out: Map<string, string>): ThreadNode {
  // `link` / `reparent` refuse any edge that would make a cycle, so this recursion terminates.
  if (c.message !== null) out.set(c.message.id, threadId);
  const children = [...c.children]
    .map((kid) => toNode(kid, threadId, out))
    .sort((a, b) => {
      const ad = a.message?.date ?? 0;
      const bd = b.message?.date ?? 0;
      if (ad !== bd) return ad - bd;
      return (a.message?.id ?? '').localeCompare(b.message?.id ?? '');
    });
  return { message: c.message, children };
}

/** Thread a flat list of messages. Deterministic in message order and content. */
export function threadMessages(messages: readonly ThreadableMessage[]): ThreadResult {
  const table = new Map<string, Container>();
  const all: Container[] = [];

  const getById = (id: string): Container => {
    let c = table.get(id);
    if (c === undefined) {
      c = newContainer(id);
      table.set(id, c);
      all.push(c);
    }
    return c;
  };

  // JWZ step 1 — a container per message, keyed by Message-ID where possible.
  for (const m of messages) {
    let self: Container;
    if (m.messageId !== null && m.messageId.length > 0) {
      self = getById(m.messageId);
      if (self.message !== null) {
        // a second message claiming the same id — give it a standalone container
        self = newContainer(null);
        all.push(self);
      }
    } else {
      self = newContainer(null);
      all.push(self);
    }
    self.message = m;

    // JWZ step 1.B — walk the reference chain, linking parent→child.
    const chain = (m.references.length > 0 ? [...m.references] : m.inReplyTo ? [m.inReplyTo] : [])
      .filter((r) => typeof r === 'string' && r.length > 0 && r !== m.messageId);
    let prev: Container | null = null;
    for (const ref of chain) {
      const cur = getById(ref);
      if (prev !== null) link(prev, cur);
      prev = cur;
    }
    // JWZ step 1.C — this message's parent is the last reference.
    if (prev !== null) reparent(self, prev);
  }

  // JWZ step 3 — the root set.
  const roots = new Set<Container>();
  for (const c of all) {
    let r = c;
    while (r.parent !== null) r = r.parent;
    roots.add(r);
  }

  pruneEmpties(roots);
  mergeBySubject(roots);

  const threadIdOf = new Map<string, string>();
  const threads = new Map<string, ThreadNode>();
  const orderedRoots = [...roots].sort((a, b) => {
    const ad = earliestDate(a);
    const bd = earliestDate(b);
    if (ad !== bd) return ad - bd;
    return earliestKey(a).localeCompare(earliestKey(b));
  });
  for (const root of orderedRoots) {
    const threadId = `t-${fnv1a(earliestKey(root))}`;
    threads.set(threadId, toNode(root, threadId, threadIdOf));
  }
  return { threadIdOf, threads };
}

function earliestDate(c: Container): number {
  let best = Number.POSITIVE_INFINITY;
  const visit = (node: Container): void => {
    if (node.message !== null && node.message.date < best) best = node.message.date;
    for (const kid of node.children) visit(kid);
  };
  visit(c);
  return best === Number.POSITIVE_INFINITY ? 0 : best;
}

// ---------------------------------------------------------------------------
// incremental
// ---------------------------------------------------------------------------

export interface ThreadedRef {
  readonly messageId: string | null;
  readonly subject: string;
  readonly date: number;
  readonly threadId: string;
}

/**
 * The `threadId` a newly-synced message should take, given the folder's already-threaded messages.
 * Prefers an explicit `References` / `In-Reply-To` match; falls back to a base-subject match when
 * the new message looks like a reply; otherwise starts a new thread.
 */
export function assignThreadId(
  message: ThreadableMessage,
  existing: readonly ThreadedRef[],
): string {
  const byMessageId = new Map<string, string>();
  const bySubject = new Map<string, { threadId: string; date: number }>();
  for (const e of existing) {
    if (e.messageId !== null && e.messageId.length > 0 && !byMessageId.has(e.messageId)) {
      byMessageId.set(e.messageId, e.threadId);
    }
    const base = normaliseSubject(e.subject);
    if (base.length > 0) {
      const prev = bySubject.get(base);
      if (prev === undefined || e.date < prev.date) {
        bySubject.set(base, { threadId: e.threadId, date: e.date });
      }
    }
  }

  const refs = [...message.references, ...(message.inReplyTo ? [message.inReplyTo] : [])];
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    const hit = byMessageId.get(refs[i] ?? '');
    if (hit !== undefined) return hit;
  }

  if (isReplySubject(message.subject)) {
    const base = normaliseSubject(message.subject);
    const hit = bySubject.get(base);
    if (hit !== undefined) return hit.threadId;
  }

  return `t-${fnv1a(message.messageId ?? message.id)}`;
}
