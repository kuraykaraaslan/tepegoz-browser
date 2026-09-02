import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-agent-controls.ts` — run-control (cancel/pause/resume/steer) + HITL responses. The properties
 * that matter for safety, pinned here:
 *   - a HITL response is RELAYED, never decided, by the renderer — the handler only forwards a
 *     `safeParse`d, correlated payload to `settleApproval` / `settlePlan`;
 *   - cancel does not just abort: it immediately resolves every pending approval/plan promise for
 *     that run as DENIED, so the run doesn't sit on the 120s fail-safe;
 *   - it only unblocks prompts for the run being cancelled, not others;
 *   - an untrusted sender frame and a malformed payload are both silently dropped (onAction is
 *     fire-and-forget — `ipcMain.on`, no throw).
 */

const h = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    on: (c: string, fn: (e: unknown, p: unknown) => void) => h.listeners.set(c, fn),
    handle: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), redact: (s: string) => s },
}));

const rc = vi.hoisted(() => ({
  abort: vi.fn(),
  control: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  steer: vi.fn(),
}));
vi.mock('../agent/agent-run-lock.electron', () => ({
  agentRunControl: (id: string) => {
    rc.control(id);
    return { abort: rc.abort };
  },
  pauseAgentRun: rc.pause,
  resumeAgentRun: rc.resume,
  steerAgentRun: rc.steer,
}));

const emitRunEvent = vi.hoisted(() => vi.fn());
vi.mock('../agent/browser-host.electron', () => ({ emitRunEvent }));
vi.mock('../db/database.electron', () => ({ getDb: () => null }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: { append: vi.fn() } }));
vi.mock('@tepegoz/agent-runtime', () => ({
  holdCheckpoint: () => ({ kind: 'hold' }),
  resumeCheckpoint: () => ({ kind: 'resume' }),
}));

const reg = vi.hoisted(() => ({
  approvals: new Map<string, { runId: string; resolve: (v: unknown) => void }>(),
  plans: new Map<string, { runId: string; resolve: (v: unknown) => void }>(),
  settleApproval: vi.fn(),
  settlePlan: vi.fn(),
}));
vi.mock('../agent/hitl-registry', () => ({
  pendingApprovals: reg.approvals,
  pendingPlans: reg.plans,
  settleApproval: reg.settleApproval,
  settlePlan: reg.settlePlan,
}));

const { registerAgentControlIpc } = await import('./ipc-agent-controls');

const ev = { senderFrame: { url: TRUSTED } };
const evil = { senderFrame: { url: 'https://evil.example/' } };
const fire = (channel: string, payload: unknown, event: unknown = ev) =>
  h.listeners.get(channel)?.(event, payload);

beforeEach(() => {
  h.listeners.clear();
  Object.values(rc).forEach((f) => f.mockClear());
  emitRunEvent.mockClear();
  reg.settleApproval.mockClear();
  reg.settlePlan.mockClear();
  reg.approvals.clear();
  reg.plans.clear();
  registerAgentControlIpc();
});

describe('cancel', () => {
  it('aborts the run and denies every pending prompt for THAT run only', () => {
    const a1 = vi.fn();
    const a2 = vi.fn();
    const p1 = vi.fn();
    reg.approvals.set('ap-1', { runId: 'run-x', resolve: a1 });
    reg.approvals.set('ap-2', { runId: 'run-other', resolve: a2 });
    reg.plans.set('pl-1', { runId: 'run-x', resolve: p1 });

    fire(IpcChannels.agentCancel, 'run-x');

    expect(rc.abort).toHaveBeenCalledTimes(1);
    expect(a1).toHaveBeenCalledWith({ approved: false, remember: false, grantScope: false });
    expect(p1).toHaveBeenCalledWith({ approved: false });
    expect(a2).not.toHaveBeenCalled(); // a different run's prompt is left alone
    expect(reg.approvals.has('ap-1')).toBe(false);
    expect(reg.approvals.has('ap-2')).toBe(true);
  });

  it('drops a malformed run id without aborting anything', () => {
    fire(IpcChannels.agentCancel, '');
    expect(rc.control).not.toHaveBeenCalled();
  });
});

describe('pause / resume / steer', () => {
  it('pause holds the loop and emits a paused event', () => {
    fire(IpcChannels.agentPause, 'run-1');
    expect(rc.pause).toHaveBeenCalledWith('run-1');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'paused', 'paused');
  });

  it('resume releases the loop and emits a resumed event', () => {
    fire(IpcChannels.agentResume, 'run-1');
    expect(rc.resume).toHaveBeenCalledWith('run-1');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'resumed', 'resumed');
  });

  it('steer injects the message and echoes it as a steered event', () => {
    fire(IpcChannels.agentSteer, { runId: 'run-1', text: 'try the other tab' });
    expect(rc.steer).toHaveBeenCalledWith('run-1', 'try the other tab');
    expect(emitRunEvent).toHaveBeenCalledWith('run-1', 'steered', 'try the other tab');
  });

  it('drops an empty steer message', () => {
    fire(IpcChannels.agentSteer, { runId: 'run-1', text: '' });
    expect(rc.steer).not.toHaveBeenCalled();
  });
});

describe('HITL responses are relayed, not decided', () => {
  it('forwards a correlated approval response verbatim, defaulting the optional flags', () => {
    fire(IpcChannels.agentApprovalResponse, { approvalId: 'ap-1', approved: true });
    expect(reg.settleApproval).toHaveBeenCalledWith('ap-1', true, false, false);
  });

  it('passes remember / grantScope through when the renderer set them', () => {
    fire(IpcChannels.agentApprovalResponse, {
      approvalId: 'ap-1',
      approved: true,
      remember: true,
      grantScope: true,
    });
    expect(reg.settleApproval).toHaveBeenCalledWith('ap-1', true, true, true);
  });

  it('forwards a plan response with its skip list', () => {
    fire(IpcChannels.agentPlanResponse, {
      planId: 'pl-1',
      approved: true,
      skipStepIds: ['s2', 's3'],
    });
    expect(reg.settlePlan).toHaveBeenCalledWith('pl-1', true, ['s2', 's3']);
  });

  it('drops a malformed approval payload (no approved flag)', () => {
    fire(IpcChannels.agentApprovalResponse, { approvalId: 'ap-1' });
    expect(reg.settleApproval).not.toHaveBeenCalled();
  });
});

describe('untrusted sender', () => {
  it('reaches none of the control or HITL paths', () => {
    fire(IpcChannels.agentCancel, 'run-1', evil);
    fire(IpcChannels.agentPause, 'run-1', evil);
    fire(IpcChannels.agentApprovalResponse, { approvalId: 'ap-1', approved: true }, evil);
    expect(rc.control).not.toHaveBeenCalled();
    expect(rc.pause).not.toHaveBeenCalled();
    expect(reg.settleApproval).not.toHaveBeenCalled();
  });
});
