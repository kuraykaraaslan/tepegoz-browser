# Phase 11 — Regional Trust Pack (e-Devlet / Kamu)

**Status:** ⬜ Not started  ·  **Estimate:** ~3–4 months  ·  **Depends on:** Phase 2 (IntegrationAdapters,
Credential Vault) + Phase 1a (Policy Kernel/HITL/Human Handoff) + Phase 6 (RecipeCompiler) + Phase 8
(Turkish-first engine) + Phase 7 (NotaryService)
**Goal:** The highest-value, highest-risk Turkish tasks live on **e-Devlet / GİB / SGK / MHRS** and local-bank
portals — exactly where a prompt-injection-prone, screenshot-scraping cloud agent is unusable and a mis-step is
irreversible. tepegöz's deterministic recipes + forced-HITL-on-state-change + Human Handoff make it the **only
agentic browser one could plausibly trust on a government login** — a regional moat no competitor will invest
in. A thin, focused adapter pack on the Phase-2 adapter + Phase-1a Policy Kernel seams.
**Branch examples:** `feat/kamu-adapter-pack`, `feat/locale-as-a-plugin`

## Exit criteria (DoD)
- [ ] **Kamu read-only mode** works zero-approval on e-Devlet / MHRS / GİB / SGK (check randevu availability,
      view tax debt, list documents); **every state-changing step** forces HITL + Windows Hello
- [ ] 2FA/SMS and CAPTCHA route to the **Human Handoff Controller** (NO auto-solve); a full replayable,
      notarized trace is journaled as dispute evidence
- [ ] TC Kimlik No / credentials never leave `safeStorage`; a dedicated sensitive-site lockout class covers the
      Kamu pack
- [ ] **Locale-as-a-Plugin**: a signed locale pack installs, passes the `Resources` type-parity check, and (if
      it bundles recipes) those recipes run sandboxed + scope-reviewed
- [ ] **i18n:** en+tr full parity for all new surfaces (Kamu adapter consent/scope screens, read-only vs write
      mode, locale-pack install/management); the pack itself ships Turkish-first copy
- [ ] ADR accepted: **ADR-0022** (Kamu public-service adapter trust model)
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L6/L8/L3 — Kamu (Turkish public-service) Safe Adapter Pack
- [ ] A curated **"Kamu" IntegrationAdapter pack**: deterministic browser-automation recipes for e-Devlet /
      MHRS / GİB / SGK with EVERY state-changing step (randevu al, başvuru gönder, beyanname onayla)
      hard-classified `financial`/`destructive` in the Policy Kernel so they **ALWAYS** force HITL + Windows
      Hello
- [ ] 2FA/SMS and the inevitable CAPTCHA route to the existing **Human Handoff Controller** (NO auto-solve)
- [ ] Recipes are **signed, version-pinned**, and ship a zero-approval **read-only mode** (check randevu
      availability, view tax debt, list documents)
- [ ] Credentials live in the Credential Vault under a **dedicated sensitive-site lockout class**; **TC Kimlik
      No never outside `safeStorage`**; full replayable trace journaled (+ notarized) for dispute evidence
- [ ] *Risk (ADR-0022):* regulatory/liability if a recipe mis-acts on a government portal; recipes break when
      portals change → read-only-first, every write hard-coded forced-HITL + biometric, full replayable trace
      for dispute evidence, version pinning + an honest "recipe stale, falling back to manual" failure state

### L9/i18n — Locale-as-a-Plugin (signed locale + regional-recipe packs beyond en/tr)
- [ ] A signed **locale-pack format** (Ed25519, same provenance as the Phase-4 marketplace) bundling: i18n
      catalog (must pass the existing `Resources` type-parity check), RTL/IME layout overrides, local TTS/STT
      voice config, and optional **signed regional service recipes**
- [ ] Ship official **Azerbaijani (ASAN imza)** + **Arabic (RTL)** + **Russian** packs to prove the model
- [ ] Community packs go through the same sandbox + scope-review as connectors; locale strings are validated by
      zod parity at install so a malformed pack can't break the UI; recipes are sandboxed/reviewed
- [ ] *Risk:* untrusted community locale packs could ship malicious recipes → route all pack recipes through the
      existing CapabilitySandbox + scope review + Policy Kernel re-pass; auto-trust strings **only after** the
      zod parity check

### Cross-cutting (as in every phase)
- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/adapter/locale-pack trust boundary;
      AppError contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution
      trailer**
