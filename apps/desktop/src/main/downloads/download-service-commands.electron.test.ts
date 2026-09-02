import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `runCommand` is the download command dispatch — pause/resume/cancel/release/open/reveal/retry/clear.
 * Two branches carry weight: `release` refuses a trust-blocked file and a not-yet-quarantined one, and
 * `retry` re-enters the real `will-download` path (it must have a live web page, and it drops the old
 * record rather than mutating it in place).
 */

const fs = vi.hoisted(() => ({
  moveFile: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  uniquePath: vi.fn((dir: string, name: string) => `${dir}/${name}`),
}));
const store = vi.hoisted(() => ({
  appendAudit: vi.fn(),
  // Release is one of the two moments the retention policy can act, so the command reaches for it.
  applyRetentionPolicy: vi.fn(() => 0),
  downloadDirectory: vi.fn(() => '/dl'),
  patch: vi.fn(),
  pushPending: vi.fn(),
  removeRecord: vi.fn(),
}));
const prefs = vi.hoisted(() => ({
  downloadAskEachTime: false,
  downloadDirectory: '',
  downloadHistoryRetention: 'manual' as const,
}));
const dialog = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));

vi.mock('./download-service-fs.electron', () => fs);
vi.mock('./download-service-store.electron', () => store);
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog,
  shell: { openPath: vi.fn(() => Promise.resolve('')), showItemInFolder: vi.fn() },
}));

const { runCommand } = await import('./download-service-commands.electron');

interface Rec {
  id: string;
  url: string;
  filename: string;
  status: string;
  trustVerdict?: string;
  quarantinePath?: string;
  finalPath?: string;
  provenance: { actor: string };
  item?: {
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    canResume: ReturnType<typeof vi.fn>;
  };
}

function fakeItem() {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    canResume: vi.fn(() => true),
  };
}

function state(rec?: Partial<Rec>): { records: Map<string, Rec> } {
  const records = new Map<string, Rec>();
  if (rec) {
    records.set('d1', {
      id: 'd1',
      url: 'https://example.com/f.bin',
      filename: 'f.bin',
      status: 'quarantined',
      trustVerdict: 'unknown',
      quarantinePath: '/q/f.bin',
      finalPath: '/dl/f.bin',
      provenance: { actor: 'user' },
      ...rec,
    });
  }
  return { records };
}

const run = (s: unknown, id: string, action: string, wc?: unknown) =>
  runCommand(s as never, id, action as never, wc as never);

beforeEach(() => {
  vi.clearAllMocks();
  prefs.downloadAskEachTime = false;
});
afterEach(() => vi.clearAllMocks());

describe('runCommand', () => {
  it('throws 404 for an unknown download id', async () => {
    await expect(run(state(), 'nope', 'pause')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an unsupported action with 400', async () => {
    await expect(run(state({}), 'd1', 'frobnicate')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('pause / resume / cancel drive the underlying DownloadItem', async () => {
    const item = fakeItem();
    const s = state({ status: 'in_progress', item });
    await run(s, 'd1', 'pause');
    expect(item.pause).toHaveBeenCalled();
    await run(s, 'd1', 'resume');
    expect(item.resume).toHaveBeenCalled();
    await run(s, 'd1', 'cancel');
    expect(item.cancel).toHaveBeenCalled();
    expect(store.appendAudit).toHaveBeenCalledWith('DownloadCanceled', expect.anything());
  });

  describe('release', () => {
    it('refuses a trust-blocked file with 403, without moving anything', async () => {
      await expect(
        run(state({ status: 'quarantined', trustVerdict: 'blocked' }), 'd1', 'release'),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(fs.moveFile).not.toHaveBeenCalled();
    });

    it('refuses a download that is not in quarantine yet with 409', async () => {
      await expect(
        run(state({ status: 'in_progress' }), 'd1', 'release'),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(fs.moveFile).not.toHaveBeenCalled();
    });

    it('moves the file out of quarantine and journals the release', async () => {
      await run(state({ status: 'quarantined', trustVerdict: 'safe' }), 'd1', 'release');
      expect(fs.moveFile).toHaveBeenCalledWith('/q/f.bin', '/dl/f.bin');
      expect(store.patch).toHaveBeenCalledWith(
        expect.anything(),
        'd1',
        expect.objectContaining({ status: 'completed' }),
      );
      expect(store.appendAudit).toHaveBeenCalledWith('DownloadReleased', expect.anything());
    });

    it('honours "ask each time" and does nothing if the save dialog is cancelled', async () => {
      prefs.downloadAskEachTime = true;
      dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
      await run(state({ status: 'quarantined', trustVerdict: 'safe' }), 'd1', 'release');
      expect(fs.moveFile).not.toHaveBeenCalled();
      expect(store.appendAudit).not.toHaveBeenCalledWith('DownloadReleased', expect.anything());
    });
  });

  describe('retry', () => {
    it('rejects a download that is still running (409)', async () => {
      await expect(run(state({ status: 'in_progress' }), 'd1', 'retry')).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('needs a live web page (404 when none is passed)', async () => {
      await expect(run(state({ status: 'failed' }), 'd1', 'retry')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('drops the old record and re-enters will-download on the given page', async () => {
      const downloadURL = vi.fn();
      const wc = { isDestroyed: () => false, downloadURL };
      await run(state({ status: 'failed' }), 'd1', 'retry', wc);
      expect(store.removeRecord).toHaveBeenCalledWith(expect.anything(), 'd1');
      expect(store.pushPending).toHaveBeenCalledWith(
        expect.anything(),
        'https://example.com/f.bin',
        expect.objectContaining({ actor: 'user' }),
      );
      expect(downloadURL).toHaveBeenCalledWith('https://example.com/f.bin');
    });
  });

  it('clear removes the record outright', async () => {
    await run(state({ status: 'completed' }), 'd1', 'clear');
    expect(store.removeRecord).toHaveBeenCalledWith(expect.anything(), 'd1');
  });
});
