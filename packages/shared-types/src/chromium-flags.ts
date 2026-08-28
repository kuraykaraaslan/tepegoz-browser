import { z } from 'zod';

/**
 * The **allowlist** of Chromium/Electron command-line flags the user may toggle from the dev-only
 * Developer settings surface — Tepegöz's answer to `chrome://flags`, minus Chromium's blast radius
 * ([ADR-0041](../../../docs/adr/0041-developer-settings-surface.md)).
 *
 * There is deliberately **no free-form entry**. A flag reaches the command line only if its `id` is in
 * this list; an unknown key is rejected at the preferences `safeParse` boundary and never reaches
 * `app.commandLine`. Adding a flag here is a reviewed commit — that diff *is* the per-flag review that
 * `chrome://flags` gets upstream and a text box would not.
 *
 * Every entry is safe by construction: none weakens the renderer trust boundary (that would need
 * `--disable-web-security` / `--no-sandbox`, which are not here and never will be), none opens a
 * debugging port, and every effect is reversed by toggling the flag back off and relaunching.
 */

/** How enabling one allowlisted flag is applied to the Chromium command line. */
export type ChromiumFlagApply =
  | { readonly kind: 'switch'; readonly switch: string }
  | { readonly kind: 'switch-value'; readonly switch: string; readonly value: string }
  | { readonly kind: 'enable-feature'; readonly feature: string }
  | { readonly kind: 'disable-feature'; readonly feature: string };

export interface ChromiumFlagDef {
  /**
   * Stable id — the key under `Preferences.chromiumFlags`. **Never renamed or reused**: a rename would
   * silently drop a user's setting, and reuse would resurrect one against a different flag.
   */
  readonly id: string;
  /** What enabling this flag does to the command line. */
  readonly apply: ChromiumFlagApply;
  /**
   * `true` when the flag exposes behavior Chromium itself still marks experimental/unstable. Drives the
   * `experimental` badge in the UI; does not change how the flag is applied.
   */
  readonly experimental: boolean;
}

/**
 * The allowlist. Keep it conservative — a flag earns a row by being demonstrably safe for an agentic,
 * security-by-design browser, not by being interesting.
 */
export const CHROMIUM_FLAG_ALLOWLIST = [
  {
    id: 'force-dark-mode',
    apply: { kind: 'switch', switch: 'force-dark-mode' },
    experimental: false,
  },
  {
    id: 'parallel-downloading',
    apply: { kind: 'enable-feature', feature: 'ParallelDownloading' },
    experimental: false,
  },
  {
    id: 'overlay-scrollbars',
    apply: { kind: 'enable-feature', feature: 'OverlayScrollbars' },
    experimental: true,
  },
  {
    id: 'force-reduced-motion',
    apply: { kind: 'switch', switch: 'force-prefers-reduced-motion' },
    experimental: false,
  },
  {
    id: 'disable-gpu',
    apply: { kind: 'switch', switch: 'disable-gpu' },
    experimental: false,
  },
  {
    id: 'show-fps-counter',
    apply: { kind: 'switch', switch: 'show-fps-counter' },
    experimental: true,
  },
] as const satisfies readonly ChromiumFlagDef[];

export type ChromiumFlagId = (typeof CHROMIUM_FLAG_ALLOWLIST)[number]['id'];

/** Every allowlisted id, as a plain array (schema enum, UI iteration, tests). */
export const CHROMIUM_FLAG_IDS = CHROMIUM_FLAG_ALLOWLIST.map((f) => f.id) as [
  ChromiumFlagId,
  ...ChromiumFlagId[],
];

/** Look up one flag definition by id. */
export function chromiumFlagDef(id: ChromiumFlagId): ChromiumFlagDef {
  const def = CHROMIUM_FLAG_ALLOWLIST.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown chromium flag id: ${id}`);
  return def;
}

export const ChromiumFlagIdSchema = z.enum(CHROMIUM_FLAG_IDS);

/**
 * Persisted user overrides: allowlisted id → enabled. Absent id ⇒ off (the Chromium default). An
 * unknown key fails this schema, so a hand-edited `preferences.json` cannot smuggle a flag past the
 * allowlist.
 */
export const ChromiumFlagOverridesSchema = z.record(ChromiumFlagIdSchema, z.boolean());
export type ChromiumFlagOverrides = z.infer<typeof ChromiumFlagOverridesSchema>;

/** The ids currently toggled on, in allowlist order (stable, dedup'd). */
export function enabledChromiumFlagIds(overrides: ChromiumFlagOverrides): ChromiumFlagId[] {
  return CHROMIUM_FLAG_ALLOWLIST.filter((f) => overrides[f.id] === true).map((f) => f.id);
}
