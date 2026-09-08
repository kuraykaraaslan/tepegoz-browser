/**
 * The `webPreferences` every **browsed tab view** is born with, as a data table the Developer surface
 * can render read-only ([ADR-0041](../../../docs/adr/0041-developer-settings-surface.md) Tier C/D).
 *
 * This is the single description of that baseline. `apps/desktop`'s `browsedViewWebPreferences()` is
 * the code that applies it, and a drift test (`tabs-shared` suite) fails if the two disagree — so this
 * table cannot quietly describe a page sandbox the app does not actually give.
 *
 * `locked: true` marks a key that **must never become a UI toggle**: flipping `contextIsolation`,
 * `sandbox`, `nodeIntegration` or `webSecurity` from Settings is exactly the regression that got
 * `express-settings.md` rejected. The Developer surface shows those greyed with a link to ADR-0041.
 * The rest are safe to expose later (Tier C), and are listed here now so the read-only mirror is
 * complete.
 */

export interface WebContentDefault {
  /** The `webPreferences` key. */
  readonly key: string;
  /** The value every browsed view is created with today. */
  readonly value: boolean;
  /** `true` ⇒ permanently locked by security policy; never UI-flippable (ADR-0041). */
  readonly locked: boolean;
}

export const WEB_CONTENT_DEFAULTS = [
  { key: 'contextIsolation', value: true, locked: true },
  { key: 'sandbox', value: true, locked: true },
  { key: 'nodeIntegration', value: false, locked: true },
  { key: 'webSecurity', value: true, locked: true },
  // Chromium's built-in PDF viewer (gates the internal PDF/print viewers only — NPAPI/Pepper are gone).
  { key: 'plugins', value: true, locked: false },
  // A hidden or backgrounded tab the agent drives must keep running at full rate, not just keep painting.
  { key: 'backgroundThrottling', value: false, locked: false },
] as const satisfies readonly WebContentDefault[];

export type WebContentDefaultKey = (typeof WEB_CONTENT_DEFAULTS)[number]['key'];

/** The keys that can never be exposed as a toggle, in table order. */
export const LOCKED_WEB_CONTENT_KEYS = WEB_CONTENT_DEFAULTS.filter((d) => d.locked).map((d) => d.key);

/** The keys a user may adjust from the Developer surface (ADR-0041 Tier C), in table order. */
export const EDITABLE_WEB_CONTENT_KEYS = WEB_CONTENT_DEFAULTS.filter((d) => !d.locked).map(
  (d) => d.key,
);

/**
 * Overlay the user's editable overrides onto a hardened `webPreferences` base. Only the non-locked
 * keys are ever copied across — a `contextIsolation`/`sandbox`/`nodeIntegration`/`webSecurity` value
 * in `overrides` is ignored by construction, so this cannot weaken page isolation whatever it is
 * handed. `base` is returned mutated (it is the freshly-built options object) and also returned.
 */
export function applyWebContentDefaults<T extends Record<string, unknown>>(
  base: T,
  overrides: Partial<Record<WebContentDefaultKey, boolean>> | undefined,
): T {
  if (overrides === undefined) return base;
  for (const key of EDITABLE_WEB_CONTENT_KEYS) {
    const value = overrides[key];
    if (typeof value === 'boolean') (base as Record<string, unknown>)[key] = value;
  }
  return base;
}
