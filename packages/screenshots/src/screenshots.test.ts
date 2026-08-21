import { describe, expect, it } from 'vitest';
import {
  buildScreenshotSnapshot,
  DEFAULT_SCREENSHOT_MAX_EDGE,
  MAX_SCREENSHOT_MAX_EDGE,
  normalizeScreenshotInput,
} from './index';
import { ScreenshotCaptureInputSchema } from './schemas';

describe('@tepegoz/screenshots', () => {
  it('normalizes mode and max edge defaults', () => {
    expect(normalizeScreenshotInput({})).toEqual({
      tabId: '',
      mode: 'viewport',
      maxEdge: DEFAULT_SCREENSHOT_MAX_EDGE,
    });
    expect(normalizeScreenshotInput({ mode: 'fullPage', maxEdge: 99 }).maxEdge).toBe(256);
    expect(normalizeScreenshotInput({ maxEdge: 99999 }).maxEdge).toBe(MAX_SCREENSHOT_MAX_EDGE);
  });

  it('validates screenshot capture inputs', () => {
    expect(
      ScreenshotCaptureInputSchema.safeParse({ mode: 'fullPage', maxEdge: 2048 }).success,
    ).toBe(true);
    expect(ScreenshotCaptureInputSchema.safeParse({ mode: 'whole-document' }).success).toBe(false);
  });

  it('wraps capture metadata as untrusted context and states plainly that the pixels are NOT sent', () => {
    const snap = buildScreenshotSnapshot({
      url: 'https://example.com',
      title: 'Example',
      mode: 'fullPage',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AA==',
      width: 640,
      height: 480,
      pageWidth: 640,
      pageHeight: 1200,
      byteLength: 128,
      capturedAt: 1,
    });

    expect(snap.dataUrl).toContain('data:image/png');
    expect(snap.content).toContain('Browser screenshot');
    expect(snap.content).toContain('untrusted');
    expect(snap.content).not.toBe('Browser screenshot');
    // AI-8A honesty contract: the model receives text only, so the note must NOT invite it to "look at"
    // the image, and must say the pixels are not sent. Guards against silently re-introducing the vanity.
    expect(snap.content).toContain('are NOT sent to you');
    expect(snap.content).not.toMatch(/visual fallback|in this image/i);
  });
});
