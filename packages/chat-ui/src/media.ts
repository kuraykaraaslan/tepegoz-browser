/**
 * Attachment rendering rules. The hard constraint (X-chat.2 DoD): the timeline **never fetches a
 * remote URL for a preview**. A message carries only an opaque `mediaRef`; the host resolves it to a
 * {@link MediaResource} whose `url` must be a local `blob:` / `data:` URL — {@link isLocalMediaUrl}
 * rejects anything else so a compromised host or a crafted message cannot turn a preview into a beacon.
 */

export type MediaCategory = 'image' | 'video' | 'audio' | 'file';

export interface MediaResource {
  /** A host-produced `blob:` or `data:` URL. This is the ONLY value the timeline puts in `src`. */
  url: string;
  mime: string;
  name: string;
}

export function mediaCategory(mime: string): MediaCategory {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}

const LOCAL_URL = /^(blob:|data:)/i;

/** True only for `blob:` / `data:` URLs — the timeline refuses to load anything else. */
export function isLocalMediaUrl(url: string): boolean {
  return LOCAL_URL.test(url.trim());
}

/** A resolved resource is safe to render only when its URL is local. */
export function isSafeMediaResource(resource: MediaResource): boolean {
  return isLocalMediaUrl(resource.url) && resource.mime.trim() !== '';
}
