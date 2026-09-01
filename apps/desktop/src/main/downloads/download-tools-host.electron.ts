import type { DownloadCommandInput, DownloadCreateInput, DownloadRecord } from '@tepegoz/downloads';
import type { DownloadToolsHost } from '@tepegoz/downloads/tools';
import DownloadService from './download-service.electron';
import TabManager from '../tabs';

/** Electron host for the built-in download_* agent tools. Records are already path-redacted by DownloadService. */
export const downloadToolsHost: DownloadToolsHost = {
  listDownloads: () => DownloadService.list(),
  getDownload: (id: string): DownloadRecord | null =>
    DownloadService.list().find((record) => record.id === id) ?? null,
  createDownload: (input: DownloadCreateInput) =>
    DownloadService.create({ ...input, actor: 'agent' }, TabManager.activeWebContents()),
  commandDownload: async (input: DownloadCommandInput) => {
    // `retry` re-enters `will-download` and needs a live page to attach the transfer to — the same
    // active tab `createDownload` uses, so an agent retry runs the quarantine/trust path on the
    // session the agent can see. Every other action ignores the web contents.
    await DownloadService.command(input.id, input.action, TabManager.activeWebContents());
    return { ok: true };
  },
};
