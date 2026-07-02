import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { runAgent, type AgentRunDeps, type AgentRunHooks } from './agent-runtime';

/** Reversible fake crypto (no OS keychain) so CredentialVault can init in a unit test. */
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

const DEPS: AgentRunDeps = {
  browserHost: {
    navigateActive: () => Promise.resolve({ url: '', title: '' }),
    readActivePage: () => Promise.resolve({ url: '', title: '', text: '' }),
    listTabs: () => [],
    createTab: () => 'tab-1',
  },
  journal: { recentEvents: () => [] },
  activeTabUrl: () => undefined,
  handoffStrings: { captcha: 'captcha', twofa: '2fa' },
};

function hooks(): AgentRunHooks {
  return {
    onEvent: vi.fn(),
    requestPlanApproval: () => Promise.resolve({ approved: false }),
    requestApproval: () => Promise.resolve(false),
    signal: { aborted: false },
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-runtime-'));
  PreferenceStore.init({ filePath: join(dir, 'preferences.json') });
  CredentialVault.init({ crypto: fakeCrypto, filePath: join(dir, 'credentials.enc.json') });
});
afterEach(() => {
  PreferenceStore.reset();
  rmSync(dir, { recursive: true, force: true });
});

describe('runAgent guards (before any model/tool call)', () => {
  it('rejects when the default provider is not the (Phase-1a) supported one', async () => {
    PreferenceStore.update({ defaultProvider: 'openai' });
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow(/not supported/i);
  });

  it('rejects when no API key is configured for the default provider', async () => {
    // Default provider is anthropic; no key stored → the key guard fires.
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow(/API key/i);
  });
});
