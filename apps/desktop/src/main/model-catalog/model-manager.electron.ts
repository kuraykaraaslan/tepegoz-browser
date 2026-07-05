import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import type { SelectedLocalModel } from '@tepegoz/local-inference';
import type { LocalModelInfo } from '@tepegoz/desktop-ipc';

/**
 * On-device model management (main process). Downloads GGUF models into the tepegöz profile
 * (`userData/models/<id>.gguf`) via `node-llama-cpp`'s `resolveModelFile` (HF/URL URIs, resumable,
 * progress) — NOT bundled with the app. The catalog is data-driven (`resources/models.catalog.json`,
 * zod-validated). "Installed" is simply "the file exists"; the selected model lives in
 * `prefs.localProvider.selectedModelId`, and `resolveModel()` feeds the local inference engine.
 */
const ModelCatalogEntrySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  /** HF (`hf:user/repo/file.gguf`) or direct URL — resolved by node-llama-cpp. */
  uri: z.string().min(1).max(512),
  ctx: z.number().int().positive(),
  paramsB: z.number().positive(),
  recommended: z.boolean().default(false),
  firstParty: z.boolean().default(false),
  license: z.string().max(64).default(''),
});
type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;
const CatalogFileSchema = z.object({ version: z.literal(1), models: z.array(ModelCatalogEntrySchema) });

interface ActiveDownload {
  downloadedSize: number;
  totalSize: number;
  controller: AbortController;
}

let catalogCache: ModelCatalogEntry[] | null = null;
const active = new Map<string, ActiveDownload>();
let progressListener: ((models: LocalModelInfo[]) => void) | null = null;

function modelsDir(): string {
  return join(app.getPath('userData'), 'models');
}
function modelFilePath(id: string): string {
  return join(modelsDir(), `${id}.gguf`);
}

function catalog(): ModelCatalogEntry[] {
  if (catalogCache !== null) return catalogCache;
  try {
    // resources/** ships inside app.asar → this one path resolves in dev and packaged builds.
    const raw: unknown = JSON.parse(
      readFileSync(join(app.getAppPath(), 'resources', 'models.catalog.json'), 'utf8'),
    );
    const parsed = CatalogFileSchema.safeParse(raw);
    if (!parsed.success) {
      Logger.warn('Invalid models catalog', { err: parsed.error.message });
      catalogCache = [];
    } else {
      catalogCache = parsed.data.models;
    }
  } catch (err) {
    Logger.warn('Failed to read models catalog', { err: String(err) });
    catalogCache = [];
  }
  return catalogCache;
}

function toInfo(entry: ModelCatalogEntry): LocalModelInfo {
  const dl = active.get(entry.id);
  const selectedId = PreferenceStore.getAll().localProvider.selectedModelId;
  return {
    id: entry.id,
    name: entry.name,
    paramsB: entry.paramsB,
    ctx: entry.ctx,
    recommended: entry.recommended,
    installed: existsSync(modelFilePath(entry.id)),
    downloading: dl !== undefined,
    progress: dl !== undefined && dl.totalSize > 0 ? dl.downloadedSize / dl.totalSize : 0,
    selected: selectedId === entry.id,
  };
}

function emitProgress(): void {
  progressListener?.(ModelManager.list());
}

const ModelManager = {
  /** Wire the main→renderer `models:state` push (called once from ipc.ts). */
  setProgressListener(cb: (models: LocalModelInfo[]) => void): void {
    progressListener = cb;
  },

  list(): LocalModelInfo[] {
    return catalog().map(toInfo);
  },

  async download(id: string): Promise<void> {
    const entry = catalog().find((m) => m.id === id);
    if (entry === undefined) throw new AppError('Unknown model id', 404);
    if (active.has(id)) return; // already downloading
    mkdirSync(modelsDir(), { recursive: true });
    const controller = new AbortController();
    active.set(id, { downloadedSize: 0, totalSize: 0, controller });
    emitProgress();
    try {
      const { resolveModelFile } = await import('node-llama-cpp');
      await resolveModelFile(entry.uri, {
        directory: modelsDir(),
        fileName: `${id}.gguf`,
        signal: controller.signal,
        cli: false,
        onProgress: ({ totalSize, downloadedSize }) => {
          const d = active.get(id);
          if (d !== undefined) {
            d.totalSize = totalSize;
            d.downloadedSize = downloadedSize;
            emitProgress();
          }
        },
      });
    } catch (err) {
      if (controller.signal.aborted) {
        Logger.info('Model download canceled', { id });
      } else {
        Logger.warn('Model download failed', { id, err: String(err) });
        throw new AppError('Model download failed', 502);
      }
    } finally {
      active.delete(id);
      emitProgress();
    }
  },

  cancel(id: string): void {
    active.get(id)?.controller.abort();
  },

  /** Make `id` the active on-device model AND switch the agent to run on it (provider override =
   *  'local'), so "Use" is immediately effective. The user can switch back via the agent model selector. */
  select(id: string): void {
    if (!existsSync(modelFilePath(id))) throw new AppError('Model not installed', 400);
    const prefs = PreferenceStore.getAll();
    PreferenceStore.update({
      localProvider: { ...prefs.localProvider, selectedModelId: id },
      agentProviderOverride: 'local',
    });
    emitProgress();
  },

  remove(id: string): void {
    rmSync(modelFilePath(id), { force: true });
    const cur = PreferenceStore.getAll().localProvider;
    if (cur.selectedModelId === id) {
      PreferenceStore.update({ localProvider: { ...cur, selectedModelId: '' } });
    }
    emitProgress();
  },

  /** The selected+installed model for the inference engine, or null. */
  resolveModel(): SelectedLocalModel | null {
    const id = PreferenceStore.getAll().localProvider.selectedModelId;
    if (id === '') return null;
    const entry = catalog().find((m) => m.id === id);
    const path = modelFilePath(id);
    if (entry === undefined || !existsSync(path)) return null;
    return { modelId: id, modelPath: path, ctxSize: entry.ctx };
  },
};

export default ModelManager;
