import { describe, it, expect } from 'vitest';
import { bareJid, formatJid, parseIrcPrefix, parseJid, parseMatrixId } from './address';

describe('parseJid', () => {
  it('parses local@domain/resource', () => {
    expect(parseJid('ada@example.com/phone')).toEqual({
      local: 'ada',
      domain: 'example.com',
      resource: 'phone',
    });
  });

  it('parses a bare domain (server JID) and a domain/resource', () => {
    expect(parseJid('example.com')).toEqual({ local: null, domain: 'example.com', resource: null });
    expect(parseJid('example.com/xyz')?.resource).toBe('xyz');
  });

  it('rejects an empty local part, a stray @, or spaces', () => {
    expect(parseJid('@example.com')).toBeNull();
    expect(parseJid('')).toBeNull();
    expect(parseJid('a b@example.com')).toBeNull();
    expect(parseJid('x'.repeat(600))).toBeNull();
  });

  it('bareJid strips the resource; formatJid round-trips', () => {
    expect(bareJid('ada@example.com/phone')).toBe('ada@example.com');
    expect(bareJid('example.com')).toBe('example.com');
    expect(formatJid({ local: 'ada', domain: 'x.com', resource: 'r' })).toBe('ada@x.com/r');
    expect(formatJid({ local: null, domain: 'x.com', resource: null })).toBe('x.com');
  });
});

describe('parseIrcPrefix', () => {
  it('parses nick!user@host', () => {
    expect(parseIrcPrefix('ada!~a@host.example')).toEqual({
      nick: 'ada',
      user: '~a',
      host: 'host.example',
    });
  });

  it('parses a leading colon and a bare servername', () => {
    expect(parseIrcPrefix(':irc.libera.chat')).toEqual({
      nick: 'irc.libera.chat',
      user: null,
      host: null,
    });
  });

  it('parses nick@host without a user', () => {
    expect(parseIrcPrefix('ada@host')).toEqual({ nick: 'ada', user: null, host: 'host' });
  });

  it('parses a bare nick with no user or host', () => {
    expect(parseIrcPrefix('ada')).toEqual({ nick: 'ada', user: null, host: null });
  });

  it('parses nick!user with no host', () => {
    expect(parseIrcPrefix('ada!~ident')).toEqual({ nick: 'ada', user: '~ident', host: null });
  });

  it('rejects spaces and over-long input', () => {
    expect(parseIrcPrefix('a b')).toBeNull();
    expect(parseIrcPrefix('!x@y')).toBeNull();
    expect(parseIrcPrefix('x'.repeat(600))).toBeNull();
  });
});

describe('parseMatrixId', () => {
  it('parses user / room / alias sigils', () => {
    expect(parseMatrixId('@ada:example.com')).toEqual({
      kind: 'user',
      localpart: 'ada',
      server: 'example.com',
    });
    expect(parseMatrixId('!abcdef:example.com')?.kind).toBe('room');
    expect(parseMatrixId('#general:example.com')?.kind).toBe('alias');
  });

  it('rejects a missing sigil, missing colon, or empty parts', () => {
    expect(parseMatrixId('ada:example.com')).toBeNull();
    expect(parseMatrixId('@ada')).toBeNull();
    expect(parseMatrixId('@:example.com')).toBeNull();
  });
});
