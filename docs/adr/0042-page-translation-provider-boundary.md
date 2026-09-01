# ADR-0042: Page-translation provider boundary — local model is the default path, cloud is per-origin opt-in, sensitive sites never reach cloud

- **Status:** Accepted (hybrid boundary ratified; local + cloud engine and the per-origin consent flow are shipped in `@tepegoz/ext-translate`; sensitive-site cloud lockout and the agent-run untranslated-source guarantee are owed — see Consequences)
- **Date:** 2026-09-01
- **Refines:** [ADR-0005](0005-provider-agnostic-ai.md) (provider-agnostic AI, BYO-key local-first) · [ADR-0008](0008-perception-cdp.md) (DOM/a11y-first perception) · **complements** [ADR-0021](0021-agent-controllable-extensions.md) (agent-controllable extensions via in-process capability providers) · [ADR-0004](0004-event-sourced-journal.md) ("shown = recorded")
- **Phase:** [Phase 2c — Classic Browser Essentials & Downloads](../../phases/product/phase-2c-classic-browser-essentials.md), L10 (page translation)

## Context

Full-page translation rewrites the live DOM in place. To do that off-device it must send the page's
visible text — which for a signed-in page is among the most sensitive payloads the browser handles —
to a third-party model. The phase DoD names three things this decision has to settle and the
in-repo roadmap has held translation at "no wiring before the ADR":

1. **Provider boundary** — local model only, cloud API only, or both, and which one runs without asking.
2. **Sensitive-site lockout** — banking / government / crypto / password-manager / health pages are
   locked from automation by default ([`sensitive-site.ts`](../../packages/security-policy/src/sensitive-site.ts));
   translation of those pages must not become a side channel that ships their text to a cloud model.
3. **Determinism / observation-recording impact** — the agent's perception and the Notary's recording
   read the DOM. A translation rewrite that the agent then "sees" would make a run depend on model
   output that was never in the page, and would record translated text as if it were site content.

A working hybrid engine already exists in `@tepegoz/ext-translate` (`createTranslateHost`) and its
desktop host (`translate-host.electron.ts`): a local path via `llamaEngine` + a downloaded model, a
cloud path via whichever BYO provider key is present, translation memory, a glossary, and a
session-scoped native consent dialog (`requestCloudFallback`). **That code landed ahead of this
ADR** — a process deviation recorded here rather than papered over ([ADR-0010](0010-ts-tooling-conventions.md)
§ deviations). This ADR ratifies the boundary that code implements and specifies the two guarantees it
does **not** yet make.

## Decision

**Hybrid, with the local model as the privileged path. Local translation is the default and the only
path that runs without a prompt. Cloud translation is opt-in per origin, consent is session-scoped and
never silently persisted, and a sensitive site never reaches the cloud path at all — not even with a
prompt. The agent's own runs read untranslated source.**

### 1. `engineMode` is `local-first`; cloud is a fallback, not a peer

- `runLocalBatch` is tried first whenever a local model is available (`localAvailable()` — engine
  present **and** a resolved model). Its output never leaves the machine.
- `runCloudBatch` runs only when local is unavailable or a present local model errors, **and** the
  per-origin cloud consent resolves to `true`. `cloudFallbackMode` (`ask` | `allow` | `deny`,
  default `ask`) is the user's standing choice; `ask` resolves once per origin for the app session
  via `resolveCloudConsent` and shares a single in-flight prompt across concurrent batches.
- With no local model and cloud denied, `translateBatch` returns the text unchanged (`engine: 'none'`) —
  a no-op, never a silent cloud call.

### 2. Sensitive sites: cloud is refused before the prompt

`isSensitiveSite(origin)` is consulted before `resolveCloudConsent`. On a match:

- `runCloudBatch` is **not** eligible and **no consent dialog is shown** — a prompt the user cannot
  safely accept is not a choice, it is a trap.
- `runLocalBatch` stays available: a local model produces no egress, so on-device translation of a
  banking page is allowed and useful.
- If no local model is available, translation of that page is a no-op with a surfaced reason
  ("translation of this site needs the on-device model"). This is the safe direction — over-refusing
  a sensitive site, per `sensitive-site.ts`'s stated bias.

### 3. The agent reads untranslated source

- Page translation is a **user surface**. When a run is active on a tab (`ToolGateway` run context),
  a `browser_*` perception read and the Notary recorder read the **original** DOM, not a translated
  rewrite — the extension keeps the pre-translation text (it already does, for `restorePageOriginal`)
  and perception is bound to that store while a run holds the tab.
- The `translate_translate_text` capability tool stays available to the agent for *explicit*
  translate-this-text asks; it returns translated text as a tool result (recorded as a tool result,
  ADR-0004), and does not mutate the page the agent is perceiving.
- Consequence for the user: if a person has a page visually translated and then starts an agent run
  on it, the agent works against the source text. This is intentional and is surfaced in the run's
  context, not left implicit.

### 4. Provider selection reuses the existing plumbing

Cloud translation uses `ModelGateway` with the same BYO provider resolution as the rest of the app
(`registerExternalProvider` — Anthropic / OpenAI / Gemini / Kimi, first key found). There is no
translation-specific provider, endpoint, or key. Local uses the same `llamaEngine` + `ModelManager`
model the agent uses. Both are configured from the existing Settings surfaces, not a new one.

## Alternatives considered

- **Local model only.** Rejected. The on-device model is a large optional download and its quality
  on long-tail language pairs is well below a frontier cloud model. Making it the *only* path means a
  user with no model gets no translation at all, and a user with a model gets visibly worse output
  than Chrome for the languages that need help most. Kept as the *default* path, not the only one.
- **Cloud API only.** Rejected outright. It forces the page's text off-device for the common case
  (translate this article), which is the exact move the local-first DNA exists to avoid, and it has
  no answer for a sensitive site beyond "don't translate it".
- **A prompt on sensitive sites instead of a hard refusal.** Rejected — see § 2. Consent fatigue is a
  vulnerability; a dialog the safe answer to is always "no" should not be shown.
- **Let the agent perceive translated DOM.** Rejected — § 3. It makes a run non-deterministic on
  model output that was never site content and pollutes the Notary record.

## Consequences

**Positive.** The boundary matches code that already exists and is unit-tested: local-first engine
selection, per-origin session consent with in-flight de-duplication, translation memory, glossary,
and a localized native consent dialog. Ratifying rather than rebuilding closes the roadmap's "ADR
owed" line without new engine work.

**Negative / accepted.** Translation quality is a function of a downloaded model the user may not
have; with no model and cloud denied or unavailable, translation silently degrades to a no-op (a
surfaced reason, not an error). The hybrid path is two code paths and two threat-model rows rather
than one.

**Owed, and stated rather than implied.** (1) The **sensitive-site cloud lockout** (§ 2) is not yet
wired — `host.ts` calls `resolveCloudConsent` without first consulting `isSensitiveSite`, so today a
user *could* accept a cloud-translation prompt on a banking page. This is the one behavioural gap that
must close before Phase 2c's translation line can be ticked. (2) The **agent-run untranslated-source
guarantee** (§ 3) is specified here and not yet enforced — perception is not currently bound to the
pre-translation store while a run holds a translated tab. (3) `autoTranslateForeignPages` defaulting
to `true` means language detection runs on every page; that detection is local and must stay local
(no "what language is this" cloud call) — asserted here as a constraint on any future detector.
