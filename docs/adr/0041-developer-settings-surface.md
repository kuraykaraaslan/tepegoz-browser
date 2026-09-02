# ADR-0041: Developer settings surface — one place for every knob, with a locked core

- **Status:** Accepted (Tier B shipped; Tiers A/C/D owed)
- **Date:** 2026-08-28
- **Refines:** [ADR-0012](0012-browser-tab-model.md) (isolated `WebContentsView` per tab) ·
  **complements** [ADR-0010](0010-ts-tooling-conventions.md) (conventions) ·
  **contrasts** [tracks/express-settings.md](../tracks/express-settings.md) (rejected: a
  settings surface that weakened the renderer boundary)
- **Track:** [developer-settings-surface.md](../tracks/developer-settings-surface.md)

## Context

`tepegoz://` has no `chrome://flags`. The **Developer** section of `tepegoz://settings` lists every
top-level `Preferences` key in an editable table, gated to development builds. The request is to grow
that surface until **all** browser settings and **all** per-webview settings are manageable from it —
flag-level detail included.

"All settings" is four surfaces, not one:

- **A. `Preferences`** — the zod schema in `@tepegoz/shared-types` / `preferences.model.ts`. Already
  fully enumerated by the Developer table.
- **B. Chromium switches / feature flags** — `app.commandLine.appendSwitch`, `--enable-features`. Read
  by Chromium only at startup. Not modelled today beyond one hardcoded list.
- **C. Per-tab `webPreferences`** — `browsedViewWebPreferences()`, a single hardened constant applied to
  every browsed `WebContentsView`.
- **D. `session.*` defaults** — spellcheck languages, cache, DoH, permission defaults. Partly owned by
  existing settings sections.

The product also contains an agent that drives the UI and a policy kernel that locks automation out of
sensitive sites. A settings surface that can weaken the renderer sandbox is not a convenience — it is a
new attack surface reachable by a mis-wired context menu or a compromised renderer. That is precisely
why [`express-settings.md`](../tracks/express-settings.md) was rejected. This ADR draws the
line **before any code** so the line is not drawn later by whoever needed the toggle.

## Decision

> **Revised 2026-08-28 (same session, pre-merge).** The first cut of this ADR said "no separate page"
> and "development-only". The owner then asked for exactly the `chrome://flags` shape: an **unlisted**
> page any user can reach by typing its URL. The two paragraphs below reflect that; the reasoning in the
> Consequences section is updated to match.

**Two surfaces, one implementation.**

- **`tepegoz://developer`** — a real internal page (`DeveloperPageSurface.tsx`), **not linked from any
  menu**, **not gated to development builds**. Any user who types the URL gets it — deliberately, the
  way Chrome ships `chrome://flags`. The "advanced user opted in by typing an obscure URL" _is_ the
  gate; there is no in-product path that leads a casual user here. It hosts the whole Developer surface:
  the Chromium Flags card and the raw preferences editor.
- **`tepegoz://settings` → Developer section** — unchanged, still behind the `env === 'development'`
  gate ([`isDeveloperSettingsVisible`](../../apps/desktop/src/renderer/src/lib/developer-env.ts)). Kept
  purely as a convenience for developers who already live in settings; it renders the same components.

The new host costs a `REAL_PAGE_HOSTS` entry, a `main.tsx` dispatch case, a `navigation-url` entry, an
`INTERNAL_DEVELOPER_URL` constant, a tab title, and an e2e row — the well-trodden path the other seven
`tepegoz://` pages already took. `REAL_PAGE_HOSTS` also feeds `lib/trusted-origin.ts`, so the page is
IPC-trusted by the same mechanism as the rest.

**Exposing the raw preferences editor to every user is an accepted footgun.** It can break a profile
with bad JSON and it is a social-engineering surface ("paste this into `tepegoz://developer`"). Accepted
because: the URL is undiscoverable without being told, every write still goes through
`PreferencesPatchSchema.safeParse` (so a _malformed_ preference cannot land, only a valid-but-unwise
one), and `tepegoz://settings` → Reset restores defaults. If this proves to be a real abuse vector, the
mitigation is to split the page — flags stay public, the raw editor goes back behind the dev gate — not
to remove the page.

**Tier A — `Preferences` — fully exposed, schema-driven.** Every key is editable. A metadata registry
adds label, description, a `stable | experimental | internal` badge, a `restartRequired` marker, and
validation constraints **derived from the zod schema** so an invalid edit is refused at input, not at
save. A committed completeness test asserts every `Preferences` key has a metadata row — the failure
mode is a new preference silently shipping with no description.

**Tier B — Chromium flags — allowlist-only.** A new `chromiumFlags: Record<string, string>` preference,
applied in `index.ts` before `app.whenReady()`. The set of accepted keys is a **committed allowlist** of
switches/features known to be safe for this product. An unknown key is rejected at the `safeParse`
boundary and never reaches `appendSwitch`. There is no free-form entry. Rationale: a free-form switch
field is `chrome://flags#...` with none of Chromium's per-flag review — `--disable-web-security`,
`--no-sandbox`, `--remote-debugging-port` are all one typo away, and the last one hands a scriptable
debugger to anything on `localhost`.

**Tier C — per-tab `webPreferences` — safe subset only; four keys permanently locked.**

Locked, never UI-flippable, rendered disabled with a tooltip linking this ADR:

- `contextIsolation` (must stay `true`)
- `sandbox` (must stay `true`)
- `nodeIntegration` (must stay `false`)
- `webSecurity` (must stay `true`)

These four are the renderer trust boundary. "The user chose to turn it off" is not a meaningful consent
step for a boundary that a prompt-injected model, a malicious page, or a mis-wired menu benefits from
just as much as the user does. A save payload that names a locked key is a no-op and logs a warning.

Exposable subset (profile-wide defaults, no per-site override): `backgroundThrottling`, `plugins`,
`spellcheck` (+ languages), `defaultFontSize`, `minimumFontSize`, `defaultFontFamily`,
`defaultEncoding`, `images`, `javascript`, `webgl`, `autoplayPolicy`, `disableDialogs`. New tabs get
these baked into `browsedViewWebPreferences()`; open tabs get `webContents.setWebPreferences()` plus the
matching `session` call at save time.

**Tier D — `session.*` — mirrored, not re-owned.** Where a setting already has a home (network privacy,
site permissions, passwords), the Developer surface shows its current value read-only and deep-links to
the owning section. It does not become a second write path.

**Every value flows through `safeParse` at the IPC boundary**, like all other preferences. The flag
allowlist and the `webPreferences` subset are enforced there via `superRefine`, not in the renderer.

## Consequences

**Positive.** One surface for the whole knob space, reachable by anyone who knows the URL but absent
from every menu — the same "power users only, by construction" posture as `chrome://flags`. The
`chrome://flags` gap is closed for the flags that matter, without inheriting Chromium's blast radius.
The renderer trust boundary is stated, locked, and test-guarded rather than resting on nobody having
wired the toggle yet. Tier D settings keep single ownership.

**Negative / accepted.**

- A developer who needs a Chromium flag not on the allowlist has to add it to the allowlist in a commit
  (with the reasoning in the diff) rather than typing it into a box. Deliberate: that commit is the
  review.
- A developer who genuinely needs `webSecurity: false` to debug something in _this_ browser cannot, and
  uses another one for that task. Same trade-off ADR-0029 accepted for DevTools on banks.
- The metadata registry is now a thing that must be kept in sync with the schema. The completeness test
  turns "out of sync" into a red build instead of a gap nobody notices.

**Owed, and stated rather than implied.** The per-key descriptions for ~60 existing preferences are a
writing task, not a design one, and can land incrementally as long as the badge and `restartRequired`
fields are populated from day one. Per-site `webPreferences` overrides are out of scope.

## Implementation status (2026-08-28)

**Tier B shipped, plus the `tepegoz://developer` page.**

- `Preferences.chromiumFlags` — allowlist in `@tepegoz/shared-types/chromium-flags`, enforced by
  `ChromiumFlagOverridesSchema`; applied before `whenReady` in `chromium-flags-boot.ts` (merged with the
  keep-rendering baseline so `enable-features`/`disable-features` stay single). Initial allowlist:
  `force-dark-mode`, `parallel-downloading`, `overlay-scrollbars`, `force-reduced-motion`, `disable-gpu`,
  `show-fps-counter` — chosen here as the reviewed set; none weakens page isolation, a test guards that.
- **Chromium Flags** card (`settings-developer-flags.tsx`, en + tr) inside `DeveloperSection`.
- **`tepegoz://developer`** — new real page (`DeveloperPageSurface.tsx`), unlisted, **not** dev-gated;
  renders the full `DeveloperSection` (flags card + raw preferences editor). Wired through
  `REAL_PAGE_HOSTS`, `main.tsx`, `navigation-url`, `INTERNAL_DEVELOPER_URL`, `internalTitleFor`, and
  `e2e/tepegoz-internal-pages.spec.ts`.
- The `tepegoz://settings` → Developer section is unchanged (still `env === 'development'`).

**Tiers A / C / D owed.** The `Preferences` table is still the flat pre-existing editor (no
nested-object drill-down, no metadata registry). No `webContentDefaults`. No Tier-D mirroring. Tracked
in [tracks/developer-settings-surface.md](../tracks/developer-settings-surface.md).
