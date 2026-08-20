import { describe, expect, it } from 'vitest';
import type { Mandate, MandateConsumptionRequest } from '@tepegoz/shared-types';
import { consumeMandate, mandateCovers, type MandateConsumptionRecord } from './mandate-kernel';

const NOW = 1_000_000;

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  id: 'm1',
  maxAmount: 500,
  currency: 'TRY',
  allowedDomains: ['shop.test'],
  expiresAt: NOW + 10_000,
  usage: 'single_use',
  ...over,
});

const req = (over: Partial<MandateConsumptionRequest> = {}): MandateConsumptionRequest => ({
  idempotencyKey: 'tx-1',
  amount: 100,
  currency: 'TRY',
  targetUrl: 'https://checkout.shop.test/pay',
  ...over,
});

describe('mandateCovers — pre-model, deny by default', () => {
  it('covers a request inside every bound', () => {
    expect(mandateCovers(mandate(), req(), { now: NOW })).toEqual({ covered: true, requiresHitl: false });
  });

  it('denies an EXPIRED mandate', () => {
    const v = mandateCovers(mandate({ expiresAt: NOW - 1 }), req(), { now: NOW });
    expect(v).toEqual({ covered: false, reason: 'expired' });
  });

  it('denies a REVOKED mandate, even if otherwise valid', () => {
    const v = mandateCovers(mandate(), req(), { now: NOW, revoked: true });
    expect(v).toEqual({ covered: false, reason: 'revoked' });
  });

  it('denies a CURRENCY mismatch', () => {
    const v = mandateCovers(mandate({ currency: 'USD' }), req({ currency: 'TRY' }), { now: NOW });
    expect(v).toEqual({ covered: false, reason: 'currency_mismatch' });
  });

  it('denies a domain OUTSIDE the mandate — matched on registrable domain', () => {
    const v = mandateCovers(mandate(), req({ targetUrl: 'https://evil.test/pay' }), { now: NOW });
    expect(v).toEqual({ covered: false, reason: 'domain_not_allowed' });
  });

  it('covers a SUBDOMAIN of an allowed domain — checkout.shop.test under shop.test', () => {
    const v = mandateCovers(mandate(), req({ targetUrl: 'https://checkout.shop.test/pay' }), { now: NOW });
    expect(v.covered).toBe(true);
  });

  it('denies an amount ABOVE the mandate ceiling', () => {
    const v = mandateCovers(mandate({ maxAmount: 50 }), req({ amount: 100 }), { now: NOW });
    expect(v).toEqual({ covered: false, reason: 'amount_exceeds_mandate' });
  });

  it('denies an unresolvable target URL rather than guessing a domain', () => {
    const v = mandateCovers(mandate(), req({ targetUrl: 'not a url' }), { now: NOW });
    expect(v).toEqual({ covered: false, reason: 'unresolvable_domain' });
  });

  it('requires HITL when the amount crosses the mandate’s OWN lower threshold', () => {
    const v = mandateCovers(mandate({ hitlThreshold: 50 }), req({ amount: 100 }), { now: NOW });
    expect(v).toEqual({ covered: true, requiresHitl: true });
  });

  it('does not require the extra HITL below the threshold', () => {
    const v = mandateCovers(mandate({ hitlThreshold: 200 }), req({ amount: 100 }), { now: NOW });
    expect(v).toEqual({ covered: true, requiresHitl: false });
  });

  it('reports the expiry/revocation reason FIRST, even when amount would also have failed', () => {
    // The fact an auditor needs first is the true cause, not a coincidentally-also-true narrower one.
    const v = mandateCovers(mandate({ expiresAt: NOW - 1, maxAmount: 1 }), req({ amount: 999 }), {
      now: NOW,
    });
    expect(v).toEqual({ covered: false, reason: 'expired' });
  });
});

describe('consumeMandate — replay-safe, never double-charges', () => {
  const history = (...records: MandateConsumptionRecord[]) => records;

  it('consumes a fresh, covered request', () => {
    const v = consumeMandate(mandate(), history(), req(), { now: NOW });
    expect(v).toEqual({ consumed: true, replay: false });
  });

  it('a RETRY with the same idempotencyKey replays the same success — never a second charge', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const v = consumeMandate(mandate(), prior, req({ idempotencyKey: 'tx-1' }), { now: NOW });
    expect(v).toEqual({ consumed: true, replay: true });
  });

  it('the replay succeeds even if the mandate has since EXPIRED — the original transaction already happened', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const expired = mandate({ expiresAt: NOW - 1 });
    const v = consumeMandate(expired, prior, req({ idempotencyKey: 'tx-1' }), { now: NOW });
    expect(v).toEqual({ consumed: true, replay: true });
  });

  it('the replay succeeds even if the mandate has since been REVOKED', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const v = consumeMandate(mandate(), prior, req({ idempotencyKey: 'tx-1' }), {
      now: NOW,
      revoked: true,
    });
    expect(v).toEqual({ consumed: true, replay: true });
  });

  it('a DIFFERENT idempotencyKey is a genuinely new attempt, not a replay', () => {
    // Recurring, specifically to isolate this property from single-use exhaustion (covered on its own
    // below) — this test is only about key matching, not about how many times the mandate may be used.
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const v = consumeMandate(mandate({ usage: 'recurring' }), prior, req({ idempotencyKey: 'tx-2' }), {
      now: NOW,
    });
    expect(v).toEqual({ consumed: true, replay: false });
  });

  it('a SECOND distinct consumption of a single_use mandate is refused', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const v = consumeMandate(mandate({ usage: 'single_use' }), prior, req({ idempotencyKey: 'tx-2' }), {
      now: NOW,
    });
    expect(v).toEqual({ consumed: false, reason: 'single_use_exhausted' });
  });

  it('a RECURRING mandate allows a second distinct consumption', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'm1' });
    const v = consumeMandate(mandate({ usage: 'recurring' }), prior, req({ idempotencyKey: 'tx-2' }), {
      now: NOW,
    });
    expect(v).toEqual({ consumed: true, replay: false });
  });

  it('does not confuse a consumption on a DIFFERENT mandate for a prior consumption of this one', () => {
    const prior = history({ idempotencyKey: 'tx-1', mandateId: 'some-other-mandate' });
    const v = consumeMandate(mandate({ usage: 'single_use' }), prior, req({ idempotencyKey: 'tx-1' }), {
      now: NOW,
    });
    // Same idempotencyKey, but a DIFFERENT mandate — this must be treated as fresh, not as a replay.
    expect(v).toEqual({ consumed: true, replay: false });
  });

  it('refuses an out-of-mandate request exactly like mandateCovers would', () => {
    const v = consumeMandate(mandate({ maxAmount: 10 }), history(), req({ amount: 100 }), { now: NOW });
    expect(v).toEqual({ consumed: false, reason: 'amount_exceeds_mandate' });
  });
});
