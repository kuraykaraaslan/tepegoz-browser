import { type XmlElement, child, children, childText, encodeXmlText } from './xml-stream';

/**
 * XEP-0030 Service Discovery — pure. `buildDiscoItems` / `buildDiscoInfo` produce the request `<iq>`;
 * `parseDiscoItems` reads a MUC service's room list, `parseDiscoInfo` reads one entity's identities +
 * features and, for a room, the XEP-0045 `muc#roominfo` extras (occupant count, password / members-only
 * / hidden flags, description). The room browser drives all four.
 */

export const NS_DISCO_ITEMS = 'http://jabber.org/protocol/disco#items';
export const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info';
export const NS_X_DATA = 'jabber:x:data';

export function buildDiscoItems(to: string, iqId: string): string {
  return (
    `<iq type="get" to="${encodeXmlText(to)}" id="${encodeXmlText(iqId)}">` +
    `<query xmlns="${NS_DISCO_ITEMS}"/></iq>`
  );
}

export function buildDiscoInfo(to: string, iqId: string): string {
  return (
    `<iq type="get" to="${encodeXmlText(to)}" id="${encodeXmlText(iqId)}">` +
    `<query xmlns="${NS_DISCO_INFO}"/></iq>`
  );
}

export interface DiscoItem {
  jid: string;
  name: string | null;
}

/** The `<item>`s of a `disco#items` result, or `null` when the iq carries no such query. */
export function parseDiscoItems(iq: XmlElement): DiscoItem[] | null {
  const query = child(iq, 'query', NS_DISCO_ITEMS);
  if (query === null) return null;
  return children(query, 'item')
    .map((item) => ({ jid: item.attrs.jid ?? '', name: item.attrs.name ?? null }))
    .filter((i) => i.jid.length > 0);
}

export interface DiscoIdentity {
  category: string;
  type: string;
  name: string | null;
}

export interface DiscoRoomInfo {
  /** From `muc#roominfo_occupants`, when advertised. */
  occupants: number | null;
  passwordProtected: boolean;
  membersOnly: boolean;
  /** `muc_hidden` — not listed in the public room directory. */
  hidden: boolean;
  description: string | null;
}

export interface DiscoInfo {
  identities: DiscoIdentity[];
  features: string[];
  /** Present only when the entity is a MUC room. */
  room: DiscoRoomInfo | null;
}

function formValues(query: XmlElement): Map<string, string> {
  const out = new Map<string, string>();
  const x = child(query, 'x', NS_X_DATA);
  if (x === null) return out;
  for (const field of children(x, 'field')) {
    const varName = field.attrs.var;
    if (varName === undefined) continue;
    out.set(varName, childText(field, 'value'));
  }
  return out;
}

export function parseDiscoInfo(iq: XmlElement): DiscoInfo | null {
  const query = child(iq, 'query', NS_DISCO_INFO);
  if (query === null) return null;

  const identities: DiscoIdentity[] = children(query, 'identity').map((el) => ({
    category: el.attrs.category ?? '',
    type: el.attrs.type ?? '',
    name: el.attrs.name ?? null,
  }));
  const features = children(query, 'feature')
    .map((el) => el.attrs.var ?? '')
    .filter((v) => v.length > 0);

  const isRoom =
    features.includes('http://jabber.org/protocol/muc') ||
    identities.some((i) => i.category === 'conference' && i.type === 'text');

  let room: DiscoRoomInfo | null = null;
  if (isRoom) {
    const form = formValues(query);
    const occupantsRaw = form.get('muc#roominfo_occupants');
    const occupants =
      occupantsRaw !== undefined && /^\d+$/.test(occupantsRaw) ? Number(occupantsRaw) : null;
    room = {
      occupants,
      passwordProtected: features.includes('muc_passwordprotected'),
      membersOnly: features.includes('muc_membersonly'),
      hidden: features.includes('muc_hidden'),
      description: form.get('muc#roominfo_description') ?? null,
    };
  }

  return { identities, features, room };
}
