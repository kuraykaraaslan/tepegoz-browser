import { type XmlElement, child, children, text } from './xml-stream';

/**
 * `<stream:features>` parsing (RFC 6120 §4.3.2). Pure: turn the features element into a typed
 * snapshot the negotiation state machine reads. Absent features are simply `false` / empty — a
 * server that offers nothing is a server we cannot proceed with, decided by the caller, not here.
 */

const NS_TLS = 'urn:ietf:params:xml:ns:xmpp-tls';
const NS_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl';
const NS_BIND = 'urn:ietf:params:xml:ns:xmpp-bind';
const NS_SESSION = 'urn:ietf:params:xml:ns:xmpp-session';
const NS_SM = 'urn:xmpp:sm:3';
const NS_CSI = 'urn:xmpp:csi:0';

export interface StreamFeatures {
  /** STARTTLS is offered. */
  startTls: boolean;
  /** STARTTLS is offered AND marked `<required/>`. */
  startTlsRequired: boolean;
  /** SASL mechanism names, upper-cased, in server order. */
  mechanisms: string[];
  /** Resource binding is offered (post-auth). */
  bind: boolean;
  /** Legacy `<session/>` is offered (RFC 3921; usually a no-op today). */
  session: boolean;
  /** XEP-0198 stream management is offered. */
  streamManagement: boolean;
  /** XEP-0352 client state indication is offered. */
  clientStateIndication: boolean;
  /** SASL2 / other unknown feature local names (for logging / future use). */
  other: string[];
}

const KNOWN = new Set([
  'starttls',
  'mechanisms',
  'bind',
  'session',
  'sm',
  'csi',
  'c', // caps
  'ver', // rosterver
]);

export function parseStreamFeatures(el: XmlElement): StreamFeatures {
  const tls = child(el, 'starttls', NS_TLS);
  const mechEl = child(el, 'mechanisms', NS_SASL);
  const mechanisms =
    mechEl === null
      ? []
      : children(mechEl, 'mechanism')
          .map((m) => text(m).trim().toUpperCase())
          .filter((m) => m.length > 0);

  const other: string[] = [];
  for (const c of el.children) {
    if (typeof c !== 'string' && !KNOWN.has(c.local)) other.push(c.local);
  }

  return {
    startTls: tls !== null,
    startTlsRequired: tls !== null && child(tls, 'required') !== null,
    mechanisms,
    bind: child(el, 'bind', NS_BIND) !== null,
    session: child(el, 'session', NS_SESSION) !== null,
    streamManagement: child(el, 'sm', NS_SM) !== null,
    clientStateIndication: child(el, 'csi', NS_CSI) !== null,
    other,
  };
}

/**
 * Pick a SASL mechanism, most-preferred first: SCRAM-SHA-256(-PLUS) > SCRAM-SHA-1(-PLUS) > PLAIN.
 * `-PLUS` variants (channel binding) are only chosen when `channelBindingAvailable` — otherwise a
 * downgrade-attack check server-side would reject us. `PLAIN` is only returned when `tlsActive`
 * (never send a password in the clear).
 */
export function pickSaslMechanism(
  offered: readonly string[],
  opts: { tlsActive: boolean; channelBindingAvailable?: boolean },
): string | null {
  const set = new Set(offered.map((m) => m.toUpperCase()));
  const order = opts.channelBindingAvailable === true
    ? ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256', 'SCRAM-SHA-1-PLUS', 'SCRAM-SHA-1']
    : ['SCRAM-SHA-256', 'SCRAM-SHA-1'];
  for (const m of order) {
    if (set.has(m)) return m;
  }
  if (opts.tlsActive && set.has('PLAIN')) return 'PLAIN';
  return null;
}
