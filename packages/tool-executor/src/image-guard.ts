/**
 * The inbound screen every image must pass before it can reach a model (S10 PR4 seam; S6 owns the
 * screen itself).
 *
 * Page text is redacted by `content-guard`. **Pixels skip that entirely** — an instruction painted onto
 * a canvas never appears in `innerText`, so nothing in the text path has anything to redact, and the
 * image is a clean channel straight into the model's context. That is the known attack, and the
 * `atk-image-injection` fixture exists to hold it open until it is closed.
 *
 * So this seam **fails closed**: with no screen installed, no image is attached. A vision escalation
 * degrades to a text note rather than opening an unscreened channel. That is a deliberate ordering —
 * the capability waits for its defence, not the other way round.
 */

export interface ScreenedImage {
  /** Base64 image bytes (no data: prefix). */
  data: string;
  mediaType: string;
}

export interface ImageScreenVerdict {
  allow: boolean;
  /** Why it was refused — surfaced to the caller, never to the page. */
  reason?: string;
}

/** Inspect an image before it enters model context. Installed by the app; S6 supplies the real one. */
export type ImageScreen = (image: ScreenedImage) => ImageScreenVerdict;

let installed: ImageScreen | null = null;

/** Install (or clear, with `null`) the inbound image screen. */
export function setImageScreen(screen: ImageScreen | null): void {
  installed = screen;
}

/** True when an image could be screened at all. Callers use it to explain the degrade honestly. */
export function hasImageScreen(): boolean {
  return installed !== null;
}

/**
 * Screen one image. **No screen installed ⇒ refused**, because "nobody checked" and "it is safe" are
 * different statements and only one of them may let pixels through.
 *
 * A screen that throws is also a refusal: a defence that failed did not pass anything.
 */
export function screenImage(image: ScreenedImage): ImageScreenVerdict {
  if (installed === null) {
    return {
      allow: false,
      reason:
        'no inbound image screen is installed, so the image was not attached — an unscreened image is a ' +
        'direct channel into model context that page text never has.',
    };
  }
  try {
    return installed(image);
  } catch {
    return { allow: false, reason: 'the inbound image screen failed; the image was not attached' };
  }
}
