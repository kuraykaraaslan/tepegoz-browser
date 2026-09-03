import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MODELS_DIR = join('/userData', 'models');
const M1_PATH = join(MODELS_DIR, 'm1.gguf');

/**
 * `ModelManager` — on-device GGUF model management. Pinned: `list` maps the zod-validated catalog
 * through `toInfo` (empty on a schema-invalid catalog; "installed" = the file exists, with the on-disk
 * size and `selected` flag filled in); `download` 404s an unknown id and 502s a real transfer failure
 * (silent on an abort) while always clearing the active entry; `select` 400s an uninstalled model else
 * writes the pref + flips the agent override to `local`; `remove` deletes the file and clears the
 * selection when it pointed at it; and `resolveModel` returns the selected+installed entry or null.
 */

const cfg = vi.hoisted(
  (): {
    catalog: { version: number; models: unknown[] };
    selectedModelId: string;
    exists: boolean;
    size: number;
  } => ({
    catalog: { version: 1, models: [] },
    selectedModelId: '',
    exists: false,
    size: 1000,
  }),
);

const fs = vi.hoisted(() => ({
  existsSync: vi.fn(() => cfg.exists),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify(cfg.catalog)),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({ size: cfg.size })),
}));
vi.mock('node:fs', () => fs);
vi.mock('electron', () => ({
  app: { getPath: () => '/userData', getAppPath: () => '/app' },
}));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn(), info: vi.fn() } }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({
    localProvider: { selectedModelId: cfg.selectedModelId },
    agentProviderOverride: 'anthropic',
  })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

type ResolveOpts = { onProgress: (p: { totalSize: number; downloadedSize: number }) => void };
const resolveModelFile = vi.hoisted(() =>
  vi.fn<(uri: string, opts: ResolveOpts) => Promise<string>>(() =>
    Promise.resolve('/userData/models/m1.gguf'),
  ),
);
vi.mock('node-llama-cpp', () => ({ resolveModelFile }));

type Mgr = typeof import('./model-manager.electron').default;
async function load(): Promise<Mgr> {
  vi.resetModules();
  return (await import('./model-manager.electron')).default;
}

const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  name: 'Model One',
  uri: 'hf:acme/model/m1.gguf',
  ctx: 4096,
  paramsB: 7,
  recommended: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cfg.catalog = { version: 1, models: [entry()] };
  cfg.selectedModelId = '';
  cfg.exists = false;
  cfg.size = 1000;
  resolveModelFile.mockResolvedValue('/userData/models/m1.gguf');
});

describe('list', () => {
  it('maps the catalog, reporting an uninstalled model', async () => {
    const mgr = await load();
    expect(mgr.list()[0]).toMatchObject({
      id: 'm1',
      installed: false,
      downloading: false,
      progress: 0,
      selected: false,
    });
  });

  it('is empty when the catalog fails schema validation', async () => {
    cfg.catalog = { version: 2, models: [] };
    const mgr = await load();
    expect(mgr.list()).toEqual([]);
  });

  it('is empty (with a warning) when the catalog file cannot be read', async () => {
    const mgr = await load();
    fs.readFileSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    expect(mgr.list()).toEqual([]);
  });

  it('leaves installedBytes undefined when statSync races a delete', async () => {
    cfg.exists = true;
    const mgr = await load();
    fs.statSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const info = mgr.list()[0]!;
    expect(info.installed).toBe(true);
    expect(info.installedBytes).toBeUndefined();
  });

  it('fills in installed + on-disk size + selected for an installed, chosen model', async () => {
    cfg.exists = true;
    cfg.size = 4_200_000;
    cfg.selectedModelId = 'm1';
    const mgr = await load();
    expect(mgr.list()[0]).toMatchObject({
      installed: true,
      installedBytes: 4_200_000,
      selected: true,
    });
  });
});

describe('download', () => {
  it('404s an unknown model id', async () => {
    const mgr = await load();
    await expect(mgr.download('ghost')).rejects.toMatchObject({
      statusCode: 404,
      code: 'unknownModel',
    });
  });

  it('resolves the file into the models dir and clears the active entry', async () => {
    const mgr = await load();
    await mgr.download('m1');
    expect(fs.mkdirSync).toHaveBeenCalledWith(MODELS_DIR, { recursive: true });
    expect(resolveModelFile).toHaveBeenCalledWith(
      'hf:acme/model/m1.gguf',
      expect.objectContaining({ directory: MODELS_DIR, fileName: 'm1.gguf' }),
    );
    // active entry cleared -> a second call would start over, not early-return
    expect(mgr.list()[0]).toMatchObject({ downloading: false });
  });

  it('502s when the transfer fails for a reason other than an abort', async () => {
    resolveModelFile.mockRejectedValue(new Error('network'));
    const mgr = await load();
    await expect(mgr.download('m1')).rejects.toMatchObject({
      statusCode: 502,
      code: 'modelDownloadFailed',
    });
  });

  it('pushes progress through setProgressListener as the transfer advances', async () => {
    resolveModelFile.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as ResolveOpts;
      opts.onProgress({ totalSize: 1000, downloadedSize: 250 });
      opts.onProgress({ totalSize: 1000, downloadedSize: 1000 });
      return Promise.resolve('/userData/models/m1.gguf');
    });
    const mgr = await load();
    const seen: unknown[][] = [];
    mgr.setProgressListener((models) => {
      seen.push(models);
    });
    await mgr.download('m1');

    expect(seen.length).toBeGreaterThan(1); // start + each onProgress + final clear
    const rows = seen as { id: string; downloading: boolean; progress: number }[][];
    expect(rows.find((s) => s[0]!.downloading && s[0]!.progress > 0)).toBeDefined();
    expect(rows.at(-1)![0]).toMatchObject({ id: 'm1', downloading: false }); // final push
  });

  it('is silent (no 502) when the transfer rejects after a cancel', async () => {
    let rejectTransfer!: (e: unknown) => void;
    resolveModelFile.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectTransfer = reject;
      }),
    );
    const mgr = await load();
    const p = mgr.download('m1');
    mgr.cancel('m1'); // aborts this download's controller (synchronously)
    await new Promise((r) => setTimeout(r, 0)); // let download reach `await resolveModelFile()`
    rejectTransfer(new Error('The operation was aborted'));
    await expect(p).resolves.toBeUndefined();
    expect(mgr.list()[0]).toMatchObject({ downloading: false }); // active entry cleared
  });
});

describe('cancel', () => {
  it('is a no-op for an id with no active download', async () => {
    const mgr = await load();
    expect(() => {
      mgr.cancel('m1');
    }).not.toThrow();
  });
});

describe('select', () => {
  it('400s a model that is not installed', async () => {
    cfg.exists = false;
    const mgr = await load();
    let thrown: unknown;
    try {
      mgr.select('m1');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ statusCode: 400, code: 'modelNotInstalled' });
  });

  it('writes the selection and flips the agent override to local', async () => {
    cfg.exists = true;
    const mgr = await load();
    mgr.select('m1');
    expect(prefs.update).toHaveBeenCalledWith({
      localProvider: { selectedModelId: 'm1' },
      agentProviderOverride: 'local',
    });
  });
});

describe('remove', () => {
  it('deletes the file and clears the selection when it pointed at the removed model', async () => {
    cfg.selectedModelId = 'm1';
    const mgr = await load();
    mgr.remove('m1');
    expect(fs.rmSync).toHaveBeenCalledWith(M1_PATH, { force: true });
    expect(prefs.update).toHaveBeenCalledWith({ localProvider: { selectedModelId: '' } });
  });

  it('leaves an unrelated selection alone', async () => {
    cfg.selectedModelId = 'other';
    const mgr = await load();
    mgr.remove('m1');
    expect(prefs.update).not.toHaveBeenCalled();
  });
});

describe('resolveModel', () => {
  it('returns null when nothing is selected', async () => {
    const mgr = await load();
    expect(mgr.resolveModel()).toBeNull();
  });

  it('returns the selected + installed entry with its context size', async () => {
    cfg.selectedModelId = 'm1';
    cfg.exists = true;
    const mgr = await load();
    expect(mgr.resolveModel()).toEqual({
      modelId: 'm1',
      modelPath: M1_PATH,
      ctxSize: 4096,
    });
  });

  it('returns null when the selected model file is missing', async () => {
    cfg.selectedModelId = 'm1';
    cfg.exists = false;
    const mgr = await load();
    expect(mgr.resolveModel()).toBeNull();
  });
});
