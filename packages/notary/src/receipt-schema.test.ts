import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair } from './checkpoint';
import { buildReceipt } from './replay-receipt';
import { verifyReceipt } from './replay-receipt';
import { parseReceipt } from './receipt-schema';
import type { ChainableEvent } from './hash-chain';

const keys = generateSigningKeyPair();
const ev = (id: string): ChainableEvent => ({
  id,
  type: 'ToolInvoked',
  ts: 1,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { tool: 'x' },
  redacted: true,
});

describe('parsing untrusted JSON as a receipt', () => {
  it('round-trips a genuine receipt through JSON and still verifies PASS', () => {
    // The whole point: parseReceipt has to hand back the EXACT shape verifyReceipt expects, including
    // the `payload` field zod is otherwise prone to inferring as optional.
    const receipt = buildReceipt('run-1', 'device-1', [ev('a'), ev('b')], keys)!;
    const roundTripped = parseReceipt(JSON.parse(JSON.stringify(receipt)));
    expect(roundTripped).not.toBeNull();
    expect(verifyReceipt(roundTripped!)).toEqual({ status: 'PASS' });
  });

  it('returns null for a value with the wrong shape entirely', () => {
    expect(parseReceipt({ hello: 'world' })).toBeNull();
    expect(parseReceipt(null)).toBeNull();
    expect(parseReceipt('a string')).toBeNull();
    expect(parseReceipt(42)).toBeNull();
  });

  it('returns null when a hash field is not actually a 64-hex hash', () => {
    const receipt = buildReceipt('run-1', 'device-1', [ev('a')], keys)!;
    const corrupted = { ...receipt, events: [{ ...receipt.events[0]!, selfHash: 'not-a-hash' }] };
    expect(parseReceipt(corrupted)).toBeNull();
  });

  it('returns null for an unsupported version rather than coercing it', () => {
    const receipt = buildReceipt('run-1', 'device-1', [ev('a')], keys)!;
    expect(parseReceipt({ ...receipt, version: 2 })).toBeNull();
  });

  it('preserves an optional blobRef when present, and omits it when absent', () => {
    const receipt = buildReceipt('run-1', 'device-1', [ev('a')], keys)!;
    const withBlob = {
      ...receipt,
      events: [{ ...receipt.events[0]!, blobRef: 'cas://' + 'a'.repeat(64) }],
    };
    const parsed = parseReceipt(withBlob);
    expect(parsed?.events[0]?.blobRef).toBe('cas://' + 'a'.repeat(64));
    expect(parseReceipt(receipt)?.events[0]?.blobRef).toBeUndefined();
  });
});
