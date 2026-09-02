# Phase AI-4 — Higher-Level Deterministic Actions

**Status:** 🟡 In progress (**PR1 (code):** `scroll_to_text` — the flagship content-addressed reveal — as a `browser_update_page` action variant over the browser's native find (same-origin frames included). **Native dropdowns landed** as `select_option`. **PR2 `s16` landed 2026-07-23 (code + unit tests):** validation attributes captured end-to-end + the `browser_validate_form` pre-submit gate (see _Audited gaps_ below). Unit-tested (plumbing/regression); on-harness measurement owed. Remaining: page-quantized scroll + boundary detection, send-keys, tab auto-switch, and the `s16` typed-widget fill helpers.) · **Depends on:** [AI-2](phase-ai-2-perception-buildtree.md) · **Track:** [`phases/ai`](README.md)
**Goal:** Give the agent a small set of **higher-level, deterministic** actions that encode competence in
code — so it doesn't need a prose rule (or several fragile clicks) for each common web pattern. Ported
selectively from nanobrowser's action vocabulary, registered behind the same CapabilityRegistry/ToolGateway
PEP as every other tool.

## Why (code > prose, again)

Our current browser action set is minimal (navigate, get-elements, click/fill/scroll, validate). Patterns
like "bring an off-screen target into view", "read/select a native dropdown", "carry findings across a
scroll", or "search for X" are today either impossible or left to prose + luck. Each higher-level action
replaces a class of brittle multi-step prose with one reliable primitive.

## What to add (each replaces a fragile prose rule)

- **`scroll_to_text(text, nth?)`** — ✅ **PR1 (code):** content-addressed scroll to bring an off-viewport
  target into the index map. The primary deterministic "reveal a target that isn't in view" primitive.
  Shipped as a `browser_update_page` action variant over the browser's native find (same-origin frames
  included); returns `{ found }`. Unit-tested; real-page metric owed.
- **`cache_content(content)`** — an incremental scratchpad so multi-page extraction survives scroll/context
  loss; wrapped as untrusted (see [AI-5](phase-ai-5-content-security.md)).
- **`get_dropdown_options(index)` / `select_dropdown_option(index, text)`** — native `<select>` handling
  (options aren't in the element index map until opened); errors clearly on non-`select` targets.
- **Page-quantized scroll** — `scroll_to_top/bottom`, `next_page/previous_page` (optionally a specific inner
  scroll container by index) with boundary detection ("already at bottom") instead of blind percentage jumps.
- **`search_google(query)`** — one-shot "find X" → results, instead of manual URL typing when the destination
  is unknown (respects the URL allow-list / policy plane).
- **`send_keys(keys)`** — keyboard fallback (Enter to submit, shortcuts) when there is no clickable target.
- **Tab auto-switch on click** — when a click opens a new tab, detect it (tab-id diff) and switch, so the
  agent keeps operating on the right page (complements the AI navigation fix already shipped).

## Exit criteria (DoD)

- [ ] Each new action registered with a **zod `safeParse`d** arg schema behind CapabilityRegistry/ToolGateway; danger-class + HITL/idempotency policy set correctly (reads vs state-changing).
- [ ] `scroll_to_text`, native-dropdown, and page-quantized scroll each have a **local fixture** in the [AI-1](phase-ai-1-eval-harness.md) harness and pass; the real-site metric improves on tasks that need them (before/after recorded).
- [ ] Actions reuse the real-gesture human-input path where they actuate (click/type/scroll); determinism-first preserved (rule-based, no model call inside an action).
- [ ] `cache_content` output enters the model context **wrapped as untrusted** (AI-5) — findings are data, not instructions.
- [ ] **i18n:** tool descriptions are model-facing (English), not UI strings; any Agent Console labels get en+tr in the owning dict.
- [ ] Coverage + self-review; acceptance metrics green.

## Tasks

- [ ] Extend the `BrowserHost` / `TabHost` seams and the desktop host ([`browser-host.electron.ts`](../../../apps/desktop/src/main/agent/browser-host.electron.ts) + [`cdp-driver.electron.ts`](../../../apps/desktop/src/main/agent/cdp-driver.electron.ts)) with the primitives each action needs (scroll-to-text, dropdown option read/select, element-scoped + page scroll with boundary info, new-tab detection).
- [ ] Register the actions in [`packages/browser-tools/src/browser-tools.ts`](../../../packages/browser-tools/src/browser-tools.ts) with descriptions + zod schemas; keep the descriptions terse and behavioural.
- [ ] Fixtures + eval scenarios per action; measure the pass-rate delta on the real model.
- [ ] Prefer composing existing host primitives for pure-composition actions (e.g. a link/list reader over the AI-2 snapshot) — package-level only, no Electron change — before adding a new host method.

## Scope notes

- Do **not** port nanobrowser wholesale — add only actions that measurably help (scored by AI-1). Skip ones
  redundant with tepegoz's existing tools (e.g. we already have tab CRUD tools).
- `extract_content`-style large-payload actions are deferred (input-size concerns); `cache_content` +
  incremental reading covers the research loop for now.

## Audited gaps (external review, 2026-07)

The already-listed "remaining" items (native dropdowns are now shipped as `select_option`; page-quantized
scroll, `send_keys`, **tab auto-switch on click**, popup-return-to-main still owed) all map to `s18` — keep
those. The audit added one net-new action-vocabulary axis:

- **`s16` — validation-aware form engine.** 🟡 **PR1 landed 2026-07-23 (code + unit tests):**
  - [x] **Validation rules are now captured.** The AI-2 attribute allow-list gained `required`/`aria-required`/
        `aria-invalid`/`pattern`/`min`/`max`/`minlength`/`maxlength`/`autocomplete`/`inputmode` in BOTH the
        in-page [`build-dom-tree-script.ts`](../../../apps/desktop/src/main/agent/build-dom-tree-script.ts) and the
        pure [`interactable.ts`](../../../packages/tool-executor/src/interactable.ts). A native `required` is a
        boolean property (`getAttribute` returns `''` and was being dropped), so the script surfaces it from the
        DOM property — the model now SEES which fields are mandatory.
  - [x] **Pre-submit gate:** `browser_validate_form` (read tool) over the pure, unit-tested
        [`checkForm`](../../../packages/tool-executor/src/form-validation.ts). An adversarial review pass caught
        four ways an earlier cut of this check would have _lied to the agent_; the shipped design fixes each: - **Only `requiredEmpty` BLOCKS.** It is deterministic and self-clearing. `aria-invalid` and on-page
        error text are **advisory**: a page sets them on a failed submit and only refreshes them on the NEXT
        one, so blocking on them deadlocked the agent _after_ it had already fixed every field. - **Coverage is reported, never assumed.** The render-DOM snapshot is viewport-limited, so a clean
        result from a partial view was a false "OK to submit" — the exact failure s16 exists to prevent. The
        `BrowserHost.snapshotElements` seam gained `viewportExpansionPx` so the check reads the WHOLE page,
        and the report still degrades to `coverage: 'partial'` when the element cap truncated it, when the
        accessibility fallback captured no attributes, or when a required control is a custom/toggle widget
        whose filled state is unreadable. - **AI-5 boundary honoured.** Labels/error lines are injection-redacted (`sanitizeContent`) and
        quote-neutralised so a hostile page cannot forge a verdict inside the checker's own prose, and the
        whole report is fenced with `wrapUntrustedContent` like every other page read. - **No regex against page-controlled `pattern` values** (ReDoS): the page's own `aria-invalid` + error
        text carry the "currently invalid" signal.
        A reactor `BROWSING_STRATEGY` line steers the model to call it before submitting, and spells out the
        blocking-vs-advisory split so a stale warning cannot loop it.
  - [x] Fixture + scenario: `form-validation` (three required fields, one with a `pattern`; the ground truth
        "all set" is injected ONLY after a fully valid submit) + `form_validation_required`.
  - [ ] **Still owed:** widget-specific fill helpers for typed inputs (date/phone/currency/masked/
        custom-ARIA-dropdown/autocomplete), required-**checkbox/radio** support (checked state is not in the
        snapshot, so a required toggle is deliberately not reported rather than falsely flagged), and the
        on-harness before/after measurement.
- Note: `s18` (tab auto-switch / popup return-to-main) is the same axis as the "Tab auto-switch on click"
  item above — the audit confirms same-origin iframe auto-entry works but tab-spawn detection + auto-switch
  and OAuth/payment-popup-close return-to-main are unbuilt. Cross-reference
  [AI-7](phase-ai-7-navigation-grounding.md) (navigation) — don't duplicate.
