import { describe, expect, it } from 'vitest';
import { formatIrcLine, IRC_MAX_LINE, parseIrcLine, parseIsupport } from './parse';

describe('parseIrcLine', () => {
  it('parses a plain PRIVMSG with a trailing param', () => {
    expect(parseIrcLine(':nick!u@host PRIVMSG #chan :hello world\r\n')).toEqual({
      tags: {},
      prefix: 'nick!u@host',
      command: 'PRIVMSG',
      params: ['#chan', 'hello world'],
    });
  });

  it('uppercases a word command, keeps a numeric as-is', () => {
    expect(parseIrcLine('ping LAG123')?.command).toBe('PING');
    expect(parseIrcLine(':srv 001 ada :Welcome')?.command).toBe('001');
  });

  it('parses and unescapes IRCv3 message tags', () => {
    const m = parseIrcLine('@time=2026-01-01T00:00:00Z;+draft/reply=a\\sb;bare :n!u@h TAGMSG #c');
    expect(m?.tags).toEqual({
      time: '2026-01-01T00:00:00Z',
      '+draft/reply': 'a b',
      bare: '',
    });
    expect(m?.command).toBe('TAGMSG');
  });

  it('handles a message with no prefix and no trailing', () => {
    expect(parseIrcLine('CAP REQ multi-prefix')).toEqual({
      tags: {},
      prefix: null,
      command: 'CAP',
      params: ['REQ', 'multi-prefix'],
    });
  });

  it('rejects an empty / over-long / malformed line', () => {
    expect(parseIrcLine('')).toBeNull();
    expect(parseIrcLine('x'.repeat(IRC_MAX_LINE + 1))).toBeNull();
    expect(parseIrcLine('@only-tags')).toBeNull();
    expect(parseIrcLine(':prefix-only')).toBeNull();
    expect(parseIrcLine('@=noKey x')).toBeNull();
  });

  it('caps the parameter count', () => {
    expect(parseIrcLine(`CMD ${Array.from({ length: 20 }, (_, i) => `p${i}`).join(' ')}`)).toBeNull();
  });

  it('caps the tag count and tolerates a lone unknown escape / trailing empty tag part', () => {
    const tooMany = `@${Array.from({ length: 65 }, (_, i) => `t${i}`).join(';')} PING x`;
    expect(parseIrcLine(tooMany)).toBeNull();
    // `\x` is an unknown escape → the char passes through; a trailing `;` is an empty part
    expect(parseIrcLine('@k=a\\xb;; PING y')?.tags).toEqual({ k: 'axb' });
  });

  it('collapses repeated spaces between tokens', () => {
    expect(parseIrcLine(':n   PRIVMSG   #c   :hi')?.params).toEqual(['#c', 'hi']);
  });
});

describe('formatIrcLine', () => {
  it('round-trips through parseIrcLine', () => {
    const line = formatIrcLine('PRIVMSG', ['#chan', 'hello :world with spaces']);
    expect(line).toBe('PRIVMSG #chan :hello :world with spaces');
    expect(parseIrcLine(line)?.params).toEqual(['#chan', 'hello :world with spaces']);
  });

  it('uses :trailing for an empty final param', () => {
    expect(formatIrcLine('TOPIC', ['#chan', ''])).toBe('TOPIC #chan :');
  });

  it('leaves plain tokens bare and defaults to no params', () => {
    expect(formatIrcLine('NICK', ['ada'])).toBe('NICK ada');
    expect(formatIrcLine('LIST')).toBe('LIST');
  });
});

describe('parseIsupport', () => {
  it('reads KEY=value, bare KEY and -KEY, skipping nick + blurb', () => {
    const map = parseIsupport([
      'ada',
      'CHANTYPES=#&',
      'PREFIX=(ov)@+',
      'SAFELIST',
      '-KNOCK',
      'are supported by this server',
    ]);
    expect(map).toEqual({
      CHANTYPES: '#&',
      PREFIX: '(ov)@+',
      SAFELIST: true,
      KNOCK: false,
    });
  });
});
