import { type XmlElement, child, childText, children, encodeXmlText, text } from './xml-stream';

/**
 * XEP-0363 HTTP File Upload — pure request builder + slot-response parser. Building block for
 * `XmppAdapter.uploadMedia`, not yet wired to it (see `phases/extensions/ext-chat.md` X-chat.1 —
 * `ChatAccountRunner.sendMessage`'s `mediaPath` → `mediaRef` handoff is a separate, larger piece of
 * work this module does not attempt).
 *
 * Flow: `buildUploadSlotRequest` asks the discovered upload service (found via XEP-0030 disco —
 * `disco.ts`, an entity advertising the {@link NS_HTTP_UPLOAD} feature) for a slot; `parseUploadSlot`
 * reads back where to `PUT` the bytes (with any required headers) and the public `GET` url that
 * becomes the message's `mediaRef` once the upload succeeds.
 */

export const NS_HTTP_UPLOAD = 'urn:xmpp:http:upload:0';

export function buildUploadSlotRequest(
  iqId: string,
  to: string,
  filename: string,
  size: number,
  contentType: string,
): string {
  return (
    `<iq type="get" to="${encodeXmlText(to)}" id="${encodeXmlText(iqId)}">` +
    `<request xmlns="${NS_HTTP_UPLOAD}" filename="${encodeXmlText(filename)}" size="${String(Math.max(0, Math.trunc(size)))}"` +
    `${contentType.length > 0 ? ` content-type="${encodeXmlText(contentType)}"` : ''}/>` +
    `</iq>`
  );
}

export interface UploadSlot {
  putUrl: string;
  /** Headers the server requires on the `PUT` (commonly `Authorization` and/or `Cookie`). */
  putHeaders: Record<string, string>;
  /** The public download url — becomes the message's `mediaRef` once the `PUT` succeeds. */
  getUrl: string;
}

/** Read a `<slot/>` result `<iq/>`, or `null` for anything else (an error iq, a malformed slot, a
 *  slot missing either url). Never throws — an unusable slot is the caller's cue to fall back or
 *  surface a send failure, not a parser crash. */
export function parseUploadSlot(iq: XmlElement): UploadSlot | null {
  const slot = child(iq, 'slot', NS_HTTP_UPLOAD);
  if (slot === null) return null;
  const put = child(slot, 'put');
  const get = child(slot, 'get');
  const putUrl = put?.attrs.url;
  const getUrl = get?.attrs.url;
  if (putUrl === undefined || putUrl.length === 0 || getUrl === undefined || getUrl.length === 0) {
    return null;
  }
  const putHeaders: Record<string, string> = {};
  if (put !== null) {
    for (const header of children(put, 'header')) {
      const name = header.attrs.name;
      if (name === undefined || name.length === 0) continue;
      // Only the two headers XEP-0363 actually specifies a server may request — an unknown header
      // name is a slot from a server pushing something this client did not ask to carry, dropped
      // rather than forwarded onto an arbitrary PUT.
      if (name.toLowerCase() !== 'authorization' && name.toLowerCase() !== 'cookie') continue;
      const value = text(header);
      if (value.length > 0) putHeaders[name] = value;
    }
  }
  return { putUrl, putHeaders, getUrl };
}

/** `<error/>` detail for a rejected slot request — XEP-0363 §6.2's `file-too-large` extension when
 *  present, else just the stanza error type/condition. `null` when the iq is not a slot error. */
export interface UploadSlotError {
  condition: string;
  maxFileSize: number | null;
}

export function parseUploadSlotError(iq: XmlElement): UploadSlotError | null {
  if (iq.attrs.type !== 'error') return null;
  const error = child(iq, 'error');
  if (error === null) return null;
  const condition = error.children.find(
    (c): c is XmlElement => typeof c !== 'string' && c.ns === 'urn:ietf:params:xml:ns:xmpp-stanzas',
  )?.local;
  const fileTooLarge = child(error, 'file-too-large', NS_HTTP_UPLOAD);
  const maxText = fileTooLarge !== null ? childText(fileTooLarge, 'max-file-size') : '';
  const maxFileSize = /^\d+$/.test(maxText) ? Number(maxText) : null;
  return { condition: condition ?? 'unknown', maxFileSize };
}
