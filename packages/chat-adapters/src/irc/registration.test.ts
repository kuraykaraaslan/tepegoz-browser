import { describe, expect, it } from 'vitest';
import { IrcRegistration, type RegistrationConfig } from './registration';
import { parseIrcLine } from './parse';

function reg(cfg: Partial<RegistrationConfig> = {}) {
  return new IrcRegistration({ nick: 'ada', ...cfg });
}
const feed = (r: IrcRegistration, line: string) => {
  const m = parseIrcLine(line);
  if (m === null) throw new Error(line);
  return r.feed(m).map((a) => (a.kind === 'send' ? a.line : a));
};

describe('IrcRegistration — no SASL', () => {
  it('opens with CAP LS + NICK/USER, and PASS when configured', () => {
    const lines = reg({ password: 'sekret' })
      .start()
      .map((a) => (a.kind === 'send' ? a.line : a));
    expect(lines).toEqual([
      'CAP LS 302',
      'PASS sekret',
      'NICK ada',
      'USER ada 0 * ada',
    ]);
  });

  it('requests the offered subset, ends CAP on ACK, registers on 001', () => {
    const r = reg();
    r.start();
    expect(feed(r, 'CAP * LS :message-tags server-time draft/foo sasl')).toEqual([
      'CAP REQ :message-tags server-time sasl',
    ]);
    expect(feed(r, 'CAP * ACK :message-tags server-time sasl')).toEqual(['CAP END']);
    expect(feed(r, ':srv 001 ada :Welcome ada')).toEqual([{ kind: 'registered', nick: 'ada' }]);
  });

  it('ignores an unknown CAP subcommand and a duplicate CAP END trigger', () => {
    const r = reg();
    r.start();
    expect(feed(r, 'CAP * NEW :chghost')).toEqual([]);
    feed(r, 'CAP * LS :message-tags');
    expect(feed(r, 'CAP * ACK :message-tags')).toEqual(['CAP END']);
    // a late 903 after CAP END is already sent produces nothing
    expect(feed(r, ':srv 903 ada :ok')).toEqual([]);
  });

  it('handles a multi-line CAP LS', () => {
    const r = reg();
    r.start();
    expect(feed(r, 'CAP * LS * :message-tags')).toEqual([]);
    expect(feed(r, 'CAP * LS :server-time')).toEqual(['CAP REQ :message-tags server-time']);
  });

  it('ends CAP immediately when nothing is offered / on NAK', () => {
    const r = reg();
    r.start();
    expect(feed(r, 'CAP * LS :draft/nothing-we-want')).toEqual(['CAP END']);

    const r2 = reg();
    r2.start();
    feed(r2, 'CAP * LS :message-tags');
    expect(feed(r2, 'CAP * NAK :message-tags')).toEqual(['CAP END']);
  });

  it('retries a taken nick up to three times then fails', () => {
    const r = reg();
    r.start();
    expect(feed(r, ':srv 433 * ada :in use')).toEqual(['NICK ada_']);
    expect(feed(r, ':srv 433 * ada_ :in use')).toEqual(['NICK ada__']);
    expect(feed(r, ':srv 433 * ada__ :in use')).toEqual(['NICK ada___']);
    expect(feed(r, ':srv 433 * ada___ :in use')).toEqual([
      { kind: 'failed', reason: 'nickname unavailable' },
    ]);
  });

  it('fails on ERROR', () => {
    const r = reg();
    r.start();
    expect(feed(r, 'ERROR :Closing link (banned)')).toEqual([
      { kind: 'failed', reason: 'Closing link (banned)' },
    ]);
  });
});

describe('IrcRegistration — SASL PLAIN', () => {
  it('AUTHENTICATE PLAIN → payload → 903 → CAP END', () => {
    const r = reg({ sasl: { username: 'ada', password: 'pw' } });
    r.start();
    feed(r, 'CAP * LS :sasl');
    expect(feed(r, 'CAP * ACK :sasl')).toEqual(['AUTHENTICATE PLAIN']);
    const authLine = (feed(r, 'AUTHENTICATE +') as string[])[0] ?? '';
    // base64 of "\0ada\0pw"
    expect(authLine).toBe('AUTHENTICATE AGFkYQBwdw==');
    expect(feed(r, ':srv 903 ada :SASL authentication successful')).toEqual(['CAP END']);
  });

  it('a SASL failure numeric fails registration', () => {
    const r = reg({ sasl: { username: 'ada', password: 'bad' } });
    r.start();
    feed(r, 'CAP * ACK :sasl');
    feed(r, 'AUTHENTICATE +');
    expect(feed(r, ':srv 904 ada :bad password')).toEqual([
      { kind: 'failed', reason: 'SASL authentication failed' },
    ]);
  });

  it('ignores feeds once registered', () => {
    const r = reg();
    r.start();
    feed(r, ':srv 001 ada :hi');
    expect(feed(r, ':srv 433 * ada :late')).toEqual([]);
  });

  it('900 RPL_LOGGEDIN also ends CAP; a stray AUTHENTICATE is ignored', () => {
    const r = reg({ sasl: { username: 'a', password: 'b' } });
    r.start();
    feed(r, 'CAP * ACK :sasl');
    expect(feed(r, 'AUTHENTICATE *')).toEqual([]); // not '+', no payload
    feed(r, 'AUTHENTICATE +');
    expect(feed(r, ':srv 900 a a!a@h a :logged in')).toEqual(['CAP END']);
  });

  it('exposes currentNick and honours a configured user + realname', () => {
    const r = reg({ user: 'ada-ident', realname: 'Ada Lovelace' });
    expect(r.currentNick).toBe('ada');
    const lines = r.start().map((a) => (a.kind === 'send' ? a.line : a));
    expect(lines).toContain('USER ada-ident 0 * :Ada Lovelace');
  });

  it('ignores feeds after a failure', () => {
    const r = reg();
    r.start();
    feed(r, 'ERROR :bye');
    expect(feed(r, ':srv 001 ada :too late')).toEqual([]);
  });
});
