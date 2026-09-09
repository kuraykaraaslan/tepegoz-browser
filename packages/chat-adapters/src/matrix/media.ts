/**
 * Matrix media-repository URI helpers — pure. An `mxc://` uri names an attachment on a homeserver's
 * content repository; the authenticated CS-API (MSC3916, stable since v1.11) serves the bytes from
 * `/_matrix/client/v1/media`. Everything here is string building — the Node-free adapter never
 * touches the bytes; the desktop host performs the egress-bound GET and quarantines the result.
 */

const MEDIA_V1 = '/_matrix/client/v1/media';

/** Legacy unauthenticated upload endpoint — still the one homeservers accept for `POST` uploads. */
export const MATRIX_MEDIA_UPLOAD_PATH = '/_matrix/media/v3/upload';

export interface MxcRef {
  serverName: string;
  mediaId: string;
}

/** Parse `mxc://{serverName}/{mediaId}`; `null` for anything that is not exactly that shape. */
export function parseMxc(uri: string): MxcRef | null {
  const m = /^mxc:\/\/([^/?#]+)\/([^/?#]+)$/.exec(uri);
  if (m === null) return null;
  const [, serverName, mediaId] = m;
  if (serverName === undefined || mediaId === undefined) return null;
  return { serverName, mediaId };
}

function base(homeserverUrl: string): string {
  return homeserverUrl.replace(/\/+$/, '');
}

/** The authenticated full-resolution download URL for an `mxc://` uri, or `null` if it is malformed. */
export function mxcDownloadUrl(homeserverUrl: string, uri: string): string | null {
  const ref = parseMxc(uri);
  if (ref === null) return null;
  return `${base(homeserverUrl)}${MEDIA_V1}/download/${ref.serverName}/${ref.mediaId}`;
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  method?: 'crop' | 'scale';
}

/** The authenticated thumbnail URL for an `mxc://` uri, sized per `opts`, or `null` if malformed. */
export function mxcThumbnailUrl(
  homeserverUrl: string,
  uri: string,
  opts: ThumbnailOptions,
): string | null {
  const ref = parseMxc(uri);
  if (ref === null) return null;
  const q = new URLSearchParams({
    width: String(Math.max(1, Math.floor(opts.width))),
    height: String(Math.max(1, Math.floor(opts.height))),
    method: opts.method ?? 'scale',
  });
  return `${base(homeserverUrl)}${MEDIA_V1}/thumbnail/${ref.serverName}/${ref.mediaId}?${q.toString()}`;
}
