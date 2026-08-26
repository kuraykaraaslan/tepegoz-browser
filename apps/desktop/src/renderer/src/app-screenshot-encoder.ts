import { useEffect } from 'react';
// The `user-capture` SUBPATH, not the package root: the root barrel re-exports the whole package,
// including the S5 extraction-caps module, which pulls in `node:crypto` (`scriptHash`) — fine in main,
// fatal in the renderer bundle, which has no Node built-ins. This subpath reaches only the pure,
// dependency-free module the renderer actually needs.
import { SCREENSHOT_FORMATS } from '@tepegoz/screenshots/user-capture';

/**
 * The WebP encoder the main process borrows from the trusted chrome.
 *
 * `NativeImage` encodes PNG and JPEG and nothing else — there is no `toWebP` in this Electron's
 * typings — while Chromium encodes WebP natively but only inside a renderer. So main captures the
 * page, hands the PNG here, and gets WebP back.
 *
 * This adds no trust boundary: the bytes are already ours (main captured them), the page they came
 * from never sees them, and this renderer is our own contextIsolated bundle on its own partition. It
 * is a borrowed codec, not a delegation of the decision — main still chooses which encoding to store.
 *
 * Every failure resolves as `null` rather than throwing. A screenshot that could not be shrunk is
 * still a screenshot, and main stores the PNG it already holds.
 */
export function useScreenshotEncoder(): void {
  useEffect(
    () =>
      window.tepegoz.onScreenshotEncode(({ requestId, png, quality }) => {
        const send = (bytes: Uint8Array | null): void => {
          window.tepegoz.sendScreenshotEncoded(requestId, bytes);
        };
        // `createImageBitmap` decodes off the main thread, so a large capture does not freeze the
        // chrome while the user is looking at it.
        void createImageBitmap(new Blob([png as BlobPart], { type: SCREENSHOT_FORMATS[1] }))
          .then(async (bitmap) => {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d');
            if (ctx === null) {
              send(null);
              return;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            const blob = await canvas.convertToBlob({ type: SCREENSHOT_FORMATS[0], quality });
            // A browser that silently produced a PNG from a WebP request would make the stored
            // `format` field a lie, so the type is checked rather than assumed.
            send(
              blob.type === SCREENSHOT_FORMATS[0] ? new Uint8Array(await blob.arrayBuffer()) : null,
            );
          })
          .catch(() => {
            send(null);
          });
      }),
    [],
  );
}
