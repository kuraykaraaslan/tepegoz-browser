import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `captureAndStore` — the user-facing capture. Covered here: the guards that make it return `null`
 * instead of throwing at a menu click, the full-page rect clamp (`MAX_CAPTURE_PIXELS`), and that the
 * stored format follows `chooseEncoding` (WebP only when the round trip produced a SMALLER file).
 */

const encoded = vi.hoisted(() => ({ listener: null as ((e: unknown, p: unknown) => void) | null }));
const blob = vi.hoisted(() => ({ put: vi.fn(() => `cas://${'a'.repeat(64)}`) }));

vi.mock('electron', () => ({
  ipcMain: {
    on: (_ch: string, cb: (e: unknown, p: unknown) => void) => {
      encoded.listener = cb;
    },
  },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn() } }));
vi.mock('@tepegoz/persistence', () => ({ BlobStore: blob }));
vi.mock('../db/database.electron', () => ({ getDb: () => mockDb }));
vi.mock('../tabs', () => ({
  default: {
    focused: () => mockFocused,
    focusedWindow: () => mockWindow,
  },
}));

let mockDb: unknown = {};
let mockFocused: unknown;
let mockWindow: unknown;

const { captureAndStore } = await import('./user-screenshot.electron');

/** A fake NativeImage. */
function image(size: { width: number; height: number }, empty = false) {
  return {
    isEmpty: () => empty,
    toPNG: () => Buffer.alloc(1000, 1),
    getSize: () => size,
  };
}

/** A window whose `send` optionally feeds `webpBytes` straight back through the ipcMain listener,
 *  simulating the chrome renderer's WebP answer (or no answer, which the caller times out). */
function windowThatAnswers(webpBytes: Uint8Array | null) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (_ch: string, payload: { requestId: string }) => {
        if (webpBytes === null) return;
        encoded.listener?.(null, { requestId: payload.requestId, bytes: webpBytes });
      },
    },
  };
}

function tabWith(wc: unknown) {
  return { activeWebContents: () => wc };
}

function wcOn(url: string, opts: { fullPageSize?: { width: number; height: number } } = {}) {
  return {
    isDestroyed: () => false,
    getURL: () => url,
    getTitle: () => 'Shot',
    executeJavaScript: vi.fn(() => Promise.resolve(opts.fullPageSize ?? { width: 0, height: 0 })),
    capturePage: vi.fn((rect?: unknown) => {
      const r = rect as { width: number; height: number } | undefined;
      return Promise.resolve(image(r ?? { width: 1280, height: 720 }));
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb = {};
  // Default: the round trip answers immediately (bytes bigger than the PNG → PNG is kept), so tests
  // that do not care about the encode do not sit on the real ENCODE_TIMEOUT_MS.
  mockWindow = windowThatAnswers(new Uint8Array(5_000));
  mockFocused = tabWith(wcOn('https://example.com/p'));
});
afterEach(() => vi.useRealTimers());

describe('captureAndStore', () => {
  it('returns null when there is no focused tab, no window, or no database', async () => {
    mockFocused = null;
    expect(await captureAndStore('viewport')).toBeNull();

    mockFocused = tabWith(wcOn('https://x/'));
    mockWindow = null;
    expect(await captureAndStore('viewport')).toBeNull();

    mockWindow = windowThatAnswers(new Uint8Array(5_000));
    mockDb = null;
    expect(await captureAndStore('viewport')).toBeNull();
  });

  it('returns null when the web contents is gone or the capture is empty', async () => {
    mockFocused = tabWith({ ...wcOn('https://x/'), isDestroyed: () => true });
    expect(await captureAndStore('viewport')).toBeNull();

    const wc = wcOn('https://x/');
    wc.capturePage = vi.fn(() => Promise.resolve(image({ width: 10, height: 10 }, true)));
    mockFocused = tabWith(wc);
    expect(await captureAndStore('viewport')).toBeNull();
  });

  it('stores a viewport capture as a cas:// blob with the page url and title', async () => {
    const shot = await captureAndStore('viewport');
    expect(shot?.ref).toBe(`cas://${'a'.repeat(64)}`);
    expect(shot).toMatchObject({ url: 'https://example.com/p', title: 'Shot', width: 1280 });
  });

  it('falls back to PNG when the WebP round trip never answers (times out)', async () => {
    vi.useFakeTimers();
    mockWindow = windowThatAnswers(null);
    const p = captureAndStore('viewport');
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await p)?.format).toBe('image/png');
  });

  it('keeps the PNG when the WebP round trip came back BIGGER', async () => {
    mockWindow = windowThatAnswers(new Uint8Array(5000)); // bigger than the 1000-byte PNG
    const shot = await captureAndStore('viewport');
    expect(shot?.format).toBe('image/png');
    expect(blob.put).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ length: 1000 }));
  });

  it('stores WebP when the round trip produced a smaller file', async () => {
    mockWindow = windowThatAnswers(new Uint8Array(200)); // smaller than the PNG
    const shot = await captureAndStore('viewport');
    expect(shot?.format).toBe('image/webp');
    expect(blob.put).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ length: 200 }));
  });

  it('clamps a very tall full-page capture to MAX_CAPTURE_PIXELS', async () => {
    const wc = wcOn('https://x/', { fullPageSize: { width: 2_000, height: 30_000 } });
    mockFocused = tabWith(wc);
    await captureAndStore('fullPage');
    // 12_000_000 / 2_000 = 6_000, which is below the page's 30_000.
    expect(wc.capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 2_000, height: 6_000 });
  });

  it('captures a short full-page at its real height, unclamped', async () => {
    const wc = wcOn('https://x/', { fullPageSize: { width: 800, height: 1_200 } });
    mockFocused = tabWith(wc);
    await captureAndStore('fullPage');
    expect(wc.capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 1_200 });
  });

  it('returns null (not a throw) when capturePage rejects', async () => {
    const wc = wcOn('https://x/');
    wc.capturePage = vi.fn(() => Promise.reject(new Error('gpu gone')));
    mockFocused = tabWith(wc);
    expect(await captureAndStore('viewport')).toBeNull();
  });
});
