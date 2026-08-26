/**
 * The user-facing screenshot: what gets stored, in what format, and what to do when the preferred
 * encoder is not available. Pure — the Electron half lives in `apps/desktop`.
 *
 * **Why WebP, and why it needs a renderer at all.** Electron's `NativeImage` encodes PNG and JPEG and
 * nothing else — there is no `toWebP` (checked in this Electron's own typings). The blob store is
 * SQLite on the user's disk, and a full-page PNG screenshot is large, so the format is not cosmetic:
 * it is the difference between a screenshot habit costing megabytes a time and costing a fraction of
 * that. Chromium can encode WebP; it is only reachable from a renderer, so main hands the captured
 * bytes to the trusted app chrome to re-encode.
 *
 * **JPEG is not the fallback.** A screenshot is mostly flat colour, text and UI edges — exactly what
 * JPEG is worst at, and the artefacts land on the text people took the screenshot to keep. If WebP
 * cannot be produced, the honest answer is the lossless one we can always make, and to record which
 * format was actually used rather than let the field imply WebP.
 */

export const SCREENSHOT_FORMATS = ['image/webp', 'image/png'] as const;
export type ScreenshotFormat = (typeof SCREENSHOT_FORMATS)[number];

/** Quality for the WebP encode. High enough that text edges stay crisp; low enough to be worth doing. */
export const WEBP_QUALITY = 0.85;

/** How long the renderer round trip may take before the capture is stored as PNG instead. */
export const ENCODE_TIMEOUT_MS = 4_000;

export interface StoredScreenshot {
  /** `cas://<sha256>` — the reference, never the bytes and never a base64 data URL. */
  ref: string;
  /** What was ACTUALLY stored. Reading `image/png` here means the WebP encode did not happen. */
  format: ScreenshotFormat;
  width: number;
  height: number;
  byteLength: number;
  /** The page it came from, so a stored screenshot is never an orphan. */
  url: string;
  title: string;
  capturedAt: number;
}

/**
 * Pick what to store from the two candidate encodings.
 *
 * WebP wins only when it exists AND is actually smaller. That second condition is not paranoia: WebP's
 * lossy encoder can exceed PNG on small, flat images — a screenshot of a mostly-white dialog is the
 * common case — and storing the bigger file to honour a format preference would defeat the only reason
 * the preference exists.
 */
export function chooseEncoding(
  png: { byteLength: number },
  webp: { byteLength: number } | null,
): ScreenshotFormat {
  if (webp === null) return 'image/png';
  return webp.byteLength < png.byteLength ? 'image/webp' : 'image/png';
}

/** File extension for a stored screenshot, for the "save a copy" path. */
export function extensionFor(format: ScreenshotFormat): string {
  return format === 'image/webp' ? 'webp' : 'png';
}
