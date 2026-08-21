import { z } from 'zod';

/**
 * Per-site data clearing — "forget this site" (Phase 2). The single source for the shape that crosses
 * the IPC boundary and is rendered in the confirmation dialog.
 *
 * The plan is a *separate* thing from the clear on purpose. It is what the dialog is built from, so the
 * user learns that forgetting a site will sign them out **before** confirming rather than afterwards.
 */

/**
 * The storage buckets a "forget this site" clear removes. These are passed straight to Electron's
 * `session.clearStorageData({ storages })`, so the list must stay a subset of what Chromium still has:
 * `websql` was dropped when Chromium removed Web SQL Database, and Electron's typings dropped it too, so
 * naming it here is now a type error rather than a no-op.
 */
export const SITE_DATA_KINDS = [
  'cookies',
  'localstorage',
  'indexdb',
  'cachestorage',
  'serviceworkers',
  'shadercache',
  'filesystem',
] as const;
export const SiteDataKindSchema = z.enum(SITE_DATA_KINDS);
export type SiteDataKind = z.infer<typeof SiteDataKindSchema>;

/** What the user must be told before confirming. Each is a consequence they cannot undo. */
export const SITE_CLEAR_WARNINGS = [
  'signs_you_out',
  'holds_saved_credentials',
  'has_offline_data',
] as const;
export const SiteClearWarningSchema = z.enum(SITE_CLEAR_WARNINGS);
export type SiteClearWarning = z.infer<typeof SiteClearWarningSchema>;

export const SiteClearPlanSchema = z.object({
  /** eTLD+1 the clear is scoped to. */
  site: z.string().min(1).max(255),
  /** Origins passed to the storage clear. */
  origins: z.array(z.string().min(1).max(2048)).max(16),
  kinds: z.array(SiteDataKindSchema),
  warnings: z.array(SiteClearWarningSchema),
});
export type SiteClearPlan = z.infer<typeof SiteClearPlanSchema>;
