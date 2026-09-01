import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredScreenshot } from '@tepegoz/screenshots';

/**
 * "A screenshot that silently went nowhere is the failure mode this repo keeps finding" — so this
 * covers that `captureAndNotify` ALWAYS pushes a notification, both when a capture succeeded and when
 * it produced nothing, and that the success body reports the real size and the ACTUAL stored format
 * (reading `png` means the WebP encode did not happen — the field must not always claim WebP).
 */

const { mockCapture, mockPush } = vi.hoisted(() => ({
  mockCapture: vi.fn<() => Promise<StoredScreenshot | null>>(),
  mockPush: vi.fn(),
}));

vi.mock('./user-screenshot.electron', () => ({ captureAndStore: mockCapture }));
vi.mock('../notifications/notification-host', () => ({ default: { push: mockPush } }));
vi.mock('../lib/i18n-main', () => ({
  mainLocale: () => 'en',
  mainStrings: () => ({
    browser: {
      screenshotSavedTitle: 'Screenshot saved',
      screenshotSavedBody: '{size} KB · {format}',
      screenshotFailedTitle: 'Screenshot failed',
      screenshotFailedBody: 'Nothing was captured.',
    },
  }),
}));
vi.mock('@tepegoz/i18n', () => ({ formatNumber: (n: number) => String(n) }));

const { captureAndNotify } = await import('./screenshot-notify.electron');

function stored(over: Partial<StoredScreenshot> = {}): StoredScreenshot {
  return {
    ref: 'cas://' + 'a'.repeat(64),
    format: 'image/webp',
    width: 800,
    height: 600,
    byteLength: 51_200, // 50 KB exactly
    url: 'https://example.com/a',
    title: 'A',
    capturedAt: 1,
    ...over,
  };
}

beforeEach(() => {
  mockCapture.mockReset();
  mockPush.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('captureAndNotify', () => {
  it('pushes an error notification to both channels when nothing was captured', async () => {
    mockCapture.mockResolvedValue(null);
    await captureAndNotify('viewport');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0]?.[0]).toMatchObject({
      kind: 'error',
      title: 'Screenshot failed',
      channels: ['center', 'toast'],
    });
  });

  it('reports the stored size in KB and the WEBP format when that is what was stored', async () => {
    mockCapture.mockResolvedValue(stored({ format: 'image/webp', byteLength: 51_200 }));
    await captureAndNotify('fullPage');
    expect(mockPush.mock.calls[0]?.[0]).toMatchObject({
      kind: 'info',
      title: 'Screenshot saved',
      body: '50 KB · webp',
      channels: ['center', 'toast'],
    });
  });

  it('says PNG when the WebP encode did not happen — the format is not always-claimed', async () => {
    mockCapture.mockResolvedValue(stored({ format: 'image/png', byteLength: 204_800 }));
    await captureAndNotify('viewport');
    expect(mockPush.mock.calls[0]?.[0]).toMatchObject({ body: '200 KB · png' });
  });
});
