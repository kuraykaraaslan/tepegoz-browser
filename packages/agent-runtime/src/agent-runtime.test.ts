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
    snapshotElements: () => Promise.resolve({ url: '', title: '', elements: [] }),
    clickElement: () => Promise.resolve(),
    fillElement: () => Promise.resolve(),
    pressKey: () => Promise.resolve(),
    scrollPage: () => Promise.resolve(),
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
  it('rejects when the only stored key is for a not-yet-wired provider (Gemini)', async () => {
    CredentialVault.addKey('gemini', 'work', 'gm-only');
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow(/No usable API key/i);
  });

  it('rejects when no API key is stored at all', async () => {
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow(/API key/i);
  });

  it('selects the highest-priority runnable key even when a not-yet-wired provider is on top', async () => {
    // Top (highest-priority) key is Gemini (no adapter yet), but an OpenAI key sits below it: the run
    // must resolve to the OpenAI key instead of hard-failing. Mock the key fetch to stop before the
    // live model call.
    CredentialVault.addKey('gemini', 'work', 'gm-top');
    CredentialVault.addKey('openai', 'personal', 'sk-openai-lower');
    const spy = vi.spyOn(CredentialVault, 'getFirstKeyForProvider').mockImplementation(() => {
      throw new Error('stop-before-network');
    });
    await expect(runAgent('do a thing', hooks(), DEPS)).rejects.toThrow('stop-before-network');
    expect(spy).toHaveBeenCalledWith('openai');
    spy.mockRestore();
  });
});
