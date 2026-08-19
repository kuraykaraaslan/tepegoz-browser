import { z } from 'zod';

/**
 * Set-of-marks (S10 PR3) — pure, so the ONLY channel by which a vision answer re-enters the
 * deterministic action path is unit-testable.
 *
 * A model looking at a picture can only be useful if what it names resolves back to something the
 * executor can act on. Marks are that bridge: each visible element gets a number on the image, and the
 * mark → ref map turns "the button marked 3" into a ref the existing click path already knows how to
 * resolve. A model naming a mark that is not in the map is **dropped, never guessed** — a wrong-but-
 * plausible click is worse than admitting the image did not help.
 */

export const VisionMarkSchema = z.object({
  /** The number painted on the image. 1-based, and assigned by position so it is stable to read. */
  mark: z.number().int().positive().max(200),
  /** The S2 element ref this mark stands for — the sole re-entry point into the action path. */
  ref: z.number().int().positive(),
  /** Box in IMAGE pixels (already scaled), so an overlay and a coordinate answer agree. */
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type VisionMark = z.infer<typeof VisionMarkSchema>;

export const AnnotatedScreenshotSchema = z.object({
  mimeType: z.literal('image/png'),
  /** Base64 bytes of the (downscaled, possibly annotated) image. No data: prefix. */
  data: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Multiplier from viewport CSS pixels to image pixels — how a mark's box maps back to the page. */
  scale: z.number().positive(),
  marks: z.array(VisionMarkSchema).max(200),
  estimatedTokens: z.number().int().nonnegative(),
});
export type AnnotatedScreenshot = z.infer<typeof AnnotatedScreenshotSchema>;

/** An element's viewport box, as perception saw it. */
export interface MarkSource {
  ref: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Below this size in image pixels a mark cannot be read, so painting it would only add clutter. */
const MIN_MARK_EDGE = 8;
/** Marks are capped for the same reason the element list is: an unreadable image helps nobody. */
export const MAX_MARKS = 60;

/**
 * Build the marks for a scaled image.
 *
 * Boxes are converted to image pixels here rather than at draw time, so the overlay, the map, and any
 * coordinate the model quotes are all in one coordinate system. Elements too small to carry a legible
 * mark are dropped — including them would leave numbers on the image with nothing behind them.
 */
export function buildMarks(sources: readonly MarkSource[], scale: number): VisionMark[] {
  const marks: VisionMark[] = [];
  for (const source of sources) {
    if (marks.length >= MAX_MARKS) break;
    const width = source.width * scale;
    const height = source.height * scale;
    if (width < MIN_MARK_EDGE || height < MIN_MARK_EDGE) continue;
    marks.push({
      mark: marks.length + 1,
      ref: source.ref,
      x: Math.round(source.x * scale),
      y: Math.round(source.y * scale),
      width: Math.round(width),
      height: Math.round(height),
    });
  }
  return marks;
}

/**
 * Resolve what the model named back to a ref. Returns null for a mark that does not exist — the
 * deliberate dead end: an unresolvable mark means the image did not help, and the loop re-reads instead
 * of acting on a number nothing backs.
 */
export function refForMark(marks: readonly VisionMark[], mark: number): number | null {
  return marks.find((m) => m.mark === mark)?.ref ?? null;
}

/** The legend that travels with the image, so the model knows what the numbers mean. */
export function describeMarks(marks: readonly VisionMark[]): string {
  if (marks.length === 0) {
    return 'No elements could be marked on this image — nothing in it can be acted on by number.';
  }
  return (
    `The image is annotated with ${String(marks.length)} numbered marks. Answer by naming a mark ` +
    'number (e.g. "mark 3"); a number that is not in this list cannot be acted on.'
  );
}
