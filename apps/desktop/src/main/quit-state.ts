/**
 * A tiny shared flag that decouples "the app is really quitting" from "a window was closed". With
 * close-to-tray on, clicking a window's X hides it to the tray instead of quitting; the ONLY real-quit
 * paths (tray "Quit", the main-menu "Exit"/`app:quit` IPC, and `before-quit` as a backstop) set this so
 * the window `close` interceptor knows to let the close proceed. Imported by window.ts, tray.ts and the
 * app entry so none of them has to import the others.
 */
let quitting = false;

/** Mark the app as genuinely quitting (a real-quit path was taken). Idempotent. */
export function markQuitting(): void {
  quitting = true;
}

/** True once a real-quit path has been taken — the window `close` interceptor then stops hiding to tray. */
export function isQuitting(): boolean {
  return quitting;
}
