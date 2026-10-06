// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { stubJsdomLayout } from '../test-support/jsdom-layout';
import { TransferActivityPopup } from './TransferActivityPopup';
import {
  NOW,
  bridge,
  download,
  installTransferPopupHooks,
  rowTitles,
  upload,
} from './TransferActivityPopup.testkit';

/**
 * Transfer popup — what the list is and what each row says: one recency-ordered list across downloads and
 * uploads (capped at ten, with the full-page footer), and the title / size / origin / glyph of each row.
 * Shared bridge and fixtures: `TransferActivityPopup.testkit.tsx`.
 */

stubJsdomLayout();
installTransferPopupHooks();

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

  it('falls back to the raw url when a download has no source origin', async () => {
    bridge.downloads.items = [
      download({ url: 'https://files.example/report.pdf', provenance: { actor: 'user' } }),
    ];

    render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getByText('https://files.example/report.pdf')).toBeTruthy();
    });
  });

  it("falls back from an upload's target origin to its target url, then to a dash", async () => {
    bridge.uploads.items = [
      upload({
        targetOrigin: undefined,
        targetUrl: 'https://forms.example/submit',
        provenance: { actor: 'user' },
      }),
    ];
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(screen.getByText('https://forms.example/submit')).toBeTruthy();
    });
    cleanup();

    bridge.uploads.items = [
      upload({ targetOrigin: undefined, targetUrl: undefined, provenance: { actor: 'user' } }),
    ];
    render(<TransferActivityPopup />);
    await waitFor(() => {
      expect(screen.getByText('-')).toBeTruthy();
    });
  });

  it('shows the risk glyph regardless of direction, and the plain direction glyph otherwise', async () => {
    bridge.downloads.items = [download({ id: 'd-risky', risk: 'executable' })];
    bridge.uploads.items = [upload({ id: 'u-safe', risk: 'normal' })];

    const { container } = render(<TransferActivityPopup />);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
    const icons = [...container.querySelectorAll('svg[data-icon]')].map((el) =>
      el.getAttribute('data-icon'),
    );
    expect(icons).toContain('circle-exclamation');
    expect(icons).toContain('arrow-up');
  });
});
