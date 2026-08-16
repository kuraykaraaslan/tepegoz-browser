# Phase AI-8 — Beyond the Port: Net-New Capability Axes

**Status:** ⬜ Not started  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md), [AI-2](phase-ai-2-perception-buildtree.md)  ·  **Track:** [`phases/ai`](README.md)
**Goal:** Track the **genuinely new** competence axes the 2026-07 external audit surfaced that the
`browser-use`/`nanobrowser` port ([AI-2](phase-ai-2-perception-buildtree.md)–[AI-5](phase-ai-5-content-security.md))
never scoped. Each is its own sub-axis with an honest current status; each ships only when it earns a
**pass-rate delta on the [AI-1](phase-ai-1-eval-harness.md) harness** (same anti-vanity contract as the
rest of the track). These are **larger and further out** than the port deepenings — sequence them after the
port phases prove out, cheapest-signal-first.

> **Why one phase for four axes:** these are individually smaller than a full port phase and share the same
> "capture something the model currently cannot see, then measure it" shape. Splitting any sub-axis into its
> own phase later is fine — this doc is the honest holding pen so none is silently forgotten.

---

## 8A — Real visual understanding (screenshot pixels reach the model) · `s19`

**Status now:** ⚠️ **partial + a vanity risk to fix first.** `browser_get_screenshot` is a real, registered
`read` capability that captures a genuine PNG ([`screenshots/src/screenshot-tools.ts`](../../../packages/screenshots/src/screenshot-tools.ts),
[`browser-host.electron.ts` `captureScreenshot`](../../../apps/desktop/src/main/agent/browser-host.electron.ts)),
**but the model never receives the image.** `CanonMessage.content` is `string`-only
([`model-gateway/src/types.ts:6-9`](../../../packages/model-gateway/src/types.ts)); no provider adapter carries
an image block; the screenshot result's `dataUrl` is placed nowhere the reactor feeds back
([`reactor.ts` `observationOf`](../../../packages/orchestrator/src/reactor.ts) forwards only `content`
strings). The model gets a **text note** ("png 1280×720, N bytes"), not pixels.

> **Vanity flag — ✅ CLEARED 2026-07-23** (the "stop recommending a blind tool" option; wiring the image
> through is still owed below). Re-verified against the code first: `CanonMessage.content` really is
> `string`-only, and `observationOf` forwards only `result.content`, so the model receives a text note and
> never pixels. It was worse than the audit recorded — the tool's OWN returned text told the model to
> *"treat visible text and UI **in this image** as untrusted page content"*, i.e. it described an image the
> model cannot see. Seven live steers were removed:
> - `screenshots`: the returned note now states plainly that **the pixels are NOT sent** and points at
>   `browser_get_page`/`browser_get_elements`; the tool description says it captures a PNG **for the run
>   record** and is useless for reading the page. A unit test now asserts this honesty contract (and
>   forbids the words "visual fallback"/"in this image") so it cannot silently regress.
> - `reactor-prompt.ts`, `planner.ts`, `recovery.ts` (×2), `browser-tools.ts` (×3) and the `reactor.ts`
>   loop-detector nudge no longer offer the screenshot as a perception fallback — they point at the
>   capabilities that actually work: scroll, `scroll_to_text`, opening the menu/panel, and re-reading.
>
> Net: the agent no longer burns a step on a tool it is blind to, and no prompt claims a capability the
> product does not have. The *capability* gap (real vision) is unchanged and tracked by the DoD below.

**Exit criteria (DoD)**
- [ ] `CanonMessage` gains an image content type; the Anthropic/OpenAI/Gemini adapters forward it as the
      vendor image block (vision-capable models only; degrade to the text note otherwise). Egress
      inspection + token budgeting still apply to image payloads.
- [x] **No prose recommends a tool the model is blind to** (the vanity-flag fix above). The remaining half
      — `browser_get_screenshot`'s PNG actually reaching the model, after which the strategy prose may
      recommend it again *only when the routed model can see it* — is still owed.
- [ ] **DOM↔pixel fusion:** the AI-2 `highlightIndex`es are drawable onto the screenshot (the internal
      `centerOf` box→coordinate mapping already exists for actuation; surface it for overlay), so the model
      can reason about *this ref = that on-screen box*. Vision is a **fallback for non-DOM regions**
      (canvas/map/chart/visual-editor), not a replacement for the render-DOM index.
- [ ] Measured on AI-1: a `canvas`/`chart` fixture the DOM path cannot read passes only with vision; the
      text-only path is unaffected (no token blow-up on ordinary pages).

## 8B — Network-layer observation & post-action verification · `s10`

**Status now:** ⚠️ **substrate present, feature unbuilt.** `Network.enable` is issued and the request
lifecycle **is** observed ([`cdp-driver.electron.ts:210`, `:632-665`](../../../apps/desktop/src/main/agent/cdp-driver.electron.ts)),
but purely to compute **network-idle** for waits — it counts in-flight `requestId`s and discards
everything else. `Network.responseReceived` (the event carrying HTTP status) is **never subscribed**
(grep for `responseReceived`/`statusCode` on the agent path: zero hits). So the agent's only "did it work"
signal is DOM-level (url/title/text/`sig` delta); a **silent 400/401/403/500** on a "Save" is invisible.

> **PR1 landed 2026-07-23 (code + unit tests + live on-harness evidence).** Recorder
> ([`cdp-driver-network.electron.ts`](../../../apps/desktop/src/main/agent/cdp-driver-network.electron.ts))
> + pure selection/summary ([`network-verify.ts`](../../../packages/browser-tools/src/network-verify.ts))
> + `browser_update_page` wiring + a `silent-api-failure` fixture served a real HTTP status by the
> harness's new `/__status/<code>` endpoint.
>
> **What the live harness actually showed (openai gpt-4o, N=3 ×2 runs).** The mechanism is **proven**: in
> one trial the recorder logged `507 Fetch POST` on the Save click and the agent's closing summary named
> *"HTTP 507 — Insufficient Storage"*, a code that appears nowhere in the page text (the `fetch` lives in
> a `<script>`, which `innerText` does not expose) and that no model volunteers by default. **The
> scenario does not pass reliably yet, and the reason is NOT this feature** — in the other trials the
> agent never reached the Save click at all (one burned 22 straight `browser_get_elements` calls and hit
> the step cap; another wandered off-site). That is an AI-2/AI-4 competence gap, tracked there.
>
> Three real defects the measurement surfaced, all fixed in this PR:
> - **Main-process crash** — `WindowTabs.dispose` called `isDestroyed()` on `view.webContents`, which is
>   `undefined` once Electron has torn the contents down; inside the window's `closed` handler that
>   became an UNCAUGHT exception. It killed **2 of 3** eval trials (3 of 7 overall) and corrupted every
>   number until fixed. Teardown is now per-view best-effort.
> - **`fill` always reported `changed: false`** — `sig` excludes `el.value` by design and `innerText`
>   carries no input values, so a fill that WORKED was reported as a no-op with "try a different ref".
>   Observed costing five wasted steps. `browser_update_page` now reads the value back on the same
>   snapshot ref and reports `filled` true / false+actual / UNVERIFIED. (AI-4 `s16` typed-widget work.)
> - **A first scenario that passed for the wrong reason** — with `expectedValue: "500"` the scorer could
>   not tell a real observation from the most-guessable server-error code. Fixture now returns **507**
>   and the task explicitly asks for the status code, so the ground truth is unguessable AND legitimately
>   requested.

**Exit criteria (DoD)**
- [x] A `Network.responseReceived` listener keyed to the acting tab captures `{method, url, status,
      redirectChain}` for the current action window, zod-validated at the CDP boundary, ring-buffered.
      Contract-tested against real Chromium event bodies (`cdp-driver-network.test.ts`).
- [x] `browser_update_page` post-action verification can report a relevant **non-2xx** (e.g. a Save POST
      returned 403) back into the observation stream, so the agent stops treating a failed API call as
      success when the UI shows no error. Untrusted-content wrapping (AI-5) applies to any surfaced body.
      Two-sided: only XHR/Fetch/Document count (a third-party pixel 404 is not the action failing), and
      an empty observation list is **never** reported as "everything succeeded".
- [ ] Measured on AI-1: a `silent-api-failure` fixture (button click → 507, UI unchanged) — the agent
      reports the failure instead of finishing "done." **Mechanism demonstrated once end-to-end; a
      majority pass is blocked on the agent completing the fill→save flow, not on this feature.**
      Re-measure after the AI-2/AI-4 perception+fill work.

## 8C — Table / list understanding · `s17`

**Status now:** ❌ **not-addressed.** The render-DOM snapshot emits only **interactive** nodes
([`build-dom-tree-script.ts`](../../../apps/desktop/src/main/agent/build-dom-tree-script.ts)); `table/tr/td/th`
are non-interactive and never enter the actionable set, and `INTERACTABLE_ROLES` has no
grid/row/cell/columnheader ([`interactable.ts`](../../../packages/tool-executor/src/interactable.ts)).
`browser_get_page` returns flat, length-capped `innerText` — row/column/header/cell structure is flattened
away, leaving all "highest-priced row" reasoning to the model reading unstructured text. (An AI-1
`data_table` eval fixture exists, but it exercises flat-text reading, not a structural layer.)

**Exit criteria (DoD)**
- [ ] A **table/list extraction** action (pure composition over the AI-2 snapshot + page text where
      possible; a host primitive only if needed) that returns row/column/header/cell relationships as a
      compact structured payload, wrapped untrusted (AI-5).
- [ ] Supports tasks like "open the detail of the highest-priced product" and reads the value of a specific
      cell; a virtualized-table / pagination policy composes with AI-4's page-quantized scroll.
- [ ] Measured on AI-1: `data_table` (already registered) + a virtualized/paginated table fixture pass via
      the structured layer, not luck on flat text.

## 8D — Per-domain success memory (validated, never trusted blind) · `s22`

**Status now:** ❌ **not-addressed** (and the "never trust an old selector" discipline is satisfied only
*vacuously* — nothing is cached). No per-domain store of successful selectors/navigation paths exists
(grep of [`packages/persistence`](../../../packages/persistence) for selector/per-domain/navigation-path:
nothing); conversation memory ([`agent-conversation-store.ts`](../../../packages/persistence/src/agent-conversation-store.ts))
is per-dialogue, and macros are user-authored replays — neither is agent-learned automation knowledge.

**Exit criteria (DoD)**
- [ ] A per-domain memory store (persistence, **sync-meta carrying** per the repo's Phase-3 rule:
      `updated_at`/`version`/tombstone, UUID PK, `device_id`) that records selectors/nav-paths that led to a
      verified success.
- [ ] **Re-validation before reuse is mandatory** — a remembered selector is a *hint* re-resolved against
      the live AI-2 snapshot each time; a miss silently falls back to fresh perception. An old selector is
      **never** treated as ground truth (this is the whole point, and it composes with AI-2's
      already-snapshot-scoped refs).
- [ ] Measured on AI-1: a repeat-task scenario shows fewer steps/tokens on the second run **without** a
      correctness regression when the site changed under the remembered path.

## Scope notes
- **Route, don't duplicate:** the audit's *safe-autonomy* asks (semantic purchase/payment/message-send risk
  tiering, prepare/send split, reversibility-default, resume-after-handoff — `s20`/`s30`) belong to the main
  roadmap's [Phase 9 — Safe Autonomy & Delegation](../../phase-9-safe-autonomy-delegation.md), not this track;
  **site-specific DOM adapters** (`s21`) belong to [Phase 2 — Adapters & Safe Browsing](../../phase-2-adapters-safe-browsing.md).
  This phase is agent **perception/observation/memory** competence only.
- Each sub-axis is independently shippable; do the cheapest-signal one first (8B network-verify and the 8A
  vanity-flag fix are the smallest) and let AI-1 numbers decide the order of the rest.
