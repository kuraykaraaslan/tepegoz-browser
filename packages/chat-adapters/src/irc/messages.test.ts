import { describe, expect, it } from 'vitest';
import {
  buildIrcAction,
  buildIrcAway,
  buildIrcJoin,
  buildIrcNick,
  buildIrcPart,
  buildIrcPrivmsg,
  ircMessageToEvent,
  type IrcContext,
} from './messages';
import { parseIrcLine } from './parse';

const ctx: IrcContext = { accountId: 'acc', selfNick: 'ada', chanTypes: '#&', now: 1000 };

function ev(line: string, over: Partial<IrcContext> = {}) {
  const msg = parseIrcLine(line);
  if (msg === null) throw new Error(`unparseable: ${line}`);
  return ircMessageToEvent(msg, { ...ctx, ...over });
}

describe('ircMessageToEvent — PRIVMSG', () => {
  it('a channel message → a room message keyed by the folded channel', () => {
    const e = ev(':bob!b@h PRIVMSG #Chan :hello there');
    expect(e).toMatchObject({
      type: 'message',
      message: {
        conversationId: '#chan',
        senderAddress: 'bob',
        senderName: 'bob',
        body: 'hello there',
        kind: 'text',
      },
    });
  });

  it('a private message → a DM keyed by the sender nick', () => {
    expect(ev(':bob!b@h PRIVMSG ada :hi')).toMatchObject({
      type: 'message',
      message: { conversationId: 'bob', body: 'hi' },
    });
  });

  it('uses the server-time tag for originTs, msgid for protocolId', () => {
    const e = ev('@time=2026-01-02T03:04:05.000Z;msgid=abc :bob!b@h PRIVMSG #c :yo');
    expect(e?.type === 'message' && e.message.originTs).toBe(Date.parse('2026-01-02T03:04:05.000Z'));
    expect(e?.type === 'message' && e.message.protocolId).toBe('abc');
  });

  it('a CTCP ACTION becomes a /me line; other CTCP is dropped', () => {
    const soh = String.fromCharCode(1);
    expect(ev(`:bob!b@h PRIVMSG #c :${soh}ACTION waves${soh}`)).toMatchObject({
      message: { body: '/me waves' },
    });
    expect(ev(`:bob!b@h PRIVMSG #c :${soh}VERSION${soh}`)).toBeNull();
  });

  it('a NOTICE is a system-kind message', () => {
    expect(ev(':serv NOTICE #c :heads up')?.type === 'message').toBe(true);
    const e = ev(':serv NOTICE #c :heads up');
    expect(e?.type === 'message' && e.message.kind).toBe('system');
  });

  it('drops an empty body or a bad prefix', () => {
    expect(ev('PRIVMSG #c :')).toBeNull();
  });

  it('folds RFC-1459 special chars in the channel id', () => {
    expect(ev(':bob!b@h PRIVMSG #Foo[Bar] :x')).toMatchObject({ message: { conversationId: '#foo{bar}' } });
  });
});

describe('ircMessageToEvent — membership', () => {
  it('JOIN / PART → room-membership; own JOIN is self', () => {
    expect(ev(':bob!b@h JOIN #c')).toMatchObject({
      type: 'room-membership',
      conversationId: '#c',
      address: '#c/bob',
      joined: true,
      self: false,
      realJid: 'b@h',
    });
    expect(ev(':ada!a@h JOIN #c')).toMatchObject({ joined: true, self: true });
    expect(ev(':bob!b@h PART #c :bye')).toMatchObject({ joined: false });
  });

  it('KICK attributes the leave to the kicked nick, not the kicker', () => {
    expect(ev(':op!o@h KICK #c bob :rude')).toMatchObject({
      type: 'room-membership',
      address: '#c/bob',
      joined: false,
    });
  });

  it('QUIT and unknown commands surface nothing', () => {
    expect(ev(':bob!b@h QUIT :ping timeout')).toBeNull();
    expect(ev(':srv 375 ada :- message of the day')).toBeNull();
  });
});

describe('irc builders', () => {
  it('build well-formed lines (message / reason text is always :trailing)', () => {
    expect(buildIrcPrivmsg('#c', 'hi there')).toBe('PRIVMSG #c :hi there');
    expect(buildIrcPrivmsg('#c', 'oneword')).toBe('PRIVMSG #c :oneword');
    expect(buildIrcNick('ada2')).toBe('NICK ada2');
    expect(buildIrcJoin('#c', 's3cret')).toBe('JOIN #c s3cret');
    expect(buildIrcJoin('#c')).toBe('JOIN #c');
    expect(buildIrcPart('#c', 'later on')).toBe('PART #c :later on');
    expect(buildIrcPart('#c')).toBe('PART #c');
    expect(buildIrcAway('brb')).toBe('AWAY :brb');
    expect(buildIrcAway()).toBe('AWAY');
    const soh = String.fromCharCode(1);
    expect(buildIrcAction('#c', 'nods')).toBe(`PRIVMSG #c :${soh}ACTION nods${soh}`);
  });
});
