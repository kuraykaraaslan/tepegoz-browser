// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { UploadFileRecord, UploadRecord, UploadsState } from '@tepegoz/uploads';
import { UploadsPage } from './uploads-page';

/**
 * The uploads ledger — the mirror of the downloads page, for data leaving the machine.
 *
 * Two things here are not cosmetic. Every row says WHO started the upload (the user, the agent, or
 * the site), because "did the assistant send that file" is the question this page exists to answer.
 * And the row shows the file NAMES with a standing note that local paths are hidden, so the ledger
 * itself never becomes the thing that discloses a directory layout.
 *
 * Two branches stay uncovered: the `cancelled` guards in the load effect. Reaching them means
 * unmounting mid-read, and the setState they prevent is already a silent no-op in React 18.
 */

const file = (filename: string, sizeBytes: number): UploadFileRecord => ({
  filename,
  sizeBytes,
  risk: 'normal',
});

function record(over: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'u1',
    status: 'staged',
    risk: 'normal',
    files: [file('report.pdf', 2048)],
    createdAt: 1,
    updatedAt: 1,
    targetOrigin: 'https://example.test',
    provenance: { actor: 'user' },
    ...over,
  };
}

function renderPage(
  records: UploadRecord[] = [record()],
  over: {
    list?: () => Promise<UploadRecord[]>;
    subscribe?: (cb: (s: UploadsState) => void) => () => void;
  } = {},
) {
  const list = vi.fn(over.list ?? (() => Promise.resolve(records)));
  const command = vi.fn(() => Promise.resolve());
  const subscribe = vi.fn(over.subscribe ?? (() => () => undefined));
  render(
    <I18nProvider locale="en">
      <UploadsPage list={list} command={command} subscribe={subscribe} />
    </I18nProvider>,
  );
  return { list, command, subscribe };
}

afterEach(cleanup);

describe('loading the ledger', () => {
  it('lists what the store returned', async () => {
    renderPage();
    expect(await screen.findByText('report.pdf')).toBeDefined();
  });

  it('shows the empty state rather than a permanent "Loading..." when the read fails', async () => {
    renderPage([], { list: () => Promise.reject(new Error('store gone')) });
    expect(await screen.findByText('No uploads yet')).toBeDefined();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows the empty state when there is nothing to show', async () => {
    renderPage([]);
    expect(await screen.findByText('No uploads yet')).toBeDefined();
  });

  it('replaces the list when the host pushes new state', async () => {
    let push: ((s: UploadsState) => void) | null = null;
    renderPage([record({ id: 'u1', files: [file('first.pdf', 10)] })], {
      subscribe: (cb) => {
        push = cb;
        return () => undefined;
      },
    });
    await screen.findByText('first.pdf');

    act(() => {
      push?.({ items: [record({ id: 'u2', files: [file('second.pdf', 10)] })] });
    });
    expect(await screen.findByText('second.pdf')).toBeDefined();
    expect(screen.queryByText('first.pdf')).toBeNull();
  });

  it('unsubscribes on unmount so a late push cannot land on a gone page', async () => {
    const unsubscribe = vi.fn();
    const { list } = renderPage([record()], { subscribe: () => unsubscribe });
    await waitFor(() => expect(list).toHaveBeenCalled());
    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('what a row discloses', () => {
  it('names who started the upload', async () => {
    // The whole reason this ledger exists: "did the assistant send that file" has to be answerable.
    renderPage([record({ provenance: { actor: 'agent' } })]);
    expect(await screen.findByText('Agent')).toBeDefined();
  });

  it('shows the file names but says that local paths are hidden', async () => {
    // A ledger of what left the machine must not itself disclose where things live on disk.
    renderPage();
    expect(await screen.findByText('report.pdf')).toBeDefined();
    expect(screen.getByText(/Local file paths are hidden/)).toBeDefined();
  });

  it('summarises a multi-file upload by count, then lists each file with its size', async () => {
    renderPage([record({ files: [file('a.pdf', 1024), file('b.pdf', 2048), file('c.pdf', 512)] })]);
    expect(await screen.findByText('3 Files')).toBeDefined();
    expect(screen.getByText(/a\.pdf · 1\.0 KB/)).toBeDefined();
    expect(screen.getByText(/c\.pdf · 512 B/)).toBeDefined();
  });

  it('does not repeat a single file in a per-file list', async () => {
    renderPage();
    await screen.findByText('report.pdf');
    expect(screen.queryByText(/report\.pdf ·/)).toBeNull();
  });

  it('totals the bytes across every file, scaled to a readable unit', async () => {
    renderPage([record({ files: [file('a.bin', 3_000_000), file('b.bin', 2_400_000)] })]);
    expect(await screen.findByText(/5\.1 MB/)).toBeDefined();
  });

  it('scales a very large upload to gigabytes', async () => {
    renderPage([record({ files: [file('archive.zip', 3_221_225_472)] })]);
    expect(await screen.findByText(/3\.0 GB/)).toBeDefined();
  });

  it('falls back from origin to url, and to a dash when it knows neither', async () => {
    renderPage([
      record({ id: 'a', targetOrigin: undefined, targetUrl: 'https://cdn.example/upload' }),
    ]);
    expect(await screen.findByText('https://cdn.example/upload')).toBeDefined();

    cleanup();
    renderPage([record({ id: 'b', targetOrigin: undefined, targetUrl: undefined })]);
    expect(await screen.findByText('-')).toBeDefined();
  });

  it('shows the failure reason when there is one', async () => {
    renderPage([record({ status: 'failed', error: 'the server refused it' })]);
    expect(await screen.findByText('the server refused it')).toBeDefined();
  });

  it('flags a risky upload and labels its risk', async () => {
    renderPage([record({ risk: 'executable' })]);
    expect(await screen.findByText('Executable')).toBeDefined();
  });
});

describe('what each status offers', () => {
  const actions = (): string[] =>
    screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');

  it('offers cancel while an upload is still stoppable', async () => {
    for (const status of ['staged', 'bound'] as const) {
      renderPage([record({ status })]);
      await screen.findByText('report.pdf');
      expect(actions(), status).toEqual(['Cancel']);
      cleanup();
    }
  });

  it('offers nothing once the bytes are in flight', async () => {
    // Submitting is past the point where cancelling means anything, and clearing a live row would
    // hide an upload that is still happening.
    renderPage([record({ status: 'submitting' })]);
    await screen.findByText('report.pdf');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('offers clear on every terminal status', async () => {
    for (const status of ['completed', 'failed', 'canceled', 'cleared'] as const) {
      renderPage([record({ status })]);
      await screen.findByText('report.pdf');
      expect(actions(), status).toEqual(['Clear']);
      cleanup();
    }
  });

  it('sends each command keyed to its own row', async () => {
    // Two distinct handlers: clearing a row where cancelling was meant would drop the record instead
    // of stopping the transfer.
    const { command } = renderPage([record({ id: 'u7', status: 'staged' })]);
    await screen.findByText('report.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(command).toHaveBeenCalledWith({ id: 'u7', action: 'cancel' });
    cleanup();

    const second = renderPage([record({ id: 'u8', status: 'completed' })]);
    await screen.findByText('report.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(second.command).toHaveBeenCalledWith({ id: 'u8', action: 'clear' });
  });

  it('does not let a rejected command escape as an unhandled rejection', async () => {
    const command = vi.fn(() => Promise.reject(new Error('bridge gone')));
    render(
      <I18nProvider locale="en">
        <UploadsPage
          list={() => Promise.resolve([record({ status: 'staged' })])}
          command={command}
          subscribe={() => () => undefined}
        />
      </I18nProvider>,
    );
    await screen.findByText('report.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    expect(screen.getByText('report.pdf')).toBeDefined();
  });
});
