// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useScreenshotEncoder } from './app-screenshot-encoder';

/**
 * The borrowed WebP codec: main hands the renderer a captured PNG and gets WebP back (Electron's
 * NativeImage can't encode WebP; Chromium can, but only in a renderer). Contract worth pinning: it
 * wires ONE `onScreenshotEncode` listener, and EVERY failure path — no 2d context, a browser that
 * quietly returned a non-WebP blob, or a decode that threw — resolves as `sendScreenshotEncoded(id,
 * null)` so main just stores the PNG it already holds. It never throws.
 */

type Handler = (p: { requestId: string; png: Uint8Array; quality: number }) => void;

let handler: Handler | undefined;
const sendScreenshotEncoded = vi.fn();

/** Result of the mocked `canvas.convertToBlob` for the next run. */
let blobType = 'image/webp';
let ctxIsNull = false;
let bitmapRejects = false;

beforeEach(() => {
  handler = undefined;
  sendScreenshotEncoded.mockReset();
  blobType = 'image/webp';
  ctxIsNull = false;
  bitmapRejects = false;

  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      onScreenshotEncode: (h: Handler) => {
        handler = h;
        return () => undefined; // the cleanup fn useEffect returns
      },
      sendScreenshotEncoded,
    },
  });

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() =>
      bitmapRejects
        ? Promise.reject(new Error('decode failed'))
        : Promise.resolve({ width: 12, height: 8, close: vi.fn() }),
    ),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return ctxIsNull ? null : { drawImage: vi.fn() };
      }
      convertToBlob() {
        return Promise.resolve({
          type: blobType,
          arrayBuffer: () => Promise.resolve(new Uint8Array([9, 9, 9]).buffer),
        });
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fire = () =>
  handler?.({ requestId: 'req-1', png: new Uint8Array([1, 2, 3]), quality: 0.7 });

describe('useScreenshotEncoder', () => {
  it('encodes the PNG to WebP bytes and sends them back for the request id', async () => {
    renderHook(() => useScreenshotEncoder());
    expect(handler).toBeTypeOf('function');

    fire();

    await waitFor(() => expect(sendScreenshotEncoded).toHaveBeenCalledTimes(1));
    const [id, bytes] = sendScreenshotEncoded.mock.calls[0] as [string, Uint8Array];
    expect(id).toBe('req-1');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([9, 9, 9]);
  });

  it('sends null when the offscreen canvas has no 2d context', async () => {
    ctxIsNull = true;
    renderHook(() => useScreenshotEncoder());
    fire();
    await waitFor(() => expect(sendScreenshotEncoded).toHaveBeenCalledWith('req-1', null));
  });

  it('sends null when the browser returned a non-WebP blob (the format field must not become a lie)', async () => {
    blobType = 'image/png';
    renderHook(() => useScreenshotEncoder());
    fire();
    await waitFor(() => expect(sendScreenshotEncoded).toHaveBeenCalledWith('req-1', null));
  });

  it('sends null when decoding the capture throws', async () => {
    bitmapRejects = true;
    renderHook(() => useScreenshotEncoder());
    fire();
    await waitFor(() => expect(sendScreenshotEncoded).toHaveBeenCalledWith('req-1', null));
  });
});
