import { bareJid, parseJid } from '@tepegoz/chat-core';
import type { ChatContact, ChatEvent, ChatMessage, ChatPresence } from '@tepegoz/shared-types';
import { type XmlElement, child, childText, children, encodeXmlText, text } from './xml-stream';

/**
 * XMPP stanza ⇄ normalized model. Incoming: `stanzaToEvent` maps a parsed `<message>` / `<presence>`
 * / roster-push `<iq>` to a **raw** `ChatEvent` — `@tepegoz/chat-core`'s `normalizeEvent` then
 * validates and capability-gates it, so this layer stays lenient (a stanza it does not understand
 * returns `null`, never throws). Outgoing: small builders that emit well-formed, entity-escaped XML.
 */

export const NS = {
  chatstates: 'http://jabber.org/protocol/chatstates',
  receipts: 'urn:xmpp:receipts',
  markers: 'urn:xmpp:chat-markers:0',
  correction: 'urn:xmpp:message-correct:0',
  retract: 'urn:xmpp:message-retract:1',
  delay: 'urn:xmpp:delay',
  roster: 'jabber:iq:roster',
  stanzaId: 'urn:xmpp:sid:0',
  reactions: 'urn:xmpp:reactions:0',
} as const;

export interface StanzaContext {
  accountId: string;
  /** The connected account's bare JID — a stanza `from` matching it is a carbon / self-echo. */
  selfBareJid: string;
  /** Fallback timestamp (epoch ms) when a stanza carries no `<delay/>`. */
  now: number;
}

/** Conversation id the host resolves against `ChatStore` (unique on `(accountId, address)`). For
 *  1:1 this is the peer bare JID; for `groupchat` it is the room bare JID. */
function convIdFor(peerBareJid: string): string {
  return peerBareJid;
}

function delayTs(el: XmlElement): number | null {
  const delay = child(el, 'delay', NS.delay);
  if (delay === null) return null;
  const stamp = delay.attrs.stamp;
  if (stamp === undefined) return null;
  const t = Date.parse(stamp);
  return Number.isFinite(t) ? t : null;
}

function presenceFromShow(show: string, unavailable: boolean): ChatPresence {
  if (unavailable) return 'offline';
  switch (show) {
    case 'away':
      return 'away';
    case 'xa':
      return 'xa';
    case 'dnd':
      return 'dnd';
    default:
      return 'online';
  }
}

export interface ReactionsStanza {
  /** The message being reacted to. */
  targetId: string;
  /** The reacting party's *complete* current emoji set on that message (XEP-0444 §4: a `<reactions>`
   *  element always carries the full set, never a single add/remove). */
  emojis: string[];
}

/** Parse a XEP-0444 `<message><reactions id=…><reaction>…</reaction>…</reactions></message>`. Pure —
 *  the adapter owns diffing this against what it last knew for that (message, sender) pair. */
export function parseReactionsStanza(el: XmlElement): ReactionsStanza | null {
  const reactions = child(el, 'reactions', NS.reactions);
  const targetId = reactions?.attrs.id;
  if (reactions === null || targetId === undefined || targetId.length === 0) return null;
  const emojis = children(reactions, 'reaction', NS.reactions)
    .map((r) => text(r))
    .filter((e) => e.length > 0);
  return { targetId, emojis };
}

function messageEvent(el: XmlElement, ctx: StanzaContext): ChatEvent | null {
  const from = el.attrs.from ?? '';
  const to = el.attrs.to ?? '';
  const type = el.attrs.type ?? 'normal';
  const isGroup = type === 'groupchat';
  const peer = isGroup ? bareJid(from) : bareJid(from) ?? bareJid(to);
  if (peer === null || peer.length === 0) return null;
  const conversationId = convIdFor(peer);
  const ts = delayTs(el) ?? ctx.now;

  // XEP-0308 correction
  const replace = child(el, 'replace', NS.correction);
  const bodyText = childText(el, 'body');
  if (replace !== null && replace.attrs.id !== undefined) {
    if (bodyText.length === 0) return null;
    return {
      type: 'message-edit',
      conversationId,
      protocolId: replace.attrs.id,
      body: bodyText,
      editedAt: ts,
    };
  }

  // XEP-0424 retraction
  const retract = child(el, 'retract', NS.retract);
  if (retract !== null && retract.attrs.id !== undefined) {
    return {
      type: 'message-redact',
      conversationId,
      protocolId: retract.attrs.id,
      redactedAt: ts,
    };
  }

  // XEP-0184 delivery receipt / XEP-0333 read marker
  const received = child(el, 'received', NS.receipts);
  const displayed = child(el, 'displayed', NS.markers);
  const marker = received ?? displayed;
  if (marker !== null && marker.attrs.id !== undefined) {
    return {
      type: 'receipt',
      receipt: {
        conversationId,
        messageId: marker.attrs.id,
        byAddress: bareJid(from) ?? from,
        kind: displayed !== null ? 'read' : 'delivered',
        ts,
      },
    };
  }

  // XEP-0085 chat states (no body → a state notification)
  if (bodyText.length === 0) {
    for (const state of ['composing', 'paused', 'active', 'inactive', 'gone'] as const) {
      if (child(el, state, NS.chatstates) !== null) {
        return {
          type: 'typing',
          conversationId,
          senderAddress: isGroup ? from : (bareJid(from) ?? from),
          active: state === 'composing',
        };
      }
    }
    return null; // an empty message with nothing we model
  }

  const stanzaId = child(el, 'stanza-id', NS.stanzaId)?.attrs.id;
  const protocolId = el.attrs.id ?? stanzaId ?? `${String(ts)}-${from}`;
  const senderAddress = isGroup ? from : (bareJid(from) ?? from);
  const senderName = isGroup && parseJid(from)?.resource !== null ? (parseJid(from)?.resource ?? '') : '';

  const message: ChatMessage = {
    id: protocolId,
    conversationId,
    accountId: ctx.accountId,
    protocolId,
    senderAddress,
    senderName,
    kind: 'text',
    body: bodyText,
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

function presenceEvent(el: XmlElement, ctx: StanzaContext): ChatEvent | null {
  const from = el.attrs.from ?? '';
  const bare = bareJid(from);
  if (bare === null || bare.length === 0 || bare === ctx.selfBareJid) return null;
  const type = el.attrs.type ?? '';
  if (type === 'subscribe' || type === 'subscribed' || type === 'unsubscribe' || type === 'unsubscribed') {
    return null; // subscription workflow handled elsewhere
  }
  const unavailable = type === 'unavailable';
  return {
    type: 'presence',
    accountId: ctx.accountId,
    // The FULL JID (resource included) — a contact may have several connected resources; the
    // presence tracker in @tepegoz/chat-core folds them into one effective presence per bare JID.
    address: from,
    presence: presenceFromShow(childText(el, 'show'), unavailable),
    statusText: childText(el, 'status').slice(0, 512),
  };
}

/** Map a `<item/>` from `jabber:iq:roster` (a get result or a push) to a `ChatContact`. */
export function rosterItemToContact(item: XmlElement, accountId: string): ChatContact {
  const jid = item.attrs.jid ?? '';
  const subscription = item.attrs.subscription ?? 'none';
  const removed = subscription === 'remove';
  const groups = item.children
    .filter((c): c is XmlElement => typeof c !== 'string' && c.local === 'group')
    .map((g) => text(g))
    .filter((g) => g.length > 0)
    .slice(0, 64);
  return {
    id: `${accountId}:${jid}`,
    accountId,
    address: jid,
    name: item.attrs.name ?? '',
    groups,
    presence: 'offline',
    statusText: '',
    subscription: removed
      ? 'none'
      : subscription === 'both' || subscription === 'to' || subscription === 'from'
        ? subscription
        : 'none',
  };
}

function rosterPushEvent(el: XmlElement, ctx: StanzaContext): ChatEvent | null {
  if ((el.attrs.type ?? '') !== 'set') return null;
  const query = child(el, 'query', NS.roster);
  if (query === null) return null;
  const item = child(query, 'item');
  if (item === null || item.attrs.jid === undefined) return null;
  return {
    type: 'roster-change',
    removed: (item.attrs.subscription ?? '') === 'remove',
    contact: rosterItemToContact(item, ctx.accountId),
  };
}

/** Map one parsed top-level stanza to a raw `ChatEvent`, or `null` if we do not model it. */
export function stanzaToEvent(el: XmlElement, ctx: StanzaContext): ChatEvent | null {
  switch (el.local) {
    case 'message':
      return messageEvent(el, ctx);
    case 'presence':
      return presenceEvent(el, ctx);
    case 'iq':
      return rosterPushEvent(el, ctx);
    default:
      return null;
  }
}

// ── outgoing builders ───────────────────────────────────────────────────────

function attrs(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => ` ${k}="${encodeXmlText(v)}"`)
    .join('');
}

export interface OutgoingChatMessage {
  to: string;
  body: string;
  id: string;
  /** groupchat vs chat. */
  groupchat?: boolean;
  /** XEP-0308: this message corrects a previous one. */
  replaceId?: string;
  /** Request a XEP-0184 delivery receipt. */
  requestReceipt?: boolean;
}

export function buildMessage(m: OutgoingChatMessage): string {
  const parts = [`<body>${encodeXmlText(m.body)}</body>`];
  if (m.replaceId !== undefined) {
    parts.push(`<replace${attrs({ id: m.replaceId, xmlns: NS.correction })}/>`);
  }
  if (m.requestReceipt === true) parts.push(`<request${attrs({ xmlns: NS.receipts })}/>`);
  parts.push(`<active${attrs({ xmlns: NS.chatstates })}/>`);
  return `<message${attrs({ to: m.to, id: m.id, type: m.groupchat === true ? 'groupchat' : 'chat' })}>${parts.join('')}</message>`;
}

export function buildChatState(to: string, state: 'composing' | 'paused' | 'active'): string {
  return `<message${attrs({ to, type: 'chat' })}><${state}${attrs({ xmlns: NS.chatstates })}/></message>`;
}

export function buildReceipt(to: string, messageId: string): string {
  return `<message${attrs({ to })}><received${attrs({ xmlns: NS.receipts, id: messageId })}/></message>`;
}

export function buildReadMarker(to: string, messageId: string): string {
  return `<message${attrs({ to })}><displayed${attrs({ xmlns: NS.markers, id: messageId })}/></message>`;
}

/** XEP-0444: always the caller's *complete* current reaction set on `targetId` — an empty `emojis`
 *  clears every reaction of theirs on that message. */
export function buildReactions(
  to: string,
  targetId: string,
  emojis: readonly string[],
  groupchat = false,
): string {
  const reactionEls = emojis.map((e) => `<reaction>${encodeXmlText(e)}</reaction>`).join('');
  return (
    `<message${attrs({ to, type: groupchat ? 'groupchat' : 'chat' })}>` +
    `<reactions${attrs({ xmlns: NS.reactions, id: targetId })}>${reactionEls}</reactions>` +
    `</message>`
  );
}

/** RFC 6121 §2.3.1: add `jid` to the roster (no groups, no name) — the server roster-pushes the new
 *  item back, which `rosterPushEvent` already turns into a `roster-change` event. Adding to the
 *  roster and asking to see the contact's presence are two separate RFC 6121 steps (this + the
 *  presence subscription request below); most servers do not do one without the other. */
export function buildRosterAdd(iqId: string, jid: string): string {
  return (
    `<iq type="set" id="${encodeXmlText(iqId)}">` +
    `<query xmlns="${NS.roster}"><item${attrs({ jid })}/></query>` +
    `</iq>`
  );
}

/** RFC 6121 §3.1: ask to see `jid`'s presence. The contact must approve for `subscription` to ever
 *  reach `to`/`both` — until then the roster item stays at `none`/`from`, same as any other pending
 *  add, which the UI already renders as "Awaiting response" (`RosterPanel`'s `pending` marker). */
export function buildSubscribeRequest(jid: string): string {
  return `<presence${attrs({ to: jid, type: 'subscribe' })}/>`;
}

export function buildPresence(show?: 'away' | 'xa' | 'dnd', status?: string): string {
  const inner = [
    show !== undefined ? `<show>${encodeXmlText(show)}</show>` : '',
    status !== undefined && status.length > 0 ? `<status>${encodeXmlText(status)}</status>` : '',
  ].join('');
  return inner.length === 0 ? '<presence/>' : `<presence>${inner}</presence>`;
}
