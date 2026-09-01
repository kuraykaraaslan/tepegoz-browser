// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
import type { DownloadRecord, DownloadsState } from '@tepegoz/downloads';
import { DownloadsPage } from './downloads-page';

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

function renderPage(records: DownloadRecord[], locale: 'en' | 'tr' = 'en') {
  const list = vi.fn<() => Promise<DownloadRecord[]>>(() => Promise.resolve(records));
  const command = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());
  const subscribe = vi.fn<(cb: (s: DownloadsState) => void) => () => void>(() => () => undefined);
  render(
    <I18nProvider locale={locale}>
      <DownloadsPage list={list} command={command} subscribe={subscribe} />
    </I18nProvider>,
  );
  return { list, command, subscribe };
}

afterEach(cleanup);

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
