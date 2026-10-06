import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { DownloadRecord, UploadRecord } from '@tepegoz/desktop-ipc';

/**
 * Shared fixtures for the `TransferActivityPopup.*.test.tsx` files: the fake `window.tepegoz` bridge, the
 * record builders, and the frozen clock. The tests are split by concern (rows / lifecycle / exits); this
 * file is what keeps the three of them speaking about the same bridge.
 *
 * `Date.now` is frozen: every row prints a relative time, and a test whose expected string depends on
 * the wall clock fails at midnight rather than when the code breaks.
 */

export const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

export interface Bridge {
  prefsOk: boolean;
  locale: string;
  downloads: { ok: boolean; items: DownloadRecord[] };
  uploads: { ok: boolean; items: UploadRecord[] };
  pushDownloads: ((state: { items: DownloadRecord[] }) => void) | null;
  pushUploads: ((state: { items: UploadRecord[] }) => void) | null;
  offDownloads: number;
  offUploads: number;
  closed: number;
  navigated: string[];
  resized: number[];
}

export let bridge: Bridge;

export function download(over: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd-1',
    url: 'https://files.example/report.pdf',
    filename: 'report.pdf',
    status: 'completed',
    risk: 'normal',
    trustVerdict: 'safe',
    receivedBytes: 2048,
    totalBytes: 2048,
    canResume: false,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    provenance: { actor: 'user', sourceOrigin: 'https://files.example' },
    ...over,
  };
}

export function upload(over: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'u-1',
    status: 'completed',
    risk: 'normal',
    files: [{ filename: 'photo.jpg', sizeBytes: 1024, risk: 'normal' }],
    createdAt: NOW - 30_000,
    updatedAt: NOW - 30_000,
    targetOrigin: 'https://forms.example',
    provenance: { actor: 'user' },
    ...over,
  };
}

function stubBridge(): void {
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: {
      resizePopup: (height: number) => bridge.resized.push(height),
      closePopup: () => {
        bridge.closed += 1;
      },
      navigateTab: (url: string) => bridge.navigated.push(url),
      getPreferences: () =>
        bridge.prefsOk
          ? Promise.resolve({ theme: 'dark', themeColor: '', locale: bridge.locale })
          : Promise.reject(new Error('bridge unavailable')),
      listDownloads: () =>
        bridge.downloads.ok
          ? Promise.resolve(bridge.downloads.items)
          : Promise.reject(new Error('bridge unavailable')),
      listUploads: () =>
        bridge.uploads.ok
          ? Promise.resolve(bridge.uploads.items)
          : Promise.reject(new Error('bridge unavailable')),
      onDownloadsState: (cb: (state: { items: DownloadRecord[] }) => void) => {
        bridge.pushDownloads = cb;
        return () => {
          bridge.offDownloads += 1;
        };
      },
      onUploadsState: (cb: (state: { items: UploadRecord[] }) => void) => {
        bridge.pushUploads = cb;
        return () => {
          bridge.offUploads += 1;
        };
      },
    },
  });
}

/** Row titles in rendered order — the first line of each `<li>`. */
export function rowTitles(): string[] {
  const list = screen.queryByRole('list');
  if (list === null) return [];
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent ?? '');
}

/** Register the per-test bridge reset, frozen clock and cleanup for the importing test file. */
export function installTransferPopupHooks(): void {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    bridge = {
      prefsOk: true,
      locale: 'en',
      downloads: { ok: true, items: [] },
      uploads: { ok: true, items: [] },
      pushDownloads: null,
      pushUploads: null,
      offDownloads: 0,
      offUploads: 0,
      closed: 0,
      navigated: [],
      resized: [],
    };
    stubBridge();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
}
