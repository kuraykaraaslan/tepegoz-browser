import { describe, it, expect, beforeEach } from 'vitest';
import type { RiskLevel, ToolError } from '@tepegoz/shared-types';
import CapabilityRegistry from './registry';
import ToolGateway from './tool-gateway';
import type { InputValidator } from './types';
import { setIntentCritic } from './intent-critic';

/**
 * Accepts any OBJECT — and rejects anything that is not one, which is what every real tool schema does.
 * It used to return `success: true` unconditionally, coercing a non-object to `{}`. That is a rubber
 * stamp, not a validator, and `CapabilityRegistry.register` now refuses one: a tool whose validator says
 * yes to everything sends LLM-produced arguments straight into its handler.
 */
const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) =>
    typeof d === 'object' && d !== null && !Array.isArray(d)
      ? { success: true, data: d as Record<string, unknown> }
      : { success: false, error: { issues: ['expected an object'] } },
};

const needsFoo: InputValidator<{ foo: string }> = {
  safeParse: (d) => {
    if (
      typeof d === 'object' &&
      d !== null &&
      typeof (d as Record<string, unknown>).foo === 'string'
    ) {
      return { success: true, data: d as { foo: string } };
    }
    return { success: false, error: { issues: ['foo required'] } };
  },
};

function register(opts: {
  id: string;
  dangerClass: RiskLevel;
  requiresIdempotencyKey?: boolean;
  validator?: InputValidator<unknown>;
  handler?: (args: unknown) => unknown;
}): void {
  CapabilityRegistry.register({
    descriptor: {
      id: opts.id,
      description: 'test tool',
      dangerClass: opts.dangerClass,
      source: 'builtin',
      inputSchema: {},
      requiresIdempotencyKey: opts.requiresIdempotencyKey ?? false,
    },
    inputSchema: opts.validator ?? passAny,
    handler: opts.handler ?? (() => 'ok'),
  });
}

const asError = (v: unknown): ToolError => v as ToolError;

beforeEach(() => {
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

describe('ToolGateway.invoke', () => {
  it('runs a read tool (policy allow) and returns its result', async () => {
    register({ id: 'browser_get_page', dangerClass: 'read', handler: () => 'PAGE' });
    expect(await ToolGateway.invoke('browser_get_page', {})).toBe('PAGE');
  });

  it('returns NOT_FOUND for an unknown tool', async () => {
    expect(asError(await ToolGateway.invoke('nope_get_thing', {})).code).toBe('NOT_FOUND');
  });

  it('validates untrusted args (VALIDATION_ERROR) before doing anything', async () => {
    register({ id: 'data_get_item', dangerClass: 'read', validator: needsFoo });
    expect(asError(await ToolGateway.invoke('data_get_item', {})).code).toBe('VALIDATION_ERROR');
    expect(await ToolGateway.invoke('data_get_item', { foo: 'x' })).toBe('ok');
  });

  it('gates a state-changing tool on HITL confirmation', async () => {
    register({ id: 'form_update_field', dangerClass: 'state_changing' });
    // No confirm handler → fail safe to denied.
    expect(asError(await ToolGateway.invoke('form_update_field', {})).code).toBe('FORBIDDEN');
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    expect(await ToolGateway.invoke('form_update_field', {})).toBe('ok');
    ToolGateway.setConfirmHandler(() => Promise.resolve(false));
    expect(asError(await ToolGateway.invoke('form_update_field', {})).code).toBe('FORBIDDEN');
  });

  it('denies a destructive action on a sensitive site (lockout, no prompt)', async () => {
    register({ id: 'file_delete_item', dangerClass: 'destructive' });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true)); // even with approval...
    const res = asError(
      await ToolGateway.invoke('file_delete_item', {}, { targetUrl: 'https://mybank.com' }),
    );
    expect(res.code).toBe('FORBIDDEN');
    expect(res.message).toContain('sensitive_site_lockout');
  });

  it('requires an idempotencyKey for create/upload tools', async () => {
    register({
      id: 'mail_create_message',
      dangerClass: 'state_changing',
      requiresIdempotencyKey: true,
    });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    expect(asError(await ToolGateway.invoke('mail_create_message', {})).code).toBe(
      'VALIDATION_ERROR',
    );
    expect(await ToolGateway.invoke('mail_create_message', {}, { idempotencyKey: 'k1' })).toBe(
      'ok',
    );
  });

  it('wraps a throwing handler in INTERNAL_ERROR (retryable)', async () => {
    register({
      id: 'thing_get_data',
      dangerClass: 'read',
      handler: () => {
        throw new Error('boom');
      },
    });
    const res = asError(await ToolGateway.invoke('thing_get_data', {}));
    expect(res.code).toBe('INTERNAL_ERROR');
    expect(res.retryable).toBe(true);
  });

  it('audits every gated invocation', async () => {
    const entries: string[] = [];
    ToolGateway.setAuditHandler((e) => entries.push(`${e.toolName}:${e.decision}`));
    register({ id: 'browser_get_page', dangerClass: 'read' });
    await ToolGateway.invoke('browser_get_page', {});
    expect(entries).toContain('browser_get_page:allow');
  });

  it('scopes HITL handlers per async run', async () => {
    register({ id: 'form_update_field', dangerClass: 'state_changing' });
    const seen: string[] = [];
    let releaseA: (() => void) | undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const runA = ToolGateway.runWithHandlers(
      {
        confirmHandler: async () => {
          await gateA;
          seen.push('a');
          return true;
        },
      },
      () => ToolGateway.invoke('form_update_field', { run: 'a' }),
    );
    const runB = ToolGateway.runWithHandlers(
      {
        confirmHandler: () => {
          seen.push('b');
          return Promise.resolve(false);
        },
      },
      () => ToolGateway.invoke('form_update_field', { run: 'b' }),
    );

    expect(asError(await runB).code).toBe('FORBIDDEN');
    releaseA?.();
    expect(await runA).toBe('ok');
    expect(seen).toEqual(['b', 'a']);
  });
});

describe('CapabilityRegistry', () => {
  it('rejects duplicate registration and malformed tool names', () => {
    register({ id: 'browser_get_page', dangerClass: 'read' });
    expect(() => register({ id: 'browser_get_page', dangerClass: 'read' })).toThrow();
    expect(() => register({ id: 'BadName', dangerClass: 'read' })).toThrow();
  });
});

describe('the advisory critic cannot change what happens (S6 PR4)', () => {
  beforeEach(() => {
    CapabilityRegistry.reset();
    ToolGateway.reset();
    setIntentCritic(null);
  });

  it('lets a call through even when the critic says it diverges', async () => {
    // Advisory means advisory. A blocking critic would be one model deciding whether another may act,
    // on the critical path, with a judgement nobody can verify.
    register({
      id: 'browser_update_page',
      dangerClass: 'state_changing',
      handler: () => ({ ok: true }),
    });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    setIntentCritic(() =>
      Promise.resolve({ aligned: false, reason: 'this is not what was asked' }),
    );
    const result = await ToolGateway.invoke('browser_update_page', { action: 'click', ref: 1 });
    expect(result).toEqual({ ok: true });
  });

  it('records the divergence on the audit entry, beside the action it did not stop', async () => {
    register({
      id: 'browser_update_page',
      dangerClass: 'state_changing',
      handler: () => ({ ok: true }),
    });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    setIntentCritic(() => Promise.resolve({ aligned: false, reason: 'diverges from the request' }));
    const entries: { toolName: string; critic?: { aligned: boolean; reason: string } }[] = [];
    await ToolGateway.runWithHandlers(
      {
        confirmHandler: () => Promise.resolve(true),
        auditHandler: (e) => entries.push(e),
        goal: 'summarise the article',
      },
      () => ToolGateway.invoke('browser_update_page', { action: 'click', ref: 1 }),
    );
    expect(entries[0]?.critic).toEqual({ aligned: false, reason: 'diverges from the request' });
  });

  it('never asks about a read, so an ordinary perception step costs nothing extra', async () => {
    register({ id: 'browser_get_page', dangerClass: 'read', handler: () => ({ content: 'x' }) });
    let asked = 0;
    setIntentCritic(() => {
      asked += 1;
      return Promise.resolve({ aligned: true, reason: 'fine' });
    });
    await ToolGateway.invoke('browser_get_page', {});
    expect(asked).toBe(0);
  });

  it('is silent on the audit entry when no critic is installed', async () => {
    register({
      id: 'browser_update_page',
      dangerClass: 'state_changing',
      handler: () => ({ ok: true }),
    });
    const entries: { critic?: unknown }[] = [];
    await ToolGateway.runWithHandlers(
      { confirmHandler: () => Promise.resolve(true), auditHandler: (e) => entries.push(e) },
      () => ToolGateway.invoke('browser_update_page', { action: 'click', ref: 1 }),
    );
    expect(entries[0]?.critic).toBeUndefined();
  });
});
