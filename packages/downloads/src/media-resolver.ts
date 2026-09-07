/**
 * Media resolver (Phase 2c P3-c) — classifies whether a public URL is a DIRECT media resource
 * (image/video/audio bytes) or something else (an HTML page, unreachable, wrong scheme) that the
 * agent should instead visit with ordinary browsing/web tools. Read-only and Electron-free: the
 * actual HTTP probe is an injected host seam ({@link MediaProbe}); this module only classifies the
 * result. Resolving is deliberately separate from saving — a direct hit still has to go through the
 * EXISTING `download_create_item` quarantine/hash/SafeBrowsing/trust-gate path (ADR-0040), so this
 * tool gains no new write path and no new trust exemption.
 *
 * MVP scope: direct-link media only (a URL whose response IS the media bytes). Extracting media from
 * an indirect source (e.g. a YouTube watch page) is the harder half of WebBrain's
 * `resolve_public_media`/`download_social_media` pair and stays a documented follow-up
 * (`docs/parities/webbrain-agent-parity.md` P3-c) rather than blocking this box.
 */

const DIRECT_MEDIA_MIME_PREFIXES = ['image/', 'video/', 'audio/'];

/** Extension guessed from a MIME subtype when the URL path has none. Small and deliberately not
 *  exhaustive — an unmapped MIME still resolves as `direct`, just without a filename extension. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
};

export interface MediaProbeResult {
  status: number;
  contentType?: string | undefined;
  contentLengthBytes?: number | null | undefined;
  /** URL after redirects. Equal to the request URL when the host can't tell (e.g. no redirect). */
  finalUrl: string;
}

/** Injected host seam for the actual network probe (HEAD, or a ranged-GET fallback for a server that
 *  rejects HEAD). Returns null on any transport failure — unreachable is a classification, never a
 *  thrown error. */
export type MediaProbe = (url: string) => Promise<MediaProbeResult | null>;

export type MediaResolutionReason =
  | 'unsupported_scheme'
  | 'invalid_url'
  | 'unreachable'
  | 'html_page'
  | 'unknown_type';

export type MediaResolution =
  | {
      kind: 'direct';
      url: string;
      contentType: string;
      contentLengthBytes: number | null;
      suggestedFilename: string;
    }
  | {
      kind: 'not_direct';
      url: string;
      reason: MediaResolutionReason;
      hint: string;
    };

const NOT_DIRECT_HINTS: Record<MediaResolutionReason, string> = {
  unsupported_scheme:
    'Only http/https URLs can be resolved. Use the browser tools for anything else.',
  invalid_url: 'The URL could not be parsed. Double-check it before retrying.',
  unreachable:
    'The URL did not respond with a usable status. Try browsing to it, or use web_get_page.',
  html_page:
    'This URL is a page, not a direct media file. Open it with browser tools (or web_get_page) and find the direct media link on it.',
  unknown_type:
    'The response is not a recognized image/video/audio type. Open it with browser tools if you need to inspect it.',
};

function mimeEssence(mimeType: string | undefined): string {
  return (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** http/https only — a resolver that could be pointed at `file:`/`data:`/`javascript:` would be a new
 *  capability, not a read. Returns null for anything else, including unparseable input. */
export function parseResolvableMediaUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function extensionFromPath(pathname: string): string {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot === -1 ? '' : last.slice(dot).toLowerCase();
}

/** Best-effort save name: the URL's own filename when it has a plausible extension, else one derived
 *  from the MIME type, else a bare fallback. Never trusts path text beyond its extension. */
export function suggestMediaFilename(url: string, mime: string): string {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = '';
  }
  const last = pathname.split('/').pop() ?? '';
  const ext = extensionFromPath(pathname);
  if (last.length > 0 && ext.length > 1 && ext.length <= 6) return last;
  const guessed = MIME_EXTENSIONS[mime] ?? '';
  const base = last.length > 0 ? last : 'media';
  return guessed.length > 0 ? `${base}${guessed}` : base;
}

/**
 * Classify a probe result. Pure — the network call already happened (or failed) in {@link MediaProbe};
 * this only decides `direct` vs `not_direct`, and why.
 */
export function classifyMediaProbe(url: string, probe: MediaProbeResult | null): MediaResolution {
  if (probe === null || probe.status < 200 || probe.status >= 300) {
    return { kind: 'not_direct', url, reason: 'unreachable', hint: NOT_DIRECT_HINTS.unreachable };
  }
  const mime = mimeEssence(probe.contentType);
  if (mime === 'text/html' || mime === 'application/xhtml+xml') {
    return { kind: 'not_direct', url, reason: 'html_page', hint: NOT_DIRECT_HINTS.html_page };
  }
  const isDirect =
    mime.length > 0 && DIRECT_MEDIA_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!isDirect) {
    return { kind: 'not_direct', url, reason: 'unknown_type', hint: NOT_DIRECT_HINTS.unknown_type };
  }
  return {
    kind: 'direct',
    url: probe.finalUrl,
    contentType: mime,
    contentLengthBytes: probe.contentLengthBytes ?? null,
    suggestedFilename: suggestMediaFilename(probe.finalUrl, mime),
  };
}

/** Full resolve: validates the URL scheme first (no network call for a bad scheme), then probes. */
export async function resolveMedia(url: string, probe: MediaProbe): Promise<MediaResolution> {
  const parsed = parseResolvableMediaUrl(url);
  if (parsed === null) {
    // A recognizable-but-disallowed scheme (`file:`, `data:`, `javascript:`, ...) is a clearer signal
    // than a plain parse failure, so callers can tell "wrong kind of URL" from "not a URL at all".
    const reason: MediaResolutionReason = /^[a-z][a-z0-9+.-]*:/i.test(url)
      ? 'unsupported_scheme'
      : 'invalid_url';
    return { kind: 'not_direct', url, reason, hint: NOT_DIRECT_HINTS[reason] };
  }
  const result = await probe(parsed.toString());
  return classifyMediaProbe(url, result);
}
