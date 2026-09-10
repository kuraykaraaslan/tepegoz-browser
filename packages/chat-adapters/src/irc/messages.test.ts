import { describe, expect, it } from 'vitest';
import {
  asIrcCasemapping,
  buildIrcAction,
  buildIrcAway,
  buildIrcJoin,
  buildIrcNick,
  buildIrcPart,
  buildIrcPrivmsg,
  foldIrcTarget,
  ircMessageToEvent,
  namesReplyToEvents,
  parseIrcPrefixSpec,
  splitMembershipPrefix,
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

  it('folds RFC-1459 special chars in the channel id (the default casemapping)', () => {
    expect(ev(':bob!b@h PRIVMSG #Foo[Bar] :x')).toMatchObject({ message: { conversationId: '#foo{bar}' } });
  });

  it('an `ascii` casemapping folds only A–Z — brackets are left alone', () => {
    expect(ev(':bob!b@h PRIVMSG #Foo[Bar] :x', { casemapping: 'ascii' })).toMatchObject({
      message: { conversationId: '#foo[bar]' },
    });
  });

  it('`rfc1459-strict` folds []\\ but not ^', () => {
    expect(ev(':bob!b@h PRIVMSG #A[b]c^d\\e :x', { casemapping: 'rfc1459-strict' })).toMatchObject({
      message: { conversationId: '#a{b}c^d|e' },
    });
  });

  it('the DM conversation id folds by the same casemapping', () => {
    expect(ev(':Bob[X]!b@h PRIVMSG ada :hi', { casemapping: 'ascii' })).toMatchObject({
      message: { conversationId: 'bob[x]' },
    });
  });

  it('a membership event folds its channel + address by casemapping', () => {
    expect(ev(':bob!b@h JOIN #Foo[Bar]', { casemapping: 'ascii' })).toMatchObject({
      type: 'room-membership',
      conversationId: '#foo[bar]',
      address: '#foo[bar]/bob',
    });
  });
});

describe('foldIrcTarget / asIrcCasemapping', () => {
  it('defaults to rfc1459 and maps the full bracket set', () => {
    expect(foldIrcTarget('#Foo[]\\^')).toBe('#foo{}|~');
  });

  it('ascii leaves everything but A–Z', () => {
    expect(foldIrcTarget('#Foo[]\\^', 'ascii')).toBe('#foo[]\\^');
  });

  it('narrows a raw ISUPPORT token, rejecting the unknown', () => {
    expect(asIrcCasemapping('ascii')).toBe('ascii');
    expect(asIrcCasemapping('rfc1459-strict')).toBe('rfc1459-strict');
    expect(asIrcCasemapping('rfc7613')).toBeNull();
    expect(asIrcCasemapping(true)).toBeNull();
    expect(asIrcCasemapping(undefined)).toBeNull();
  });
});

describe('ISUPPORT PREFIX + RPL_NAMREPLY (353)', () => {
  it('parseIrcPrefixSpec keeps the ordered symbol string, rejecting a malformed value', () => {
    expect(parseIrcPrefixSpec('(ov)@+')).toBe('@+');
    expect(parseIrcPrefixSpec('(qaohv)~&@%+')).toBe('~&@%+');
    expect(parseIrcPrefixSpec('(ov)@')).toBe(''); // count mismatch
    expect(parseIrcPrefixSpec('garbage')).toBe('');
  });

  it('splitMembershipPrefix peels the leading symbol run and keeps the top rank', () => {
    expect(splitMembershipPrefix('@+bob', '@+')).toEqual({ symbol: '@', nick: 'bob' });
    expect(splitMembershipPrefix('~carol', '~&@%+')).toEqual({ symbol: '~', nick: 'carol' });
    expect(splitMembershipPrefix('dave', '@+')).toEqual({ symbol: '', nick: 'dave' });
  });

  it('fans a 353 line out to one joined membership per occupant, op → moderator', () => {
    const msg = parseIrcLine(':srv 353 ada = #Chan :@bea +cem ada')!;
    expect(namesReplyToEvents(msg, ctx)).toMatchObject([
      { type: 'room-membership', conversationId: '#chan', address: '#chan/bea', joined: true, role: 'moderator', self: false },
      { type: 'room-membership', address: '#chan/cem', joined: true, role: 'participant' },
      { type: 'room-membership', address: '#chan/ada', joined: true, role: 'participant', self: true },
    ]);
  });

  it('honours a non-default PREFIX symbol set and the negotiated casemapping', () => {
    const msg = parseIrcLine(':srv 353 ada = #Foo[1] :%hank ~ida')!;
    expect(namesReplyToEvents(msg, { ...ctx, prefixSymbols: '~&@%+', casemapping: 'ascii' })).toMatchObject([
      { address: '#foo[1]/hank', role: 'moderator' },
      { address: '#foo[1]/ida', role: 'moderator' },
    ]);
  });

  it('returns nothing for a 353 whose target is not a channel', () => {
    const msg = parseIrcLine(':srv 353 ada = ada :ada')!;
    expect(namesReplyToEvents(msg, ctx)).toEqual([]);
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

describe('ircMessageToEvent — TOPIC', () => {
  it('a live TOPIC change → room-topic with the setter and a timestamp', () => {
    expect(ev(':op!o@h TOPIC #Chan :New topic here')).toMatchObject({
      type: 'room-topic',
      conversationId: '#chan',
      topic: 'New topic here',
      setBy: 'op',
      ts: 1000,
    });
  });

  it('332 RPL_TOPIC → room-topic, no setter', () => {
    expect(ev(':srv 332 ada #Chan :Persisted topic')).toEqual({
      type: 'room-topic',
      conversationId: '#chan',
      topic: 'Persisted topic',
      setBy: null,
      ts: null,
    });
  });

  it('331 RPL_NOTOPIC → an empty-string topic (a clear)', () => {
    expect(ev(':srv 331 ada #Chan :No topic is set')).toMatchObject({
      type: 'room-topic',
      conversationId: '#chan',
      topic: '',
    });
  });

  it('a TOPIC for a non-channel target is ignored', () => {
    expect(ev(':op!o@h TOPIC ada :nope')).toBeNull();
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
