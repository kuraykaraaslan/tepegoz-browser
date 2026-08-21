import {
  chainEvents,
  chainRoot,
  verifyChain,
  type ChainableEvent,
  type ChainedEvent,
} from './hash-chain';
import {
  signCheckpoint,
  verifyCheckpoint,
  type Checkpoint,
  type SigningKeyPair,
} from './checkpoint';

/**
 * A Replay Receipt (Phase 7 NotaryService) — a portable, self-contained proof of what the agent did on
 * one run.
 *
 * "Self-contained" is the operative word: everything `verifyReceipt` needs is inside the receipt. A
 * verifier holds no tepegöz database, no prior state, and no shared secret — it is handed one JSON
 * document and answers PASS, FAIL, or TAMPERED from that document alone. That is what makes the
 * standalone `tepegoz-verify` CLI possible, and it is the whole point of a receipt: an insurer, an
 * auditor, or a regulator can check a claim about what an agent did without trusting the vendor that
 * produced the claim to also grade it.
 *
 * A receipt is deliberately narrower than the whole Journal. It is the **subtree for one
 * `correlationId`** (one task/run) plus the checkpoint that anchors it — never the user's entire
 * history, which nobody asking "did this refund happen correctly" needs to see.
 */

export interface ReplayReceipt {
  version: 1;
  correlationId: string;
  deviceId: string;
  events: ChainedEvent[];
  checkpoint: Checkpoint;
}

/**
 * Build a receipt for one run's events.
 *
 * `events` must already be the correct slice — every event carrying this `correlationId`, in journal
 * (`lsn`) order — and `genesis` must be the hash the chain actually started from (the device's
 * `GENESIS_HASH`, or the previous checkpoint's root if this run did not start a fresh chain). Getting
 * either wrong produces a receipt that is internally consistent but does not correspond to what the
 * journal actually holds — which `verifyReceipt` cannot detect on its own, because it has nothing else
 * to check the slice against. That correspondence is the caller's responsibility (the main-process
 * NotaryService, reading the real Journal), which is why this function takes plain data rather than a
 * database handle: it stays a pure, fully-tested transform, and the only thing left to get right at the
 * integration point is picking the right slice.
 */
export function buildReceipt(
  correlationId: string,
  deviceId: string,
  events: readonly ChainableEvent[],
  keyPair: SigningKeyPair,
  genesis?: string,
): ReplayReceipt | null {
  if (events.length === 0) return null;
  const chained = chainEvents(events, genesis);
  const root = chainRoot(chained);
  if (root === null) return null;
  return {
    version: 1,
    correlationId,
    deviceId,
    events: chained,
    checkpoint: signCheckpoint(root, keyPair),
  };
}

export type ReceiptVerdict =
  | { status: 'PASS' }
  | { status: 'TAMPERED'; reason: string }
  | { status: 'INVALID'; reason: string };

/**
 * Verify a receipt with NOTHING but the receipt itself.
 *
 * Three checks, and the distinction between them is the whole diagnostic value of the verdict:
 *
 * - **INVALID** — the document is not shaped like a receipt at all (wrong version, empty, malformed
 *   key). This is a USAGE error, not evidence of tampering — the wrong file, an old format, a corrupt
 *   download.
 * - **TAMPERED** — the chain does not verify, or the correlation id does not match its own events. The
 *   document IS a receipt; its content contradicts itself. This is the case the whole feature exists to
 *   catch.
 * - **PASS** — chain intact AND checkpoint signature valid over that exact chain root.
 *
 * A checkpoint that verifies over the WRONG root (edited after signing, or copied from a different run)
 * is TAMPERED, not PASS with a warning — a receipt is a binary claim, not a claim with footnotes.
 */
export function verifyReceipt(receipt: ReplayReceipt): ReceiptVerdict {
  if (receipt.version !== 1) return { status: 'INVALID', reason: 'unsupported receipt version' };
  if (receipt.events.length === 0)
    return { status: 'INVALID', reason: 'receipt carries no events' };
  if (receipt.events.some((e) => e.correlationId !== receipt.correlationId)) {
    return { status: 'TAMPERED', reason: 'an event does not belong to this receipt’s run' };
  }

  const chainVerdict = verifyChain(receipt.events);
  if (!chainVerdict.valid) {
    return {
      status: 'TAMPERED',
      reason: `hash chain broken at event ${String(chainVerdict.atIndex)} (${chainVerdict.reason})`,
    };
  }

  const root = chainRoot(receipt.events);
  if (root !== receipt.checkpoint.chainRoot) {
    // The chain is internally intact, but the checkpoint was signed over a DIFFERENT root than the one
    // these events actually produce — a checkpoint copied from another run, or a root edited after
    // signing without re-signing.
    return {
      status: 'TAMPERED',
      reason: 'checkpoint does not attest to this receipt’s chain root',
    };
  }

  const sigVerdict = verifyCheckpoint(receipt.checkpoint);
  if (!sigVerdict.valid) {
    return { status: 'TAMPERED', reason: `checkpoint signature invalid (${sigVerdict.reason})` };
  }

  return { status: 'PASS' };
}
