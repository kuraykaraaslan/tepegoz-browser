import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { CanonResponse, ModelProvider } from '@tepegoz/model-gateway';
import type { StepOutcome } from '@tepegoz/orchestrator';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';

/**
 * Shared fixtures for the agent-runtime suites. Deliberately free of any `vitest` import (this is not a
 * `*.test.ts` file, so the dev-dependency boundary applies): each suite wires the lifecycle itself.
 */

/** Reversible fake crypto (no OS keychain) so CredentialVault can init in a unit test. */
export const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

export const DEPS: AgentRunDeps = {
  activeTabUrl: () => undefined,
  handoffStrings: { captcha: 'captcha', twofa: '2fa', login: 'login' },
  tabSpawnStrings: {
    opened: 'opened',
    followBlocked: 'follow-blocked',
    returnedToOrigin: 'returned',
  },
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
};

/** Fresh preference + credential stores in a temp dir; pair with {@link resetStores}. */
export function initStores(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-runtime-'));
  PreferenceStore.init({ filePath: join(dir, 'preferences.json') });
  CredentialVault.init({ crypto: fakeCrypto, filePath: join(dir, 'credentials.enc.json') });
  return dir;
}

export function resetStores(dir: string): void {
  PreferenceStore.reset();
  rmSync(dir, { recursive: true, force: true });
}

/** `AgentRunHooks` whose `onEvent` is the caller's spy (kept generic so `.mock` stays typed). */
export function makeHooks<E extends AgentRunHooks['onEvent']>(
  onEvent: E,
): AgentRunHooks & { onEvent: E } {
  return {
    onEvent,
    requestPlanApproval: () => Promise.resolve({ approved: false }),
    requestApproval: () => Promise.resolve(false),
    signal: { aborted: false },
  };
}

export const validPlan = {
  goal: 'read the page',
  steps: [{ id: 's1', tool: 'browser_get_elements', args: {}, rationale: 'r', dependsOn: [] }],
};

export const objSchema = {
  safeParse: (data: unknown) =>
    typeof data === 'object' && data !== null
      ? { success: true as const, data }
      : { success: false as const, error: { issues: ['expected an object'] } },
};

/** Reset the registry to a single `browser_get_elements` read tool whose result is `getResult()`. */
export function installReadTool(getResult: () => unknown): void {
  CapabilityRegistry.reset();
  CapabilityRegistry.register({
    descriptor: {
      id: 'browser_get_elements',
      description: 'read the page',
      dangerClass: 'read',
      source: 'builtin',
      inputSchema: { type: 'object' },
      requiresIdempotencyKey: false,
    },
    inputSchema: objSchema,
    handler: () => getResult(),
  });
}

/** A provider whose complete() is scripted by `reply` (a fn of the call index). */
export class ScriptedProvider implements ModelProvider {
  readonly id = 'anthropic' as const;
  private turn = 0;
  constructor(private readonly reply: (turn: number) => CanonResponse | Error) {}
  complete(): Promise<CanonResponse> {
    const r = this.reply(this.turn++);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }
}
export const resp = (text: string): CanonResponse => ({
  text,
  stopReason: 'end',
  usage: { inputTokens: 10, outputTokens: text.length },
  toolCalls: [],
});
export const inject = (p: ModelProvider): AgentRunDeps => ({
  ...DEPS,
  provider: { id: 'anthropic', instance: p },
});

/** S3 PR3 tab-spawn world model fixtures: policy-checked auto-follow + return-to-origin bookkeeping. */

export const TABS = { origin: 'origin', spawned: 'spawned' };

export function outcome(overrides: Partial<StepOutcome> = {}): StepOutcome {
  return {
    stepId: 's1',
    tool: 'browser_update_page',
    ok: true,
    durationMs: 1,
    ...overrides,
  };
}

export function deps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
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
