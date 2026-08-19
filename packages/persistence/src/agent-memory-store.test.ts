import { beforeEach, describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { migrate } from './migrations';
import { AgentMemoryStore } from './agent-memory-store';

/**
 * The store's contract (S9 PR1). NOTE: like every persistence suite here, this needs the
 * better-sqlite3 addon built for the running ABI — it runs under `pnpm test:electron`, not `pnpm test`.
 */

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
});

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('domain memory', () => {
  it('stores and reads a hint back for its host', () => {
    AgentMemoryStore.putHint(db, {
      id: uuid(1),
      host: 'shop.test',
      note: 'the part number is behind the Technical details drawer',
      provenance: 'run',
    });
    const hints = AgentMemoryStore.hintsForHost(db, 'shop.test');
    expect(hints).toHaveLength(1);
    expect(hints[0]?.note).toContain('Technical details');
  });

  it('never returns another host’s hints', () => {
    AgentMemoryStore.putHint(db, { id: uuid(2), host: 'a.test', note: 'note', provenance: 'run' });
    expect(AgentMemoryStore.hintsForHost(db, 'b.test')).toEqual([]);
  });

  it('carries sync-meta on every row, so Phase-3 owes no migration', () => {
    AgentMemoryStore.putHint(db, { id: uuid(3), host: 'shop.test', note: 'note', provenance: 'run' });
    const hint = AgentMemoryStore.hintsForHost(db, 'shop.test')[0];
    expect(hint?.deviceId.length).toBeGreaterThan(0);
    expect(hint?.version).toBe(1);
    expect(hint?.tombstone).toBe(false);
    expect(hint?.updatedAt).toBeGreaterThan(0);
  });

  it('bumps the version on update, so a sync can order two edits', () => {
    AgentMemoryStore.putHint(db, { id: uuid(4), host: 'shop.test', note: 'first', provenance: 'run' });
    AgentMemoryStore.putHint(db, { id: uuid(4), host: 'shop.test', note: 'second', provenance: 'run' });
    const hint = AgentMemoryStore.hintsForHost(db, 'shop.test')[0];
    expect(hint?.note).toBe('second');
    expect(hint?.version).toBe(2);
  });

  it('QUARANTINE keeps the row — the evidence of a planted hint must survive', () => {
    AgentMemoryStore.putHint(db, { id: uuid(5), host: 'shop.test', note: 'planted', provenance: 'page' });
    AgentMemoryStore.quarantine(db, uuid(5));
    const hints = AgentMemoryStore.hintsForHost(db, 'shop.test');
    // Still present, and flagged: deleting it would erase the attack along with the attack.
    expect(hints).toHaveLength(1);
    expect(hints[0]?.quarantined).toBe(true);
  });

  it('forget is a SOFT delete — a hard delete is indistinguishable from an unsynced row', () => {
    AgentMemoryStore.putHint(db, { id: uuid(6), host: 'shop.test', note: 'note', provenance: 'run' });
    AgentMemoryStore.forget(db, uuid(6));
    expect(AgentMemoryStore.hintsForHost(db, 'shop.test')).toEqual([]);
    const raw = db.prepare('SELECT tombstone FROM agent_domain_memory WHERE id = ?').get(uuid(6));
    expect((raw as { tombstone: number }).tombstone).toBe(1);
  });

  it('round-trips a durable descriptor, never a positional ref', () => {
    AgentMemoryStore.putHint(db, {
      id: uuid(7),
      host: 'shop.test',
      note: 'open the drawer',
      descriptor: { tag: 'button', role: 'button', name: 'Technical details' },
      provenance: 'run',
    });
    expect(AgentMemoryStore.hintsForHost(db, 'shop.test')[0]?.descriptor?.name).toBe('Technical details');
  });

  it('DROPS a row that fails validation instead of trusting its own database', () => {
    // A row from an older build, or one left by a poisoning attempt, is untrusted input like page text.
    db.prepare(
      `INSERT INTO agent_domain_memory
         (id, host, note, descriptor_json, provenance, quarantined, device_id, updated_at, version, tombstone)
       VALUES ('not-a-uuid', 'shop.test', 'x', NULL, 'run', 0, 'dev', 1, 1, 0)`,
    ).run();
    expect(AgentMemoryStore.hintsForHost(db, 'shop.test')).toEqual([]);
  });
});

describe('skills', () => {
  it('stores and lists a skill template', () => {
    AgentMemoryStore.putSkill(db, {
      id: uuid(10),
      name: 'Weekly invoice check',
      prompt: 'Open the invoices page and tell me which are unpaid.',
      startUrl: 'https://billing.test/invoices',
    });
    const skills = AgentMemoryStore.listSkills(db);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.startUrl).toBe('https://billing.test/invoices');
  });

  it('carries sync-meta', () => {
    AgentMemoryStore.putSkill(db, { id: uuid(11), name: 'n', prompt: 'p' });
    expect(AgentMemoryStore.listSkills(db)[0]?.deviceId.length).toBeGreaterThan(0);
  });

  it('forgets a skill softly, so a sync can still see the deletion', () => {
    AgentMemoryStore.putSkill(db, { id: uuid(12), name: 'n', prompt: 'p' });
    AgentMemoryStore.forgetSkill(db, uuid(12));
    expect(AgentMemoryStore.listSkills(db)).toEqual([]);
    const raw = db.prepare('SELECT tombstone FROM agent_skills WHERE id = ?').get(uuid(12));
    expect((raw as { tombstone: number }).tombstone).toBe(1);
  });
});

describe('remembered grants', () => {
  const hour = 60 * 60 * 1000;

  it('returns a live grant', () => {
    AgentMemoryStore.putGrant(db, {
      id: uuid(20),
      scope: 'weekly-invoice-check',
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() + hour,
    });
    expect(AgentMemoryStore.liveGrants(db, 'weekly-invoice-check', 'billing.test')).toHaveLength(1);
  });

  it('never returns an EXPIRED grant, even before anything sweeps it', () => {
    // A grant that outlives its window by however long the cleanup took is silent autonomy creep.
    AgentMemoryStore.putGrant(db, {
      id: uuid(21),
      scope: 's',
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() - 1,
    });
    expect(AgentMemoryStore.liveGrants(db, 's', 'billing.test')).toEqual([]);
  });

  it('never returns a revoked grant', () => {
    AgentMemoryStore.putGrant(db, {
      id: uuid(22),
      scope: 's',
      host: 'billing.test',
      tier: 'read',
      expiresAt: Date.now() + hour,
    });
    AgentMemoryStore.revokeGrant(db, uuid(22));
    expect(AgentMemoryStore.liveGrants(db, 's', 'billing.test')).toEqual([]);
  });

  it('is scoped to a task AND a host — a grant is never global', () => {
    AgentMemoryStore.putGrant(db, {
      id: uuid(23),
      scope: 's',
      host: 'billing.test',
      tier: 'read',
      expiresAt: Date.now() + hour,
    });
    expect(AgentMemoryStore.liveGrants(db, 's', 'other.test')).toEqual([]);
    expect(AgentMemoryStore.liveGrants(db, 'other-task', 'billing.test')).toEqual([]);
  });

  it('revokes EVERY grant a scope holds — deleting a skill takes its permissions with it', () => {
    // A skill is the only scope that can mint a remembered grant, so if the skill goes and the grants
    // stay, the user is left with permissions they have no surface to revoke.
    for (const [n, host] of [[25, "billing.test"], [26, "shop.test"]] as const) {
      AgentMemoryStore.putGrant(db, { id: uuid(n), scope: 'skill-1', host, tier: 'ui-write', expiresAt: Date.now() + hour });
    }
    AgentMemoryStore.revokeGrantsForScope(db, 'skill-1');
    expect(AgentMemoryStore.liveGrants(db, 'skill-1', 'billing.test')).toEqual([]);
    expect(AgentMemoryStore.liveGrants(db, 'skill-1', 'shop.test')).toEqual([]);
  });

  it('REFUSES a credential-tier grant at the schema level — those are only ever asked', () => {
    expect(() =>
      AgentMemoryStore.putGrant(db, {
        id: uuid(24),
        scope: 's',
        host: 'billing.test',
        tier: 'credential',
        expiresAt: Date.now() + hour,
      }),
    ).toThrow();
  });
});
