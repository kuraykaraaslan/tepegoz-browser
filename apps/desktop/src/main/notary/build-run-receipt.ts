import type { EventRecord } from '@tepegoz/shared-types';
import {
  buildReceipt,
  verifyChain,
  type ChainableEvent,
  type ChainedEvent,
  type ReplayReceipt,
  type SigningKeyPair,
} from '@tepegoz/notary';

/**
 * Build a signed Replay Receipt for ONE run, from its own already-chained Journal events (Phase 7
 * NotaryService DoD: "Replay Receipt is emitted for a completed task ... PASS; a tampered event →
 * FAIL/TAMPERED"). This is the first caller that actually produces a receipt from real data — every
 * other exercise of `buildReceipt` so far is a unit test handing it fixtures directly.
 *
 * Two passes over the same events, for two different reasons:
 *
 * 1. **Integrity, against what was actually recorded.** Re-verifies the STORED `prevHash`/`selfHash` on
 *    each row (chained from the first event's own recorded `prevHash` — the device's real tail when this
 *    run began, not `GENESIS_HASH`). This is the entire reason those columns exist: if a row was edited
 *    directly in the database after `appendChainedEvent` wrote it, this catches it. Skipping this check
 *    and only doing the rebuild below would silently launder a tampered row — a fresh re-hash of
 *    WHATEVER the payload currently says will always look internally consistent.
 * 2. **The portable receipt itself.** Re-chains the same events from the well-known `GENESIS_HASH`
 *    (`buildReceipt`'s default), never from the device's real tail — a standalone verifier has nothing
 *    to check an arbitrary claimed tail against, so the receipt's own embedded chain must be
 *    self-contained (see `replay-receipt.ts`'s module doc: "never the user's entire history").
 *
 * Refuses rather than fabricating a receipt when: there are no events for this run, any of them were
 * never chained at all (journaled before `appendChainedEvent` existed), or the integrity pass finds a
 * break.
 */

export type RunReceiptResult =
  | { ok: true; receipt: ReplayReceipt }
  | { ok: false; reason: 'no_events' | 'not_chained' | 'chain_broken' };

export function buildRunReceipt(
  runId: string,
  deviceId: string,
  events: readonly EventRecord[],
  keyPair: SigningKeyPair,
): RunReceiptResult {
  const ordered = events
    .filter((e) => e.correlationId === runId)
    .slice()
    .sort((a, b) => a.lsn - b.lsn);
  if (ordered.length === 0) return { ok: false, reason: 'no_events' };

  if (!ordered.every((e) => e.prevHash !== undefined && e.selfHash !== undefined)) {
    return { ok: false, reason: 'not_chained' };
  }

  const storedChain: ChainedEvent[] = ordered.map((e) => ({
    id: e.id,
    type: e.type,
    ts: e.ts,
    actor: e.actor,
    correlationId: e.correlationId,
    payload: e.payload,
    blobRef: e.blobRef,
    redacted: e.redacted,
    prevHash: e.prevHash!,
    selfHash: e.selfHash!,
  }));
  const integrity = verifyChain(storedChain, storedChain[0]!.prevHash);
  if (!integrity.valid) return { ok: false, reason: 'chain_broken' };

  const chainable: ChainableEvent[] = ordered.map((e) => ({
    id: e.id,
    type: e.type,
    ts: e.ts,
    actor: e.actor,
    correlationId: e.correlationId,
    payload: e.payload,
    blobRef: e.blobRef,
    redacted: e.redacted,
  }));
  const receipt = buildReceipt(runId, deviceId, chainable, keyPair);
  if (receipt === null) return { ok: false, reason: 'no_events' };
  return { ok: true, receipt };
}
