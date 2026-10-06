import { describe, expect, it } from 'vitest';
import type { HandoffSignal } from '@tepegoz/security-policy';
import type { AgentRunDeps } from './agent-runtime-types';
import { handoffMessageFor, perceivedHandoffSignal } from './agent-runtime-handoff';
import { TABS, deps, outcome } from './agent-runtime.test-support';

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
    const d = tunnelDeps({
      tabTunneled: () => false,
      captchaTunnelDisclosure: 'exit-ip-disclosure',
    });
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
