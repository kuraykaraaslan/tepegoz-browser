import { describe, expect, it } from 'vitest';
import type { AgentAutonomy } from '@tepegoz/shared-types';
import { AGENT_AUTONOMY_LEVELS } from '@tepegoz/shared-types';
import { resolveAutonomy } from './autonomy-gate';
import PolicyKernel from './policy-kernel';

const ask = (biometric: boolean) => ({ decision: 'ask' as const, biometric });

describe('resolveAutonomy — autonomy can only skip a prompt, never widen permission', () => {
  it('never auto-approves a denial, at any level', () => {
    for (const level of AGENT_AUTONOMY_LEVELS) {
      const r = resolveAutonomy({ decision: 'deny', biometric: false }, level);
      expect(r.decision, `level=${level}`).toBe('prompt');
    }
  });

  it('holds biometric actions for a human under `act` — the level that auto-approves routine work', () => {
    expect(resolveAutonomy(ask(true), 'act').decision).toBe('prompt');
    expect(resolveAutonomy(ask(false), 'act').decision).toBe('auto_approve');
  });

  it('`ask` prompts for everything the kernel asked about', () => {
    expect(resolveAutonomy(ask(false), 'ask').decision).toBe('prompt');
    expect(resolveAutonomy(ask(true), 'ask').decision).toBe('prompt');
  });

  it('`auto` is the only level that skips a biometric prompt', () => {
    expect(resolveAutonomy(ask(true), 'auto').decision).toBe('auto_approve');
    expect(resolveAutonomy(ask(false), 'auto').decision).toBe('auto_approve');
  });

  it('treats the reserved `dangerous` level as `ask`, not as an escalation', () => {
    expect(resolveAutonomy(ask(false), 'dangerous').decision).toBe('prompt');
    expect(resolveAutonomy(ask(true), 'dangerous').decision).toBe('prompt');
  });

  it('fails safe to prompt on an unrecognised level (stale or tampered preference)', () => {
    const bogus = 'yolo' as AgentAutonomy;
    expect(resolveAutonomy(ask(false), bogus).decision).toBe('prompt');
    expect(resolveAutonomy(ask(false), bogus).reason).toBe('autonomy_unknown_held');
  });

  it('passes an already-allowed action through without a prompt', () => {
    expect(resolveAutonomy({ decision: 'allow', biometric: false }, 'ask').decision).toBe(
      'auto_approve',
    );
  });

  it('carries a stable reason code for audit / Permission Debug', () => {
    expect(resolveAutonomy(ask(false), 'auto').reason).toBe('autonomy_auto');
    expect(resolveAutonomy(ask(false), 'act').reason).toBe('autonomy_act');
    expect(resolveAutonomy(ask(true), 'act').reason).toBe('autonomy_act_biometric_held');
    expect(resolveAutonomy(ask(false), 'ask').reason).toBe('autonomy_ask');
  });
});

describe('resolveAutonomy composed with the real PolicyKernel', () => {
  const evaluate = (dangerClass: 'read' | 'state_changing' | 'destructive' | 'financial') =>
    PolicyKernel.evaluate({
      descriptor: { id: 't', dangerClass },
      taintedArgs: false,
    });

  it('never auto-approves a destructive or financial call below `auto`', () => {
    for (const cls of ['destructive', 'financial'] as const) {
      const policy = evaluate(cls);
      expect(policy.biometric, `${cls} should be biometric`).toBe(true);
      expect(resolveAutonomy(policy, 'ask').decision, cls).toBe('prompt');
      expect(resolveAutonomy(policy, 'act').decision, cls).toBe('prompt');
    }
  });

  it('lets `act` proceed on a routine state change without a prompt', () => {
    const policy = evaluate('state_changing');
    expect(policy.decision).toBe('ask');
    expect(resolveAutonomy(policy, 'act').decision).toBe('auto_approve');
  });

  // NOTE: uses a host the CURRENT keyword list actually covers. Turkish banking/gov hostnames
  // (garanti.com.tr, turkiye.gov.tr, …) are NOT covered yet — extending that list is S6-PR2's job,
  // and this test must not imply coverage that does not exist.
  it('keeps the sensitive-site lockout unskippable at every level', () => {
    const policy = PolicyKernel.evaluate({
      descriptor: { id: 't', dangerClass: 'state_changing' },
      taintedArgs: false,
      targetUrl: 'https://www.bankofamerica.com/transfer',
    });
    expect(policy.decision).toBe('deny');
    for (const level of AGENT_AUTONOMY_LEVELS) {
      expect(resolveAutonomy(policy, level).decision, `level=${level}`).toBe('prompt');
    }
  });

  it('holds a tainted side-effecting call for a human under `act`', () => {
    const policy = PolicyKernel.evaluate({
      descriptor: { id: 't', dangerClass: 'financial' },
      taintedArgs: true,
    });
    expect(policy.reason).toBe('tainted_side_effect');
    expect(resolveAutonomy(policy, 'act').decision).toBe('prompt');
  });
});
