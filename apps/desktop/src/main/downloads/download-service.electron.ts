import { type WebContents } from 'electron';
import {
  type DownloadCommandAction,
  type DownloadCreateInput,
  type DownloadProvenance,
  type DownloadRecord,
  type DownloadsState,
} from '@tepegoz/downloads';
import { AppError } from '@tepegoz/libs';
import { DownloadStore } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import { originOf } from './download-service-fs.electron';
import {
  unknownTrustProvider,
  type DownloadTrustProvider,
} from './download-service-model.electron';
import {
  applyRetentionPolicy,
  clearTerminal,
  createState,
  list,
  pushPending,
  snapshot,
  type DownloadState,
} from './download-service-store.electron';
import { handleWillDownload, ingestGeneratedFile } from './download-service-lifecycle.electron';
import BrowsingSessions from '../network/browsing-sessions.electron';
import { runCommand } from './download-service-commands.electron';

export type { DownloadTrustProvider } from './download-service-model.electron';

class DownloadService {
  private static initialized = false;
  private static readonly ctx: DownloadState = createState();

  static init(provider: DownloadTrustProvider = unknownTrustProvider): void {
    if (DownloadService.initialized) return;
    DownloadService.initialized = true;
    DownloadService.ctx.trustProvider = provider;
    const db = getDb();
    if (db !== null) {
      for (const record of DownloadStore.list(db)) {
        // No `DownloadItem` survives a restart, so a row still reading `in_progress` describes a
        // transfer that is not happening. Correct it on the way in rather than showing a progress bar
        // that will never move: `paused` is what it actually is, and the resume path knows how to
        // pick it up from the bytes on disk.
        DownloadService.ctx.records.set(
          record.id,
          record.status === 'in_progress' ? { ...record, status: 'paused' } : record,
        );
      }
      // Rows age out while the app is closed, so "after one day" has to be applied on the way in —
      // otherwise a browser that is opened once a week never removes anything. No-op on the default
      // `manual` policy.
      applyRetentionPolicy(DownloadService.ctx);
    }
    // Every browsing session, present and future — a download started from a VPN/Tor-bound tab must go
    // through the same quarantine path as one from a Direct tab. Registered as CRITICAL: a session we
    // cannot attach the quarantine handler to is one no tab may be hosted on, because the alternative is
    // a partition where files land on disk unscanned and nothing says so.
    BrowsingSessions.register(
      'downloads',
      (ses) => {
        ses.on('will-download', (_event, item, wc) => {
          handleWillDownload(DownloadService.ctx, item, wc);
        });
      },
      { critical: true },
    );
  }

  /**
   * Take bytes the browser generated (a page printed to PDF) into the download lifecycle: quarantine,
   * hash, trust check, and the same release gate as everything else. Returns the record id.
   */
  static ingestGeneratedFile(input: {
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    provenance: DownloadProvenance;
    sourceUrl: string;
  }): Promise<string> {
    return ingestGeneratedFile(DownloadService.ctx, input);
  }

  static list(): DownloadRecord[] {
    return list(DownloadService.ctx);
  }

  static state(): DownloadsState {
    return snapshot(DownloadService.ctx);
  }

  static downloadURL(wc: WebContents, url: string, provenance?: Partial<DownloadProvenance>): void {
    if (url.length === 0) return;
    const sourceUrl = provenance?.sourceUrl ?? wc.getURL();
    pushPending(DownloadService.ctx, url, {
      actor: provenance?.actor ?? 'user',
      sourceUrl,
      sourceOrigin: provenance?.sourceOrigin ?? originOf(sourceUrl),
      correlationId: provenance?.correlationId,
      taskId: provenance?.taskId,
    });
    wc.downloadURL(url);
  }

  static create(input: DownloadCreateInput, wc?: WebContents | null): { idempotencyKey?: string } {
    const target = wc ?? null;
    if (target === null || target.isDestroyed()) {
      throw new AppError('No active web page can start this download', 404, 'downloadNoActivePage');
    }
    DownloadService.downloadURL(target, input.url, {
      actor: input.actor ?? 'agent',
      sourceUrl: input.sourceUrl,
      sourceOrigin: input.sourceUrl !== undefined ? originOf(input.sourceUrl) : undefined,
      correlationId: input.correlationId,
      taskId: input.taskId,
    });
    return input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {};
  }

  static async command(
    id: string,
    action: DownloadCommandAction,
    wc?: WebContents | null,
  ): Promise<void> {
    await runCommand(DownloadService.ctx, id, action, wc);
  }

  static clearTerminal(): number {
    return clearTerminal(DownloadService.ctx);
  }
}

export default DownloadService;
