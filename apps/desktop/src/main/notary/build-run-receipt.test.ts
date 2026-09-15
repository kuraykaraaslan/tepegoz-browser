import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair, GENESIS_HASH, selfHashOf, verifyReceipt } from '@tepegoz/notary';
import type { EventRecord } from '@tepegoz/shared-types';
import { buildRunReceipt } from './build-run-receipt';

/**
 * `buildRunReceipt` — the first caller that turns real (chained) Journal rows into a signed Replay
 * Receipt. Deliberately uses the REAL `@tepegoz/notary` (not mocked) so this test is the DoD's own
 * acceptance language made concrete: "PASS; a tampered event → FAIL/TAMPERED" — including the case that
 * matters most and is easy to get wrong: a row edited directly in the database AFTER it was chained.
 */

const keys = generateSigningKeyPair();

// `payload` is re-required (zod's `z.unknown()` infers it as optional — the same quirk
// receipt-schema.ts's parseReceipt doc explains) so a fixture always carries one, matching ChainableEvent.
type Unchained = Omit<EventRecord, 'prevHash' | 'selfHash' | 'payload'> & { payload: unknown };

function baseEvent(over: Partial<Unchained> = {}): Unchained {
  return {
    lsn: 1,
    id: '00000000-0000-4000-8000-000000000001',
    type: 'AgentStepExecuted',
    ts: 1000,
    actor: 'agent',
    correlationId: 'run-1',
    payload: { step: 1 },
    redacted: true,
    deviceId: 'device-1',
    ...over,
  };
}

/** Chain a sequence the way `appendChainedEvent` would — real prevHash/selfHash, not placeholders. */
function chainSequence(events: Unchained[], genesis: string): EventRecord[] {
  let prevHash = genesis;
  return events.map((e) => {
    const selfHash = selfHashOf(e, prevHash);
    const chained: EventRecord = { ...e, prevHash, selfHash };
    prevHash = selfHash;
    return chained;
  });
}

describe('buildRunReceipt', () => {
  it('refuses (no_events) when nothing in the given slice belongs to this run', () => {
    const events = chainSequence([baseEvent({ correlationId: 'run-2' })], GENESIS_HASH);
    expect(buildRunReceipt('run-1', 'device-1', events, keys)).toEqual({
      ok: false,
      reason: 'no_events',
    });
  });

  it('refuses (not_chained) when the run has events but none were ever chained', () => {
    const events: EventRecord[] = [baseEvent()];
    expect(buildRunReceipt('run-1', 'device-1', events, keys)).toEqual({
      ok: false,
      reason: 'not_chained',
    });
  });

  it('refuses (not_chained) when SOME but not all of the run’s events were chained', () => {
    const [chained] = chainSequence([baseEvent({ lsn: 1 })], GENESIS_HASH);
    const events: EventRecord[] = [chained!, baseEvent({ lsn: 2, id: 'e2' })];
    expect(buildRunReceipt('run-1', 'device-1', events, keys)).toEqual({
      ok: false,
      reason: 'not_chained',
    });
  });

  it('refuses (chain_broken) when a stored row was edited after it was chained (a raw DB tamper)', () => {
    const events = chainSequence(
      [baseEvent({ lsn: 1, id: 'e1', ts: 1000 }), baseEvent({ lsn: 2, id: 'e2', ts: 2000 })],
      GENESIS_HASH,
    );
    // Simulate an edit made directly in the database: the payload changed, but self_hash was NOT
    // recomputed — exactly what appendChainedEvent's own write path could never produce, and exactly
    // what this integrity pass exists to catch.
    const tampered = events.map((e, i) => (i === 1 ? { ...e, payload: { step: 999 } } : e));
    expect(buildRunReceipt('run-1', 'device-1', tampered, keys)).toEqual({
      ok: false,
      reason: 'chain_broken',
    });
  });

  it('PASSes standalone verification even for a run that began mid-device-history', () => {
    // This run's local genesis (its first event's prevHash) is NOT GENESIS_HASH — same as a real run
    // that started after other events were already chained on this device.
    const deviceTailBeforeThisRun = 'c'.repeat(64);
    const events = chainSequence(
      [baseEvent({ lsn: 1, id: 'e1', ts: 1000 }), baseEvent({ lsn: 2, id: 'e2', ts: 2000 })],
      deviceTailBeforeThisRun,
    );
    const result = buildRunReceipt('run-1', 'device-1', events, keys);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.correlationId).toBe('run-1');
    expect(result.receipt.deviceId).toBe('device-1');
    // The PORTABLE receipt re-chains from GENESIS_HASH, not from deviceTailBeforeThisRun — a standalone
    // verifier has no way to confirm an arbitrary claimed tail, so the receipt must be self-contained.
    expect(result.receipt.events[0]!.prevHash).toBe(GENESIS_HASH);
    expect(verifyReceipt(result.receipt)).toEqual({ status: 'PASS' });
  });

  it('produces a TAMPERED verdict when an event in the ALREADY-BUILT receipt is edited afterward', () => {
    const events = chainSequence([baseEvent({ lsn: 1 })], GENESIS_HASH);
    const result = buildRunReceipt('run-1', 'device-1', events, keys);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tampered = {
      ...result.receipt,
      events: [{ ...result.receipt.events[0]!, payload: { step: 999 } }],
    };
    expect(verifyReceipt(tampered).status).toBe('TAMPERED');
  });

  it('orders by lsn regardless of the order events were handed in', () => {
    const [first, second] = chainSequence(
      [baseEvent({ lsn: 1, id: 'first', ts: 1000 }), baseEvent({ lsn: 2, id: 'second', ts: 2000 })],
      GENESIS_HASH,
    );
    const result = buildRunReceipt('run-1', 'device-1', [second!, first!], keys);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.events.map((e) => e.id)).toEqual(['first', 'second']);
  });
});
