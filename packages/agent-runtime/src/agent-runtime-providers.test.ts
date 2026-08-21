import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { ModelGateway, PROVIDER_MODEL_CATALOG } from '@tepegoz/model-gateway';
import { hotSwapRunProvider } from './agent-runtime-providers';

/** Reversible fake crypto (no OS keychain) so CredentialVault can init in a unit test. */
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

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

describe('hotSwapRunProvider (live mid-run provider switch)', () => {
  beforeEach(() => {
    ModelGateway.reset();
  });

  it('is a no-op for local (needs engine/model wiring — applies at the next run)', () => {
    const register = vi.spyOn(ModelGateway, 'register');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('local', { effort: 'high', model: '' })).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(setOverride).not.toHaveBeenCalled();
    register.mockRestore();
    setOverride.mockRestore();
  });

  it('is a no-op when the target provider has no stored key (run stays put)', () => {
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('openai', { effort: 'high', model: '' })).toBe(false);
    expect(setOverride).not.toHaveBeenCalled();
    setOverride.mockRestore();
  });

  it('registers the adapter and pins the provider’s primary model when unpinned', () => {
    CredentialVault.addKey('openai', 'work', 'sk-openai-hot');
    const register = vi.spyOn(ModelGateway, 'register');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    const primary = PROVIDER_MODEL_CATALOG.openai[0]?.id ?? '';
    expect(hotSwapRunProvider('openai', { effort: 'high', model: '' })).toBe(true);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai' }));
    expect(setOverride).toHaveBeenCalledWith({ provider: 'openai', model: primary });
    register.mockRestore();
    setOverride.mockRestore();
  });

  it('pins the explicitly requested model when one is provided', () => {
    CredentialVault.addKey('anthropic', 'a', 'sk-ant-hot');
    const setOverride = vi.spyOn(ModelGateway, 'setModelOverride');
    expect(hotSwapRunProvider('anthropic', { effort: 'high', model: 'claude-sonnet-4-6' })).toBe(
      true,
    );
    expect(setOverride).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    setOverride.mockRestore();
  });
});
