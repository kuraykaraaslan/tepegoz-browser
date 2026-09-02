import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ipc-agent-shared.ts` — cross-concern agent-IPC helpers. Pinned:
 *   - the Agent extension is a real kill-switch: `requireAgentEnabled` throws 403 when it is disabled;
 *   - `maybeWarnQuota` raises the 80% warning EXACTLY on the run that crosses the threshold — never
 *     when the quota is off, never again once already past;
 *   - `safeArgsPreview` never leaks the full payload (200-char cap, `…` suffix, survives a cyclic arg);
 *   - `tokenUsage` folds the in-memory run ledger with the persisted lifetime total and the quota;
 *   - `broadcastConversationsState` pushes to every live window.
 */

const getAllWindows = vi.hoisted(() => vi.fn(() => [] as unknown[]));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows } }));

vi.mock('@tepegoz/ext-agent/manifest', () => ({ agentManifest: { id: 'com.tepegoz.agent' } }));

const ledgerTotals = vi.hoisted(() =>
  vi.fn(() => ({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })),
);
vi.mock('@tepegoz/model-gateway', () => ({ TokenLedger: { totals: ledgerTotals } }));

const convList = vi.hoisted(() => vi.fn(() => [{ id: 'c1' }]));
const lifetimeTotals = vi.hoisted(() => vi.fn(() => ({ totalTokens: 4200 })));
vi.mock('@tepegoz/persistence', () => ({
  AgentConversationStore: { list: convList },
  TokenStore: { lifetimeTotals },
}));

const db = vi.hoisted((): { value: unknown } => ({ value: {} }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ agent: { quota: { warnTitle: '80%', warnBody: 'nearly out' } } }),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock('../notifications/notification-host', () => ({ default: { push } }));

const prefs = vi.hoisted(
  (): { value: { extensions: { id: string; status: string }[]; agentTokenQuota: number } } => ({
    value: { extensions: [], agentTokenQuota: 0 },
  }),
);
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.value } }));

const mod = await import('./ipc-agent-shared');

beforeEach(() => {
  getAllWindows.mockReturnValue([]);
  ledgerTotals.mockReturnValue({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  convList.mockReturnValue([{ id: 'c1' }]);
  lifetimeTotals.mockReturnValue({ totalTokens: 4200 });
  push.mockClear();
  db.value = {};
  prefs.value = { extensions: [], agentTokenQuota: 0 };
});

describe('the Agent kill-switch', () => {
  it('is enabled by default (no extension state row)', () => {
    expect(mod.agentEnabled()).toBe(true);
    expect(() => mod.requireAgentEnabled()).not.toThrow();
  });

  it('throws a 403 when the Agent extension is disabled', () => {
    prefs.value = {
      extensions: [{ id: 'com.tepegoz.agent', status: 'disabled' }],
      agentTokenQuota: 0,
    };
    expect(mod.agentEnabled()).toBe(false);
    expect(() => mod.requireAgentEnabled()).toThrow(/disabled/);
  });
});

describe('maybeWarnQuota', () => {
  it('does nothing when the quota is off', () => {
    mod.maybeWarnQuota(0, 0, 10_000);
    expect(push).not.toHaveBeenCalled();
  });

  it('warns once, on the run that crosses 80%', () => {
    mod.maybeWarnQuota(1000, 700, 850); // 700 < 800 <= 850
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toMatchObject({ source: 'agent', kind: 'warning' });
  });

  it('does not warn again once the threshold was already passed', () => {
    mod.maybeWarnQuota(1000, 850, 999);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not warn while still below the threshold', () => {
    mod.maybeWarnQuota(1000, 100, 700);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('safeArgsPreview', () => {
  it('round-trips a small object', () => {
    expect(mod.safeArgsPreview({ a: 1 })).toBe('{"a":1}');
  });

  it('caps at 200 chars with an ellipsis', () => {
    const out = mod.safeArgsPreview({ blob: 'x'.repeat(500) });
    expect(out.length).toBe(201);
    expect(out.endsWith('…')).toBe(true);
  });

  it('survives an un-stringifiable (cyclic) argument', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => mod.safeArgsPreview(cyclic)).not.toThrow();
  });

  it('reports undefined as the string "undefined"', () => {
    expect(mod.safeArgsPreview(undefined)).toBe('undefined');
  });
});

describe('REFUNDABLE_STOP_REASONS', () => {
  it('includes the not-the-user-fault stops', () => {
    for (const r of [
      'handoff',
      'loop_detected',
      'transient_error',
      'egress_blocked',
      'max_steps',
    ]) {
      expect(mod.REFUNDABLE_STOP_REASONS.has(r)).toBe(true);
    }
  });

  it('excludes a normal user cancellation / completion', () => {
    expect(mod.REFUNDABLE_STOP_REASONS.has('user_cancelled')).toBe(false);
    expect(mod.REFUNDABLE_STOP_REASONS.has('done')).toBe(false);
  });
});

describe('tokenUsage', () => {
  it('folds the run ledger, the account quota, and the persisted lifetime total', () => {
    prefs.value = { extensions: [], agentTokenQuota: 50_000 };
    expect(mod.tokenUsage()).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      quota: 50_000,
      lifetimeTokens: 4200,
    });
  });

  it('reports 0 lifetime tokens when there is no database', () => {
    db.value = null;
    expect(mod.tokenUsage().lifetimeTokens).toBe(0);
  });
});

describe('broadcastConversationsState', () => {
  it('sends the conversation list to every live window', () => {
    const send = vi.fn();
    getAllWindows.mockReturnValue([{ webContents: { isDestroyed: () => false, send } }]);
    mod.broadcastConversationsState();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toEqual({ items: [{ id: 'c1' }] });
  });

  it('skips a window whose webContents was destroyed', () => {
    const send = vi.fn();
    getAllWindows.mockReturnValue([{ webContents: { isDestroyed: () => true, send } }]);
    mod.broadcastConversationsState();
    expect(send).not.toHaveBeenCalled();
  });
});
