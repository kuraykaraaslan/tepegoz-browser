# Phase 11 — Regional Trust Pack (e-Devlet / Kamu)

**Status:** 🟡 In progress (Kamu step classification + locale-pack parity check landed 2026-08-20) · **Estimate:** ~3–4 months · **Depends on:** Phase 2 (IntegrationAdapters,
Credential Vault) + Phase 1a (Policy Kernel/HITL/Human Handoff) + Phase 6 (RecipeCompiler) + Phase 8
(Turkish-first engine) + Phase 7 (NotaryService)
**Goal:** The highest-value, highest-risk Turkish tasks live on **e-Devlet / GİB / SGK / MHRS** and local-bank
portals — exactly where a prompt-injection-prone, screenshot-scraping cloud agent is unusable and a mis-step is
irreversible. tepegöz's deterministic recipes + forced-HITL-on-state-change + Human Handoff make it the **only
agentic browser one could plausibly trust on a government login** — a regional moat no competitor will invest
in. A thin, focused adapter pack on the Phase-2 adapter + Phase-1a Policy Kernel seams.
**Branch examples:** `feat/kamu-adapter-pack`, `feat/locale-as-a-plugin`

## Exit criteria (DoD)

- [~] **Kamu read-only mode** works zero-approval on e-Devlet / MHRS / GİB / SGK (check randevu availability,
  view tax debt, list documents); **every state-changing step** forces HITL + Windows Hello
  _(landed: [kamu-policy.ts](../../packages/security-policy/src/kamu-policy.ts) — `classifyKamuStep`, 9 tests. **Owed:** the recipes themselves (nothing checks randevu availability or tax debt yet) and the provenance check that would confirm a step actually came from a reviewed recipe before this classification is trusted.)_
- [ ] 2FA/SMS and CAPTCHA route to the **Human Handoff Controller** (NO auto-solve); a full replayable,
      notarized trace is journaled as dispute evidence
- [ ] TC Kimlik No / credentials never leave `safeStorage`; a dedicated sensitive-site lockout class covers the
      Kamu pack
- [~] **Locale-as-a-Plugin**: a signed locale pack installs, passes the `Resources` type-parity check, and (if
  it bundles recipes) those recipes run sandboxed + scope-reviewed
  _(landed: [locale-pack-parity.ts](../../packages/security-policy/src/locale-pack-parity.ts) — `checkLocalePackParity`, 8 tests distinguishing a missing key from a shape mismatch (a string turned into an object at the same path breaks a caller differently than an absent key). **Owed:** signing/verification, the install flow, and everything about recipe sandboxing.)_
- [ ] **i18n:** en+tr full parity for all new surfaces (Kamu adapter consent/scope screens, read-only vs write
      mode, locale-pack install/management); the pack itself ships Turkish-first copy
- [x] ADR accepted: **ADR-0022** (Kamu public-service adapter trust model)
      _(lands as [ADR-0036](../../docs/adr/0036-kamu-adapter-trust-model.md) — ADR-0022 was already claimed before this phase document was written; see the numbering note in that ADR.)_
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** `classifyKamuStep` and `checkLocalePackParity` are real
> and tested (17 tests total). **Neither is called from anywhere real.** There is no Kamu recipe, no
> recipe provenance check to confirm a step should even be classified this way, no locale-pack loader,
> and no signing. Both modules exist to be the rule a future caller applies, not a working feature.

## Tasks

### L6/L8/L3 — Kamu (Turkish public-service) Safe Adapter Pack

- [~] A curated **"Kamu" IntegrationAdapter pack**: deterministic browser-automation recipes for e-Devlet /
  MHRS / GİB / SGK with EVERY state-changing step (randevu al, başvuru gönder, beyanname onayla)
  hard-classified `financial`/`destructive` in the Policy Kernel so they **ALWAYS** force HITL + Windows
  Hello
  _(landed: the classification RULE — `classifyKamuStep` force-asks with biometric on any state-changing step, deliberately scoped to four individually-named domains rather than the whole `gov.tr` suffix, so a Kamu pack can never claim coverage of a government site nobody reviewed it against. **Not started:** the recipes themselves.)_
- [ ] 2FA/SMS and the inevitable CAPTCHA route to the existing **Human Handoff Controller** (NO auto-solve) — not started; this module has no page-signal detector, and none is added here, because a hand-wavy heuristic would be exactly the kind of unverified guess this project rejects
- [ ] Recipes are **signed, version-pinned**, and ship a zero-approval **read-only mode** (check randevu
      availability, view tax debt, list documents)
- [ ] Credentials live in the Credential Vault under a **dedicated sensitive-site lockout class**; **TC Kimlik
      No never outside `safeStorage`**; full replayable trace journaled (+ notarized) for dispute evidence
- [ ] _Risk (ADR-0022):_ regulatory/liability if a recipe mis-acts on a government portal; recipes break when
      portals change → read-only-first, every write hard-coded forced-HITL + biometric, full replayable trace
      for dispute evidence, version pinning + an honest "recipe stale, falling back to manual" failure state

### L9/i18n — Locale-as-a-Plugin (signed locale + regional-recipe packs beyond en/tr)

- [~] A signed **locale-pack format** (Ed25519, same provenance as the Phase-4 marketplace) bundling: i18n
  catalog (must pass the existing `Resources` type-parity check), RTL/IME layout overrides, local TTS/STT
  voice config, and optional **signed regional service recipes**
  _(landed: the type-parity CHECK itself — `checkLocalePackParity` — which distinguishes a missing key, an extra key, and a shape mismatch (string vs. nested object at the same path) as three different findings, because only the last one actually crashes a caller. Not the pack format, not the signing, not RTL/IME/voice config.)_
- [ ] Ship official **Azerbaijani (ASAN imza)** + **Arabic (RTL)** + **Russian** packs to prove the model
- [ ] Community packs go through the same sandbox + scope-review as connectors; locale strings are validated by
      zod parity at install so a malformed pack can't break the UI; recipes are sandboxed/reviewed
- [ ] _Risk:_ untrusted community locale packs could ship malicious recipes → route all pack recipes through the
      existing CapabilitySandbox + scope review + Policy Kernel re-pass; auto-trust strings **only after** the
      zod parity check

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/adapter/locale-pack trust boundary;
      AppError contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution
      trailer**
