import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import type { ScreenshotCaptureInput, ScreenshotCaptureResult } from '@tepegoz/screenshots';
import DownloadService from '../downloads/download-service.electron';
import { originOf as originOfUrl } from '../downloads/download-service-fs.electron';
import { pdfFileName } from '../print/pdf-filename';
import { requireWc } from './browser-host-tab.electron';

const SCREENSHOT_MAX_CAPTURE_PIXELS = 30_000_000;

interface PageDimensions {
  width: number;
  height: number;
}

async function pageDimensions(wc: WebContents): Promise<PageDimensions> {
  const raw: unknown = await wc.executeJavaScript(
    `(() => {
      const d = document.documentElement;
      const b = document.body;
      return {
        width: Math.ceil(Math.max(d?.scrollWidth || 0, d?.clientWidth || 0, b?.scrollWidth || 0, b?.clientWidth || 0, 1)),
        height: Math.ceil(Math.max(d?.scrollHeight || 0, d?.clientHeight || 0, b?.scrollHeight || 0, b?.clientHeight || 0, 1))
      };
    })()`,
    false,
  );
  if (typeof raw !== 'object' || raw === null) return { width: 1, height: 1 };
  const width = (raw as { width?: unknown }).width;
  const height = (raw as { height?: unknown }).height;
  return {
    width: typeof width === 'number' && Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1,
    height:
      typeof height === 'number' && Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1,
  };
}

function resizeForMaxEdge(image: Electron.NativeImage, maxEdge: number): Electron.NativeImage {
  const size = image.getSize();
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  if (scale >= 1) return image;
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  });
}

export async function captureScreenshot(
  input: ScreenshotCaptureInput = {},
): Promise<ScreenshotCaptureResult> {
  const wc = requireWc(input.tabId);
  const mode = input.mode ?? 'viewport';
  const maxEdge = input.maxEdge ?? 1400;
  const page = await pageDimensions(wc);
  const truncated = mode === 'fullPage' && page.width * page.height > SCREENSHOT_MAX_CAPTURE_PIXELS;
  const captureHeight = truncated
    ? Math.max(1, Math.floor(SCREENSHOT_MAX_CAPTURE_PIXELS / page.width))
    : page.height;
  const rect =
    mode === 'fullPage' ? { x: 0, y: 0, width: page.width, height: captureHeight } : undefined;
  const raw = await wc.capturePage(rect);
  if (raw.isEmpty()) throw new AppError('Could not capture page screenshot', 502);
  const image = resizeForMaxEdge(raw, maxEdge);
  const nextSize = image.getSize();
  const dataUrl = image.toDataURL();
  const result: ScreenshotCaptureResult = {
    url: wc.getURL(),
    title: wc.getTitle(),
    mode,
    mimeType: 'image/png',
    dataUrl,
    width: nextSize.width,
    height: nextSize.height,
    pageWidth: page.width,
    pageHeight: page.height,
    byteLength: Buffer.byteLength(dataUrl, 'utf8'),
    capturedAt: Date.now(),
  };
  return truncated ? { ...result, truncated: true } : result;
}

/**
 * `browser_save_pdf` — the agent's only way to put a file on disk, and it is not really one.
 *
 * `printToPDF` produces bytes; those bytes go into `DownloadService.ingestGeneratedFile`, which is the
 * SAME quarantine → hash → trust-check → human-release path every download takes. So this adds no
 * write path and no trust exemption: the agent can cause a file to exist in quarantine, and only a
 * person can move it anywhere the user would look.
 *
 * The filename comes from the page title, so it goes through `pdfFileName` first — the title is
 * attacker-controlled and would otherwise reach a path.
 *
 * What comes back is an id and a name, never a path. The agent has no filesystem, and handing it one
 * string of a real one is how that stops being true.
 */
export async function savePageAsPdf(
  tabId?: string,
): Promise<{ downloadId: string; filename: string; bytes: number }> {
  const wc = requireWc(tabId);
  const pdf = await wc.printToPDF({});
  const filename = pdfFileName(wc.getTitle());
  const sourceUrl = wc.getURL();
  const downloadId = await DownloadService.ingestGeneratedFile({
    filename,
    mimeType: 'application/pdf',
    bytes: pdf,
    sourceUrl,
    // `actor: 'agent'` is stamped HERE, by the host, exactly as it is for an agent download — the
    // model cannot set its own actor, and `releaseNeedsApproval` refuses an agent record without a
    // human whatever the file turns out to be.
    provenance: { actor: 'agent', sourceUrl, sourceOrigin: originOfUrl(sourceUrl) },
  });
  return { downloadId, filename, bytes: pdf.byteLength };
}
