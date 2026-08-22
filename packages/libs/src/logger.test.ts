import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from './logger';

/**
 * The redaction contract. This file exists because `Logger` shipped with none — the project rule says
 * secrets never reach a log, and nothing checked it.
 *
 * Every assertion here searches the WHOLE emitted line for the secret rather than inspecting a field.
 * A secret that leaks through a field nobody thought to check is still leaked, and asserting on the
 * shape of the output would miss exactly that.
 */

let lines: string[];
const capture = (line: unknown): void => {
  lines.push(String(line));
};

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'info').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(console, 'debug').mockImplementation(capture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const emitted = (): string => lines.join('\n');

describe('secrets recognisable by SHAPE never reach a log', () => {
  const SHAPED: Record<string, string> = {
    anthropic: 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA',
    openai: 'sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    openrouter: 'sk-or-v1-AAAAAAAAAAAAAAAAAAAAAAAA',
    google: 'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    groq: 'gsk_AAAAAAAAAAAAAAAAAAAAAAAA',
    xai: 'xai-AAAAAAAAAAAAAAAAAAAAAAAA',
    github: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA',
    slack: 'xoxb-1111111111-AAAAAAAAAAAA',
    aws: 'AKIAIOSFODNN7EXAMPLE',
    bearer: 'Bearer AAAAAAAAAAAAAAAAAAAA',
    // A realistic one: the pattern requires each segment to be long enough not to fire on prose.
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM',
  };

  it('scrubs each one out of a message', () => {
    for (const [name, secret] of Object.entries(SHAPED)) {
      lines = [];
      Logger.info(`request failed with ${secret}`);
      expect(emitted(), name).not.toContain(secret);
      expect(emitted(), name).toContain('[REDACTED]');
    }
  });

  it('scrubs one buried deep inside metadata, not just at the top level', () => {
    Logger.error('upstream rejected the call', {
      attempt: 2,
      response: { headers: { note: 'used Bearer AAAAAAAAAAAAAAAAAAAA' } },
    });
    expect(emitted()).not.toContain('AAAAAAAAAAAAAAAAAAAA');
  });
});

describe('secrets recognisable only by their FIELD NAME never reach a log', () => {
  // This is the axis that was missing. A stored login password is opaque by construction — no value
  // pattern can ever match one — so the field it travels in is the only thing that identifies it.
  const OPAQUE = 'hunter2-correct-horse-battery-staple';

  it('redacts a password, however it is spelled', () => {
    for (const field of ['password', 'Password', 'userPassword', 'passwd', 'passphrase']) {
      lines = [];
      Logger.warn('vault write failed', { [field]: OPAQUE });
      expect(emitted(), field).not.toContain(OPAQUE);
    }
  });

  it('redacts an API key with no recognisable prefix', () => {
    // A Mistral/Together-style opaque key. Pattern matching cannot tell this from an id.
    Logger.info('provider configured', { apiKey: 'f4c1b2a9d8e7f6a5b4c3d2e1f0a9b8c7' });
    expect(emitted()).not.toContain('f4c1b2a9d8e7f6a5b4c3d2e1f0a9b8c7');
  });

  it('redacts tokens, credentials, cookies and session ids', () => {
    Logger.info('session', {
      accessToken: 'aaaa-bbbb',
      credential: 'cccc-dddd',
      cookie: 'sid=eeee',
      sessionId: 'ffff',
      authorization: 'gggg',
    });
    for (const v of ['aaaa-bbbb', 'cccc-dddd', 'sid=eeee', 'ffff', 'gggg']) {
      expect(emitted(), v).not.toContain(v);
    }
  });

  it('redacts one nested inside an array of objects', () => {
    Logger.info('keys loaded', { keys: [{ label: 'work', apiKey: OPAQUE }] });
    expect(emitted()).not.toContain(OPAQUE);
    // The non-secret sibling survives — redaction that erased everything would be useless.
    expect(emitted()).toContain('work');
  });

  it('survives JSON escaping: a secret containing a quote is still gone', () => {
    // The old implementation scrubbed the SERIALIZED string, so a value containing a quote or a
    // backslash came out escaped and no longer matched any pattern. Redacting before serializing is
    // what fixes that, and this is the case that proves it.
    Logger.info('vault', { password: 'he said "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"' });
    expect(emitted()).not.toContain('sk-ant');
  });
});

describe('logging stays useful', () => {
  it('keeps ordinary metadata intact', () => {
    Logger.info('navigated', { url: 'https://example.com/a', tabId: 7, ok: true });
    expect(emitted()).toContain('https://example.com/a');
    expect(emitted()).toContain('7');
  });

  it('does not redact a field merely called `key`', () => {
    // `key` is a legitimate field name across the kv store, shortcuts, and list rendering. Redacting
    // it would fill logs with noise while protecting nothing.
    Logger.info('preference written', { key: 'theme', value: 'dark' });
    expect(emitted()).toContain('theme');
  });

  it('unwraps an Error instead of logging `{}`, and scrubs its message', () => {
    Logger.error('call failed', { err: new Error('401 for Bearer AAAAAAAAAAAAAAAAAAAA') });
    expect(emitted()).toContain('401 for');
    expect(emitted()).not.toContain('AAAAAAAAAAAAAAAAAAAA');
  });

  it('terminates on a cyclic object instead of hanging the caller', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(() => {
      Logger.info('cycle', cyclic);
    }).not.toThrow();
  });

  it('routes each level to the right console channel', () => {
    Logger.debug('d');
    Logger.info('i');
    Logger.warn('w');
    Logger.error('e');
    Logger.fatal('f');
    expect(lines).toHaveLength(5);
  });
});
