import { bareJid, parseJid } from '@tepegoz/chat-core';
import type { ChatPresence } from '@tepegoz/shared-types';
import { type XmlElement, child, childText, children, encodeXmlText } from './xml-stream';

/**
 * XEP-0045 Multi-User Chat primitives — pure. Outgoing: the join / leave / subject / invite stanzas.
 * Incoming: `parseMucPresence` turns a room `<presence>` into a {@link MucOccupant} (affiliation, role,
 * real JID when the room is non-anonymous, the self marker from status 110), `parseMucSubject` reads a
 * room's topic, `parseMucError` classifies a bounce (wrong password, banned, nick taken, …). Anything
 * it does not recognise returns `null` — the adapter layer decides what to do.
 */

export const NS_MUC = 'http://jabber.org/protocol/muc';
export const NS_MUC_USER = 'http://jabber.org/protocol/muc#user';

export const MUC_AFFILIATIONS = ['owner', 'admin', 'member', 'outcast', 'none'] as const;
export type MucAffiliation = (typeof MUC_AFFILIATIONS)[number];

export const MUC_ROLES = ['moderator', 'participant', 'visitor', 'none'] as const;
export type MucRole = (typeof MUC_ROLES)[number];

export interface MucOccupant {
  /** Bare room JID (`room@service`). */
  roomJid: string;
  /** The occupant's nick — the resource part of the room JID. */
  nick: string;
  /** The occupant's real bare JID, when the room exposes it (non-anonymous / you are a moderator). */
  realJid: string | null;
  affiliation: MucAffiliation;
  role: MucRole;
  presence: ChatPresence;
  statusText: string;
  /** True when this presence is about the connected account (MUC status code 110). */
  self: boolean;
  /** Raw MUC status codes on the presence (110 self, 201 room-created, 210 nick-assigned, …). */
  statusCodes: number[];
}

export interface MucJoinOptions {
  /** Password for a members-only / password-protected room. */
  password?: string;
  /** Cap the history the server replays on join (`0` = none). */
  historyMaxStanzas?: number;
  /** Only replay history at or after this ISO-8601 instant. */
  historySince?: string;
}

function occupantJid(roomJid: string, nick: string): string {
  return `${roomJid}/${nick}`;
}

export function buildMucJoin(roomJid: string, nick: string, options: MucJoinOptions = {}): string {
  const x: string[] = [];
  if (options.password !== undefined && options.password.length > 0) {
    x.push(`<password>${encodeXmlText(options.password)}</password>`);
  }
  const historyAttrs: string[] = [];
  if (options.historyMaxStanzas !== undefined && options.historyMaxStanzas >= 0) {
    historyAttrs.push(`maxstanzas="${Math.floor(options.historyMaxStanzas)}"`);
  }
  if (options.historySince !== undefined) {
    historyAttrs.push(`since="${encodeXmlText(options.historySince)}"`);
  }
  if (historyAttrs.length > 0) x.push(`<history ${historyAttrs.join(' ')}/>`);

  return (
    `<presence to="${encodeXmlText(occupantJid(roomJid, nick))}">` +
    `<x xmlns="${NS_MUC}">${x.join('')}</x>` +
    `</presence>`
  );
}

export function buildMucLeave(roomJid: string, nick: string, status?: string): string {
  const inner =
    status !== undefined && status.length > 0 ? `<status>${encodeXmlText(status)}</status>` : '';
  return `<presence to="${encodeXmlText(occupantJid(roomJid, nick))}" type="unavailable">${inner}</presence>`;
}

export function buildMucChangeSubject(roomJid: string, subject: string): string {
  return (
    `<message to="${encodeXmlText(roomJid)}" type="groupchat">` +
    `<subject>${encodeXmlText(subject)}</subject>` +
    `</message>`
  );
}

export function buildMucInvite(roomJid: string, inviteeJid: string, reason?: string): string {
  const reasonEl =
    reason !== undefined && reason.length > 0 ? `<reason>${encodeXmlText(reason)}</reason>` : '';
  return (
    `<message to="${encodeXmlText(roomJid)}">` +
    `<x xmlns="${NS_MUC_USER}"><invite to="${encodeXmlText(inviteeJid)}">${reasonEl}</invite></x>` +
    `</message>`
  );
}

function normAffiliation(value: string | undefined): MucAffiliation {
  return (MUC_AFFILIATIONS as readonly string[]).includes(value ?? '')
    ? (value as MucAffiliation)
    : 'none';
}

function normRole(value: string | undefined): MucRole {
  return (MUC_ROLES as readonly string[]).includes(value ?? '') ? (value as MucRole) : 'none';
}

function statusCodesOf(x: XmlElement): number[] {
  return children(x, 'status')
    .map((s) => Number.parseInt(s.attrs.code ?? '', 10))
    .filter((n) => Number.isInteger(n));
}

function presenceOf(el: XmlElement): ChatPresence {
  if (el.attrs.type === 'unavailable') return 'offline';
  switch (childText(el, 'show')) {
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

/** A room `<presence>` (has an `x` in the `muc#user` namespace). Returns `null` for a plain presence. */
export function parseMucPresence(el: XmlElement): MucOccupant | null {
  if (el.name !== 'presence') return null;
  const x = child(el, 'x', NS_MUC_USER);
  if (x === null) return null;

  const from = parseJid(el.attrs.from ?? '');
  if (from === null || from.resource === null) return null;
  const roomJid = bareJid(el.attrs.from ?? '');
  if (roomJid === null) return null;

  const item = child(x, 'item');
  const codes = statusCodesOf(x);

  return {
    roomJid,
    nick: from.resource,
    realJid: item?.attrs.jid !== undefined ? bareJid(item.attrs.jid) : null,
    affiliation: normAffiliation(item?.attrs.affiliation),
    role: normRole(item?.attrs.role),
    presence: presenceOf(el),
    statusText: childText(el, 'status').slice(0, 512),
    self: codes.includes(110),
    statusCodes: codes,
  };
}

export interface MucSubject {
  roomJid: string;
  nick: string | null;
  subject: string;
}

/** A `<message type="groupchat">` carrying a `<subject>` and no `<body>` (a topic change). */
export function parseMucSubject(el: XmlElement): MucSubject | null {
  if (el.name !== 'message' || el.attrs.type !== 'groupchat') return null;
  const subject = child(el, 'subject');
  if (subject === null || child(el, 'body') !== null) return null;
  const roomJid = bareJid(el.attrs.from ?? '');
  if (roomJid === null) return null;
  return { roomJid, nick: parseJid(el.attrs.from ?? '')?.resource ?? null, subject: childText(el, 'subject') };
}

export type MucErrorCondition =
  | 'not-authorized'
  | 'forbidden'
  | 'registration-required'
  | 'conflict'
  | 'not-allowed'
  | 'jid-malformed'
  | 'service-unavailable'
  | 'item-not-found'
  | 'unknown';

const KNOWN_CONDITIONS: readonly MucErrorCondition[] = [
  'not-authorized',
  'forbidden',
  'registration-required',
  'conflict',
  'not-allowed',
  'jid-malformed',
  'service-unavailable',
  'item-not-found',
];

export interface MucError {
  roomJid: string;
  nick: string | null;
  condition: MucErrorCondition;
}

/** A bounced join / message: `<presence type="error">` or `<message type="error">` from a room. */
export function parseMucError(el: XmlElement): MucError | null {
  if (el.attrs.type !== 'error') return null;
  const roomJid = bareJid(el.attrs.from ?? '');
  if (roomJid === null) return null;
  const error = child(el, 'error');
  let condition: MucErrorCondition = 'unknown';
  if (error !== null) {
    const named = error.children.find(
      (c): c is XmlElement =>
        typeof c !== 'string' && (KNOWN_CONDITIONS as readonly string[]).includes(c.local),
    );
    if (named !== undefined) condition = named.local as MucErrorCondition;
  }
  return { roomJid, nick: parseJid(el.attrs.from ?? '')?.resource ?? null, condition };
}
