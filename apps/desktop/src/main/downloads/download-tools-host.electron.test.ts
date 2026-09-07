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
const http = vi.hoisted(() => ({ head: vi.fn(), get: vi.fn() }));

vi.mock('./download-service.electron', () => ({ default: svc }));
vi.mock('../tabs', () => ({ default: { activeWebContents: () => activeWc } }));
vi.mock('@tepegoz/http', () => ({ createHttpClient: () => http }));

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

describe('probeMedia', () => {
  it('reports status/content-type/content-length/finalUrl from a successful HEAD', async () => {
    http.head.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '1024' },
      request: { res: { responseUrl: 'https://cdn.example.com/pic.png' } },
    });
    const result = await downloadToolsHost.probeMedia('https://short.link/x');
    expect(result).toEqual({
      status: 200,
      contentType: 'image/png',
      contentLengthBytes: 1024,
      finalUrl: 'https://cdn.example.com/pic.png',
    });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('falls back to a ranged GET when HEAD is rejected with 405', async () => {
    http.head.mockResolvedValue({ status: 405, headers: {}, request: {} });
    http.get.mockResolvedValue({
      status: 206,
      headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/999' },
      request: { res: { responseUrl: 'https://cdn.example.com/clip.mp4' } },
    });
    const result = await downloadToolsHost.probeMedia('https://cdn.example.com/clip.mp4');
    expect(http.get).toHaveBeenCalledWith(
      'https://cdn.example.com/clip.mp4',
      expect.objectContaining({ headers: { Range: 'bytes=0-0' } }),
    );
    expect(result).toEqual({
      status: 206,
      contentType: 'video/mp4',
      contentLengthBytes: 999,
      finalUrl: 'https://cdn.example.com/clip.mp4',
    });
  });

  it('falls back to the ranged GET when HEAD throws (transport error)', async () => {
    http.head.mockRejectedValue(new Error('ECONNRESET'));
    http.get.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'content-length': '55' },
      request: {},
    });
    const result = await downloadToolsHost.probeMedia('https://cdn.example.com/song.mp3');
    expect(result).toEqual({
      status: 200,
      contentType: 'audio/mpeg',
      contentLengthBytes: 55,
      finalUrl: 'https://cdn.example.com/song.mp3',
    });
  });

  it('returns null when both HEAD and the ranged-GET fallback fail', async () => {
    http.head.mockRejectedValue(new Error('ECONNRESET'));
    http.get.mockRejectedValue(new Error('ECONNRESET'));
    expect(await downloadToolsHost.probeMedia('https://dead.example.com/x')).toBeNull();
  });

  it('ignores an unparseable content-range and falls back to content-length', async () => {
    http.head.mockResolvedValue({ status: 501, headers: {}, request: {} });
    http.get.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes */*', 'content-length': '10' },
      request: {},
    });
    const result = await downloadToolsHost.probeMedia('https://cdn.example.com/no-range.jpg');
    expect(result?.contentLengthBytes).toBe(10);
  });
});
