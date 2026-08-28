# Track — Developer settings surface: every browser + web-content knob in one place

- **Status:** Planned, unscheduled. No phase row, no DoD, no owner yet.
- **Owner decisions taken (2026-08-28):** dev-only visibility · Chromium flags are **allowlist-only** ·
  this document + an ADR land **before any code**.
- **Companion ADR:** [ADR-0041](../../docs/adr/0041-developer-settings-surface.md) — the security
  carve-out (what is exposable, what is permanently locked) is decided there, not here.

## Why

`tepegoz://` has no `chrome://flags` equivalent. The closest thing today is the **Developer** section of
`tepegoz://settings` ([`settings-developer.tsx`](../../apps/desktop/src/renderer/src/components/settings-developer.tsx)),
which lists every top-level `Preferences` key in a searchable `DataTable` with a per-row edit modal
(boolean toggle / string / JSON). It is gated to development builds by
[`isDeveloperSettingsVisible`](../../apps/desktop/src/renderer/src/lib/developer-env.ts) (`env === 'development'`).

The ask: make **all** browser settings and **all** per-webview settings manageable from that one surface —
developer, experimental, and flag-level detail included.

That phrase is four different surfaces, and only some of them can safely become a UI toggle:

| Tier | What | Today | Exposable in Developer? |
| ---- | ---- | ----- | ----------------------- |
| **A. Preferences** | the zod schema — ~60 top-level keys ([`preferences.model.ts`](../../packages/preferences/src/preferences.model.ts)) | Developer table already lists **all** of them, flat | ✅ present — needs enrichment |
| **B. Chromium switches / features** | `--enable-features`, `chrome://flags`-style toggles | only `KEEP_RENDERING_SWITCHES`, hardcoded in [`index.ts`](../../apps/desktop/src/main/index.ts) | ✅ new `chromiumFlags` pref — **the real `chrome://flags` analog**, allowlist-only |
| **C. Per-tab `webPreferences`** | [`browsedViewWebPreferences()`](../../apps/desktop/src/main/tabs-shared.ts) — a hardened constant | fixed at creation | ⚠️ **safe subset only**; four keys permanently locked (ADR-0041) |
| **D. `session.*` defaults** | spellcheck languages, cache, DoH, permission defaults | some have their own settings sections already | ✅ mirror (read) + deep-link to the owning section |

## The security line (non-negotiable — CLAUDE.md, ADR-0041)

`contextIsolation`, `sandbox`, `nodeIntegration`, `webSecurity` **never** become UI-flippable. Making
them so is exactly the regression that got [`express-settings.md`](express-settings.md) rejected. In the
Developer surface they render **locked / greyed**, with a "locked by security policy" tooltip linking
ADR-0041.

Safe-to-expose `webPreferences` / `session` subset: `backgroundThrottling`, `plugins`, `spellcheck`
(+ languages), `defaultFontSize`, `minimumFontSize`, `defaultFontFamily`, `defaultEncoding`, `images`,
`javascript`, `webgl`, `autoplayPolicy`, `disableDialogs`. Final list is fixed in ADR-0041.

## Shape — Developer becomes three grouped surfaces

1. **Preferences** — the existing table, plus:
   - nested-object drill-down (today a nested object is one opaque JSON blob — e.g. `adblock`, `translate`,
     `newTabBackground`);
   - a **metadata registry** per key: label, description, `stable | experimental | internal` badge,
     `restartRequired`, and value constraints **derived from the zod schema** so the editor validates
     before save instead of after.
2. **Chromium Flags** — new `chromiumFlags: z.record(z.string(), z.string())` preference, plus an
   **allowlist registry** of known-safe switches/features. Applied in `index.ts` **before**
   `app.whenReady()` (Chromium reads switches only at startup). "Relaunch to apply" banner. No free-form
   entry — an unknown switch key is rejected at the boundary.
3. **Web Content Defaults** — the safe `webPreferences` / `session` subset. New tabs get it baked into
   `browsedViewWebPreferences()`; open tabs get `webContents.setWebPreferences()` + the matching
   `session` call pushed at save time. Locked keys shown, disabled, with the ADR link.

## Work items (indicative — not a DoD)

- **`@tepegoz/shared-types`** — extend `Preferences` (`chromiumFlags`, `webContentDefaults`); add the
  registry/allowlist types. Still the only schema source.
- **`preferences.model.ts`** — schema + `DEFAULT_PREFERENCES` entries + `superRefine` for the flag
  allowlist and the web-content subset.
- **new `developer-registry.ts`** (in `@tepegoz/preferences` or `@tepegoz/settings-ui`) — per-key
  metadata + the Chromium-flag allowlist, as one tested source. A completeness test asserts every
  `Preferences` key has a metadata row.
- **`apps/desktop/src/main/index.ts`** — read `chromiumFlags`, validate against the allowlist, apply the
  switches before `whenReady()`.
- **`tabs-shared.ts` + a runtime applier** — merge `webContentDefaults` into
  `browsedViewWebPreferences()`; fan the safe subset out to live `WebContentsView`s.
- **`settings-developer.tsx`** — split into sub-components (ADR-0010 250-line cap), three grouped
  surfaces, metadata-driven editor with schema-aware validation.
- **i18n** — `packages/settings-ui/src/i18n/{en,tr}.ts` dictionary entries (English-first, Turkish
  first-class; no hardcoded strings).
- **Tests** — registry completeness; flag-allowlist enforcement (unknown key rejected at the boundary);
  `webPreferences` locked-key guard (a save that names a locked key is a no-op + logs); schema
  round-trip; an e2e that opens the surface and round-trips one flag + one web-content default.
- **Docs** — ADR-0041 (this track's companion); note in ADR-0010 if a new deviation is taken; Phase
  Status Report on close-out.

## Explicitly out of scope

- Prod exposure. Dev-only, keeping the current `env === 'development'` gate. Revisit only with its own
  decision.
- Free-form / arbitrary Chromium switch entry. Allowlist-only.
- Any path to flipping `contextIsolation` / `sandbox` / `nodeIntegration` / `webSecurity`.
- Per-site `webPreferences` overrides. Profile-wide defaults only (a per-site override is a setting that
  exists to be turned on by whoever is asking — including a page).
- `tepegoz://flags` as a separate internal page. The Developer section is the surface; a new `tepegoz://`
  host would duplicate the protocol route, `*PageSurface.tsx`, `isTrustedAppUrl` allowlist, CSP, and
  e2e for no gain.
