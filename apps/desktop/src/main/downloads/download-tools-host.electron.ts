import type { DownloadCommandInput, DownloadCreateInput, DownloadRecord } from '@tepegoz/downloads';
import type { MediaProbeResult } from '@tepegoz/downloads';
import type { DownloadToolsHost } from '@tepegoz/downloads/tools';
import { createHttpClient } from '@tepegoz/http';
import DownloadService from './download-service.electron';
import TabManager from '../tabs';

// A dedicated client (not the shared `@tepegoz/http` default instance) so a slow/hostile media host
// can't tie up a probe past a short, resolver-specific deadline.
const mediaProbeClient = createHttpClient({ timeoutMs: 15_000 });

function contentLengthOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function finalUrlOf(response: { request?: { res?: { responseUrl?: unknown } } }, fallback: string): string {
  const responseUrl = response.request?.res?.responseUrl;
  return typeof responseUrl === 'string' && responseUrl.length > 0 ? responseUrl : fallback;
}

/** P3-c media resolver probe: a HEAD request, since virtually every CDN serving direct image/video/
 *  audio bytes supports it without transferring a body. A server that rejects HEAD (405/501, or a
 *  transport error) falls back to a 1-byte ranged GET, which still returns the real headers without
 *  downloading the resource. Never follows more than a handful of redirects and never throws —
 *  unreachable is a classification the resolver makes, not an error the caller has to catch. */
async function probeMedia(url: string): Promise<MediaProbeResult | null> {
  try {
    const response = await mediaProbeClient.head(url, { maxRedirects: 5, validateStatus: () => true });
    if (response.status !== 405 && response.status !== 501) {
      return {
        status: response.status,
        contentType: typeof response.headers['content-type'] === 'string'
          ? response.headers['content-type']
          : undefined,
        contentLengthBytes: contentLengthOf(response.headers['content-length']),
        finalUrl: finalUrlOf(response, url),
      };
    }
  } catch {
    // fall through to the ranged-GET below
  }
  try {
    const response = await mediaProbeClient.get(url, {
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { Range: 'bytes=0-0' },
      responseType: 'arraybuffer',
    });
    return {
      status: response.status,
      contentType: typeof response.headers['content-type'] === 'string'
        ? response.headers['content-type']
        : undefined,
      // A 206/200 to a ranged request reports the FULL resource size via Content-Range, not the
      // single byte just transferred — prefer it, falling back to Content-Length for a server that
      // ignored the Range header entirely.
      contentLengthBytes:
        parseContentRangeTotal(response.headers['content-range']) ??
        contentLengthOf(response.headers['content-length']),
      finalUrl: finalUrlOf(response, url),
    };
  } catch {
    return null;
  }
}

/** `Content-Range: bytes 0-0/12345` → 12345. Null for `*` (server doesn't know) or anything unparsable. */
function parseContentRangeTotal(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /\/(\d+)$/.exec(value.trim());
  if (match?.[1] === undefined) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/** Electron host for the built-in download_* agent tools. Records are already path-redacted by DownloadService. */
export const downloadToolsHost: DownloadToolsHost = {
  listDownloads: () => DownloadService.list(),
  getDownload: (id: string): DownloadRecord | null =>
    DownloadService.list().find((record) => record.id === id) ?? null,
  createDownload: (input: DownloadCreateInput) =>
    DownloadService.create({ ...input, actor: 'agent' }, TabManager.activeWebContents()),
  commandDownload: async (input: DownloadCommandInput) => {
    // `retry` re-enters `will-download` and needs a live page to attach the transfer to — the same
    // active tab `createDownload` uses, so an agent retry runs the quarantine/trust path on the
    // session the agent can see. Every other action ignores the web contents.
    await DownloadService.command(input.id, input.action, TabManager.activeWebContents());
    return { ok: true };
  },
  probeMedia,
};
