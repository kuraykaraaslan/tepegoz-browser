import { describe, it, expect } from 'vitest';
import {
  threadMessages,
  assignThreadId,
  stripSubjectPrefixes,
  normaliseSubject,
  isReplySubject,
  toThreadable,
  type ThreadableMessage,
  type ThreadNode,
} from './thread';

let clock = 0;
function mk(
  id: string,
  opts: Partial<Omit<ThreadableMessage, 'id'>> = {},
): ThreadableMessage {
  return {
    id,
    messageId: 'messageId' in opts ? (opts.messageId ?? null) : `${id}@x.org`,
    inReplyTo: opts.inReplyTo ?? null,
    references: opts.references ?? [],
    subject: opts.subject ?? 'Subject',
    date: opts.date ?? (clock += 1000),
  };
}

/** Flatten a thread tree to `id`s in DFS order, `null` for empty containers. */
function flat(node: ThreadNode): (string | null)[] {
  return [node.message?.id ?? null, ...node.children.flatMap(flat)];
}

describe('stripSubjectPrefixes / normaliseSubject / isReplySubject', () => {
  it('strips Re: / Fwd: and counters and list tags', () => {
    expect(stripSubjectPrefixes('Re: Rapor').base).toBe('Rapor');
    expect(stripSubjectPrefixes('RE: Re: Fwd: Rapor').base).toBe('Rapor');
    expect(stripSubjectPrefixes('Re[2]: Rapor').base).toBe('Rapor');
    expect(stripSubjectPrefixes('Re(5): Rapor').base).toBe('Rapor');
    expect(stripSubjectPrefixes('[dev-list] Re: Rapor').base).toBe('Rapor');
  });

  it('strips localized reply/forward prefixes (tr, de, nl, fr)', () => {
    expect(normaliseSubject('Ynt: Toplantı')).toBe('toplantı');
    expect(normaliseSubject('İlt: Toplantı')).toBe('toplantı');
    expect(normaliseSubject('Aw: Besprechung')).toBe('besprechung');
    expect(normaliseSubject('Antw: Vergadering')).toBe('vergadering');
    expect(normaliseSubject('TR: Réunion')).toBe('réunion');
  });

  it('reports whether a prefix was present', () => {
    expect(isReplySubject('Re: x')).toBe(true);
    expect(isReplySubject('Ynt: x')).toBe(true);
    expect(isReplySubject('x')).toBe(false);
    expect(isReplySubject('Rebase notes')).toBe(false); // "Rebase" is not "Re:"
  });

  it('is total on a non-string / empty subject', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(stripSubjectPrefixes(undefined).base).toBe('');
    expect(normaliseSubject('')).toBe('');
  });

  it('folds a dotless capital I token and strips a list tag before the prefix', () => {
    expect(stripSubjectPrefixes('ILT: Konu').base).toBe('Konu'); // capital I → ı → i, matches "ilt"
    expect(stripSubjectPrefixes('[team] [urgent] Re: Konu').base).toBe('Konu');
  });

  it('gives up after a pathological pile of prefixes without hanging', () => {
    const nasty = `${'Re: '.repeat(200)}Deep`;
    expect(stripSubjectPrefixes(nasty).base.endsWith('Deep')).toBe(true);
  });
});

describe('threadMessages — References / In-Reply-To', () => {
  it('threads a simple parent → child → grandchild chain under one id', () => {
    const a = mk('a', { subject: 'Plan' });
    const b = mk('b', { subject: 'Re: Plan', references: ['a@x.org'], inReplyTo: 'a@x.org' });
    const c = mk('c', {
      subject: 'Re: Plan',
      references: ['a@x.org', 'b@x.org'],
      inReplyTo: 'b@x.org',
    });
    const { threadIdOf, threads } = threadMessages([a, b, c]);
    expect(new Set(threadIdOf.values()).size).toBe(1);
    const [root] = [...threads.values()];
    expect(flat(root!)).toEqual(['a', 'b', 'c']);
  });

  it('creates an empty container when a referenced parent is missing, then no longer once it arrives', () => {
    const orphan = mk('b', { subject: 'Re: Plan', references: ['missing@x.org'] });
    const one = threadMessages([orphan]);
    // the missing parent is pruned; the single real message is the root
    expect([...one.threads.values()][0]!.message?.id).toBe('b');

    const parent = mk('a', { messageId: 'missing@x.org', subject: 'Plan' });
    const two = threadMessages([orphan, parent]);
    expect(new Set(two.threadIdOf.values()).size).toBe(1);
    expect(flat([...two.threads.values()][0]!)).toEqual(['a', 'b']);
  });

  it('keeps two unrelated messages in two threads', () => {
    const r = threadMessages([mk('a', { subject: 'One' }), mk('b', { subject: 'Two' })]);
    expect(r.threads.size).toBe(2);
  });

  it('breaks a reference loop instead of hanging', () => {
    const a = mk('a', { messageId: 'a@x.org', references: ['b@x.org'] });
    const b = mk('b', { messageId: 'b@x.org', references: ['a@x.org'] });
    expect(() => threadMessages([a, b])).not.toThrow();
    const r = threadMessages([a, b]);
    expect(r.threadIdOf.size).toBe(2);
  });

  it('is order-independent and deterministic', () => {
    const msgs = [
      mk('a', { subject: 'Plan' }),
      mk('b', { subject: 'Re: Plan', references: ['a@x.org'] }),
      mk('c', { subject: 'Re: Plan', references: ['a@x.org', 'b@x.org'] }),
    ];
    const forward = threadMessages(msgs);
    const reversed = threadMessages([...msgs].reverse());
    expect([...reversed.threadIdOf.entries()].sort()).toEqual(
      [...forward.threadIdOf.entries()].sort(),
    );
  });
});

describe('threadMessages — subject fallback', () => {
  it('joins messages with the same base subject when one is a reply and neither has References', () => {
    const a = mk('a', { subject: 'Quarterly numbers', references: [], inReplyTo: null });
    const b = mk('b', { subject: 'Re: Quarterly numbers', references: [], inReplyTo: null });
    const r = threadMessages([a, b]);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
  });

  it('does NOT merge two same-subject roots when neither is a reply', () => {
    const a = mk('a', { subject: 'Standup', references: [] });
    const b = mk('b', { subject: 'Standup', references: [] });
    const r = threadMessages([a, b]);
    // grouped under one empty container, but they are still distinct nodes
    expect(r.threadIdOf.size).toBe(2);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
  });

  it('nests a subject-matched reply under a real root, promoting a reply-only canonical', () => {
    // reply seen first (becomes provisional canonical), then the non-reply original overrides it
    const reply = mk('reply', { subject: 'Re: Roadmap', references: [] });
    const orig = mk('orig', { subject: 'Roadmap', references: [] });
    const r = threadMessages([reply, orig]);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
    const [root] = [...r.threads.values()];
    expect(root!.message?.id).toBe('orig');
    expect(flat(root!)).toEqual(['orig', 'reply']);
  });

  it('folds an empty grouping container into a subject-matched sibling', () => {
    // ghost gathers two replies -> empty grouping root; a third message shares the base subject
    const g1 = mk('g1', { subject: 'Re: Sprint', references: ['ghost@x.org'] });
    const g2 = mk('g2', { subject: 'Re: Sprint', references: ['ghost@x.org'] });
    const orig = mk('orig', { subject: 'Sprint', references: [] });
    const r = threadMessages([g1, g2, orig]);
    expect(r.threadIdOf.size).toBe(3);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
  });

  it('drops a fully-empty intermediate container (no message, no children after splice)', () => {
    // m2 pins g1>g2>g3; m1 pins g1>g3 — g2 ends up empty with zero children and is deleted
    const m1 = mk('m1', { subject: 'X', references: ['g1@x.org', 'g3@x.org'] });
    const m2 = mk('m2', { subject: 'X', references: ['g1@x.org', 'g2@x.org', 'g3@x.org'] });
    const r = threadMessages([m1, m2]);
    expect(() => flat([...r.threads.values()][0]!)).not.toThrow();
    expect(r.threadIdOf.size).toBe(2);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
  });

  it('an empty-subject message threads by itself', () => {
    const r = threadMessages([mk('a', { subject: '', references: [] }), mk('b', { subject: '' })]);
    expect(r.threads.size).toBe(2);
  });

  it('does not loop when two messages list the same references in opposite order', () => {
    const x = mk('x', { messageId: 'x@x.org', references: ['p@x.org', 'q@x.org'] });
    const y = mk('y', { messageId: 'y@x.org', references: ['q@x.org', 'p@x.org'] });
    expect(() => threadMessages([x, y])).not.toThrow();
    const r = threadMessages([x, y]);
    expect(r.threadIdOf.size).toBe(2);
  });

  it('makes a ghost grouping canonical even when a real same-subject root was seen first', () => {
    const orig = mk('orig', { subject: 'Sprint', references: [] });
    const g1 = mk('g1', { subject: 'Re: Sprint', references: ['ghost@x.org'] });
    const g2 = mk('g2', { subject: 'Re: Sprint', references: ['ghost@x.org'] });
    const r = threadMessages([orig, g1, g2]); // real first, then the ghost-grouped replies
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
    expect(r.threadIdOf.size).toBe(3);
  });

  it('folds one empty grouping container into another with the same base subject', () => {
    const a1 = mk('a1', { subject: 'Sprint', references: ['ghostA@x.org'] });
    const a2 = mk('a2', { subject: 'Sprint', references: ['ghostA@x.org'] });
    const b1 = mk('b1', { subject: 'Re: Sprint', references: ['ghostB@x.org'] });
    const b2 = mk('b2', { subject: 'Re: Sprint', references: ['ghostB@x.org'] });
    const r = threadMessages([a1, a2, b1, b2]);
    expect(new Set(r.threadIdOf.values()).size).toBe(1);
    expect(r.threadIdOf.size).toBe(4);
  });

  it('threads a message that carries no Message-ID at all', () => {
    const a = mk('a', { messageId: null, subject: 'No id here', references: [] });
    const b = mk('b', { messageId: null, subject: 'Also no id', references: [] });
    const r = threadMessages([a, b]);
    expect(r.threadIdOf.get('a')).toBeDefined();
    expect(r.threadIdOf.get('b')).toBeDefined();
    expect(r.threads.size).toBe(2);
  });

  it('breaks a root-ordering tie on the earliest key when dates are equal', () => {
    const a = mk('a', { messageId: 'a@x.org', subject: 'Alpha', date: 5000, references: [] });
    const b = mk('b', { messageId: 'b@x.org', subject: 'Beta', date: 5000, references: [] });
    const r = threadMessages([b, a]);
    expect([...r.threads.keys()]).toHaveLength(2);
  });
});

describe('threadMessages — a tangled 12-message golden', () => {
  it('resolves mixed clients, broken References and subject drift into one thread', () => {
    clock = 0;
    // root
    const m1 = mk('m1', { messageId: 'm1', subject: 'Release checklist' });
    // proper replies
    const m2 = mk('m2', { messageId: 'm2', subject: 'Re: Release checklist', references: ['m1'] });
    const m3 = mk('m3', {
      messageId: 'm3',
      subject: 'RE: Release checklist',
      references: ['m1', 'm2'],
    });
    // a client that only sets In-Reply-To
    const m4 = mk('m4', { messageId: 'm4', subject: 'Re: Release checklist', inReplyTo: 'm3' });
    // broken References (only the root), relies on subject + its own ref
    const m5 = mk('m5', { messageId: 'm5', subject: 'Re: Release checklist', references: ['m1'] });
    // subject drift, still has References
    const m6 = mk('m6', {
      messageId: 'm6',
      subject: 'Re: Release checklist (now with dates)',
      references: ['m1', 'm2', 'm3'],
    });
    // localized prefix, no References at all — subject fallback
    const m7 = mk('m7', { messageId: 'm7', subject: 'Ynt: Release checklist', references: [] });
    // deep reply to m6
    const m8 = mk('m8', {
      messageId: 'm8',
      subject: 'Re: Release checklist (now with dates)',
      references: ['m1', 'm2', 'm3', 'm6'],
    });
    // references a message we never received
    const m9 = mk('m9', {
      messageId: 'm9',
      subject: 'Re: Release checklist',
      references: ['m1', 'ghost@x.org'],
    });
    // a forward that keeps the thread
    const m10 = mk('m10', {
      messageId: 'm10',
      subject: 'Fwd: Release checklist',
      references: ['m1', 'm2'],
    });
    // reply to the forward
    const m11 = mk('m11', {
      messageId: 'm11',
      subject: 'Re: Fwd: Release checklist',
      references: ['m1', 'm2', 'm10'],
    });
    // duplicate Message-ID of m2 (seen in two folders)
    const m12 = mk('m12', { messageId: 'm2', subject: 'Re: Release checklist', references: ['m1'] });

    const all = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12];
    const { threadIdOf, threads } = threadMessages(all);

    // every message lands in exactly one, shared thread
    expect(threadIdOf.size).toBe(12);
    expect(new Set(threadIdOf.values()).size).toBe(1);
    expect(threads.size).toBe(1);

    const [root] = [...threads.values()];
    // structure: m1 at the root, m2 and m3 on the main spine
    expect(root!.message?.id).toBe('m1');
    const ids = flat(root!).filter((x): x is string => x !== null);
    expect(new Set(ids)).toEqual(new Set(all.map((m) => m.id)));
    // m8 sits under m6 which sits under m3
    const m3node = findNode(root!, 'm3');
    expect(m3node && findNode(m3node, 'm6') && findNode(findNode(m3node, 'm6')!, 'm8')).toBeTruthy();
    // m11 sits under m10
    const m10node = findNode(root!, 'm10');
    expect(m10node && findNode(m10node, 'm11')).toBeTruthy();
  });
});

function findNode(node: ThreadNode, id: string): ThreadNode | null {
  if (node.message?.id === id) return node;
  for (const kid of node.children) {
    const hit = findNode(kid, id);
    if (hit !== null) return hit;
  }
  return null;
}

describe('assignThreadId — incremental', () => {
  const existing = [
    { messageId: 'root@x.org', subject: 'Budget', date: 1000, threadId: 't-budget' },
    { messageId: 'reply1@x.org', subject: 'Re: Budget', date: 2000, threadId: 't-budget' },
  ];

  it('reuses the parent thread on a References match', () => {
    const m = mk('new', { subject: 'Re: Budget', references: ['reply1@x.org'] });
    expect(assignThreadId(m, existing)).toBe('t-budget');
  });

  it('reuses via In-Reply-To when References is empty', () => {
    const m = mk('new', { subject: 'Re: Budget', references: [], inReplyTo: 'root@x.org' });
    expect(assignThreadId(m, existing)).toBe('t-budget');
  });

  it('falls back to a base-subject match for a reply with no usable refs', () => {
    const m = mk('new', { subject: 'Ynt: Budget', references: [] });
    expect(assignThreadId(m, existing)).toBe('t-budget');
  });

  it('starts a new thread for an unrelated message, deterministically', () => {
    const m = mk('fresh', { subject: 'Something else', messageId: 'fresh@x.org' });
    const first = assignThreadId(m, existing);
    const second = assignThreadId(m, existing);
    expect(first).toBe(second);
    expect(first).not.toBe('t-budget');
  });

  it('does not subject-match a non-reply even if the base subject exists', () => {
    const m = mk('new', { subject: 'Budget', references: [], messageId: 'new@x.org' });
    expect(assignThreadId(m, existing)).not.toBe('t-budget');
  });

  it('derives a new thread id from the local id when the message has no Message-ID', () => {
    const m = mk('local-only', { subject: 'Fresh', references: [], messageId: null });
    const id = assignThreadId(m, existing);
    expect(id).toMatch(/^t-/);
    expect(id).toBe(assignThreadId(m, []));
  });

  it('skips a References entry that matches nothing and moves to the next', () => {
    const m = mk('new', {
      subject: 'Re: Budget',
      references: ['nope@x.org', 'root@x.org'],
      messageId: 'new@x.org',
    });
    expect(assignThreadId(m, existing)).toBe('t-budget');
  });
});

describe('toThreadable', () => {
  it('projects the threading fields off a MailMessage-shaped object', () => {
    const t = toThreadable({
      id: 'x',
      messageId: 'x@x.org',
      inReplyTo: null,
      references: ['y@x.org'],
      subject: 'Re: Hi',
      date: 5,
    });
    expect(t).toEqual({
      id: 'x',
      messageId: 'x@x.org',
      inReplyTo: null,
      references: ['y@x.org'],
      subject: 'Re: Hi',
      date: 5,
    });
  });
});
