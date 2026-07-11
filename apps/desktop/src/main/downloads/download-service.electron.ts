import { session, type WebContents } from 'electron';
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
  clearTerminal,
  createState,
  list,
  pushPending,
  snapshot,
  type DownloadState,
} from './download-service-store.electron';
import { handleWillDownload } from './download-service-lifecycle.electron';
import { runCommand } from './download-service-commands.electron';

export type { DownloadTrustProvider } from './download-service-model.electron';

const BROWSING_PARTITION = 'persist:tepegoz-web';

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
        DownloadService.ctx.records.set(record.id, record);
      }
    }
    session.fromPartition(BROWSING_PARTITION).on('will-download', (_event, item, wc) => {
      handleWillDownload(DownloadService.ctx, item, wc);
    });
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
      throw new AppError('No active web page can start this download', 404);
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

  static async command(id: string, action: DownloadCommandAction): Promise<void> {
    await runCommand(DownloadService.ctx, id, action);
  }

  static clearTerminal(): void {
    clearTerminal(DownloadService.ctx);
  }
}

export default DownloadService;
