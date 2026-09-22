import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolGateway } from '@tepegoz/capability-plane';
import type { StepOutcome } from '@tepegoz/orchestrator';
import type { HandoffSignal } from '@tepegoz/security-policy';
import {
  advanceTabLifecycle,
  handoffMessageFor,
  nextDomainState,
  originTabFor,
  perceivedHandoffSignal,
  spawnedTabFromResult,
} from './agent-runtime-loop';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';

/** S3 PR3 tab-spawn world model: policy-checked auto-follow + return-to-origin bookkeeping. */

const TABS = { origin: 'origin', spawned: 'spawned' };

function outcome(overrides: Partial<StepOutcome> = {}): StepOutcome {
  return {
    stepId: 's1',
    tool: 'browser_update_page',
    ok: true,
    durationMs: 1,
    ...overrides,
  };
}

function deps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
  return {
    activeTabUrl: () => undefined,
    tabUrl: (tabId) => (tabId === TABS.origin ? 'https://a.example' : undefined),
    handoffStrings: { captcha: '', twofa: '', login: '' },
    tabSpawnStrings: { opened: 'opened', followBlocked: 'blocked', returnedToOrigin: 'returned' },
    stopReasonStrings: {
      maxSteps: 'max-steps',
      loopDetected: 'loop',
      toolError: 'tool-error',
      policyDenied: 'policy-denied',
      selectorStale: 'selector-stale',
      navigationTimeout: 'nav-timeout',
      pageChanged: 'page-changed',
      modelMalformed: 'model-malformed',
      transientError: 'transient',
      generic: 'stopped',
    },
    runtimeStrings: {
      planRejected: 'plan-rejected',
      allStepsSkipped: 'all-skipped',
      egressWarning: 'egress-warning',
      domainTransition: 'now on {domain}',
    },
    listTabs: () => [
      { id: TABS.origin, url: 'https://a.example', title: 'A', active: true },
      { id: TABS.spawned, url: 'https://a.example/new', title: 'New', active: false },
    ],
    ...over,
  };
}

function hooks(): AgentRunHooks & { onEvent: ReturnType<typeof vi.fn> } {
  return {
    onEvent: vi.fn(),
    requestPlanApproval: () => Promise.resolve({ approved: false }),
    requestApproval: () => Promise.resolve(false),
    signal: { aborted: false },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spawnedTabFromResult', () => {
  it('reads the first opened tab off a browser_update_page result', () => {
    expect(
      spawnedTabFromResult({ ok: true, openedTabs: [{ id: 't2', url: 'https://x', title: 'X' }] }),
    ).toEqual({ id: 't2', url: 'https://x', title: 'X' });
  });

  it('is undefined for a result with no openedTabs, or a malformed entry', () => {
    expect(spawnedTabFromResult({ ok: true })).toBeUndefined();
    expect(spawnedTabFromResult({ ok: true, openedTabs: [] })).toBeUndefined();
    expect(spawnedTabFromResult({ ok: true, openedTabs: [{ id: 't2' }] })).toBeUndefined();
    expect(spawnedTabFromResult(null)).toBeUndefined();
    expect(spawnedTabFromResult('nope')).toBeUndefined();
  });
});

describe('perceivedHandoffSignal', () => {
  it('flags a CAPTCHA / login wall in a perceived page', () => {
    expect(
      perceivedHandoffSignal(
        outcome({
          tool: 'browser_get_elements',
          result: { content: 'Please verify you are human' },
        }),
      )?.kind,
    ).toBe('captcha');
    expect(
      perceivedHandoffSignal(
        outcome({
          tool: 'browser_get_page',
          result: { content: 'You must be logged in to view this page' },
        }),
      )?.kind,
    ).toBe('login');
  });

  it('does NOT scan browser_get_console — a logged recaptcha script URL is not a challenge', () => {
    const result = {
      url: 'https://kultur.istanbul/etkinlik/yoga-festivali-2/',
      content:
        '[warn] Failed to load resource: https://www.google.com/recaptcha/api.js?render=explicit',
    };
    expect(perceivedHandoffSignal(outcome({ tool: 'browser_get_console', result }))).toBeNull();
  });

  it('does NOT scan browser_get_network or off-page search/fetch text', () => {
    const captchaText = { content: 'GET /recaptcha/api2/reload → 200 (12ms)' };
    expect(
      perceivedHandoffSignal(outcome({ tool: 'browser_get_network', result: captchaText })),
    ).toBeNull();
    expect(
      perceivedHandoffSignal(
        outcome({
          tool: 'web_search_items',
          result: { content: 'Result: verify you are human …' },
        }),
      ),
    ).toBeNull();
    expect(
      perceivedHandoffSignal(
        outcome({ tool: 'web_get_page', result: { content: 'complete the captcha to continue' } }),
      ),
    ).toBeNull();
  });

  it('is null when the outcome carries no content', () => {
    expect(
      perceivedHandoffSignal(outcome({ tool: 'browser_get_elements', result: {} })),
    ).toBeNull();
  });
});

describe('handoffMessageFor (Phase 5 compatibility-disclosure layer)', () => {
  const captcha: HandoffSignal = { kind: 'captcha', matched: 'captcha' };
  const twofa: HandoffSignal = { kind: 'twofa', matched: 'one-time code' };
  const login: HandoffSignal = { kind: 'login', matched: 'type=password' };

  function tunnelDeps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
    return deps({
      handoffStrings: { captcha: 'captcha-base', twofa: 'twofa-base', login: 'login-base' },
      ...over,
    });
  }

  it('appends the disclosure to a CAPTCHA handoff when the acting tab is tunneled', () => {
    const d = tunnelDeps({
      tabTunneled: (tabId) => tabId === TABS.origin,
      captchaTunnelDisclosure: 'exit-ip-disclosure',
    });
    expect(handoffMessageFor(captcha, outcome(), d)).toBe('captcha-base exit-ip-disclosure');
  });

  it('leaves a CAPTCHA handoff unchanged on a Direct (non-tunneled) tab', () => {
    const d = tunnelDeps({ tabTunneled: () => false, captchaTunnelDisclosure: 'exit-ip-disclosure' });
    expect(handoffMessageFor(captcha, outcome(), d)).toBe('captcha-base');
  });

  it('leaves a CAPTCHA handoff unchanged when the host never wired tabTunneled', () => {
    const d = tunnelDeps({ captchaTunnelDisclosure: 'exit-ip-disclosure' });
    expect(handoffMessageFor(captcha, outcome(), d)).toBe('captcha-base');
  });

  it('leaves a CAPTCHA handoff unchanged when the host never wired captchaTunnelDisclosure', () => {
    const d = tunnelDeps({ tabTunneled: () => true });
    expect(handoffMessageFor(captcha, outcome(), d)).toBe('captcha-base');
  });

  it('never appends the disclosure to a 2FA/OTP handoff, even on a tunneled tab', () => {
    const d = tunnelDeps({ tabTunneled: () => true });
    expect(handoffMessageFor(twofa, outcome(), d)).toBe('twofa-base');
  });

  it('never appends the disclosure to a login-wall handoff, even on a tunneled tab', () => {
    const d = tunnelDeps({ tabTunneled: () => true });
    expect(handoffMessageFor(login, outcome(), d)).toBe('login-base');
  });

  it('resolves the acting tab from an explicit tabId arg over the active tab', () => {
    const d = tunnelDeps({
      tabTunneled: (tabId) => tabId === TABS.spawned,
      captchaTunnelDisclosure: 'exit-ip-disclosure',
      listTabs: () => [
        { id: TABS.origin, url: 'https://a.example', title: 'A', active: true },
        { id: TABS.spawned, url: 'https://a.example/new', title: 'New', active: false },
      ],
    });
    expect(handoffMessageFor(captcha, outcome({ args: { tabId: TABS.spawned } }), d)).toBe(
      'captcha-base exit-ip-disclosure',
    );
    expect(handoffMessageFor(captcha, outcome({ args: { tabId: TABS.origin } }), d)).toBe(
      'captcha-base',
    );
  });
});

describe('originTabFor', () => {
  it("prefers the click's own explicit tabId over the host-reported active tab", () => {
    const d = deps({
      listTabs: () => [{ id: 'other-active', url: 'https://a', title: 'A', active: true }],
    });
    expect(originTabFor({ id: TABS.spawned }, { tabId: 'explicit-origin' }, d)).toBe(
      'explicit-origin',
    );
  });

  it('falls back to the active tab when the call omitted tabId', () => {
    expect(originTabFor({ id: TABS.spawned }, {}, deps())).toBe(TABS.origin);
  });

  it('refuses to guess when the "active" tab already reads as the spawned tab itself', () => {
    const d = deps({
      listTabs: () => [{ id: TABS.spawned, url: 'https://a', title: 'A', active: true }],
    });
    expect(originTabFor({ id: TABS.spawned }, {}, d)).toBeUndefined();
  });

  it('is undefined when no tab is known to be active and none was given explicitly', () => {
    expect(originTabFor({ id: TABS.spawned }, {}, deps({ listTabs: () => [] }))).toBeUndefined();
  });
});

describe('advanceTabLifecycle', () => {
  it('does nothing when the step opened no tab and nothing is being followed', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const next = await advanceTabLifecycle(outcome({ result: { ok: true } }), undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalled();
  });

  it('follows a spawned tab through tab_update_item when the Policy Kernel allows it', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.spawned, active: true });
    const h = hooks();
    const result = outcome({
      args: {},
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toEqual({ actingTabId: TABS.spawned, originTabId: TABS.origin });
    expect(invoke).toHaveBeenCalledWith(
      'tab_update_item',
      { id: TABS.spawned },
      { targetUrl: 'https://a.example/new', taintedArgs: true },
    );
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'opened', 'New — https://a.example/new');
  });

  it('does not follow when the Policy Kernel/HITL declines — reported only, exactly like today', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.spawned, active: false });
    const h = hooks();
    const result = outcome({
      args: {},
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'blocked', 'New — https://a.example/new');
  });

  it('never attempts a follow while already following another tab', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const already = { actingTabId: TABS.spawned, originTabId: TABS.origin };
    const result = outcome({
      result: {
        ok: true,
        openedTabs: [{ id: 'third', url: 'https://a.example/third', title: 'Third' }],
      },
    });
    const next = await advanceTabLifecycle(result, already, deps(), h);
    expect(next).toEqual(already);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns to origin once the followed tab is no longer open, on ANY later step', async () => {
    const invoke = vi
      .spyOn(ToolGateway, 'invoke')
      .mockResolvedValue({ id: TABS.origin, active: true });
    const h = hooks();
    const following = { actingTabId: TABS.spawned, originTabId: TABS.origin };
    // The spawned tab already closed — listTabs no longer reports it — and this step is an unrelated read.
    const d = deps({
      listTabs: () => [{ id: TABS.origin, url: 'https://a.example', title: 'A', active: false }],
    });
    const next = await advanceTabLifecycle(
      outcome({ tool: 'browser_get_page', result: { ok: true } }),
      following,
      d,
      h,
    );
    expect(next).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(
      'tab_update_item',
      { id: TABS.origin },
      { targetUrl: 'https://a.example', taintedArgs: false },
    );
    expect(h.onEvent).toHaveBeenCalledWith('tab_spawn', 'returned');
  });

  it('a failed step never starts a follow, even if a stale result carried openedTabs', async () => {
    const invoke = vi.spyOn(ToolGateway, 'invoke');
    const h = hooks();
    const result = outcome({
      ok: false,
      error: { isError: true, code: 'INTERNAL_ERROR', message: 'boom', retryable: true },
      result: {
        ok: true,
        openedTabs: [{ id: TABS.spawned, url: 'https://a.example/new', title: 'New' }],
      },
    });
    const next = await advanceTabLifecycle(result, undefined, deps(), h);
    expect(next).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('nextDomainState', () => {
  it('announces nothing on the very first resolvable site (no prior site to compare against)', () => {
    const r = nextDomainState(undefined, 'https://a.example/page');
    expect(r).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });
  });

  it('does not announce a same-registrable-domain subdomain hop', () => {
    const r = nextDomainState('https://mail.example.com/x', 'https://accounts.example.com/y');
    expect(r.announceDomain).toBeNull();
    expect(r.nextUrl).toBe('https://accounts.example.com/y');
  });

  it('announces a real registrable-domain change, naming the NEW domain', () => {
    const r = nextDomainState('https://a.example/page', 'https://b.example/other');
    expect(r).toEqual({ announceDomain: 'b.example', nextUrl: 'https://b.example/other' });
  });

  it('reuses the multi-part-suffix-aware eTLD+1 rule (garanti.com.tr vs evil.com.tr are different)', () => {
    const r = nextDomainState('https://x.garanti.com.tr/y', 'https://x.evil.com.tr/y');
    expect(r.announceDomain).toBe('evil.com.tr');
  });

  it('never announces from/to an unresolvable (internal/blank) page, and does not advance tracking', () => {
    const noCurrent = nextDomainState('https://a.example/page', undefined);
    expect(noCurrent).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });

    const blankCurrent = nextDomainState('https://a.example/page', 'about:blank');
    expect(blankCurrent).toEqual({ announceDomain: null, nextUrl: 'https://a.example/page' });
  });

  it('does not re-announce a round trip through an unresolvable page back to the same site', () => {
    const toBlank = nextDomainState('https://a.example/page', 'about:blank');
    const backToA = nextDomainState(toBlank.nextUrl, 'https://a.example/other');
    expect(backToA.announceDomain).toBeNull();
  });
});
