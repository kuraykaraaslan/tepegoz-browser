import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair } from './checkpoint';
import { buildReceipt, verifyReceipt, type ReplayReceipt } from './replay-receipt';
import type { ChainableEvent } from './hash-chain';

const keys = generateSigningKeyPair();

const ev = (over: Partial<ChainableEvent> = {}): ChainableEvent => ({
  id: '00000000-0000-4000-8000-000000000001',
  type: 'ToolInvoked',
  ts: 1000,
  actor: 'agent',
  correlationId: 'run-1',
  payload: { tool: 'browser_get_page' },
  redacted: true,
  ...over,
});

const events = [
  ev({ id: 'a', ts: 1 }),
  ev({ id: 'b', ts: 2, type: 'HitlRequested' }),
  ev({ id: 'c', ts: 3, type: 'TaskSucceeded' }),
];

describe('building a receipt', () => {
  it('returns null for an empty event list — there is nothing to attest to', () => {
    expect(buildReceipt('run-1', 'device-1', [], keys)).toBeNull();
  });

  it('produces a receipt that verifies as PASS', () => {
    const receipt = buildReceipt('run-1', 'device-1', events, keys);
    expect(receipt).not.toBeNull();
    expect(verifyReceipt(receipt!)).toEqual({ status: 'PASS' });
  });
});

describe('verifying a receipt — the standalone-CLI contract: nothing but the document itself', () => {
  const receipt = buildReceipt('run-1', 'device-1', events, keys)!;

  it('PASSes an untouched receipt', () => {
    expect(verifyReceipt(receipt)).toEqual({ status: 'PASS' });
  });

  it('is TAMPERED when an event payload is edited after the fact', () => {
    const tampered: ReplayReceipt = {
      ...receipt,
      events: receipt.events.map((e, i) => (i === 1 ? { ...e, payload: { forged: true } } : e)),
    };
    const verdict = verifyReceipt(tampered);
    expect(verdict.status).toBe('TAMPERED');
  });

  it('is TAMPERED when an event is silently removed from the middle', () => {
    const tampered: ReplayReceipt = {
      ...receipt,
      events: receipt.events.filter((_e, i) => i !== 1),
    };
    expect(verifyReceipt(tampered).status).toBe('TAMPERED');
  });

  it('is TAMPERED when the checkpoint is copied from a DIFFERENT run', () => {
    const other = buildReceipt(
      'run-2',
      'device-1',
      [ev({ id: 'x', correlationId: 'run-2' })],
      keys,
    )!;
    const swapped: ReplayReceipt = { ...receipt, checkpoint: other.checkpoint };
    const verdict = verifyReceipt(swapped);
    expect(verdict.status).toBe('TAMPERED');
    if (verdict.status === 'TAMPERED') expect(verdict.reason).toContain('does not attest');
  });

  it('is TAMPERED when an event from a DIFFERENT correlationId is smuggled in', () => {
    const smuggled: ReplayReceipt = {
      ...receipt,
      events: [...receipt.events, { ...receipt.events[0]!, id: 'z', correlationId: 'not-run-1' }],
    };
    expect(verifyReceipt(smuggled).status).toBe('TAMPERED');
  });

  it('is TAMPERED, not PASS-with-a-warning, when the checkpoint signature itself is forged', () => {
    // A receipt is a binary claim. There is no partial credit for "the chain looks fine but I cannot
    // trust the signature" — that is exactly the case the whole feature exists to catch.
    const impostorKeys = generateSigningKeyPair();
    const forged: ReplayReceipt = {
      ...receipt,
      checkpoint: { ...receipt.checkpoint, publicKeyPem: impostorKeys.publicKeyPem },
    };
    expect(verifyReceipt(forged).status).toBe('TAMPERED');
  });

  it('is INVALID (not TAMPERED) for an unsupported version — a usage error, not evidence of tampering', () => {
    const wrongVersion = { ...receipt, version: 2 as unknown as 1 };
    expect(verifyReceipt(wrongVersion).status).toBe('INVALID');
  });

  it('is INVALID for a receipt with no events', () => {
    expect(verifyReceipt({ ...receipt, events: [] }).status).toBe('INVALID');
  });
});
