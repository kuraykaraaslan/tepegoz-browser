import { randomUUID } from 'node:crypto';
import { ipcMain, type BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import { BlobStore } from '@tepegoz/persistence';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import {
  chooseEncoding,
  ENCODE_TIMEOUT_MS,
  WEBP_QUALITY,
  type ScreenshotFormat,
  type StoredScreenshot,
} from '@tepegoz/screenshots';
import TabManager from '../tabs';
import { getDb } from '../db/database.electron';

/**
 * User-facing screenshots: capture the page, store it in the content-addressed blob store, never as
 * inline base64.
 *
 * The agent's screenshot path (`browser-host.electron.ts`) returns a data URL because a model needs
 * the pixels in its context. This one is the opposite: the user's screenshot goes to disk, and a
 * base64 copy on the way there would be 33% overhead on a file that already has a home.
 *
 * **The WebP encode is a round trip to the app chrome, and it has to be.** `NativeImage` cannot encode
 * WebP; Chromium can, and Chromium is only reachable from a renderer. The chrome renderer is trusted
 * (it is our own bundle, contextIsolated, on its own partition), so handing it the captured PNG to
 * re-encode adds no new trust boundary — the bytes are already ours, and the page they came from never
 * sees them.
 *
 * If that round trip fails or is slow, the screenshot is still stored, as PNG, and the record SAYS
 * PNG. A stored file whose format field lied about it would be worse than the larger file.
 */

/** Pixels above which a full-page capture is clipped, mirroring the agent path's own ceiling. */
const MAX_CAPTURE_PIXELS = 12_000_000;

interface PendingEncode {
  resolve: (bytes: Buffer | null) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingEncode>();
let wired = false;

/** Receive the chrome renderer's answer. Registered once, lazily, so tests need no Electron. */
function ensureWired(): void {
  if (wired) return;
  wired = true;
  ipcMain.on(IpcChannels.screenshotEncoded, (_event, payload: unknown) => {
    const p = payload as { requestId?: unknown; bytes?: unknown } | undefined;
    const requestId = typeof p?.requestId === 'string' ? p.requestId : '';
    const entry = pending.get(requestId);
    if (entry === undefined) return;
    pending.delete(requestId);
    clearTimeout(entry.timer);
    // A renderer that answered with anything other than bytes is treated as "no WebP", not as an
    // error: the PNG we already hold is a perfectly good screenshot.
    entry.resolve(p?.bytes instanceof Uint8Array ? Buffer.from(p.bytes) : null);
  });
}

/** Ask the chrome renderer to re-encode `png` as WebP. Resolves null on refusal, failure or timeout. */
function encodeWebp(win: BrowserWindow, png: Buffer): Promise<Buffer | null> {
  ensureWired();
  if (win.isDestroyed()) return Promise.resolve(null);
  const requestId = randomUUID();
  return new Promise<Buffer | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      Logger.warn('WebP encode timed out; storing the screenshot as PNG');
      resolve(null);
    }, ENCODE_TIMEOUT_MS);
    pending.set(requestId, { resolve, timer });
    win.webContents.send(IpcChannels.screenshotEncode, {
      requestId,
      png,
      quality: WEBP_QUALITY,
    });
  });
}

/**
 * Capture the active tab and store it. Returns null when there is nothing to capture or nowhere to
 * put it — the caller surfaces that; it is never an exception thrown at a menu click.
 */
export async function captureAndStore(
  mode: 'viewport' | 'fullPage',
): Promise<StoredScreenshot | null> {
  const wc = TabManager.focused()?.activeWebContents() ?? null;
  const win = TabManager.focusedWindow();
  if (wc === null || wc.isDestroyed() || win === null || win.isDestroyed()) return null;
  const db = getDb();
  if (db === null) return null;

  try {
    let rect: Electron.Rectangle | undefined;
    if (mode === 'fullPage') {
      const size = (await wc.executeJavaScript(
        '({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })',
        false,
      )) as { width: number; height: number };
      const width = Math.max(1, Math.floor(size.width));
      // Clipped rather than refused: a very long page still produces a usable screenshot of its top,
      // which is what someone capturing it almost always wanted.
      const height = Math.max(
        1,
        Math.min(Math.floor(size.height), Math.floor(MAX_CAPTURE_PIXELS / width)),
      );
      rect = { x: 0, y: 0, width, height };
    }

    const image = rect === undefined ? await wc.capturePage() : await wc.capturePage(rect);
    if (image.isEmpty()) return null;
    const png = image.toPNG();
    const webp = await encodeWebp(win, png);

    const format: ScreenshotFormat = chooseEncoding(
      { byteLength: png.byteLength },
      webp === null ? null : { byteLength: webp.byteLength },
    );
    const bytes = format === 'image/webp' && webp !== null ? webp : png;
    const size = image.getSize();

    return {
      ref: BlobStore.put(db, bytes),
      format,
      width: size.width,
      height: size.height,
      byteLength: bytes.byteLength,
      url: wc.getURL(),
      title: wc.getTitle(),
      capturedAt: Date.now(),
    };
  } catch (err: unknown) {
    Logger.warn('Screenshot capture failed', { err: String(err) });
    return null;
  }
}
