import { describe, it, expect, beforeEach } from 'vitest';
import type { RiskLevel, ToolError } from '@tepegoz/shared-types';
import CapabilityRegistry from './registry';
import ToolGateway from './tool-gateway';
import type { InputValidator } from './types';

const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) => ({ success: true, data: (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown> }),
};

const needsFoo: InputValidator<{ foo: string }> = {
  safeParse: (d) => {
    if (typeof d === 'object' && d !== null && typeof (d as Record<string, unknown>).foo === 'string') {
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
    const res = asError(await ToolGateway.invoke('file_delete_item', {}, { targetUrl: 'https://mybank.com' }));
    expect(res.code).toBe('FORBIDDEN');
    expect(res.message).toContain('sensitive_site_lockout');
  });

  it('requires an idempotencyKey for create/upload tools', async () => {
    register({ id: 'mail_create_message', dangerClass: 'state_changing', requiresIdempotencyKey: true });
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    expect(asError(await ToolGateway.invoke('mail_create_message', {})).code).toBe('VALIDATION_ERROR');
    expect(await ToolGateway.invoke('mail_create_message', {}, { idempotencyKey: 'k1' })).toBe('ok');
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
});

describe('CapabilityRegistry', () => {
  it('rejects duplicate registration and malformed tool names', () => {
    register({ id: 'browser_get_page', dangerClass: 'read' });
    expect(() => register({ id: 'browser_get_page', dangerClass: 'read' })).toThrow();
    expect(() => register({ id: 'BadName', dangerClass: 'read' })).toThrow();
  });
});
