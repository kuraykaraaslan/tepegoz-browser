import { z } from 'zod';

export const INSTALL_STATE_VERSION = 1;

export const ModelInstallStatusEnum = z.enum(['downloading', 'installed', 'error']);
export type ModelInstallStatus = z.infer<typeof ModelInstallStatusEnum>;

/** Persisted per-model install record (userData/models/install-state.json, via json-store). */
export const ModelInstallSchema = z.object({
  id: z.string().min(1).max(64),
  status: ModelInstallStatusEnum,
  bytesDownloaded: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive(),
  sha256Verified: z.boolean(),
  installedAt: z.number().optional(),
  /** Absolute path to the finished (or in-progress `.part`) file. */
  filePath: z.string(),
  error: z.string().optional(),
});
export type ModelInstall = z.infer<typeof ModelInstallSchema>;

export const InstallStateFileSchema = z.object({
  version: z.literal(INSTALL_STATE_VERSION),
  models: z.array(ModelInstallSchema),
});
export type InstallStateFile = z.infer<typeof InstallStateFileSchema>;

export const EMPTY_INSTALL_STATE: InstallStateFile = { version: INSTALL_STATE_VERSION, models: [] };

/** Lenient load (trust boundary): drop malformed records, keep the rest; anything unrecognizable → empty. */
export function loadInstallState(raw: unknown): InstallStateFile {
  const whole = InstallStateFileSchema.safeParse(raw);
  if (whole.success) return whole.data;
  if (raw !== null && typeof raw === 'object' && 'models' in raw) {
    const list: unknown = raw.models;
    if (Array.isArray(list)) {
      const models: ModelInstall[] = [];
      for (const m of list) {
        const rec = ModelInstallSchema.safeParse(m);
        if (rec.success) models.push(rec.data);
      }
      return { version: INSTALL_STATE_VERSION, models };
    }
  }
  return EMPTY_INSTALL_STATE;
}

/** Immutable upsert of one model's record (keyed by id). */
export function upsertInstall(state: InstallStateFile, next: ModelInstall): InstallStateFile {
  return {
    version: INSTALL_STATE_VERSION,
    models: [...state.models.filter((m) => m.id !== next.id), next],
  };
}

/** Immutable removal of a model's record. */
export function removeInstall(state: InstallStateFile, id: string): InstallStateFile {
  return { version: INSTALL_STATE_VERSION, models: state.models.filter((m) => m.id !== id) };
}

/** The installed record for `id`, or null. */
export function findInstall(state: InstallStateFile, id: string): ModelInstall | null {
  return state.models.find((m) => m.id === id) ?? null;
}
