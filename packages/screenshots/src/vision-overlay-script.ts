import type { VisionMark } from './vision-marks';

/**
 * The in-page **set-of-marks overlay** renderer (S10 PR3).
 *
 * The numbers have to be *in the pixels* — a model looking at a picture cannot use a list of coordinates
 * it has no way to locate. Drawing needs a raster surface, and the one already available is the page's
 * own: an **`OffscreenCanvas` in the isolated world**, which is detached and never inserted, so nothing
 * about the live page changes and the page's own scripts cannot observe it. That keeps perception
 * read-only while still producing painted marks, and adds no image dependency to the main process.
 *
 * Returns base64 PNG bytes, or `null` on any failure — an un-annotated escalation is a degraded one, and
 * degrading is always preferable to throwing inside a fallback path.
 */
export function buildOverlayExpression(
  dataUrl: string,
  width: number,
  height: number,
  marks: readonly VisionMark[],
): string {
  return `(function () { return (async function () {
  const MARKS = ${JSON.stringify(marks)};
  const W = ${String(Math.max(1, Math.trunc(width)))};
  const H = ${String(Math.max(1, Math.trunc(height)))};
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    const res = await fetch(${JSON.stringify(dataUrl)});
    const bitmap = await createImageBitmap(await res.blob());
    // Detached surface: never appended to the document, so the page cannot see or style it.
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0, W, H);

    ctx.lineWidth = 2;
    ctx.font = 'bold 13px sans-serif';
    ctx.textBaseline = 'top';
    for (let i = 0; i < MARKS.length; i++) {
      const m = MARKS[i];
      // Outline the element, then a filled tag with the number. High-contrast on purpose: the mark has
      // to survive downscaling and whatever colours the page itself uses.
      ctx.strokeStyle = '#ff0090';
      ctx.strokeRect(m.x + 1, m.y + 1, Math.max(2, m.width - 2), Math.max(2, m.height - 2));
      const label = String(m.mark);
      const tagWidth = 10 + label.length * 8;
      const tagX = Math.max(0, Math.min(W - tagWidth, m.x));
      const tagY = Math.max(0, m.y - 16 < 0 ? m.y : m.y - 16);
      ctx.fillStyle = '#ff0090';
      ctx.fillRect(tagX, tagY, tagWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, tagX + 5, tagY + 1);
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch (e) {
    // A fallback path must not throw: no annotation is a worse image, not a failed step.
    return null;
  }
})(); })()`;
}
