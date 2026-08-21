import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { app, shell } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import type {
  TypoDictionaryCatalogEntry,
  TypoDictionaryFileInfo,
  TypoDictionaryInfo,
} from '@tepegoz/ext-typo/types';

const DictionaryFileSchema = z.object({
  uri: z.string().url(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().min(64).max(64),
});

const DictionaryCatalogEntrySchema = z.object({
  id: z.string().min(1).max(64),
  language: z.string().min(1).max(16),
  name: z.string().min(1).max(128),
  uri: z.string().url(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().min(64).max(64),
  license: z.string().max(64),
  version: z.string().min(1).max(32),
  recommended: z.boolean(),
  aff: DictionaryFileSchema,
  dic: DictionaryFileSchema,
}) satisfies z.ZodType<TypoDictionaryCatalogEntry>;

const CatalogFileSchema = z.object({
  version: z.literal(1),
  dictionaries: z.array(DictionaryCatalogEntrySchema),
});

const InstallStateSchema = z.object({
  version: z.literal(1),
  installed: z.record(
    z.object({
      id: z.string(),
      version: z.string(),
      installedAt: z.number(),
      files: z.object({
        aff: z.object({ sha256: z.string(), sizeBytes: z.number().int() }),
        dic: z.object({ sha256: z.string(), sizeBytes: z.number().int() }),
      }),
    }),
  ),
});

type InstallState = z.infer<typeof InstallStateSchema>;

interface ActiveDownload {
  controller: AbortController;
  downloadedSize: number;
  totalSize: number;
  error: string | null;
}

export interface InstalledTypoDictionary {
  id: string;
  language: string;
  aff: string;
  dic: string;
}

let catalogCache: TypoDictionaryCatalogEntry[] | null = null;
const active = new Map<string, ActiveDownload>();
const lastErrors = new Map<string, string>();
let progressListener: ((dictionaries: TypoDictionaryInfo[]) => void) | null = null;

function dictionariesDir(): string {
  return join(app.getPath('userData'), 'dictionaries');
}

function statePath(): string {
  return join(dictionariesDir(), 'install-state.json');
}

function dictionaryDir(id: string): string {
  return join(dictionariesDir(), id);
}

function affPath(id: string): string {
  return join(dictionaryDir(id), 'index.aff');
}

function dicPath(id: string): string {
  return join(dictionaryDir(id), 'index.dic');
}

function catalog(): TypoDictionaryCatalogEntry[] {
  if (catalogCache !== null) return catalogCache;
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(app.getAppPath(), 'resources', 'typo-dictionaries.catalog.json'), 'utf8'),
    );
    const parsed = CatalogFileSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn('Invalid typo dictionary catalog', { err: parsed.error.message });
      catalogCache = [];
    } else {
      catalogCache = parsed.data.dictionaries;
    }
  } catch (err) {
    Logger.warn('Failed to read typo dictionary catalog', { err: String(err) });
    catalogCache = [];
  }
  return catalogCache;
}

function loadState(): InstallState {
  try {
    const raw: unknown = JSON.parse(readFileSync(statePath(), 'utf8'));
    const parsed = InstallStateSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    /* absent state is normal on first run */
  }
  return { version: 1, installed: {} };
}

function saveState(state: InstallState): void {
  mkdirSync(dictionariesDir(), { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function sha256File(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function fileMatches(path: string, meta: TypoDictionaryFileInfo): boolean {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return stat.size === meta.sizeBytes && sha256File(path) === meta.sha256;
}

function isInstalled(entry: TypoDictionaryCatalogEntry): boolean {
  const state = loadState().installed[entry.id];
  if (state === undefined || state.version !== entry.version) return false;
  if (state.files.aff.sha256 !== entry.aff.sha256 || state.files.dic.sha256 !== entry.dic.sha256) {
    return false;
  }
  return fileMatches(affPath(entry.id), entry.aff) && fileMatches(dicPath(entry.id), entry.dic);
}

function toInfo(entry: TypoDictionaryCatalogEntry): TypoDictionaryInfo {
  const dl = active.get(entry.id);
  const installed = dl === undefined ? isInstalled(entry) : false;
  const error = dl?.error ?? lastErrors.get(entry.id) ?? null;
  return {
    id: entry.id,
    language: entry.language,
    name: entry.name,
    uri: entry.uri,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
    license: entry.license,
    version: entry.version,
    recommended: entry.recommended,
    installed,
    downloading: dl !== undefined,
    progress: dl !== undefined && dl.totalSize > 0 ? dl.downloadedSize / dl.totalSize : 0,
    status:
      dl !== undefined
        ? 'downloading'
        : installed
          ? 'installed'
          : error !== null
            ? 'error'
            : 'available',
    error,
  };
}

function emitProgress(): void {
  progressListener?.(TypoDictionaryManager.list());
}

function requestFor(url: URL) {
  return url.protocol === 'http:' ? httpRequest : httpsRequest;
}

function downloadFile(
  urlString: string,
  targetPath: string,
  signal: AbortSignal,
  onProgress: (downloaded: number, total: number) => void,
  redirects = 0,
): Promise<void> {
  if (redirects > 5) return Promise.reject(new AppError('Too many redirects', 502));
  const url = new URL(urlString);
  return new Promise((resolve, reject) => {
    const req = requestFor(url)(
      url,
      { method: 'GET', signal, headers: { 'user-agent': 'tepegoz-typo-dictionary-manager' } },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location !== undefined) {
          res.resume();
          resolve(
            downloadFile(
              new URL(location, url).toString(),
              targetPath,
              signal,
              onProgress,
              redirects + 1,
            ),
          );
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new AppError(`Dictionary download failed with HTTP ${String(status)}`, 502));
          return;
        }
        const total = Number(res.headers['content-length'] ?? 0);
        let downloaded = 0;
        const out = createWriteStream(targetPath);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(downloaded, total);
        });
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        res.pipe(out);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchDictionaryFile(
  id: string,
  meta: TypoDictionaryFileInfo,
  finalPath: string,
  bytesBefore: number,
  controller: AbortController,
): Promise<void> {
  const partPath = `${finalPath}.part`;
  rmSync(partPath, { force: true });
  await downloadFile(meta.uri, partPath, controller.signal, (downloaded) => {
    const dl = active.get(id);
    if (dl !== undefined) {
      dl.downloadedSize = Math.min(dl.totalSize, bytesBefore + downloaded);
      emitProgress();
    }
  });
  if (sha256File(partPath) !== meta.sha256) {
    rmSync(partPath, { force: true });
    throw new AppError('Dictionary checksum mismatch', 502, 'dictionaryChecksumMismatch');
  }
  rmSync(finalPath, { force: true });
  renameSync(partPath, finalPath);
}

const TypoDictionaryManager = {
  setProgressListener(cb: (dictionaries: TypoDictionaryInfo[]) => void): void {
    progressListener = cb;
  },

  dictionariesDir,

  list(): TypoDictionaryInfo[] {
    return catalog().map(toInfo);
  },

  async download(id: string): Promise<void> {
    const entry = catalog().find((d) => d.id === id);
    if (entry === undefined) throw new AppError('Unknown dictionary id', 404, 'dictionaryNotFound');
    if (active.has(id)) return;
    lastErrors.delete(id);
    mkdirSync(dictionaryDir(id), { recursive: true });
    const controller = new AbortController();
    active.set(id, {
      controller,
      downloadedSize: 0,
      totalSize: entry.aff.sizeBytes + entry.dic.sizeBytes,
      error: null,
    });
    emitProgress();
    try {
      await fetchDictionaryFile(id, entry.aff, affPath(id), 0, controller);
      await fetchDictionaryFile(id, entry.dic, dicPath(id), entry.aff.sizeBytes, controller);
      const state = loadState();
      state.installed[id] = {
        id,
        version: entry.version,
        installedAt: Date.now(),
        files: {
          aff: { sha256: entry.aff.sha256, sizeBytes: entry.aff.sizeBytes },
          dic: { sha256: entry.dic.sha256, sizeBytes: entry.dic.sizeBytes },
        },
      };
      saveState(state);
      lastErrors.delete(id);
    } catch (err) {
      rmSync(join(dictionaryDir(id), 'index.aff.part'), { force: true });
      rmSync(join(dictionaryDir(id), 'index.dic.part'), { force: true });
      if (controller.signal.aborted) {
        Logger.info('Typo dictionary download canceled', { id });
      } else {
        const dl = active.get(id);
        if (dl !== undefined) dl.error = 'Download failed';
        lastErrors.set(id, 'Download failed');
        Logger.warn('Typo dictionary download failed', { id, err: String(err) });
        throw err instanceof AppError
          ? err
          : new AppError('Dictionary download failed', 502, 'dictionaryDownloadFailed');
      }
    } finally {
      active.delete(id);
      emitProgress();
    }
  },

  cancel(id: string): void {
    active.get(id)?.controller.abort();
  },

  remove(id: string): void {
    active.get(id)?.controller.abort();
    rmSync(dictionaryDir(id), { recursive: true, force: true });
    const state = loadState();
    delete state.installed[id];
    lastErrors.delete(id);
    saveState(state);
    emitProgress();
  },

  async showFolder(): Promise<void> {
    mkdirSync(dictionariesDir(), { recursive: true });
    await shell.openPath(dictionariesDir());
  },

  loadInstalled(language: string): InstalledTypoDictionary | null {
    const entries = catalog()
      .filter((entry) => entry.language === language)
      .sort((a, b) => Number(b.recommended) - Number(a.recommended));
    const entry = entries.find(isInstalled);
    if (entry === undefined) return null;
    return {
      id: entry.id,
      language: entry.language,
      aff: readFileSync(affPath(entry.id), 'utf8'),
      dic: readFileSync(dicPath(entry.id), 'utf8'),
    };
  },
};

export default TypoDictionaryManager;
