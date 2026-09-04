// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DownloadRecord, UploadRecord } from '@tepegoz/desktop-ipc';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { TransferActivityPopup } from './TransferActivityPopup';

/**
 * The toolbar transfer indicator — the one surface that shows downloads and uploads together.
 *
 * It is a popup with its own window, so it does all its own plumbing: it fetches both lists, subscribes
 * to both live channels, resolves the locale, applies the theme, and measures itself to tell the main
 * process how tall to be. None of that had ever run. What the tests below actually pin down:
 *
 *  - The two lists are ONE list, ordered by recency across both kinds. Sorting downloads and uploads
 *    separately, or appending one after the other, would put a file you uploaded ten seconds ago below
 *    a download from yesterday, which is precisely the question this popup exists to answer.
 *  - It shows at most ten, and the footer offers the full pages. A cap without that footer would be a
 *    silent truncation; the pairing is what makes the cap acceptable.
 *  - It unsubscribes from BOTH live channels on unmount. A popup window is opened and closed all day,
 *    and a leaked listener holding a closed window's setState is a warning per close, forever.
 *  - The bridge failing is not the same as there being nothing. Both `list*` calls can reject and the
 *    popup must still render its empty state rather than a blank window.
 *
 * `Date.now` is frozen: every row prints a relative time, and a test whose expected string depends on
 * the wall clock fails at midnight rather than when the code breaks.
 */

stubJsdomLayout();

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

interface Bridge {
  prefsOk: boolean;
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

let bridge: Bridge;

function download(over: Partial<DownloadRecord> = {}): DownloadRecord {
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

function upload(over: Partial<UploadRecord> = {}): UploadRecord {
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
          ? Promise.resolve({ theme: 'dark', themeColor: '', locale: 'en' })
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
function rowTitles(): string[] {
  const list = screen.queryByRole('list');
  if (list === null) return [];
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent ?? '');
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  bridge = {
    prefsOk: true,
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

describe('the two lists are one list', () => {
  it('orders downloads and uploads together by recency, newest first', async () => {
    bridge.downloads.items = [
      download({ id: 'd-old', filename: 'old.pdf', updatedAt: NOW - 300_000 }),
      download({ id: 'd-new', filename: 'new.pdf', updatedAt: NOW - 1_000 }),
    ];
    bridge.uploads.items = [
      upload({
        id: 'u-mid',
        files: [{ filename: 'middle.jpg', sizeBytes: 10, risk: 'normal' }],
        updatedAt: NOW - 60_000,
      }),
    ];

    render(<TransferActivityPopup />);

    // Interleaved by time — not downloads-then-uploads, which would bury a just-finished upload.
    await waitFor(() => {
      expect(rowTitles()).toEqual(['new.pdf', 'middle.jpg', 'old.pdf']);
    });
  });

  it('shows at most ten, and offers the full pages for the rest', async () => {
    bridge.downloads.items = Array.from({ length: 14 }, (_, i) =>
      download({ id: `d-${String(i)}`, filename: `file-${String(i)}.pdf`, updatedAt: NOW - i }),
    );

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(rowTitles()).toHaveLength(10);
    });
    // The cap is only acceptable because these exist — otherwise it is a silent truncation.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(2);
    expect(rowTitles()[0]).toBe('file-0.pdf');
  });

  it('says so when there is nothing, rather than showing an empty box', async () => {
    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.queryByRole('list')).toBeNull();
    });
    expect(screen.getByText('No downloads or uploads yet')).toBeTruthy();
  });
});

describe('what each row tells you', () => {
  it('names a single-file upload by its filename', async () => {
    bridge.uploads.items = [
      upload({ files: [{ filename: 'contract.pdf', sizeBytes: 500, risk: 'normal' }] }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(rowTitles()).toEqual(['contract.pdf']);
    });
  });

  it('counts a multi-file upload instead of naming just the first', async () => {
    bridge.uploads.items = [
      upload({
        files: [
          { filename: 'a.jpg', sizeBytes: 1, risk: 'normal' },
          { filename: 'b.jpg', sizeBytes: 1, risk: 'normal' },
          { filename: 'c.jpg', sizeBytes: 1, risk: 'normal' },
        ],
      }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(rowTitles()[0]).toMatch(/^3 /);
    });
  });

  it('sums the bytes across every file of an upload', async () => {
    bridge.uploads.items = [
      upload({
        files: [
          { filename: 'a.jpg', sizeBytes: 700, risk: 'normal' },
          { filename: 'b.jpg', sizeBytes: 400, risk: 'normal' },
        ],
      }),
    ];

    render(<TransferActivityPopup />);

    // 1100 bytes crosses into KB — reporting 700 (the first file) or 1100 B would both be wrong.
    await waitFor(() => {
      expect(screen.getByText(/1\.1 KB/)).toBeTruthy();
    });
  });

  it('shows a download size in the right unit at the boundary', async () => {
    bridge.downloads.items = [download({ receivedBytes: 1023, totalBytes: 1023 })];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText(/1023 B/)).toBeTruthy();
    });
  });

  it('reports the TOTAL size while a download is still in progress', async () => {
    // `receivedBytes` alone would show the size shrinking back to zero on every restart.
    bridge.downloads.items = [
      download({ status: 'in_progress', receivedBytes: 1024, totalBytes: 5 * 1024 * 1024 }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText(/5\.0 MB/)).toBeTruthy();
    });
  });

  it('falls back to received bytes when the total is unknown', async () => {
    bridge.downloads.items = [
      download({ status: 'in_progress', receivedBytes: 2048, totalBytes: null }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
    });
  });

  it('prefers the origin over the raw url, so a long link does not become the label', async () => {
    bridge.downloads.items = [
      download({
        url: 'https://files.example/very/long/path/report.pdf?token=secret',
        provenance: { actor: 'user', sourceOrigin: 'https://files.example' },
      }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText('https://files.example')).toBeTruthy();
    });
    // A query string can carry a token; it has no business in a popup row.
    expect(screen.queryByText(/token=secret/)).toBeNull();
  });
});

describe('live updates', () => {
  it('replaces the list when the main process pushes new download state', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    bridge.pushDownloads?.({ items: [download({ filename: 'pushed.pdf' })] });

    await waitFor(() => {
      expect(rowTitles()).toEqual(['pushed.pdf']);
    });
  });

  it('unsubscribes from BOTH channels when the popup goes away', async () => {
    const view = render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushUploads).not.toBeNull();
    });

    view.unmount();

    // A popup window is opened and closed all day; one leaked listener is a warning per close forever.
    expect(bridge.offDownloads).toBe(1);
    expect(bridge.offUploads).toBe(1);
  });
});

describe('when the bridge is not there', () => {
  it('renders the empty state rather than a blank window', async () => {
    bridge.downloads = { ok: false, items: [] };
    bridge.uploads = { ok: false, items: [] };

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText('No downloads or uploads yet')).toBeTruthy();
    });
  });

  it('still renders its list when the preferences fetch rejects', async () => {
    bridge.prefsOk = false;
    bridge.downloads.items = [download({ filename: 'anyway.pdf' })];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(rowTitles()).toEqual(['anyway.pdf']);
    });
  });
});

describe('size and time formatting across every unit', () => {
  it('reports a multi-gigabyte transfer in GB', async () => {
    bridge.downloads.items = [
      download({ status: 'in_progress', receivedBytes: 1024, totalBytes: 3 * 1024 * 1024 * 1024 }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => expect(screen.getByText(/3\.0 GB/)).toBeTruthy());
  });

  it('prints an hours-old transfer in hours and a days-old one in days', async () => {
    bridge.downloads.items = [
      download({ id: 'd-hr', filename: 'hours.pdf', updatedAt: NOW - 3 * 3_600_000 }),
      download({ id: 'd-day', filename: 'days.pdf', updatedAt: NOW - 4 * 86_400_000 }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => expect(rowTitles()).toEqual(['hours.pdf', 'days.pdf']));
    // both relative-time branches (hour, day) are exercised by rendering these two rows
    expect(screen.getByText(/3 hr/)).toBeTruthy();
    expect(screen.getByText(/4 days? ago/)).toBeTruthy();
  });
});

describe('the ways out', () => {
  it('closes on Escape', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(bridge.closed).toBe(1);
  });

  it('stops listening for Escape once unmounted', async () => {
    const view = render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    view.unmount();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(bridge.closed).toBe(0);
  });

  it('navigates to a full page AND closes, so the popup does not linger over it', async () => {
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(bridge.pushDownloads).not.toBeNull();
    });

    const footer = screen.getAllByRole('button').at(-1);
    fireEvent.click(footer as HTMLElement);

    expect(bridge.navigated).toHaveLength(1);
    expect(bridge.closed).toBe(1);
  });
});
