import { describe, it, expect } from 'vitest';
import type { RiskLevel } from '@tepegoz/shared-types';
import PolicyKernel, { type PolicyContext } from './policy-kernel';

function evaluate(
  dangerClass: RiskLevel,
  opts: { taintedArgs?: boolean; targetUrl?: string } = {},
) {
  const ctx: PolicyContext = {
    descriptor: { id: 'tab_get_item', dangerClass },
    taintedArgs: opts.taintedArgs ?? false,
  };
  if (opts.targetUrl !== undefined) ctx.targetUrl = opts.targetUrl;
  return PolicyKernel.evaluate(ctx);
}

describe('PolicyKernel.evaluate — base danger class', () => {
  it('allows reads', () => {
    expect(evaluate('read')).toEqual({ decision: 'allow', reason: 'read_allowed', biometric: false });
  });
  it('asks before state-changing actions', () => {
    expect(evaluate('state_changing')).toEqual({
      decision: 'ask',
      reason: 'state_change_confirm',
      biometric: false,
    });
  });
  it('asks + requires biometric for destructive and financial actions', () => {
    expect(evaluate('destructive')).toEqual({
      decision: 'ask',
      reason: 'destructive_confirm',
      biometric: true,
    });
    expect(evaluate('financial')).toEqual({
      decision: 'ask',
      reason: 'financial_confirm',
      biometric: true,
    });
  });
});

describe('PolicyKernel.evaluate — taint', () => {
  it('forces HITL when web-tainted args drive a side-effecting call', () => {
    expect(evaluate('state_changing', { taintedArgs: true })).toEqual({
      decision: 'ask',
      reason: 'tainted_side_effect',
      biometric: false,
    });
    expect(evaluate('destructive', { taintedArgs: true })).toEqual({
      decision: 'ask',
      reason: 'tainted_side_effect',
      biometric: true,
    });
  });
  it('does not penalize reads for taint', () => {
    expect(evaluate('read', { taintedArgs: true }).decision).toBe('allow');
  });
});

describe('PolicyKernel.evaluate — sensitive-site lockout', () => {
  it('denies side-effecting actions on a sensitive site (lockout overrides)', () => {
    expect(evaluate('state_changing', { targetUrl: 'https://mybank.com/transfer' })).toEqual({
      decision: 'deny',
      reason: 'sensitive_site_lockout',
      biometric: false,
    });
    expect(evaluate('destructive', { targetUrl: 'https://coinbase.com' }).decision).toBe('deny');
  });
  it('asks (not allow) for reads on a sensitive site', () => {
    expect(evaluate('read', { targetUrl: 'https://mybank.com' })).toEqual({
      decision: 'ask',
      reason: 'sensitive_site_read',
      biometric: false,
    });
  });
  it('treats a non-sensitive site normally', () => {
    expect(evaluate('state_changing', { targetUrl: 'https://example.com' }).reason).toBe(
      'state_change_confirm',
    );
  });
});
