import { AppError } from '@tepegoz/libs';
import { CatalogMessages } from './messages';

/**
 * Injected I/O for a resumable download — the actual axios stream + file append live in the Electron
 * adapter (`apps/desktop/src/main/model-catalog/model-manager.electron.ts`); this keeps the
 * orchestration pure and unit-testable over a fake stream.
 */
export interface DownloadStreamDeps {
  /** Open a byte stream for `url` starting at `fromByte` (HTTP Range for resume). */
  open: (url: string, fromByte: number) => Promise<AsyncIterable<Uint8Array>>;
  /** Append one chunk to the destination `.part` file. */
  append: (chunk: Uint8Array) => Promise<void>;
  /** Bytes already present in the `.part` file (the resume point). */
  existingBytes: number;
  /** Total-bytes-so-far callback (throttling is the caller's concern). */
  onProgress?: (bytesDownloaded: number) => void;
  /** Cooperative cancellation, checked between chunks. */
  signal?: { readonly aborted: boolean };
}

/**
 * Stream `url` → `append`, resuming from `existingBytes`, reporting progress and honoring cancellation.
 * Returns the total bytes written. Integrity is verified separately by re-hashing the finished file
 * (see {@link sha256OfStream}) so a resumed download is still fully validated end-to-end.
 */
export async function downloadStream(url: string, deps: DownloadStreamDeps): Promise<number> {
  let total = deps.existingBytes;
  const stream = await deps.open(url, deps.existingBytes);
  for await (const chunk of stream) {
    if (deps.signal?.aborted === true) {
      throw new AppError(CatalogMessages.DownloadCanceled, 499);
    }
    await deps.append(chunk);
    total += chunk.length;
    deps.onProgress?.(total);
  }
  return total;
}
