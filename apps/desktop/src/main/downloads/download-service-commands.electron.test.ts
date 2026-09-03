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
const bw = vi.hoisted((): { focused: unknown; all: unknown[] } => ({ focused: null, all: [] }));
const shellMock = vi.hoisted(() => ({
  openPath: vi.fn<() => Promise<string>>(() => Promise.resolve('')),
  showItemInFolder: vi.fn(),
}));
const resume = vi.hoisted(() => ({
  resumeInterrupted: vi.fn(() => ({ action: 'resume' })),
  resumeRefusal: vi.fn(
    () => Object.assign(new Error('resume refused'), { statusCode: 409 }) as Error,
  ),
}));
const autoretry = vi.hoisted(() => ({ forget: vi.fn() }));

vi.mock('./download-service-fs.electron', () => fs);
vi.mock('./download-service-store.electron', () => store);
vi.mock('./download-service-resume.electron', () => resume);
vi.mock('./download-service-autoretry.electron', () => autoretry);
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => bw.focused, getAllWindows: () => bw.all },
  dialog,
  shell: shellMock,
}));

const { runCommand } = await import('./download-service-commands.electron');

interface Rec {
  id: string;
  url: string;
  filename: string;
  status: string;
  trustVerdict?: string | undefined;
  quarantinePath?: string | undefined;
  finalPath?: string | undefined;
  provenance: { actor: string };
  item?:
    | {
        pause: ReturnType<typeof vi.fn>;
        resume: ReturnType<typeof vi.fn>;
        cancel: ReturnType<typeof vi.fn>;
        canResume: ReturnType<typeof vi.fn>;
      }
    | undefined;
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
  bw.focused = null;
  bw.all = [];
  shellMock.openPath.mockResolvedValue('');
  resume.resumeInterrupted.mockReturnValue({ action: 'resume' });
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
      await expect(run(state({ status: 'in_progress' }), 'd1', 'release')).rejects.toMatchObject({
        statusCode: 409,
      });
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

  describe('resume without a live DownloadItem', () => {
    it('delegates to resumeInterrupted and lets a "resume" plan through', async () => {
      resume.resumeInterrupted.mockReturnValue({ action: 'resume' });
      await run(state({ status: 'interrupted', item: undefined }), 'd1', 'resume');
      expect(resume.resumeInterrupted).toHaveBeenCalled();
    });

    it('throws the refusal when the plan is not "resume"', async () => {
      resume.resumeInterrupted.mockReturnValue({ action: 'refuse' });
      await expect(
        run(state({ status: 'interrupted', item: undefined }), 'd1', 'resume'),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(resume.resumeRefusal).toHaveBeenCalled();
    });

    it('a live item that reports it cannot resume is recorded, not overwritten', async () => {
      const item = fakeItem();
      item.canResume.mockReturnValue(false);
      await run(state({ status: 'paused', item }), 'd1', 'resume');
      expect(item.resume).not.toHaveBeenCalled();
      expect(store.patch).toHaveBeenCalledWith(
        expect.anything(),
        'd1',
        expect.objectContaining({ canResume: false }),
      );
    });
  });

  describe('open', () => {
    it('opens a released file via the OS shell', async () => {
      await run(state({ status: 'completed', finalPath: '/dl/f.bin' }), 'd1', 'open');
      expect(shellMock.openPath).toHaveBeenCalledWith('/dl/f.bin');
    });

    it('refuses a download that has not been released yet with 409', async () => {
      await expect(
        run(state({ status: 'quarantined', finalPath: undefined }), 'd1', 'open'),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('surfaces an OS open failure as a 500', async () => {
      shellMock.openPath.mockResolvedValueOnce('no application registered');
      await expect(
        run(state({ status: 'completed', finalPath: '/dl/f.bin' }), 'd1', 'open'),
      ).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe('reveal', () => {
    it('shows the final path in the file browser', async () => {
      await run(state({ status: 'completed', finalPath: '/dl/f.bin' }), 'd1', 'reveal');
      expect(shellMock.showItemInFolder).toHaveBeenCalledWith('/dl/f.bin');
    });

    it('falls back to the quarantine path when there is no final path', async () => {
      await run(
        state({ status: 'quarantined', finalPath: undefined, quarantinePath: '/q/f.bin' }),
        'd1',
        'reveal',
      );
      expect(shellMock.showItemInFolder).toHaveBeenCalledWith('/q/f.bin');
    });

    it('404s when neither path is available', async () => {
      await expect(
        run(
          state({ status: 'in_progress', finalPath: undefined, quarantinePath: undefined }),
          'd1',
          'reveal',
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('release — the save-dialog paths', () => {
    it('computes a fresh unique final path when the record has none', async () => {
      await run(
        state({ status: 'quarantined', trustVerdict: 'safe', finalPath: undefined }),
        'd1',
        'release',
      );
      expect(fs.uniquePath).toHaveBeenCalledWith('/dl', 'f.bin');
      expect(fs.moveFile).toHaveBeenCalled();
    });

    it('prompts with the focused window and moves to the chosen path under "ask each time"', async () => {
      prefs.downloadAskEachTime = true;
      bw.focused = { __win: true };
      dialog.showSaveDialog.mockResolvedValueOnce({
        canceled: false,
        filePath: '/picked/here.bin',
      });
      await run(state({ status: 'quarantined', trustVerdict: 'safe' }), 'd1', 'release');
      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        { __win: true },
        expect.objectContaining({ defaultPath: expect.any(String) as string }),
      );
      expect(fs.moveFile).toHaveBeenCalledWith('/q/f.bin', '/picked/here.bin');
    });
  });
});
