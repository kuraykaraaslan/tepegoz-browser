import { type ChatAdapterCaps, ChatAdapterCapsSchema, type ChatProtocol } from '@tepegoz/shared-types';

/**
 * Per-protocol capability presets — the *maximum* a protocol can do. A live connection narrows these
 * (a server without MAM loses `historySync`; OMEMO/Megolm `e2ee` only becomes true once X-chat.7
 * lands the crypto). The UI and the agent tools degrade against the negotiated caps, never the
 * preset.
 */

const full = (over: Partial<ChatAdapterCaps>): ChatAdapterCaps => ChatAdapterCapsSchema.parse(over);

/** XMPP (RFC 6120/6121 + XEPs): receipts (0184), typing (0085), edits (0308), reactions (0444),
 *  OMEMO e2ee (0384), HTTP upload media (0363), presence, MAM history (0313), MUC rooms (0045).
 *  Threads are not a first-class XMPP concept → false. */
export const XMPP_CAPS: ChatAdapterCaps = full({
  receipts: true,
  typing: true,
  edits: true,
  reactions: true,
  threads: false,
  e2ee: true,
  media: true,
  presence: true,
  historySync: true,
  rooms: true,
});

/** IRC (RFC 2812 + IRCv3): no encryption, no edits, no reactions, no delivery receipts. `chathistory`
 *  gives limited history sync; channels are rooms; `away-notify` gives coarse presence. */
export const IRC_CAPS: ChatAdapterCaps = full({
  receipts: false,
  typing: false,
  edits: false,
  reactions: false,
  threads: false,
  e2ee: false,
  media: false,
  presence: true,
  historySync: true,
  rooms: true,
});

/** Matrix Client-Server API: the broadest — receipts, typing, edits (`m.replace`), reactions,
 *  threads (`m.thread`), Olm/Megolm e2ee (X-chat.7), media repo, presence, `/sync` history, rooms +
 *  spaces. */
export const MATRIX_CAPS: ChatAdapterCaps = full({
  receipts: true,
  typing: true,
  edits: true,
  reactions: true,
  threads: true,
  e2ee: true,
  media: true,
  presence: true,
  historySync: true,
  rooms: true,
});

/** Everything off — the safe default for a bridge until it declares what it actually supports. */
export const BRIDGE_DEFAULT_CAPS: ChatAdapterCaps = full({});

const PRESETS: Record<ChatProtocol, ChatAdapterCaps> = {
  xmpp: XMPP_CAPS,
  irc: IRC_CAPS,
  matrix: MATRIX_CAPS,
  bridge: BRIDGE_DEFAULT_CAPS,
};

export function capsFor(protocol: ChatProtocol): ChatAdapterCaps {
  return { ...PRESETS[protocol] };
}

/**
 * Narrow a preset with what a connection actually negotiated. Narrow only — a connection can turn a
 * capability OFF (server lacks MAM) but never ON beyond the protocol preset, so a buggy/hostile
 * server response cannot make the UI offer a feature the wire cannot carry.
 */
export function negotiateCaps(
  preset: ChatAdapterCaps,
  observed: Partial<ChatAdapterCaps>,
): ChatAdapterCaps {
  const out = { ...preset };
  for (const key of Object.keys(out) as (keyof ChatAdapterCaps)[]) {
    if (observed[key] === false) out[key] = false;
  }
  return out;
}
