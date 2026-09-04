import { describe, expect, it } from 'vitest';
import {
  LoginExportSchema,
  LoginFillSchema,
  LoginIdSchema,
  LoginImportSchema,
  LoginSetSchema,
} from './schemas-logins';

/**
 * The runtime (zod) guards for the `logins:*` IPC channels. `logins:set` is the only one that carries
 * a plaintext secret across the boundary — main encrypts it on arrival — so its bounds matter, as do
 * the import/export format enums (an unknown format must fail to parse, not be treated as generic).
 */

describe('LoginSetSchema', () => {
  it('accepts url + username + secret, with title / notes optional', () => {
    expect(
      LoginSetSchema.parse({ url: 'https://x.test', username: 'ada', secret: 'hunter2' }),
    ).toEqual({ url: 'https://x.test', username: 'ada', secret: 'hunter2' });
    expect(
      LoginSetSchema.parse({
        url: 'https://x.test',
        username: 'ada',
        secret: 's',
        title: 'X',
        notes: 'n',
      }),
    ).toMatchObject({ title: 'X', notes: 'n' });
  });

  it('rejects an empty secret, an empty username, and an over-long url', () => {
    expect(LoginSetSchema.safeParse({ url: 'https://x.test', username: 'ada', secret: '' }).success).toBe(false);
    expect(LoginSetSchema.safeParse({ url: 'https://x.test', username: '', secret: 's' }).success).toBe(false);
    expect(
      LoginSetSchema.safeParse({ url: 'h'.repeat(4097), username: 'ada', secret: 's' }).success,
    ).toBe(false);
  });
});

describe('LoginIdSchema', () => {
  it('bounds the id to 1..128 chars', () => {
    expect(LoginIdSchema.parse('cred-1')).toBe('cred-1');
    expect(LoginIdSchema.safeParse('').success).toBe(false);
    expect(LoginIdSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('LoginImportSchema / LoginExportSchema', () => {
  it('accept the two known formats and reject anything else', () => {
    expect(LoginImportSchema.parse({ data: 'a,b', format: 'google-csv' })).toMatchObject({
      format: 'google-csv',
    });
    expect(LoginExportSchema.parse('generic-csv')).toBe('generic-csv');
    expect(LoginImportSchema.safeParse({ data: 'a,b', format: 'lastpass' }).success).toBe(false);
    expect(LoginExportSchema.safeParse('keepass').success).toBe(false);
  });
});

describe('LoginFillSchema', () => {
  it('requires a credentialId and allows an optional tabId', () => {
    expect(LoginFillSchema.parse({ credentialId: 'c1' })).toEqual({ credentialId: 'c1' });
    expect(LoginFillSchema.parse({ credentialId: 'c1', tabId: 't1' })).toEqual({
      credentialId: 'c1',
      tabId: 't1',
    });
    expect(LoginFillSchema.safeParse({}).success).toBe(false);
  });
});
