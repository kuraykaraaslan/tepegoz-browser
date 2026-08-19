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

/**
 * Code execution (S5). The class is an axis of its own: it says where the instructions came from, not
 * what the tool does.
 */
describe('PolicyKernel — model-authored code execution', () => {
  const readTool = { id: 'browser_analyze_page', dangerClass: 'read' as const };

  it('DENIES code_exec_write unconditionally — reserved, not merely unimplemented', () => {
    // It exists as a class so that enabling it is a visible change to the kernel with its own ADR and
    // its own adversarial battery, rather than a flag somebody flips.
    const r = PolicyKernel.evaluate({
      descriptor: readTool,
      taintedArgs: false,
      capability: 'code_exec_write',
    });
    expect(r.decision).toBe('deny');
    expect(r.reason).toBe('code_exec_write_disabled');
  });

  it('denies code_exec_write even on a page nothing else objects to', () => {
    const r = PolicyKernel.evaluate({
      descriptor: { id: 'x_get_y', dangerClass: 'read' },
      taintedArgs: false,
      targetUrl: 'https://example.test/',
      capability: 'code_exec_write',
    });
    expect(r.decision).toBe('deny');
  });

  it('allows code_exec_read but marks it JOURNALLED, so the reason itself records the obligation', () => {
    const r = PolicyKernel.evaluate({
      descriptor: readTool,
      taintedArgs: false,
      capability: 'code_exec_read',
    });
    expect(r.decision).toBe('allow');
    expect(r.reason).toBe('code_exec_read_journaled');
  });

  it('does not let code_exec_read walk past the sensitive-site lockout', () => {
    const r = PolicyKernel.evaluate({
      descriptor: readTool,
      taintedArgs: false,
      targetUrl: 'https://www.chase.com/accounts',
      capability: 'code_exec_read',
    });
    expect(r.decision).not.toBe('allow');
  });

  it('leaves an ordinary read exactly as it was', () => {
    expect(PolicyKernel.evaluate({ descriptor: readTool, taintedArgs: false }).reason).toBe(
      'read_allowed',
    );
  });
});
