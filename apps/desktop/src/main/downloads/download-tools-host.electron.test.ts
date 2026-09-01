import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Electron host behind the `download_*` agent tools. Two things it must get right: every created
 * download is forced to `actor: 'agent'` (provenance is not the model's to claim), and a `retry`
 * carries the active tab's web contents so it re-enters `will-download` on the session the agent can
 * see — not silently on the clear path.
 */

const svc = vi.hoisted(() => ({
  list: vi.fn(() => [] as unknown[]),
  create: vi.fn(),
  command: vi.fn(() => Promise.resolve()),
}));
const activeWc = { id: 'active-wc' };

vi.mock('./download-service.electron', () => ({ default: svc }));
vi.mock('../tabs', () => ({ default: { activeWebContents: () => activeWc } }));

const { downloadToolsHost } = await import('./download-tools-host.electron');

beforeEach(() => vi.clearAllMocks());

describe('downloadToolsHost', () => {
  it('lists whatever DownloadService reports', () => {
    svc.list.mockReturnValueOnce([{ id: 'a' }, { id: 'b' }]);
    expect(downloadToolsHost.listDownloads()).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('gets one record by id, or null when there is no match', () => {
    svc.list.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
    expect(downloadToolsHost.getDownload('b')).toEqual({ id: 'b' });
    expect(downloadToolsHost.getDownload('zzz')).toBeNull();
  });

  it('forces actor "agent" on a created download and starts it in the active tab', () => {
    downloadToolsHost.createDownload({ url: 'https://x/f.bin', actor: 'user' } as never);
    expect(svc.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x/f.bin', actor: 'agent' }),
      activeWc,
    );
  });

  it('passes the active web contents to a command so a retry can re-enter will-download', async () => {
    const res = await downloadToolsHost.commandDownload({ id: 'd1', action: 'retry' });
    expect(svc.command).toHaveBeenCalledWith('d1', 'retry', activeWc);
    expect(res).toEqual({ ok: true });
  });
});
