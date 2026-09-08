// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { DownloadRecord, DownloadsState } from '@tepegoz/downloads';
import { DownloadsPage } from './downloads-page';

/**
 * Two branches stay uncovered: the `cancelled` guards in the initial-load effect. Reaching them means
 * unmounting mid-read, and what they prevent — a setState on an unmounted tree — React 18 already
 * makes a silent no-op, so a test could drive the path but could not tell the guard from its absence.
 */

function record(over: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.bin',
    filename: 'file.bin',
    status: 'quarantined',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 100,
    totalBytes: 100,
    canResume: false,
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user', sourceOrigin: 'https://example.com' },
    ...over,
  };
}

function renderPage(
  records: DownloadRecord[],
  locale: 'en' | 'tr' = 'en',
  over: { onExport?: () => Promise<string> } = {},
) {
  const list = vi.fn<() => Promise<DownloadRecord[]>>(() => Promise.resolve(records));
  const command = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());
  const subscribe = vi.fn<(cb: (s: DownloadsState) => void) => () => void>(() => () => undefined);
  const onExport = over.onExport === undefined ? undefined : vi.fn(over.onExport);
  render(
    <I18nProvider locale={locale}>
      <DownloadsPage
        list={list}
        command={command}
        subscribe={subscribe}
        {...(onExport === undefined ? {} : { onExport })}
      />
    </I18nProvider>,
  );
  return { list, command, subscribe, onExport };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DownloadsPage', () => {
  it("warns that an archive wasn't scanned inside — only while it is still openable", async () => {
    renderPage([record({ filename: 'photos.zip', risk: 'archive', status: 'quarantined' })]);
    await waitFor(() => expect(screen.getByText(/wasn't scanned inside/i)).toBeDefined());
  });

  it('drops the archive warning once the download is blocked (nothing to open)', async () => {
    renderPage([record({ filename: 'photos.zip', risk: 'archive', status: 'blocked' })]);
    await waitFor(() => expect(screen.getByText('photos.zip')).toBeDefined());
    expect(screen.queryByText(/wasn't scanned inside/i)).toBeNull();
  });

  it('shows the quarantine-approval warning for an executable, not the archive one', async () => {
    renderPage([record({ filename: 'setup.exe', risk: 'executable', status: 'quarantined' })]);
    await waitFor(() =>
      expect(screen.getByText(/needs your approval before it leaves quarantine/i)).toBeDefined(),
    );
    expect(screen.queryByText(/wasn't scanned inside/i)).toBeNull();
  });

  it('renders both warnings localized in Turkish', async () => {
    renderPage(
      [
        record({ id: 'a', filename: 'x.zip', risk: 'archive', status: 'completed' }),
        record({ id: 'b', filename: 'y.exe', risk: 'executable', status: 'quarantined' }),
      ],
      'tr',
    );
    await waitFor(() => expect(screen.getByText(/içi taranmadı/i)).toBeDefined());
    expect(screen.getByText(/onayınızı gerektirir/i)).toBeDefined();
  });

  it('shows the empty state when there are no downloads', async () => {
    renderPage([]);
    await waitFor(() => expect(screen.getByText('No downloads yet')).toBeDefined());
  });
});

describe('what each download status offers', () => {
  /** The action buttons on the single rendered row, by their visible label. */
  const actions = (): string[] =>
    screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');

  it('offers pause and cancel while a download is running, and nothing that assumes a file', async () => {
    // Open/Show-in-folder on a half-written file would hand the user a partial download.
    renderPage([record({ status: 'in_progress', receivedBytes: 40, totalBytes: 100 })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Pause', 'Cancel']);
  });

  it('offers resume and cancel while paused', async () => {
    renderPage([record({ status: 'paused', receivedBytes: 40, totalBytes: 100 })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Resume', 'Cancel']);
  });

  it('offers only cancel for a download that has been requested but not started', async () => {
    renderPage([record({ status: 'requested', receivedBytes: 0, totalBytes: null })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Cancel']);
  });

  it('offers release and reveal for a quarantined file — but never Open', async () => {
    // Quarantine exists to stop exactly that click; the file must be released first.
    renderPage([record({ status: 'quarantined' })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Release', 'Show in folder', 'Clear'].slice(0, 2));
    expect(actions()).not.toContain('Open');
  });

  it('offers open, reveal and clear once completed', async () => {
    renderPage([record({ status: 'completed' })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Open', 'Show in folder', 'Clear']);
  });

  it('offers retry and clear for a failed or cancelled download', async () => {
    for (const status of ['failed', 'canceled'] as const) {
      renderPage([record({ status })]);
      await screen.findByText('file.bin');
      expect(actions(), status).toEqual(['Retry', 'Clear']);
      cleanup();
    }
  });

  it('offers only clear for a blocked download — it is not retryable', async () => {
    // A blocked download was refused on purpose. Retry would just walk into the same refusal.
    renderPage([record({ status: 'blocked' })]);
    await screen.findByText('file.bin');
    expect(actions()).toEqual(['Clear']);
  });

  it('sends the row action the host expects, keyed to that row', async () => {
    const { command } = renderPage([record({ id: 'd7', status: 'in_progress' })]);
    await screen.findByText('file.bin');
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    expect(command).toHaveBeenCalledWith({ id: 'd7', action: 'pause' });
  });

  it('does not let a rejected command escape as an unhandled rejection', async () => {
    // Commands are fire-and-forget from the row's side; a failed pause must not take the page down.
    const command = vi.fn<(input: unknown) => Promise<void>>(() =>
      Promise.reject(new Error('bridge gone')),
    );
    render(
      <I18nProvider locale="en">
        <DownloadsPage
          list={() => Promise.resolve([record({ status: 'in_progress' })])}
          command={command}
          subscribe={() => () => undefined}
        />
      </I18nProvider>,
    );
    await screen.findByText('file.bin');
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    expect(screen.getByText('file.bin')).toBeDefined();
  });
});

describe('what a row says about progress', () => {
  it('scales the size to the unit a human reads, not raw bytes', async () => {
    renderPage([record({ status: 'completed', receivedBytes: 5_400_000, totalBytes: 5_400_000 })]);
    expect(await screen.findByText(/5\.1 MB . 5\.1 MB/)).toBeDefined();
  });

  it('shows speed and a remaining time while running', async () => {
    renderPage([
      record({
        status: 'in_progress',
        receivedBytes: 1_048_576,
        totalBytes: 10_485_760,
        bytesPerSecond: 524_288,
        etaSeconds: 65,
      }),
    ]);
    // 512.0 KB/s, and 65s written as 1:05 rather than "65 seconds"
    expect(await screen.findByText(/512\.0 KB/)).toBeDefined();
    expect(screen.getByText(/1:05/)).toBeDefined();
  });

  it('writes a long remaining time with hours', async () => {
    renderPage([
      record({
        status: 'in_progress',
        receivedBytes: 1,
        totalBytes: 100,
        bytesPerSecond: 1024,
        etaSeconds: 3725,
      }),
    ]);
    expect(await screen.findByText(/1:02:05/)).toBeDefined();
  });

  it('says nothing about speed when the host is not reporting one', async () => {
    renderPage([record({ status: 'in_progress', receivedBytes: 1, totalBytes: 100 })]);
    await screen.findByText('file.bin');
    expect(screen.queryByText(/\/s/)).toBeNull();
  });

  it('leaves the bar at zero for a download of unknown size, and says so in words', async () => {
    // The track still renders so the row does not jump when a total arrives, but filling it against
    // an unknown total would be inventing a percentage — the text carries the honest answer instead.
    renderPage([record({ status: 'in_progress', receivedBytes: 500, totalBytes: null })]);
    await screen.findByText('file.bin');
    const fill = document.querySelector('.bg-primary');
    expect((fill as HTMLElement | null)?.style.width).toBe('0%');
    expect(screen.getByText(/unknown/i)).toBeDefined();
  });

  it('falls back to the url when the download carries no source origin', async () => {
    renderPage([
      record({
        status: 'completed',
        url: 'https://cdn.example/thing.bin',
        provenance: { actor: 'user' },
      }),
    ]);
    expect(await screen.findByText('https://cdn.example/thing.bin')).toBeDefined();
  });
});

describe('loading the list', () => {
  it('shows the empty state when the list read fails, rather than staying on loading forever', async () => {
    render(
      <I18nProvider locale="en">
        <DownloadsPage
          list={() => Promise.reject(new Error('store gone'))}
          command={() => Promise.resolve()}
          subscribe={() => () => undefined}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByText(/No downloads/i)).toBeDefined());
  });

  it('replaces the list when the host pushes new state', async () => {
    let push: ((s: DownloadsState) => void) | null = null;
    render(
      <I18nProvider locale="en">
        <DownloadsPage
          list={() => Promise.resolve([record({ id: 'd1', filename: 'first.bin' })])}
          command={() => Promise.resolve()}
          subscribe={(cb) => {
            push = cb;
            return () => undefined;
          }}
        />
      </I18nProvider>,
    );
    await screen.findByText('first.bin');

    act(() => {
      push?.({ items: [record({ id: 'd2', filename: 'second.bin' })] });
    });
    expect(await screen.findByText('second.bin')).toBeDefined();
    expect(screen.queryByText('first.bin')).toBeNull();
  });

  it('unsubscribes on unmount, so a late push cannot land on a gone page', async () => {
    const unsubscribe = vi.fn();
    const view = render(
      <I18nProvider locale="en">
        <DownloadsPage
          list={() => Promise.resolve([record()])}
          command={() => Promise.resolve()}
          subscribe={() => unsubscribe}
        />
      </I18nProvider>,
    );
    await screen.findByText('file.bin');
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('every row action reaches the host', () => {
  const cases = [
    { status: 'in_progress', label: 'Pause', action: 'pause' },
    { status: 'paused', label: 'Resume', action: 'resume' },
    { status: 'paused', label: 'Cancel', action: 'cancel' },
    { status: 'quarantined', label: 'Release', action: 'release' },
    { status: 'completed', label: 'Open', action: 'open' },
    { status: 'completed', label: 'Show in folder', action: 'reveal' },
    { status: 'failed', label: 'Retry', action: 'retry' },
    { status: 'blocked', label: 'Clear', action: 'clear' },
  ] as const;

  it('sends the right command for each button on each status', async () => {
    // Every one of these is a distinct handler; a mis-wired button would send a neighbouring action
    // — "clear" where "cancel" was meant loses the download instead of stopping it.
    for (const { status, label, action } of cases) {
      const { command } = renderPage([record({ id: 'row', status })]);
      await screen.findByText('file.bin');
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
      expect(command, `${status} → ${label}`).toHaveBeenCalledWith({ id: 'row', action });
      cleanup();
    }
  });
});

describe('exporting the downloads list', () => {
  it('offers Export only when the host can produce a file', async () => {
    renderPage([record({ status: 'completed' })]);
    await screen.findByText('file.bin');
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('downloads the CSV the host returns via a blob link', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') el.click = click;
      return el;
    });

    const { onExport } = renderPage([record({ status: 'completed' })], 'en', {
      onExport: () => Promise.resolve('filename,url\r\n'),
    });
    await screen.findByText('file.bin');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});

describe('size and rate formatting at the edges', () => {
  it('reports bytes, kilobytes, megabytes and gigabytes each in their own unit', async () => {
    const sizes: [number, RegExp][] = [
      [512, /512 B/],
      [2048, /2\.0 KB/],
      [5_400_000, /5\.1 MB/],
      [3_221_225_472, /3\.0 GB/],
    ];
    for (const [bytes, shown] of sizes) {
      renderPage([record({ status: 'completed', receivedBytes: bytes, totalBytes: bytes })]);
      expect(await screen.findByText(shown), String(bytes)).toBeDefined();
      cleanup();
    }
  });

  it('shows the speed without a remaining time when the host has no estimate yet', async () => {
    // Early in a download there is a rate but no credible ETA. Printing "0:00 left" would be a lie;
    // printing nothing is the honest half-answer.
    renderPage([
      record({
        status: 'in_progress',
        receivedBytes: 1,
        totalBytes: 100,
        bytesPerSecond: 2048,
      }),
    ]);
    expect(await screen.findByText(/2\.0 KB\/s/)).toBeDefined();
    expect(screen.queryByText(/left/i)).toBeNull();
  });
});
