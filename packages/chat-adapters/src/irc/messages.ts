import { parseIrcPrefix } from '@tepegoz/chat-core';
import type { ChatEvent, ChatMessage } from '@tepegoz/shared-types';
import type { IrcMessage } from './parse';

/**
 * IRC message ⇄ normalized model. Incoming: `ircMessageToEvent` maps `PRIVMSG` / `NOTICE` / `JOIN` /
 * `PART` / `QUIT` / `KICK` / numeric replies to a **raw** `ChatEvent` — `@tepegoz/chat-core`'s
 * `normalizeEvent` validates and capability-gates it, so this layer stays lenient (anything it does
 * not model returns `null`, never throws). Outgoing: small line builders.
 *
 * IRC has no message ids without IRCv3 `message-tags`, so `protocolId` falls back to a synthetic
 * `time~nick~body` key — best-effort dedup for a `chathistory` replay that overlaps the live stream.
 */

/**
 * ISUPPORT `CASEMAPPING` values we honour. `ascii` folds only `A–Z`; `rfc1459` additionally folds
 * `[]\^` → `{}|~` (the "{}|~ are the lowercase of []\^" rule); `rfc1459-strict` is `rfc1459` without
 * the `^` → `~` mapping. Anything else a server advertises falls back to `rfc1459` (RFC 2812).
 */
export type IrcCasemapping = 'ascii' | 'rfc1459' | 'rfc1459-strict';

export const IRC_CASEMAPPINGS: readonly IrcCasemapping[] = ['ascii', 'rfc1459', 'rfc1459-strict'];

/** Narrow a raw ISUPPORT token to a known {@link IrcCasemapping}, or `null` if unrecognised. */
export function asIrcCasemapping(raw: string | boolean | undefined): IrcCasemapping | null {
  return typeof raw === 'string' && (IRC_CASEMAPPINGS as readonly string[]).includes(raw)
    ? (raw as IrcCasemapping)
    : null;
}

export interface IrcContext {
  accountId: string;
  /** The connected nick — used to mark a room-membership change as `self`. */
  selfNick: string;
  /** Channel-type prefixes from ISUPPORT `CHANTYPES` (default `#&`). */
  chanTypes: string;
  /** ISUPPORT `CASEMAPPING` (default `rfc1459`) — decides how a target folds to a conversation id. */
  casemapping?: IrcCasemapping;
  /** Wall-clock ms used when a line has no `server-time` tag. */
  now: number;
}

const CTCP = String.fromCharCode(1);

function tagTime(msg: IrcMessage, fallback: number): number {
  const t = msg.tags.time;
  if (t === undefined) return fallback;
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isChannel(target: string, chanTypes: string): boolean {
  return target.length > 0 && chanTypes.includes(target[0] ?? '');
}

const RFC1459_EXTRA: Record<string, string> = { '[': '{', ']': '}', '\\': '|', '^': '~' };
const RFC1459_STRICT_EXTRA: Record<string, string> = { '[': '{', ']': '}', '\\': '|' };

/**
 * Lowercase a channel/nick for use as a conversation id, honouring the negotiated ISUPPORT
 * `CASEMAPPING`. Fold-only: `A–Z` always map down; `rfc1459` / `rfc1459-strict` additionally map the
 * bracket set. A server changing casemapping cannot make two previously-distinct ids collide in a way
 * that crosses a channel/DM boundary — the channel-type prefix is never in the folded set.
 */
export function foldIrcTarget(target: string, mapping: IrcCasemapping = 'rfc1459'): string {
  const extra =
    mapping === 'rfc1459' ? RFC1459_EXTRA : mapping === 'rfc1459-strict' ? RFC1459_STRICT_EXTRA : null;
  let out = '';
  for (const ch of target) {
    if (ch >= 'A' && ch <= 'Z') out += ch.toLowerCase();
    else out += extra?.[ch] ?? ch;
  }
  return out;
}

function synthProtocolId(ts: number, nick: string, body: string): string {
  return `${String(ts)}~${nick}~${body.slice(0, 40)}`;
}

function messageEvent(msg: IrcMessage, ctx: IrcContext, notice: boolean): ChatEvent | null {
  const from = parseIrcPrefix(msg.prefix ?? '');
  const [target, rawBody] = msg.params;
  if (from === null || target === undefined || rawBody === undefined || rawBody === '') return null;

  const channel = isChannel(target, ctx.chanTypes);
  const conversationId = channel
    ? foldIrcTarget(target, ctx.casemapping)
    : foldIrcTarget(from.nick, ctx.casemapping);
  const ts = tagTime(msg, ctx.now);

  let body = rawBody;
  let kind: ChatMessage['kind'] = 'text';
  if (body.startsWith(CTCP) && body.endsWith(CTCP)) {
    const inner = body.slice(1, -1);
    if (inner.startsWith('ACTION ')) body = `/me ${inner.slice(7)}`;
    else return null; // a non-ACTION CTCP (VERSION, PING…) is protocol chatter, not a message
  }
  if (notice) kind = 'system';

  const protocolId = msg.tags.msgid ?? synthProtocolId(ts, from.nick, body);
  const message: ChatMessage = {
    id: protocolId,
    conversationId,
    accountId: ctx.accountId,
    protocolId,
    senderAddress: from.nick,
    senderName: from.nick,
    kind,
    body,
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: ts,
    receivedAt: ctx.now,
    deliveryState: 'delivered',
  };
  return { type: 'message', message };
}

function membershipEvent(
  msg: IrcMessage,
  ctx: IrcContext,
  joined: boolean,
  channelParamIndex = 0,
): ChatEvent | null {
  const from = parseIrcPrefix(msg.prefix ?? '');
  const channel = msg.params[channelParamIndex];
  if (from === null || channel === undefined || !isChannel(channel, ctx.chanTypes)) return null;
  const folded = foldIrcTarget(channel, ctx.casemapping);
  return {
    type: 'room-membership',
    conversationId: folded,
    address: `${folded}/${from.nick}`,
    joined,
    memberCount: 0,
    self: from.nick === ctx.selfNick,
    affiliation: 'none',
    role: 'participant',
    realJid: from.user !== null && from.host !== null ? `${from.user}@${from.host}` : null,
  };
}

/** Map one parsed line to a raw event, or `null` when it is not something we surface. */
export function ircMessageToEvent(msg: IrcMessage, ctx: IrcContext): ChatEvent | null {
  switch (msg.command) {
    case 'PRIVMSG':
      return messageEvent(msg, ctx, false);
    case 'NOTICE':
      return messageEvent(msg, ctx, true);
    case 'JOIN':
      return membershipEvent(msg, ctx, true);
    case 'PART':
      return membershipEvent(msg, ctx, false);
    case 'KICK':
      // KICK <channel> <nick> [:reason] — the kicked nick is param 1, not the sender.
      return membershipEvent(
        { ...msg, prefix: msg.params[1] ?? '' },
        ctx,
        false,
        0,
      );
    case 'QUIT': {
      // QUIT has no channel — we cannot attribute it to one room here; the adapter tracks
      // per-channel membership and re-emits. Surface nothing at the parse layer.
      return null;
    }
    default:
      return null;
  }
}

// ── outbound builders ───────────────────────────────────────────────────────
// The message / reason text is always the `:trailing` argument — a one-word body would otherwise be
// ambiguous, and an empty one is only expressible as trailing.

export function buildIrcPrivmsg(target: string, body: string): string {
  return `PRIVMSG ${target} :${body}`;
}

export function buildIrcAction(target: string, action: string): string {
  return `PRIVMSG ${target} :${CTCP}ACTION ${action}${CTCP}`;
}

export function buildIrcJoin(channel: string, key?: string): string {
  return key !== undefined && key.length > 0 ? `JOIN ${channel} ${key}` : `JOIN ${channel}`;
}

export function buildIrcPart(channel: string, reason?: string): string {
  return reason !== undefined && reason.length > 0
    ? `PART ${channel} :${reason}`
    : `PART ${channel}`;
}

export function buildIrcNick(nick: string): string {
  return `NICK ${nick}`;
}

export function buildIrcAway(message?: string): string {
  return message !== undefined && message.length > 0 ? `AWAY :${message}` : 'AWAY';
}
