# Phase S3 — Reliability Actions (W1 Reliability)

**Status:** 🟡 In progress (PR0–PR2 landed 2026-08-18) · **Depends on:** [S0](phase-s0-truth-and-repair.md); [S2](phase-s2-perception-v2.md) (identity refs for the locator cascade) · **Track:** [AI Agent Super](README.md)

**Goal:** Close the missing action vocabulary and the two structural interaction gaps — snapshot-only
occlusion and one-locator-per-ref — that make the agent fail on real sites. This targets the **measured**
on-page competence gap ([eval-results.md](eval-results.md): the Anthropic product default fails the hard
nav scenarios ON-PAGE, escape rate 0%), not the escape ceiling v2 chased. It adds dialogs, a tab-spawn
world model, `wait_for`, `send_keys` chords, hover/drag, browser-history verbs and typed-widget fill
strategies, and it fixes `cookie_consent` (0/3, zero escapes) via a click-time occlusion re-check and a
locator cascade rather than a full re-snapshot on every locator miss.

## Why

The on-page gap **is** the measured DoD-model failure mode. [eval-results.md](eval-results.md) records
`url_hallucination_trap` **0/2** failing on-page (wrong/incomplete answer), `escape rate 0%`, and
`cookie_consent` **0/3 with zero escapes** — a distinct interaction gap (its baseline is re-taken and
diagnosed by [S0](phase-s0-truth-and-repair.md)). The verbs and structural fixes below are what a real
site needs and today's loop lacks:

- **Missing verbs (verified absent from the vocabulary).** [browser-tools.ts](../../packages/browser-tools/src/browser-tools.ts)
  / [ToolGateway](../../packages/tool-executor/src/interactable.ts) expose `click | fill | press |
  scroll | scroll_to_text | select_option` only. There is **no** hover, drag, right-click, key
  chords/send-keys (`press` is single-key `KEY_MAP` only — an unknown key raises a hard
  `AppError(400)` in [cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts)),
  no back/forward/reload, no `wait_for`, no JS-dialog handling (**no** `Page.javascriptDialogOpening`
  handler anywhere), and no popup/`window.open` follow.
- **`target=_blank` STRANDS the agent.** Popups are opened by
  [tabs-view-wiring.ts](../../apps/desktop/src/main/tabs-view-wiring.ts) but **nothing tells the
  reactor** — there is no tab-spawn world model, so a click that spawns a tab leaves the agent acting on
  the wrong (old) page. Prose steer #1 (tab discipline) exists precisely because the mechanism is
  missing.
- **Occlusion is checked only at snapshot time.** [build-dom-tree-script.ts](../../apps/desktop/src/main/agent/build-dom-tree-script.ts)
  `isTopElement` runs during the scan; [cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts)
  `clickElement` dispatches **without** re-probing whether the target is still the top element. A
  cookie/consent banner or sticky overlay that appears **between** snapshot and click intercepts the
  gesture — the direct cause of `cookie_consent` failing with no escape.
- **One locator per ref.** [dom-path.ts](../../packages/tool-executor/src/dom-path.ts) `resolveNodePath`
  returns `null` on a miss, which forces a full, expensive re-snapshot (and re-numbers every positional
  ref in [interactable.ts](../../packages/tool-executor/src/interactable.ts) `finalizeElements`). One
  locator, one shot; a stale ref costs a whole perception round-trip.
- **Typed widgets sink task families.** Datepickers, ARIA comboboxes and masked inputs are not fillable
  by free clicking; there is no structured fill strategy. This is the residue behind prose steer #5
  (`validate_form` before submit).

Mechanism (what this phase builds): a **tab-spawn world model** hooked off `setWindowOpenHandler` /
`did-create-window` in the tab-engine host that emits an *"action opened tab T"* agent event, does a
policy-checked auto-follow, and books return-to-origin in
[reactor-working-state.ts](../../packages/orchestrator/src/reactor-working-state.ts); **dialog handling**
via the native `will-prevent-unload` for `beforeunload` and `webContents.debugger`
CDP `Page.javascriptDialogOpening` / `handleJavaScriptDialog` for alert/confirm (spike-first, HITL
fallback, **never** a page-principal `window.confirm` override); new verbs `wait_for`, `send_keys`
(chords, replacing the single-key `KEY_MAP`), `hover` (reuses the [human-input](../../packages/human-input)
Catmull-Rom path), `drag` (CDP `Input.dispatchDragEvent`), `back/forward/reload` (`webContents` calls),
and typed-widget fill strategies; a **click-time occlusion re-check** (`elementFromPoint` probe in the
isolated world immediately before dispatch); and a **locator cascade** (css-path + text + role/name
recorded per ref at snapshot, built on S2 identity, retried down the cascade on a miss instead of
re-snapshotting).

## Exit criteria (DoD)

- [ ] `cookie_consent` **≥ 8/10** with a Wilson **lower bound > 50%** at pooled N (⏸ funded sweep) — the
      regression sentinel that proves the occlusion re-check + locator cascade.
- [ ] The **new-fixture family** (popup-follow, target-blank-form, confirm-dialog-destructive,
      beforeunload-trap, datepicker-booking, hover-menu-nav, drag-reorder) pooled **≥ 70%** at **N ≥ 10**
      (⏸ funded sweep). `drag-reorder` is **NOT** a gate — see Risks (stretch, excluded from the pooled
      aggregate if the CDP drag spike lands HITL-only).
- [ ] **web-patterns pooled** improves with a **CI-separated** delta versus the [S0](phase-s0-truth-and-repair.md)
      baseline — pre-stated detectable effect **≥ 25pp pooled**, not CI-overlap eyeballing (⏸ funded
      sweep).
- [ ] **Zero regression** on the acceptance family (N=3, flaky-tagged) (⏸ funded sweep).
- [ ] Every new verb registered behind the single [ToolGateway](../../packages/tool-executor/src/interactable.ts)
      PEP with a zod `safeParse`d schema in [`@tepegoz/shared-types`](../../packages/shared-types); an
      unknown/malformed arg errors as `AppError`, never a raw throw. `send_keys` **replaces** the
      single-key `KEY_MAP` hard-fail path — an unknown chord degrades to a reported no-op, not
      `AppError(400)`.
- [ ] Dialog + popup interception documents its HITL fallback and **never** installs a page-principal
      `window.confirm`/`window.alert` override (security-plane invariant, [ADR-0024](../../docs/adr/0024-action-interception-plane.md)).
- [x] **Fixtures frozen before capability code** (PR0), each with a `test-fixtures/sites/<name>/index.html`
      + a registry entry, and a green scripted plumbing run before any reactor/executor code lands.
- [ ] **Prose steers** #1–#5 each moved **DELETED or RETAINED** by its **paired with/without sweep** at
      pooled N with the pre-stated equivalence margin; [PROSE-LEDGER.md](PROSE-LEDGER.md) updated in the
      proving PR with the before/after system-prompt token count (⏸ funded sweep).
- [ ] **Delta recorded** in [eval-results.md](eval-results.md) (a phase is incomplete until its number is
      in the ledger; ⏸ funded sweep — the phase legitimately rests at 🟠 until the funded sweep runs).
- [ ] **i18n:** new tool descriptions are model-facing English; any new Agent Console string
      (the *"opened tab T"* / *"agent waiting on a page dialog"* HITL surface in
      [ext-agent](../../extensions/ext-agent)) ships **EN + full TR parity in the same PR**.

## Tasks

### PR0 — fixture freeze
- [x] Add seven `test-fixtures/sites/*/index.html` deterministic pages (see [Fixtures](#fixtures)):
      `popup-follow`, `target-blank-form`, `confirm-dialog-destructive`, `beforeunload-trap`,
      `datepicker-booking`, `hover-menu-nav`, `drag-reorder`.
- [x] Register them in a new `packages/agent-eval/scenarios/reliability-actions.json` (mirrors the
      `web-patterns.json` schema: `id / task / target.fixture / success.domAssertion / heldOut / tags`);
      hold out the check-set per the constitution.
- [x] Confirm `cookie_consent` in [web-patterns.json](../../packages/agent-eval/scenarios/web-patterns.json)
      stays untouched as the **regression sentinel**.
- [x] Green scripted plumbing run (`ScriptedProvider`) proving the fixtures load + score, labelled
      "plumbing/regression, NOT competence" — **no capability code in this PR** (the exam is frozen
      before the answer exists).

### PR1 — nav verbs + `wait_for` (Lane A)
- [x] `browser_history` (`back | forward | reload`) as `webContents` calls in
      [browser-host.electron.ts](../../apps/desktop/src/main/agent/browser-host.electron.ts); tool +
      schema in [browser-tools.ts](../../packages/browser-tools/src/browser-tools.ts).
- [x] `wait_for` (`text | selector | network_idle`, bounded by an explicit timeout, returns a truthful
      `{ satisfied, waitedMs }`) — resolves in the isolated world / via a bounded CDP `Network.*` idle
      probe; never an unbounded spin.
- [x] Reactor consumes the new observations in [reactor.ts](../../packages/orchestrator/src/reactor.ts) /
      [reactor-decision.ts](../../packages/orchestrator/src/reactor-decision.ts) without breaking the
      non-streaming JSON-in-text contract (locked by the model-gateway streaming guard).

> **Naming deviation (recorded, PR1).** The verbs ship as **`browser_update_history`** and
> **`browser_validate_condition`**, not `browser_history` and `wait_for`. `ToolNameSchema` enforces
> `{domain}_{verb}_{noun}` with an approved verb and the registry `parse`s it, so both of the doc's
> literal names are rejected at registration. Same verbs, names the plane accepts.
>
> `moved` comes from the browser's own `canGoBack`/`canGoForward`, not from comparing URLs afterwards:
> a site that pushes the same URL twice makes a real back step look like a no-op and a genuine no-op look
> like a step. `network_idle` reuses the driver's existing settle logic rather than inventing a second
> definition of "quiet" that could disagree with the one every interaction is already judged by. The
> reactor needs no change to consume either — both are ordinary tool results on the existing observation
> path.

### PR2 — `send_keys` chords (Lane A/B)
- [x] `send_keys` variant of `browser_update_page` in
      [browser-tools.ts](../../packages/browser-tools/src/browser-tools.ts) over the real-gesture path;
      accepts chords (`Ctrl+A`, `Shift+Tab`, `Enter`, sequences).
- [x] **Replace** the single-key `KEY_MAP` hard-fail in
      [cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts): an
      unrecognised key becomes a reported no-op, not `AppError(400)`.
- [x] Keep `press` as a thin single-key alias so existing scenarios (`form_validation_required`) don't
      regress.

### PR3 — tab-spawn world model (Lane A)
- [ ] Hook `setWindowOpenHandler` / `did-create-window` in the tab-engine host
      ([tab-engine](../../packages/tab-engine) + [tabs-view-wiring.ts](../../apps/desktop/src/main/tabs-view-wiring.ts));
      detect a click that opened tab T.
- [ ] Emit an *"action opened tab T"* agent event and a **policy-checked** auto-follow (the
      PolicyKernel/ToolGateway decides — no unconditional follow).
- [ ] Return-to-origin bookkeeping in
      [reactor-working-state.ts](../../packages/orchestrator/src/reactor-working-state.ts): after a popup
      closes, the acting tab returns to the origin tab; the model is told *"your click opened tab T; you
      are now acting on it"*, sanitized like every observation.
- [ ] EN+TR strings for the *"opened tab T"* console line in [ext-agent](../../extensions/ext-agent).

### PR4 — dialog spike + handling (Lane A, **spike-first**)
- [ ] **Spike:** confirm `webContents.debugger` can own `Page.javascriptDialogOpening` /
      `handleJavaScriptDialog` without a DevTools-open attach conflict (Chromium allows one debugger
      client). Document the finding.
- [ ] `beforeunload` via the native `will-prevent-unload` Electron event (no debugger needed).
- [ ] alert/confirm via CDP when the debugger is free; **fallback** = surface a **blocking HITL** agent
      event (the run pauses on the pause/steer plane) — **never** a page-principal `window.confirm`
      override.
- [ ] `confirm-dialog-destructive` asserts the agent does **not** blindly accept a destructive confirm;
      `beforeunload-trap` asserts the agent handles the unload prompt without stranding.
- [ ] EN+TR strings for the dialog HITL surface.

### PR5 — click-time occlusion re-check + locator cascade (Lane B) — fixes `cookie_consent`
- [ ] `elementFromPoint` probe in the isolated world immediately **before** dispatch in
      [cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts): if
      the target is no longer the top element, report an occlusion (so the reactor can dismiss the
      overlay) instead of clicking through it.
- [ ] Record a **locator cascade** per ref at snapshot — css-path + text + role/name — in
      [interactable.ts](../../packages/tool-executor/src/interactable.ts) `finalizeElements`, building on
      the S2 identity work.
- [ ] [dom-path.ts](../../packages/tool-executor/src/dom-path.ts) `resolveNodePath` retries **down the
      cascade** on a miss (css → text → role/name) before returning `null`; a full re-snapshot becomes
      the last resort, not the first.
- [ ] Per the [S0](phase-s0-truth-and-repair.md) `cookie_consent` diagnosis, this is the PR that must
      move the sentinel.

### PR6 — hover + drag (Lane B, drag **spike + stretch**)
- [ ] `hover` variant reusing the [human-input](../../packages/human-input) Catmull-Rom mouse path;
      `hover-menu-nav` asserts a hover-revealed menu link is then clickable.
- [ ] **Spike:** `drag` via CDP `Input.dispatchDragEvent`; if the debugger/HTML5-DnD interaction is
      unreliable, ship HITL-only and **exclude `drag-reorder` from the DoD pooled aggregate** (stated in
      Risks).

### PR7 — typed widgets (Lane B)
- [ ] Deterministic, rule-based fill strategies (datepicker / ARIA combobox / masked input) — a
      **structured plan**, no model call inside an action; errors honestly on an unrecognised widget.
- [ ] Feed required-widget state honestly into `browser_validate_form` (a required combobox/date becomes
      reportable).
- [ ] `datepicker-booking` asserts a date is set through the widget, not by raw text injection.

### PR8 — exit sweep + steer deletions (⏸ funded)
- [ ] Funded sweep across `cookie_consent`, the new family, web-patterns, acceptance; record the delta in
      [eval-results.md](eval-results.md).
- [ ] Paired with/without sweep for each of prose steers **#1–#5**; move each **DELETED/RETAINED** in
      [PROSE-LEDGER.md](PROSE-LEDGER.md) with the token-count delta and the proving sweep linked.
- [ ] Amend [ADR-0024](../../docs/adr/0024-action-interception-plane.md) with the dialog + popup
      interception points.

## Fixtures

New, frozen in **PR0** under `test-fixtures/sites/` + `packages/agent-eval/scenarios/reliability-actions.json`:

| Fixture | Asserts |
|---|---|
| `popup-follow` | a click opens a tab; agent follows, acts, returns to origin |
| `target-blank-form` | `target=_blank` form submit; agent completes on the spawned tab, not stranded |
| `confirm-dialog-destructive` | agent does not blindly accept a destructive `window.confirm` |
| `beforeunload-trap` | agent handles a `beforeunload` prompt without stranding |
| `datepicker-booking` | a date is set through the widget, not raw text injection |
| `hover-menu-nav` | a hover-revealed menu link becomes clickable and is followed |
| `drag-reorder` | drag reorders a list (**stretch**, not a DoD gate) |

**Regression sentinel (unchanged):** `cookie_consent` in
[web-patterns.json](../../packages/agent-eval/scenarios/web-patterns.json) — the occlusion-re-check
proof.

## Prose steers

This phase **owns** (from [PROSE-LEDGER.md](PROSE-LEDGER.md)):

- **#1 tab discipline** — subsumed by the PR3 tab-spawn world model.
- **#2 reveal hidden navigation** — subsumed by the occlusion re-check + the hover verb + the
  structural-signature re-read.
- **#3 conventional path only when shown** — nav-verb / grounding residue.
- **#4 `web_search` last resort (the escape steer)** — the on-page competence sweep tests whether it is
  still load-bearing given escape is already 0%.
- **#5 `validate_form` before submit** — decided by the typed-widget / form-completion sweep.

Each row moves **DELETED or RETAINED** only by its paired with/without sweep at pooled N (equivalence
margin pre-stated), in the same PR that proves the delta (PR8).

## ADR

**Amends [ADR-0024](../../docs/adr/0024-action-interception-plane.md)** — the action-interception plane
gains two interception points: JS-dialog interception (`will-prevent-unload` + CDP
`Page.javascriptDialogOpening` / `handleJavaScriptDialog`, with the HITL fallback recorded) and
popup/`window.open` interception (`setWindowOpenHandler` / `did-create-window` → agent event +
policy-checked follow). **No new ADR.**

## Risks

- **CDP debugger attach conflict.** Chromium allows a single debugger client, so an open DevTools window
  conflicts with `webContents.debugger`. **Mitigation:** dialog (PR4) and drag (PR6) are **spike-first**
  with a documented **HITL fallback** — dialogs surface as a blocking pause event; drag ships HITL-only
  if the spike is unreliable, and `drag-reorder` is then **excluded from the DoD pooled aggregate**
  (drag is explicitly **not** a gate).
- **Page-principal override temptation.** A `window.confirm`/`window.alert` override in the page world
  would let untrusted script drive the agent. **Mitigation:** interception is main-process only, via the
  debugger/native events — never injected into the page principal (a security-plane invariant asserted in
  the DoD).
- **Auto-follow as an SSRF/escape vector.** An attacker-controlled `window.open` could pull the agent
  off-task. **Mitigation:** the follow is **policy-checked** through the PolicyKernel/ToolGateway, not
  unconditional, and books return-to-origin.
- **Right-click context menus deferred.** Native context-menu automation is **explicitly a stretch,
  deferred to a later PR** — not in this phase's vocabulary or DoD.
- **Locator cascade masking real staleness.** Retrying down css → text → role/name could click a
  wrong-but-plausible element. **Mitigation:** the cascade requires a role/name match consistent with the
  recorded S2 identity; on ambiguity it falls back to a re-snapshot rather than guessing.
