import type { ChatMessage } from '@tepegoz/shared-types';
import { type StanzaContext, stanzaToEvent } from './stanzas';
import { type XmlElement, child, childText, encodeXmlText } from './xml-stream';

/**
 * XEP-0313 Message Archive Management — the query builder + result/`<fin/>` parsers. Pure. The
 * adapter registers a sink for the streamed `<message><result/>` items (see `XmppSession.request`)
 * and calls these to turn them into `ChatMessage`s and to read the RSM cursor for the next page.
 */

export const NS_MAM = 'urn:xmpp:mam:2';
const NS_FORWARD = 'urn:xmpp:forward:0';
const NS_RSM = 'http://jabber.org/protocol/rsm';
const NS_XDATA = 'jabber:x:data';
const NS_DELAY = 'urn:xmpp:delay';

export interface MamQuery {
  queryId: string;
  /** Restrict to a conversation partner (bare JID); omit for the whole archive. Meaningless (and
   *  omitted by the caller) alongside {@link to} — a room archive is already scoped to that room. */
  withJid?: string;
  /** Page size (RSM `<max>`). */
  max?: number;
  /** RSM `<before>` cursor from a previous page's `nextCursor`; `''` / omitted → the most recent page. */
  before?: string;
  /** Route the query to this JID's own archive instead of the account's personal one — a MUC room's
   *  history lives in the room's archive (XEP-0313 §5), not reflected into every member's archive. */
  to?: string;
}

/** Build the MAM `<iq type="set">`. The `queryid` equals the iq id so the adapter's result sink
 *  (keyed by iq id) matches the streamed `<result queryid=…>` items. */
export function buildMamQuery(q: MamQuery): string {
  const fields = [
    `<field var="FORM_TYPE" type="hidden"><value>${NS_MAM}</value></field>`,
    q.withJid !== undefined && q.withJid.length > 0
      ? `<field var="with"><value>${encodeXmlText(q.withJid)}</value></field>`
      : '',
  ].join('');
  const rsm = [
    `<max>${String(q.max ?? 50)}</max>`,
    q.before !== undefined ? `<before>${encodeXmlText(q.before)}</before>` : '<before/>',
  ].join('');
  const to = q.to !== undefined && q.to.length > 0 ? ` to="${encodeXmlText(q.to)}"` : '';
  return (
    `<iq type="set" id="${encodeXmlText(q.queryId)}"${to}>` +
    `<query xmlns="${NS_MAM}" queryid="${encodeXmlText(q.queryId)}">` +
    `<x xmlns="${NS_XDATA}" type="submit">${fields}</x>` +
    `<set xmlns="${NS_RSM}">${rsm}</set>` +
    `</query></iq>`
  );
}

/** Turn one streamed `<message><result/>` into a `ChatMessage`, or `null` if it is not one we model. */
export function parseMamResult(resultEl: XmlElement, ctx: StanzaContext): ChatMessage | null {
  const result = resultEl.local === 'result' ? resultEl : child(resultEl, 'result', NS_MAM);
  if (result === null) return null;
  const forwarded = child(result, 'forwarded', NS_FORWARD);
  if (forwarded === null) return null;
  const inner = child(forwarded, 'message');
  if (inner === null) return null;

  const stamp = child(forwarded, 'delay', NS_DELAY)?.attrs.stamp;
  const ts = stamp !== undefined ? Date.parse(stamp) : NaN;
  const event = stanzaToEvent(inner, {
    ...ctx,
    now: Number.isFinite(ts) ? ts : ctx.now,
  });
  if (event === null || event.type !== 'message') return null;

  // The archive id (`<result id=…>`) is the stable per-message id; prefer it as the protocol id.
  const archiveId = result.attrs.id;
  return archiveId !== undefined && archiveId.length > 0
    ? { ...event.message, protocolId: archiveId, id: archiveId }
    : event.message;
}

export interface MamFin {
  complete: boolean;
  /** RSM `<first>` — the cursor for an even older page. */
  firstCursor: string | null;
  /** RSM `<last>` — the newest id in this page. */
  lastCursor: string | null;
  count: number | null;
}

/** Parse the terminal `<iq type="result"><fin/></iq>` (the element passed is the `<iq/>`). */
export function parseMamFin(iqEl: XmlElement): MamFin {
  const fin = child(iqEl, 'fin', NS_MAM);
  if (fin === null) {
    return { complete: true, firstCursor: null, lastCursor: null, count: null };
  }
  const set = child(fin, 'set', NS_RSM);
  const count = set === null ? NaN : Number.parseInt(childText(set, 'count'), 10);
  const first = set === null ? '' : childText(set, 'first');
  const last = set === null ? '' : childText(set, 'last');
  return {
    complete: fin.attrs.complete === 'true',
    firstCursor: first.length > 0 ? first : null,
    lastCursor: last.length > 0 ? last : null,
    count: Number.isFinite(count) ? count : null,
  };
}
