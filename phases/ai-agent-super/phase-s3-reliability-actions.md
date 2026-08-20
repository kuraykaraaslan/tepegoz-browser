# Phase S3 — Reliability Actions (W1 Reliability)

**Status:** 🟠 Measurement-owed (PR0–PR2, PR5, PR6-hover landed 2026-08-18; PR3 + PR4 + PR7 fully landed 2026-08-20 — PR3: spawn detection + policy-checked auto-follow + return-to-origin + EN/TR; PR4: live-spiked dialog/beforeunload auto-decline, overturning the phase's own DevTools-conflict assumption; PR7: widget-driven refusal (08-18) + the datepicker/combobox fill strategies (08-20); the PR6 drag spike NOT started, PR8 ⏸ funded) · **Depends on:** [S0](phase-s0-truth-and-repair.md); [S2](phase-s2-perception-v2.md) (identity refs for the locator cascade) · **Track:** [AI Agent Super](README.md)

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
- [x] Dialog + popup interception documents its HITL fallback and **never** installs a page-principal
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
- [~] Hook `setWindowOpenHandler` / `did-create-window` in the tab-engine host
      ([tab-engine](../../packages/tab-engine) + [tabs-view-wiring.ts](../../apps/desktop/src/main/tabs-view-wiring.ts));
      detect a click that opened tab T.
- [x] Emit an *"action opened tab T"* agent event and a **policy-checked** auto-follow (the
      PolicyKernel/ToolGateway decides — no unconditional follow).
- [x] Return-to-origin bookkeeping — after a popup closes, the acting tab returns to the origin tab; the
      model is told *"your click opened tab T; you are now acting on it"*, sanitized like every observation.
- [x] EN+TR strings for the *"opened tab T"* console line in [ext-agent](../../extensions/ext-agent).

> **Mechanism deviation (recorded, PR3).** Spawn detection compares the **open-tab set either side of
> the interaction** rather than hooking `setWindowOpenHandler`/`did-create-window`. Both hooks already
> carry the popup blocker and the ADR-0024 interception plane; threading an agent-run notion through them
> would put agent state into browsing mechanics, and the observation needed here — *"a tab appeared while
> I was acting"* — is exactly what the diff gives, with no coupling and no new failure mode when the two
> paths disagree. The trade-off: a tab opened by something OTHER than this interaction inside the same
> window would also be reported. That is a false positive the model can see and dismiss, which is the
> safer direction of error.
>
> **The follow is NOT unconditional — it is the SAME `tab_update_item` a model-issued switch would get.**
> [agent-runtime-loop.ts](../../packages/agent-runtime/src/agent-runtime-loop.ts)'s `advanceTabLifecycle`
> runs after every step: on a fresh spawn it calls `ToolGateway.invoke('tab_update_item', { id: spawned },
> { targetUrl: spawned.url, taintedArgs: true })` — the exact tool [tab-tools.ts](../../packages/tab-engine/src/tab-tools.ts)
> already exposes to the model, through the exact same PEP, with `taintedArgs: true` because the
> destination was the PAGE's choice. An attacker-controlled `window.open` still has to clear the Policy
> Kernel (`state_changing` → `ask`, resolved by the run's own HITL/autonomy gate exactly like any other
> click) — there is no separate fast path that bypasses confirmation. When the call does not resolve
> `active: true` (denied, declined, or the tab is view-less), the run falls back to today's
> reported-only behavior; the model still has the id and can switch itself. Every later step re-checks
> whether the followed tab is still open (`deps.listTabs()`, not a dedicated close event — no such event
> exists here, and polling reuses the same seam the spawn diff itself relies on); once it is gone, the
> same PEP call returns the acting tab to origin and says so (`tabSpawnStrings.returnedToOrigin`).
> Origin is the click's own explicit `tabId` when the model gave one, else whichever tab reads `active`
> right now — and the fallback deliberately refuses to guess when "active" already equals the spawned tab
> itself (a same-origin foreground click can auto-activate its own popup before this runs), leaving that
> edge case at today's reported-only behavior rather than booking a return to the wrong tab.
>
> **Lives in `agent-runtime-loop.ts`, not `reactor-working-state.ts` (deviation from the task list
> above).** The follow/origin pair is reactor-owned, host-facing bookkeeping — never something the model
> declares or reads back — so it sits as plain closure state in the Electron-facing loop next to the
> run's taint corpus, the same shape as `signatureCounts`/`recalledHost`-style per-run state elsewhere in
> this codebase, rather than adding a model-visible field to `AgentWorkingState`'s merge/render machinery
> for state the model has no business seeing or editing. Tested directly in
> [agent-runtime-loop.test.ts](../../packages/agent-runtime/src/agent-runtime-loop.test.ts) (12 cases:
> follow / policy-declined / already-following / return-to-origin / failed-step / origin-resolution edge
> cases) rather than through a live fixture run, since the fixture sweep itself stays ⏸ funded.

### PR4 — dialog spike + handling (Lane A, **spike-first**)
- [x] **Spike:** confirm `webContents.debugger` can own `Page.javascriptDialogOpening` /
      `handleJavaScriptDialog` without a DevTools-open attach conflict (Chromium allows one debugger
      client). Document the finding.
- [x] `beforeunload` via the native `will-prevent-unload` Electron event (no debugger needed).
- [x] alert/confirm via CDP when the debugger is free; **fallback** = surface a **blocking HITL** agent
      event (the run pauses on the pause/steer plane) — **never** a page-principal `window.confirm`
      override. *(Design changed from the fallback literally proposed here — see below.)*
- [x] `confirm-dialog-destructive` asserts the agent does **not** blindly accept a destructive confirm;
      `beforeunload-trap` asserts the agent handles the unload prompt without stranding.
- [x] EN+TR strings for the dialog HITL surface. *(Vacuously satisfied — see below.)*

> **PR4 landed 2026-08-20, and the spike's own answer changed the design.**
>
> **Spike finding (`e2e/spike-dialog-interception.spec.ts`, 4 arms, all green, repeated twice with no
> flake): the DevTools-vs-debugger conflict this phase was written around does NOT hold on this Electron
> version.** `webContents.debugger.attach()` succeeds even with native DevTools already open on the same
> tab; opening DevTools *after* the agent's debugger is attached neither throws nor detaches it; and the
> full `attach → Page.enable → Page.javascriptDialogOpening → Page.handleJavaScriptDialog` flow works
> end-to-end with DevTools open throughout (arm D). The first, naive version of this spike measured the
> OPPOSITE — but that was a confound: one of the app's own always-on page injectors (translate/typo/
> video-player, all of which auto-attach `webContents.debugger` on page load) had already taken the
> debugger before the test's own `attach()` ran, and the resulting "already attached" error had nothing to
> do with DevTools. Isolating the variable (detach any pre-existing session, mirror `CdpDriver`'s own
> `if (!isAttached())` guard) reversed the result. Recorded here rather than quietly corrected, per this
> program's own rule about a wrong belief being worth more than the phase it blocked (see S5's history).
>
> **Because the conflict doesn't happen, there is no "debugger is busy" case to build a fallback for.**
> `CdpDriver.ensureAttached`'s existing `AppError(409, "Cannot drive the page…")` on any OTHER attach
> failure already covers the rare case a tool call cannot drive the page at all, uniformly with every
> other such failure — no new fallback path was needed.
>
> **The dialog decision itself: deterministic auto-decline, not a live HITL approve/deny UI.**
> [cdp-driver-dialogs.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-dialogs.electron.ts),
> wired from `CdpDriver.ensureAttached` exactly like the AI-8B network recorder (idempotent per tab):
> - **`Page.javascriptDialogOpening` → `Page.handleJavaScriptDialog({ accept: false })`, always.** An
>   agent must never be able to talk itself into a destructive `confirm()`; declining costs nothing on an
>   `alert()` (one button either way). A legitimate, non-destructive `confirm()` an agent gets stuck behind
>   is a real cost, but guessing intent from the dialog's own untrusted text — with no model call allowed
>   inside an action — is not a safe default. This is main-process/native-only: no page-principal
>   `window.confirm`/`window.alert` override exists anywhere in the codebase (confirmed by search).
> - **`will-prevent-unload` → `event.preventDefault()`, always**, so the tab is never left on a native OS
>   prompt no DOM action can dismiss. Scoped to tabs the agent has actually acted on (installed from
>   `ensureAttached`, same gate as the CDP listener) — an ordinary human browsing tab the agent never
>   touched keeps Chromium's normal "leave site?" prompt untouched. The listener persists for the tab's
>   whole life once first wired (same lifetime as the debugger attach and the network recorder), so a human
>   who later takes over an agent-touched tab in the SAME window session would also have `beforeunload`
>   suppressed on it — an accepted, consistent-with-existing-precedent tradeoff, not a new risk class.
> - **The model is TOLD, not silently protected.** [`interceptionNote`](../../packages/browser-tools/src/browser-tools.ts)
>   (mirrors AI-8B's `networkWarning` exactly: same "action window since `Date.now()` at the top of the
>   handler" shape, same never-throws/degrades-to-`undefined` contract) folds a declined dialog or a
>   suppressed `beforeunload` into `browser_update_page`/`browser_update_location`/`browser_update_history`'s
>   own `note`, English, model-facing — the same channel S3 PR3's tab-spawn note and S3 PR7's widget
>   refusal already use. `browser_update_page` covers `confirm-dialog-destructive` (dialog raised by a
>   button click) AND `beforeunload-trap` (the trap fires from clicking an `<a href>` link, not a
>   `browser_update_location` call) in one place; navigate/history get the same fold-in for a
>   `beforeunload` a URL-bar-style move might trip.
>
> **This is why the DoD's "blocking HITL agent event (the run pauses on the pause/steer plane)" line
> reads `[x]` with a design change, not literally as written.** The run never needs to pause for a dialog
> at all: the safe default resolves it immediately and deterministically, so there is nothing for a human
> to be blocked on. Building the live approve/deny UI the literal reading implies — a real interactive
> surface, wired through `RunControl`/`enterHandoffHold`, which `CdpDriver` has no path to reach from the
> Electron-side driver layer (a real architectural gap, not just extra work) — would have added a second,
> heavier mechanism to accomplish something the deterministic default already accomplishes. **The EN+TR
> line is vacuously satisfied the same way PR3's was**: no new user-facing Agent Console event was
> introduced, because `interceptionNote` is model-facing English exactly like `networkWarning`/
> `recoveryHint` elsewhere in this file — never localized, by the same established convention.
>
> **Verification:** 7 new unit tests in
> [browser-tools.test.ts](../../packages/browser-tools/src/browser-tools.test.ts) (note-folding across all
> three tools, graceful degrade when the host omits `interceptionsSince`, append-not-replace with an
> existing note); the CDP mechanism itself is proven live by the 4-arm spike against a real Electron
> window, not a fixture run (the eval sweep stays ⏸ funded). `confirm-dialog-destructive`'s own task never
> requires the destructive button at all (rename-only is the intended path) — the auto-decline is
> defense-in-depth for an errant/adversarial click, traced by hand against the fixture's real markup, not
> exercised by a live scored run.

### PR5 — click-time occlusion re-check + locator cascade (Lane B) — fixes `cookie_consent`
- [x] `elementFromPoint` probe in the isolated world immediately **before** dispatch in
      [cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts): if
      the target is no longer the top element, report an occlusion (so the reactor can dismiss the
      overlay) instead of clicking through it.
- [x] Record a **locator cascade** per ref at snapshot — css-path + text + role/name — in
      [interactable.ts](../../packages/tool-executor/src/interactable.ts) `finalizeElements`, building on
      the S2 identity work.
- [x] [dom-path.ts](../../packages/tool-executor/src/dom-path.ts) `resolveNodePath` retries **down the
      cascade** on a miss (css → text → role/name) before returning `null`; a full re-snapshot becomes
      the last resort, not the first.
- [x] Per the [S0](phase-s0-truth-and-repair.md) `cookie_consent` diagnosis, this is the PR that must
      move the sentinel.

> **Mechanism notes (PR5).**
> 1. The probe does **not** simply veto a covered element: it tries the centre and four inset points and
>    clicks the first free one. A banner usually covers one edge, not the whole control, and refusing a
>    click a user could make would be its own failure. Only when every probe point is blocked is the
>    click refused — and then the blocker is named (tag · role · label) so the model can dismiss it.
> 2. A **failed probe never blocks a click**: an unreadable result is treated as "not occluded", because
>    a diagnostic that can veto real work is worse than the problem it detects.
> 3. The cascade lives in `resolveRef`, not inside `resolveNodePath`: the path resolver is injected into
>    the page verbatim via `.toString()` and must stay self-contained, so the *second* attempt is a
>    separate injected function (`findByLocators`) and the driver sequences them. It refuses to guess —
>    a match must agree on tag, role AND name, and be **unique**; ambiguity returns null and the model
>    re-reads, which is the phase's own stated mitigation.

### PR6 — hover + drag (Lane B, drag **spike + stretch**)
- [x] `hover` variant reusing the [human-input](../../packages/human-input) Catmull-Rom mouse path;
      `hover-menu-nav` asserts a hover-revealed menu link is then clickable.
- [ ] **Spike:** `drag` via CDP `Input.dispatchDragEvent`; if the debugger/HTML5-DnD interaction is
      unreliable, ship HITL-only and **exclude `drag-reorder` from the DoD pooled aggregate** (stated in
      Risks).

> **PR6 status.** `hover` landed. **`drag` did not**, and is not silently pending: the phase marks it
> spike-first and explicitly **not a DoD gate**, and `drag_reorder` carries a `not-a-gate` tag in the
> registry so no pooled aggregate can absorb it. Shipping a drag verb whose reliability had not been
> spiked would be worse than not having one — the agent would believe it could reorder lists it cannot.
> The CDP `Input.dispatchDragEvent` spike, and the HITL-only fallback if it proves unreliable, remain
> open work for this phase.
>
> `hover` deliberately does **not** settle the page afterwards: a hover-revealed menu is a structural
> change the caller observes by re-reading, and waiting for quiet after a pointer move would charge every
> hover a page-load budget. A hover that revealed nothing reports that plainly and suggests clicking,
> rather than reading as a failure to repeat.

### PR7 — typed widgets (Lane B)
- [x] Deterministic, rule-based fill strategies (datepicker / ARIA combobox / masked input) — a
      **structured plan**, no model call inside an action; errors honestly on an unrecognised widget.
- [x] Feed required-widget state honestly into `browser_validate_form` (a required combobox/date becomes
      reportable) — investigated and recorded below; no code change was the correct outcome.
- [x] `datepicker-booking` asserts a date is set through the widget, not by raw text injection.

> **PR7 status — the refusal landed 2026-08-18; the fill strategies + form-validation line landed
> 2026-08-20.** A `readonly` datepicker, a `disabled` field, and an ARIA combobox with a popup used to
> **refuse** a typed value outright. They still refuse when driving the widget fails, but `fillElement`
> ([cdp-driver-input.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-input.electron.ts)) now
> tries first: for `readonly`/`combobox` (never `disabled` — it cannot be opened at all), a real click
> opens the widget's own popup, then [`findWidgetOption`](../../packages/tool-executor/src/widget-option.ts)
> — injected into the page via `.toString()`, unit-tested as plain TS (mirrors `resolveNodePath`'s own
> "what is tested is exactly what runs") — finds the option/day matching the fill text and a second real
> click picks it. Only on a miss does the original refusal fire, so a broken match can never block a fill
> that would have worked, and nothing is ever set by writing a value directly.
>
> **Matching cascade** (exact → diacritic-insensitive → day-of-month → substring): exact/diacritic text
> covers an ARIA combobox option ("France"); day-of-month covers a calendar whose cells show a bare
> number, not the whole date — parsed via the page's own `Date`, with BOTH the local- and UTC-parsed day
> accepted (a date-only ISO string parses as UTC midnight, other formats as local midnight, and accepting
> either avoids a timezone-dependent off-by-one instead of guessing which one the runtime meant).
>
> **Only the datepicker path is grounded against a real fixture** (`datepicker-booking` — traced by hand
> against its actual markup: `readonly` input, `role="button"` day spans, `Room booked for 2027-03-12` on
> a real widget click). **The combobox path shares the same primitive and the same detection signal
> `widgetKindOf` already uses, but no ARIA-combobox fixture exists anywhere in `test-fixtures/` yet** — it
> is deterministic and code-reviewed, not fixture-proven. A combobox/masked-input fixture is open work for
> whoever picks up the PR8 sweep.
>
> **Masked input needed no new code.** It never trips `widgetKindOf` (not readonly/disabled/combobox), so
> it already goes through the ordinary fill+verify path — whose `fillResult` already reports a
> reformatted-but-equivalent value as a hint to continue, not a failure. That was true before this PR too;
> recorded here so "masked input" in the DoD line above isn't mistaken for unaddressed scope.
>
> **`browser_validate_form`: investigated, no code change.** `isCheckableTextField`
> ([form-validation.ts](../../packages/tool-executor/src/form-validation.ts)) already includes every
> native `input`/`textarea`/`select` tag — so a `readonly` datepicker `<input>` (this fixture's own shape)
> was ALREADY checked for required-emptiness correctly before this PR; the fill strategy above is what
> makes its `.value` become non-empty through a real click. The only real gap is a **non-native** custom
> widget (`role="combobox"` on a `<div>`, no `.value` ever), which `classify()` already treats as a
> `skippedCustomRequired` **coverage note** (advisory, surfaced in `coverageNotes`) rather than silently
> passing — by the file's own stated design ("a custom ARIA widget never reports a value... those are
> counted toward coverage instead of being falsely flagged"). Inventing a heuristic for "has this specific
> div been filled" without a real fixture to validate it against risks exactly what this checker exists to
> prevent — a confident answer resting on an unverified guess — so none was added.

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

**Amends [ADR-0024](../../docs/adr/0024-action-interception-plane.md)** — still owed as an actual doc
edit (PR8, ⏸ funded), but the shape changed from what this line originally proposed, worth recording now
so PR8 writes it accurately: popup/`window.open` interception (S3 PR3) DID join the existing synchronous
`ActionType` plane conceptually (spawn detection lives beside it, though the follow itself runs through
the ordinary `tab_update_item` PEP, not a new `ActionType`). **JS-dialog interception (S3 PR4) did NOT** —
ADR-0024's own Consequences section already flags that a genuinely async interception "would need its own
dispatch path, since `setWindowOpenHandler`/`will-navigate` can never be that path," and a dialog decision
is inherently async. [cdp-driver-dialogs.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-dialogs.electron.ts)
is exactly that separate path: CDP `Page.javascriptDialogOpening`/`handleJavaScriptDialog` + the native
`will-prevent-unload` event, entirely outside `ActionInterceptorService`/`ActionType`. **No new ADR** —
ADR-0024 gets amended to document a SECOND, async interception mechanism alongside its existing
synchronous one, not a new member of the existing union.

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
