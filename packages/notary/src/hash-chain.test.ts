import { describe, expect, it } from 'vitest';
import {
  GENESIS_HASH,
  chainEvents,
  chainRoot,
  selfHashOf,
  verifyChain,
  type ChainableEvent,
} from './hash-chain';

const event = (over: Partial<ChainableEvent> = {}): ChainableEvent => ({
  id: '00000000-0000-4000-8000-000000000001',
  type: 'ToolInvoked',
  ts: 1_000,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { tool: 'browser_get_page' },
  redacted: true,
  ...over,
});

describe('chaining events', () => {
  it('chains from GENESIS_HASH by default', () => {
    const [chained] = chainEvents([event()]);
    expect(chained?.prevHash).toBe(GENESIS_HASH);
  });

  it('links each event to the PREVIOUS event’s hash', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' })]);
    expect(chained[1]?.prevHash).toBe(chained[0]?.selfHash);
  });

  it('is deterministic — the same events chain to the same hashes every time', () => {
    const events = [event({ id: 'a' }), event({ id: 'b' })];
    expect(chainEvents(events)).toEqual(chainEvents(events));
  });

  it('produces a DIFFERENT hash for a payload with different content', () => {
    const a = selfHashOf(event({ payload: { x: 1 } }), GENESIS_HASH);
    const b = selfHashOf(event({ payload: { x: 2 } }), GENESIS_HASH);
    expect(a).not.toBe(b);
  });

  it('trusts the CALLER’S order rather than re-sorting', () => {
    // Re-sorting would let a "helpful" chain function launder a reordering attack by silently accepting
    // a tampered sequence as if it were the original.
    const forward = chainEvents([event({ id: 'a', ts: 1 }), event({ id: 'b', ts: 2 })]);
    const reversed = chainEvents([event({ id: 'b', ts: 2 }), event({ id: 'a', ts: 1 })]);
    expect(forward[0]?.id).toBe('a');
    expect(reversed[0]?.id).toBe('b');
  });
});

describe('verifying a chain', () => {
  it('PASSES an intact chain', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })]);
    expect(verifyChain(chained)).toEqual({ valid: true });
  });

  it('FAILS on an empty chain — there is nothing to attest to', () => {
    expect(verifyChain([]).valid).toBe(false);
  });

  it('catches a TAMPERED PAYLOAD as a hash mismatch at the tampered event', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })]);
    const tampered = chained.map((e, i) =>
      i === 1 ? { ...e, payload: { tool: 'something_else' } } : e,
    );
    const verdict = verifyChain(tampered);
    expect(verdict).toMatchObject({ valid: false, reason: 'hash_mismatch', atIndex: 1 });
  });

  it('catches a DELETED event as a broken link — the events on either side are individually intact', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })]);
    const withoutB = [chained[0], chained[2]].filter((e) => e !== undefined);
    const verdict = verifyChain(withoutB);
    expect(verdict).toMatchObject({ valid: false, reason: 'broken_link', atIndex: 1 });
  });

  it('catches REORDERED events as a broken link', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })]);
    const swapped = [chained[1], chained[0], chained[2]].filter((e) => e !== undefined);
    expect(verifyChain(swapped).valid).toBe(false);
  });

  it('catches a chain that does not actually start from genesis', () => {
    const chained = chainEvents([event()]);
    const forged = [{ ...chained[0]!, prevHash: 'f'.repeat(64) }];
    expect(verifyChain(forged)).toMatchObject({ valid: false, reason: 'broken_genesis', atIndex: 0 });
  });

  it('catches a FORGED selfHash that does not match its own recomputed value', () => {
    // The hash mismatch check is independent of the link check: this event still points at the right
    // predecessor, but claims a self-hash that its own content does not produce.
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' })]);
    const forged = [chained[0]!, { ...chained[1]!, selfHash: 'f'.repeat(64) }];
    expect(verifyChain(forged)).toMatchObject({ valid: false, reason: 'hash_mismatch', atIndex: 1 });
  });
});

describe('the chain root', () => {
  it('is the last event’s selfHash — the one value a checkpoint signs', () => {
    const chained = chainEvents([event({ id: 'a' }), event({ id: 'b' })]);
    expect(chainRoot(chained)).toBe(chained[1]?.selfHash);
  });

  it('is null for an empty chain', () => {
    expect(chainRoot([])).toBeNull();
  });
});
