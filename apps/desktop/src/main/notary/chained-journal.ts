import { EventJournal, type Db } from '@tepegoz/persistence';
import { GENESIS_HASH, selfHashOf } from '@tepegoz/notary';
import type { EventInput, EventRecord } from '@tepegoz/shared-types';

/**
 * Append ONE journal event chained onto this device's current hash tail (Phase 7 NotaryService — the
 * piece `EventJournal.append` deliberately does not do itself; see that method's doc and migration v26's
 * note in `@tepegoz/persistence`). `@tepegoz/persistence` must not depend on `@tepegoz/notary`
 * (dependency-cruiser layering), so the fold happens here, in `apps/desktop`, which already depends on
 * both.
 *
 * Synchronous end to end — `tailHash` read, `selfHashOf` computed, `append` written, no `await` in
 * between — which is what keeps this correct without a lock: Node is single-threaded, so nothing can
 * interleave another append between the read and the write within one call.
 *
 * Scope note: only call sites that opt into this (currently the agent-run journaling path) produce
 * chained rows. `EventJournal.tailHash` already reads "the most recent HASHED row", so an interleaved
 * unchained append from a different domain (downloads, chat, tasks, …) is simply skipped over rather than
 * breaking the chain — but it does mean the chain is a subsequence of the journal, not the whole of it,
 * until every append call site is migrated onto this function.
 */
export function appendChainedEvent(
  db: Db,
  input: Omit<EventInput, 'prevHash' | 'selfHash'>,
): EventRecord {
  const prevHash = EventJournal.tailHash(db) ?? GENESIS_HASH;
  const selfHash = selfHashOf(
    {
      id: input.id,
      type: input.type,
      ts: input.ts,
      actor: input.actor,
      correlationId: input.correlationId,
      payload: input.payload,
      blobRef: input.blobRef,
      redacted: input.redacted,
    },
    prevHash,
  );
  return EventJournal.append(db, { ...input, prevHash, selfHash });
}
