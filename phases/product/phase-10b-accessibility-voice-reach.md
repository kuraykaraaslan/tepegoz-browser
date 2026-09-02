# Phase 10b — Accessibility, Voice & Inclusive Reach

**Status:** ⬜ Not started · **Estimate:** ~3–4 months · **Depends on:** Phase 1a (perception/a11y tree,
HITL) + Phase 1b (local SLM) + Phase 3 (multi-profile UI) · **Runs in parallel with Phase 10**
**Goal:** tepegöz already pays the cost of building a full **accessibility-tree perception FOR THE AGENT** in
L4 — that exact structure is what a world-class screen reader needs, and **no agentic browser ships true
assistive tech**. Fuse the two, extend to voice and shared-device/family use, and turn the trust model into
something **non-technical and disabled users can actually operate**. A defensible moral + emerging-market
position competitors won't copy quickly, built almost entirely on existing seams.
**Branch examples:** `feat/assistive-mode`, `feat/voice-onboarding`, `feat/voice-confirmed-hitl`, `feat/family-profiles`

## Exit criteria (DoD)

- [ ] **Assistive Mode**: a blind/low-vision/motor-impaired user navigates and operates a page end-to-end via
      the deterministic a11y-tree screen reader + voice control; state-changing actions still require HITL
      spoken-confirmation
- [ ] **Voice-first onboarding**: a first-timer completes one safe read-only task by speaking; speech → editable
      text → **narrated plan preview before running** (never speech → action)
- [ ] **Voice-Confirmed HITL**: a high-assurance approval is granted by spoken nonce + local speaker
      verification + Effect-Ledger fencing; financial/destructive still demand hardware biometric
- [ ] **Family/Guarded profile**: a Guarded profile **provably cannot escalate** its own policy; changing
      limits requires guardian biometric; no cross-profile data leakage
- [ ] **i18n:** en+tr keys added for new surfaces (Assistive Mode controls, voice onboarding, spoken-confirm
      prompts, family-profile management); en+tr voices wired
- [ ] ADR accepted: **ADR-0023** (Assistive Mode / voice-confirmed HITL trust model)
- [ ] WCAG 2.2 AA verified on all new surfaces + IME regression matrix unaffected
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L4/L7/L9 — Assistive Agent Mode (the a11y tree as a shared local screen reader)

- [ ] Expose the L4 accessibility-tree perception as a user-facing **"Assistive Mode"**: a deterministic, local
      TTS-driven screen-reader/voice-control surface narrating the **SAME a11y tree the agent reads**, with
      landmark/heading/form navigation, live-region announcements, and a local-SLM "tell me what's on this page"
      summary (no cloud, no PII leak)
- [ ] Voice commands ("next heading", "fill the email field", "click Gönder") map to **deterministic CDP
      actions**; state-changing actions still gated by HITL spoken-confirmation
- [ ] First-class WCAG 2.2 AA, en+tr voices, OS-native TTS (SAPI) as the deterministic default
- [ ] _Risk:_ Turkish TTS quality is uneven + voice could become an injection vector → OS-native TTS default +
      LLM summaries opt-in (never replacing literal narration); voice = user intent but page content stays
      untrusted; state-changing still needs HITL

### L3/L7/L8 — Voice-first "Konuş ve Yaptır" onboarding + Voice-Confirmed HITL

- [ ] A voice-first onboarding lane on **local STT** (whisper-class ONNX/DirectML): the user speaks (Turkish)
      what they want; a local-SLM intent classifier maps speech to a curated starter recipe and shows the
      **editable plan preview as narrated plain steps BEFORE running** (speech → editable text → plan, never
      speech → action)
- [ ] A guided first task walks a first-timer through one safe read-only task end-to-end, **teaching the HITL
      model by doing**
- [ ] **Voice-Confirmed HITL** for accessible high-assurance approval: the agent speaks the exact action + a
      short **nonce**, the user repeats it; local speaker verification + the spoken nonce + Effect-Ledger
      fencing defeats replay; financial/destructive still demand hardware biometric
- [ ] _Risk (ADR-0023):_ voice is a weaker authenticator + Turkish-dialect STT is imperfect → spoken-nonce is a
      second factor on local speaker verification, capped to `state_changing` (financial/destructive still
      demand biometric); always show transcribed text for correction

### L0/L8/L9 — Shared-Device / Family "Korumalı / Guarded" profiles

- [ ] Lightweight per-person profiles on the existing per-profile partitions, with a **"Korumalı / Guarded"**
      type for elders/kids: read-only browsing + a tiny allowlist of safe recipes, **NO credential-vault
      access**, every state-change blocked outright (not just HITL), large-text/high-contrast/voice-narration
      defaults
- [ ] A guardian pre-approves specific recipes; fast profile switch at the lock screen; no cross-profile data
      leakage
- [ ] The Guarded profile's restrictions are **sealed one-way narrowing** — it can never widen its own policy;
      changing limits needs guardian biometric
- [ ] _Risk:_ a guardian could be socially engineered into over-permissioning → the Guarded profile can never
      widen its own policy (sealed narrowing); changing limits requires guardian biometric

### L9 — Display scaling & input reach (rival evidence: Brave, Atlas)

> **Where this came from.** [`research/competitors/brave.md`](../../research/competitors/brave.md)
> (UI elements too small on large/4K displays; no in-browser DPI/scale control) and
> [`research/competitors/atlas.md`](../../research/competitors/atlas.md),
> whose priority table rates **non-English keyboard and IME quality a P0 blocker** — Turkish named first among
> the languages to fix, with side-panel input specifically broken.
>
> The IME half is the one place in this comparison where Tepegöz is already ahead rather than behind: a
> dedicated Turkish-Q/F pipeline with a regression matrix ships today, and the rival's own users rate its
> absence as blocking. That is worth defending with a test, not just claiming.

- [ ] **In-app UI scale control**, independent of page zoom and of the OS DPI setting, persisted per profile —
      chrome that is unreadable on a 4K panel is an accessibility defect, not a preference
- [ ] **Chrome surfaces survive 200% scaling** without clipping or overlap, asserted in the e2e suite at two
      scale factors rather than eyeballed once
- [ ] **The IME matrix covers agent surfaces too** — the command palette and the agent panel are exactly the
      "side panel" where the rival's input handling breaks; extend the existing Turkish matrix to those
      surfaces so the advantage is tested where it is most likely to regress
- [ ] **Keyboard reach** — every agent and chrome action reachable and discoverable without a mouse, listed in
      one searchable place (shared with the discoverability task in
      [S8](../ai-agent/phase-s8-assistant-ux.md))
- [ ] **The Chrome/Firefox accessibility checkbox set** that Assistive Mode does not subsume: caret
      browsing (F7), find-as-you-type, live caption, minimum font size as a user setting, "highlight each
      item as I Tab through a page", "always show scrollbars", focus-ring highlight, automatic image
      descriptions. Individually small, no current home — captured in
      [`../tracks/browser-settings-feature-gap.md`](../../docs/tracks/browser-settings-feature-gap.md) §13.

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/voice-intent/profile trust boundary;
      AppError contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution
      trailer**
