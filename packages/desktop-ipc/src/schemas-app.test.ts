import { describe, expect, it } from 'vitest';
import {
  AddProviderKeyInputSchema,
  AppInfoSchema,
  BasicAuthResponseSchema,
  CasRefSchema,
  CertificateErrorResponseSchema,
  ClientCertificateResponseSchema,
  DefaultBrowserStatusSchema,
  RemoveKeyByIdSchema,
  RenameProviderKeyInputSchema,
  ReorderKeysSchema,
  ScreenshotModeSchema,
  SetProviderKeyModelSchema,
} from './schemas-app';

/**
 * Runtime (zod) guards for the app-info + credential-vault + HITL-prompt IPC channels. The
 * client-certificate response is an INDEX not a certificate (the certs stay in main); `credentials:add`
 * is the only channel carrying a raw key.
 */

const appInfo = {
  name: 'Tepegoz',
  version: '0.1.0',
  platform: 'darwin',
  glassAvailable: false,
  os: { name: 'macOS', version: '15', arch: 'arm64' },
  engines: { chromium: '1', electron: '2', node: '3', v8: '4' },
  build: { channel: 'dev', commit: '', builtAt: '', packaged: false },
  license: 'MIT',
};

describe('AppInfoSchema / DefaultBrowserStatusSchema', () => {
  it('accept a full AppInfo (empty commit/builtAt allowed) and reject a missing block', () => {
    expect(AppInfoSchema.parse(appInfo)).toMatchObject({ name: 'Tepegoz' });
    expect(AppInfoSchema.safeParse({ ...appInfo, engines: undefined }).success).toBe(false);
    expect(DefaultBrowserStatusSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
  });
});

describe('the credential-vault schemas', () => {
  it('AddProviderKeyInputSchema fixes the provider enum + bounds the raw key', () => {
    expect(
      AddProviderKeyInputSchema.parse({ provider: 'anthropic', label: 'Work', apiKey: 'sk-x' }),
    ).toMatchObject({ provider: 'anthropic' });
    expect(
      AddProviderKeyInputSchema.safeParse({ provider: 'skynet', label: 'x', apiKey: 'y' }).success,
    ).toBe(false);
    expect(
      AddProviderKeyInputSchema.safeParse({ provider: 'openai', label: '', apiKey: 'y' }).success,
    ).toBe(false);
  });

  it('remove / rename / set-model wrap a bounded keyId', () => {
    expect(RemoveKeyByIdSchema.parse({ keyId: 'k1' })).toEqual({ keyId: 'k1' });
    expect(RenameProviderKeyInputSchema.parse({ keyId: 'k1', label: 'New' })).toMatchObject({
      keyId: 'k1',
    });
    expect(SetProviderKeyModelSchema.parse({ keyId: 'k1', model: '' })).toMatchObject({ model: '' });
    expect(RenameProviderKeyInputSchema.safeParse({ keyId: 'k1', label: '' }).success).toBe(false);
  });

  it('ReorderKeysSchema caps the id list at 200', () => {
    expect(ReorderKeysSchema.parse({ orderedIds: ['a', 'b'] })).toMatchObject({
      orderedIds: ['a', 'b'],
    });
    expect(
      ReorderKeysSchema.safeParse({ orderedIds: Array.from({ length: 201 }, () => 'x') }).success,
    ).toBe(false);
  });
});

describe('CasRefSchema', () => {
  it('requires the cas:// scheme', () => {
    expect(CasRefSchema.parse('cas://abc123')).toBe('cas://abc123');
    expect(CasRefSchema.safeParse('https://abc123').success).toBe(false);
  });
});

describe('the HITL-prompt response schemas', () => {
  it('BasicAuthResponseSchema length-caps the credential fields', () => {
    expect(
      BasicAuthResponseSchema.parse({ requestId: 'r', username: 'u', password: 'p', cancelled: false }),
    ).toMatchObject({ cancelled: false });
    expect(
      BasicAuthResponseSchema.safeParse({
        requestId: 'r',
        username: 'u'.repeat(1025),
        password: 'p',
        cancelled: false,
      }).success,
    ).toBe(false);
  });

  it('CertificateErrorResponseSchema is { requestId, proceed }', () => {
    expect(CertificateErrorResponseSchema.parse({ requestId: 'r', proceed: true })).toMatchObject({
      proceed: true,
    });
    expect(CertificateErrorResponseSchema.safeParse({ requestId: 'r' }).success).toBe(false);
  });

  it('ClientCertificateResponseSchema takes a nullable non-negative index, never a cert', () => {
    expect(ClientCertificateResponseSchema.parse({ requestId: 'r', index: 0 })).toMatchObject({
      index: 0,
    });
    expect(ClientCertificateResponseSchema.parse({ requestId: 'r', index: null })).toMatchObject({
      index: null,
    });
    expect(ClientCertificateResponseSchema.safeParse({ requestId: 'r', index: -1 }).success).toBe(
      false,
    );
  });

  it('ScreenshotModeSchema is a closed viewport | fullPage enum', () => {
    expect(ScreenshotModeSchema.parse('fullPage')).toBe('fullPage');
    expect(ScreenshotModeSchema.safeParse('wholeInternet').success).toBe(false);
  });
});
