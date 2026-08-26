export * from './vision-attach';
export * from './vision-budget';
export * from './vision-marks';
export * from './vision-overlay-script';
import { wrapUntrustedContent } from '@tepegoz/tool-executor';

export const SCREENSHOT_MODES = ['viewport', 'fullPage'] as const;
export type ScreenshotMode = (typeof SCREENSHOT_MODES)[number];

export const DEFAULT_SCREENSHOT_MAX_EDGE = 1400;
export const MIN_SCREENSHOT_MAX_EDGE = 256;
export const MAX_SCREENSHOT_MAX_EDGE = 4096;

export interface ScreenshotCaptureInput {
  tabId?: string | undefined;
  mode?: ScreenshotMode | undefined;
  maxEdge?: number | undefined;
}

export interface ScreenshotCaptureResult {
  url: string;
  title: string;
  mode: ScreenshotMode;
  mimeType: 'image/png';
  dataUrl: string;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  byteLength: number;
  capturedAt: number;
  truncated?: boolean | undefined;
}

export interface ScreenshotSnapshot extends ScreenshotCaptureResult {
  /** Model-readable note that frames the image as untrusted visual page content. */
  content: string;
}

export function normalizeScreenshotInput(
  input: ScreenshotCaptureInput,
): Required<ScreenshotCaptureInput> {
  return {
    tabId: input.tabId ?? '',
    mode: input.mode ?? 'viewport',
    maxEdge: Math.max(
      MIN_SCREENSHOT_MAX_EDGE,
      Math.min(MAX_SCREENSHOT_MAX_EDGE, input.maxEdge ?? DEFAULT_SCREENSHOT_MAX_EDGE),
    ),
  };
}

/**
 * Build the model-facing snapshot for a capture. **The image itself does NOT reach the model**:
 * `CanonMessage.content` is string-only and no provider adapter carries an image block (AI-8A), so the
 * model receives exactly this text — capture metadata, not pixels. The text says so plainly rather than
 * inviting the model to "look at the image", which would be a capability it does not have. The `dataUrl`
 * stays on the result for the run record / export bundle, which is what the capture is genuinely for.
 */
export function buildScreenshotSnapshot(input: ScreenshotCaptureResult): ScreenshotSnapshot {
  const truncated = input.truncated === true ? 'yes' : 'no';
  const text =
    `Browser screenshot captured from ${input.url} and attached to the run record.\n` +
    `Title: ${input.title}\n` +
    `Mode: ${input.mode}; page: ${String(input.pageWidth)}x${String(input.pageHeight)}; ` +
    `image: ${input.mimeType}, ${String(input.width)}x${String(input.height)}, ` +
    `${String(input.byteLength)} bytes; truncated: ${truncated}.\n` +
    'NOTE: you receive only these capture details — the image pixels are NOT sent to you, so this tells ' +
    'you nothing about what the page looks like. To read page content or find something to act on, use ' +
    'browser_get_page / browser_get_elements (and scroll or browser_update_page scroll_to_text to reveal ' +
    'off-screen targets).';
  return { ...input, content: wrapUntrustedContent(text, input.url) };
}
export * from './user-capture';
