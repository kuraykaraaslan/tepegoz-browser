import { z } from 'zod';

/**
 * Cross-run agent memory + skills, as stored (S9). The single schema source for both.
 *
 * Everything read back from the database is `safeParse`d, because a row written months ago by an older
 * build — or by a poisoning attempt that predates the write filter — is untrusted input exactly like
 * page text. A store that trusts its own rows is a store an attacker only has to reach once.
 */

/** A durable element descriptor. Never a positional ref: those are invalid by the next snapshot. */
export const MemoryDescriptorSchema = z.object({
  tag: z.string().max(40),
  role: z.string().max(40),
  name: z.string().max(200),
});
export type MemoryDescriptor = z.infer<typeof MemoryDescriptorSchema>;

export const MEMORY_PROVENANCE = ['page', 'run'] as const;
export const MemoryProvenanceSchema = z.enum(MEMORY_PROVENANCE);

export const DomainMemoryRecordSchema = z.object({
  id: z.string().uuid(),
  host: z.string().min(1).max(255),
  note: z.string().max(300),
  descriptor: MemoryDescriptorSchema.optional(),
  provenance: MemoryProvenanceSchema,
  /** A hint whose use once preceded a policy denial. Never offered again; kept for auditability. */
  quarantined: z.boolean(),
  /** Sync-meta (Phase-3 ready from day 0, so no migration is owed later). */
  deviceId: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  tombstone: z.boolean(),
});
export type DomainMemoryRecord = z.infer<typeof DomainMemoryRecordSchema>;

/**
 * A skill: a named, user-triggerable **template** — a prompt, a starting URL, and which grant profile it
 * expects.
 *
 * Explicitly **not** a Phase-6 recipe. The ownership test is *"if the model could be removed from the
 * replay, it's Phase 6"*: a skill still runs the ordinary reactor loop with the model reasoning over a
 * live page, so it is a starting point, not a signed deterministic replay.
 */
export const SkillRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  prompt: z.string().min(1).max(2000),
  startUrl: z.string().max(2048).optional(),
  /** Which S6 grant profile the skill expects. Never a grant itself — the user still approves. */
  grantProfile: z.string().max(80).optional(),
  deviceId: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  tombstone: z.boolean(),
});
export type SkillRecord = z.infer<typeof SkillRecordSchema>;

/**
 * A remembered S6 grant.
 *
 * Two properties keep this from becoming silent autonomy creep: it always has an explicit `expiresAt`,
 * and it can never raise the ceiling above what `follow_a_plan` already allows — it only skips re-asking
 * for something the user has already agreed to, within a window they can see and revoke.
 */
export const RememberedGrantSchema = z.object({
  id: z.string().uuid(),
  /** The task or skill this was granted for — a grant is never global. */
  scope: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  /** The risk tier the grant covers. Never `credential`, `financial`, or `destructive`. */
  tier: z.enum(['read', 'ui-write', 'data-egress']),
  expiresAt: z.number().int().positive(),
  deviceId: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  tombstone: z.boolean(),
});
export type RememberedGrant = z.infer<typeof RememberedGrantSchema>;
