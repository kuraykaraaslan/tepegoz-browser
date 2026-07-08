# Phase M — Macros Extension (`@tepegoz/ext-macros`)

**Status:** 🟡 In progress (core shipped) · **Estimate:** ongoing · **Depends on:** ADR-0021
(agent-controllable extensions) + the deterministic slice already built. **Relates to:**
[Phase 6](phase-6-deterministic-automation.md) (this is the concrete, shipped down-payment on its
Record→Replay + Macros surfaces).
**Goal:** A modern, deterministic, no-code **iMacros successor** delivered as a first-class internal
extension — record, edit, and replay browser automations that survive dynamic (React/Angular) DOMs,
with real control flow, robust selectors + auto-wait, unlimited variables/arrays, CSV data-driven
loops, and agent-callable capabilities behind the single Policy Enforcement Point.
Narrative (from `docs/iMacros Şikayet ve Öneri Analizi.md`): *"Everything iMacros users begged for —
without the Manifest-V3 death, the opaque error codes, or the `EVAL` security hole."*
**Branch examples:** `feat/ext-macros`, `feat/macros-editor`, `feat/macros-visual-ocr`,
`feat/macros-scheduler`

---

## Already shipped (✅)

- [x] **Agent-controllable extension standard** — `@tepegoz/extension-sdk` `defineCapabilities` +
      `@tepegoz/extension-host` supervisor + always-on `extension_list/get/update_item` meta-tools,
      behind the single `ToolGateway` PEP. **ADR-0021**. (6 tests)
- [x] **`@tepegoz/macro-engine`** — deterministic interpreter: `if`/`repeat`(nested)/`forEachRow`
      (CSV restart), unlimited variables + arrays, a **safe sandboxed expression language** (no
      `EVAL`), auto-wait semantics, located `MacroError`s, abort + step-budget guard, and a **≥50 ms
      inter-operation pacing floor**. (18 tests)
- [x] **Deterministic selector engine** (`macro-cdp.ts`) — CSS/XPath/text/attr **SelectorChain** with
      **auto-wait polling** + `Overlay.highlightNode` highlight.
- [x] **Recorder** (`macro-recorder.ts`) — CDP capture → Steps with generated robust selector chains;
      secret fields dropped to `{{secret}}`.
- [x] **Persistence** — `MacroStore` + migration v5; CSV stored as content-addressed blobs. (5 tests)
- [x] **IPC + service** — CRUD, `attach-csv`, streamed run progress, record streaming, and **run a
      draft without saving** (`macros:run-draft`).
- [x] **`ext-macros` surfaces** — sidebar "Macro Studio" + page "My Macros"; en+tr i18n (parity test);
      registered in both registries + Tailwind `@source`.
- [x] **Editor v1** — reorder (↑/↓), delete, rename, **run + edit without saving (draft)**, insert &
      edit `waitMs`, and an **Add-step picker**: Wait (ms) · Go to URL (`navigate`) · Wait for element
      (`waitFor`) · **Wait for page load (`waitLoad`)**.
- [x] **6 agent capabilities** — `macros_list/get/create/delete_item`, `macros_create_run`,
      `macros_get_run`, on the ADR-0021 standard.

---

## Exit criteria (DoD) for this phase's remaining work

- [ ] A user can build a **non-trivial macro entirely in the editor** (nested `if`/loop, per-step
      error policy, variables, CSV) without recording, run it, and see located progress.
- [ ] Every **state-changing step re-passes the Policy Kernel** at run time; sensitive-site lockout
      holds in both record and replay; tainted values are never inlined.
- [ ] A broken selector **self-heals** (one scoped model replan) or fails with the exact predicate.
- [ ] Macros can be **scheduled / triggered / watched** unattended under a restricted profile.
- [ ] i18n en+tr for every new surface; zod `safeParse` at each new IPC/IR boundary; coverage gate;
      **no AI attribution trailer**.

---

## Tasks

### M1 — Editor / UX
- [x] **Nested block editing** — edit inside `if` / `repeat` / `forEachRow` bodies (add/edit/reorder
      child steps), not just top-level. *(highest-impact gap)*
- [x] **Add every simple step kind from scratch** — `navigate`/`click`/`fill`/`press`/`scroll`/
      `extract`/`setVar`/`waitFor`/`waitLoad`/`waitMs` via the Add-step picker. *(block kinds
      `if`/`repeat`/`forEachRow`/`assert` now covered by the nested editor.)*
- [x] **Richer inline editors** — selector input for `click`/`fill`/`extract`; key select for `press`;
      direction for `scroll`; name+expression for `setVar`; URL/timeout for `navigate`/`waitFor`/
      `waitLoad`; predicate builder for `assert`/`if`; repeat mode config; CSV row loop config +
      attach-from-editor.)*
- [ ] **Drag-and-drop reordering** (replace ↑/↓).
- [ ] **Step disable (skip without delete)**, **duplicate**, **copy/paste** steps.
- [ ] **Step-through / breakpoints**, **pause & resume** during a run.
- [ ] **Highlight the active step on the page during replay** (reuse `Overlay.highlightNode`).
- [ ] **Variable panel** — set initial variable values before a run; inspect final variables +
      extracted data after.
- [ ] **Undo/redo** in the editor + a delete confirmation.

### M2 — Selector engine (the analysis's core demands)
- [ ] **Stronger recorded chains** — add `data-testid`/`aria`/`role+name` candidates and
      **relative/axis XPath** ("the button to the right of X").
- [ ] **Wildcard / RegExp UI** — surface the IR's existing `wildcard`/`regex` flags in the editor
      (URL/text joker-character requests).
- [ ] **Visual / OCR click (XClick)** — screenshot + template/OCR match for non-DOM targets (canvas,
      video, PDF). *(the analysis's biggest "future" ask; large.)*
- [ ] **Self-healing selectors** — on a miss, one scoped AI re-bind (Phase-6 "one scoped replan"),
      then re-save; enabled by the M0 standard + `agent-runtime`.
- [ ] **iframe / shadow-DOM** element support.

### M3 — Recorder
- [ ] **More event types** — `select` (dropdown), checkbox/radio, keyboard (Enter/Tab), file upload,
      copy/paste.
- [ ] **Isolated-world capture** — move the capture script off the page main world (hardening; noted
      in `macro-recorder.ts`).
- [ ] **Auto-insert `waitLoad`/`waitFor`** after navigations while recording.
- [ ] **Sensitive-site lockout** in the recorder (no capture on bank/health/etc.).

### M4 — Data & variables
- [ ] **CSV management UI** — upload/preview/column-map on top of the existing `attachMacroCsv`.
- [ ] **Export extracted data** — dump `extract` results to CSV/JSON (the scraping output).
- [ ] **Expression language growth** — date/time functions, `random`, JSON parsing (still sandboxed).
- [ ] **Global / persistent variables** shared across macros.

### M5 — Reliability & execution
- [ ] **Adjustable speed / step-delay UI** — the engine floor is 50 ms; expose slow/normal/fast.
- [x] **Per-step error policy** — `onError: stop | skip | retry` + `retries` on every browser-action
      step (IR + zod + engine + a per-row editor control). Correctly fixes the iMacros
      `!ERRORIGNORE`-swallows-`FAIL_IF_FOUND` problem. *(3 engine tests.)*
- [ ] **Run history & replay-diff** — journal every run (Event Journal wiring exists); show the failing
      step vs the recorded golden trace.
- [ ] **Default timeout / retry settings** per macro.

### M6 — Security / policy
- [ ] **Per-step PEP re-pass** — today only navigation + run-start HITL; every state-changing step
      through the Policy Kernel (noted as a follow-up in `macro-host.electron.ts`).
- [ ] **Sensitive-site lockout** in both record and replay.
- [ ] **Persisted-value redaction** — tainted/secret values never inlined into the IR (partly done).

### M7 — Agent integration (on the M0 standard)
- [ ] **`macros_update_item`** — let the agent edit an existing macro (today only create/delete).
- [ ] **Distil a successful agent run into a macro** (Phase-6 RecipeCompiler) + "write a macro that
      does X".
- [ ] **Stream `macros_get_run` progress** to the agent.

### M8 — Scheduling & automation (Phase-6 continuation)
- [ ] **Scheduler** — cron-like background runs under the restricted unattended profile.
- [ ] **Watchers** — "run when this element/value changes" (price-watch etc.).
- [ ] **Triggers** — run on page open / URL match.

### M9 — Import / export & sharing
- [ ] **Macro export/import (JSON)** — backup & sharing.
- [ ] **iMacros `.iim` importer** — migration hook the analysis emphasizes (own format kept as source).
- [ ] **Signed sharing** — export a macro as a signed SKILL.md (Phase-6).

### M10 — Test & verification
- [ ] **CSV parser + selector-engine unit tests** (engine has 18; CDP/recorder/panel currently
      untested — headless limits).
- [ ] **Playwright `_electron` e2e** — record → replay on a dynamic page; assert extracted value +
      a post-condition `assert`.
- [ ] **Panel component tests** (React Testing Library).

---

## Suggested order (impact / effort)

1. **M1 nested-block editing + all step kinds + M5 per-step error policy + speed UI** (high impact,
   medium effort).
2. **M4 CSV UI + extracted-data export + M7 `macros_update_item`**.
3. Big bets: **M2 visual/OCR + self-healing selectors**, **M8 scheduler/watchers**.

## Cross-cutting (as in every phase)

i18n en+tr for all new surfaces · zod `safeParse` at every new IPC/IR/recorder boundary · every
agent-callable capability behind the ToolGateway PEP · `AppError` contract · determinism-first (model
only for self-healing/ambiguity) · secrets redacted, never inlined · coverage gate (S80/B70/F80/L80) ·
migration-safe DB · **NO AI attribution trailer**.
