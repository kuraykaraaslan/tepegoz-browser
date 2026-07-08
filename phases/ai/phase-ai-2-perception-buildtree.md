# Phase AI-2 — Render-DOM Perception (buildDomTree-style)

**Status:** ⬜ Not started  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md)  ·  **Track:** [`phases/ai`](README.md)
**Goal:** Replace the agent's **accessibility-tree-only** element snapshot with a **rendered-DOM +
computed-style + geometry** perception (the browser-use/nanobrowser `buildDomTree` technique), ported into
tepegoz's CDP driver. This is the single highest-leverage change: it systematically fixes whole classes of
"the agent couldn't see / find / click it" failures instead of one prose sentence at a time.

## Why (the systematic gap)

`snapshotElements` today reads only `Accessibility.getFullAXTree` and keeps interactable roles
([`apps/desktop/src/main/agent/cdp-driver.electron.ts`](../../apps/desktop/src/main/agent/cdp-driver.electron.ts)).
That misses unlabelled `div`/`span` click targets, has no occlusion awareness, and exposes no `href`/DOM
attributes. The render-DOM approach fixes all three and adds new-element diffing — the difference between
"the model is blind to half the page" and "the model sees what a human sees."

## What the technique gives (vs a11y-only)
1. **Interactivity from computed CSS `cursor`** (pointer/grab/resize/…) + tag whitelist + `role`/`aria-*` + `class`/`data-*` + inline `on*` → catches `div`/`span` "buttons" with no semantic role.
2. **Occlusion-aware hit-testing** (`elementFromPoint` at centre + corners) → only elements a real click would actually reach are indexed (a modal correctly suppresses the controls it covers).
3. **Viewport-tied** indexing (default: in-viewport only) → the list matches what's on screen; pairs with scroll info.
4. **Raw attributes exposed** (`href`, `role`, `aria-label`, `aria-expanded`, `type`, `value`, `data-testid`, …) → the model can reason about targets and read link destinations.
5. **New-element marking `*[n]`** (branch-path hashing across states) → after an action, freshly-appeared elements (e.g. a menu that just opened) are flagged.
6. **iframe frame-hopping + shadow-DOM piercing** (force `attachShadow` open) unified into one index space.

> **Honest limitation (documented, not a bug):** buildDomTree does **not** pre-expand a collapsed
> (`display:none`) menu either — its links appear only after the toggle is clicked, on the next snapshot
> (then marked `*[n]`). The win over a11y is that the toggle is reliably detected and everything visible is
> richer; the "don't give up, open the menu" behaviour comes from [AI-3](phase-ai-3-agent-loop.md), and the
> deterministic reveal helpers from [AI-4](phase-ai-4-action-vocabulary.md).

## Exit criteria (DoD)
- [ ] `snapshotElements` builds its element list from the rendered DOM (interactivity + occlusion + viewport), keyed by a stable `highlightIndex → { xpath, attributes }` selector map; refs remain valid within a snapshot.
- [ ] Each element carries `href` and the relevant attributes in the model-facing serialization; `*[n]` marks new-since-last-state elements.
- [ ] Clicking a ref still goes through the **existing real-gesture human-input adapter** (no pixel-replay; resolve index → node → CDP, then the current click/type path). Determinism-first preserved.
- [ ] Same-origin iframe + open/closed shadow DOM elements are reachable in one index space.
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** the hidden-nav and occlusion fixtures pass, and the real-site blog scenario improves vs the a11y-only baseline (before/after pass-rate recorded). Held-out set does not regress.
- [ ] **i18n:** none expected (internal perception). Coverage + self-review.

## Tasks

### Perception core (port into the CDP driver)
- [ ] Author the in-page `buildDomTree` script; inject via `wc.executeJavaScript` (tepegoz already runs `executeJavaScript` for selection/innerText) and return a **serializable flat map** `{ rootId, map }` — no in-page handles.
- [ ] Predicates: `isInteractive` (cursor set + tag whitelist + role/aria + class/data + inline on*), `isVisible` (offset size, not display:none/visibility:hidden), `isTopElement` (`elementFromPoint` centre + corners), `isInViewport` (viewport ± expansion, default 0). Cap depth; per-run `WeakMap` caches for rects/styles.
- [ ] Attribute capture for interactive candidates/iframes/body (all names), incl. `href`.
- [ ] iframe recursion (same-origin) + cross-origin re-injection stitched into one index space; shadow-DOM traversal (force open mode via an `attachShadow` patch on the page).

### Typed model + serialization
- [ ] Parse the flat map into typed nodes + `selectorMap: Map<highlightIndex, node>`; compute branch-path hashes for `isNew`.
- [ ] Extend [`packages/tool-executor/src/interactable.ts`](../../packages/tool-executor/src/interactable.ts) `RawInteractable`/`InteractableElement` with `href?`, `isNew?`, and the attribute allow-list; plumb through `finalizeElements` / `renderElementsText` and the `BrowserHost.snapshotElements` return type.
- [ ] Serialize as `[index]<tag attr=…>text /​>` (attribute values capped; `*[index]` for new); page-controlled text/attrs pass through `sanitizeLabel` (untrusted).

### Click/act mapping (reuse existing)
- [ ] index → node → xpath/CSS → CDP resolve (`DOM.resolveNode`/`performSearch`, backend node id) → existing `centerOf` + human-input gesture. No new click path; keep the real-gesture adapter.

### Tuning
- [ ] Token control: keep viewport-limited default + attribute allow-list; expose an "expand viewport" knob for the rare full-page case.
- [ ] Calibrate the cursor heuristic (e.g. treat `cursor:text` carefully) against the AI-1 fixtures to avoid over/under-selection.

## Scope notes
- `CdpDriver` and `MacroCdp` share one `webContents.debugger` attachment (only one active at a time) — keep the injection/read within that constraint.
- The a11y snapshot may remain as a fallback path behind a flag until the render-DOM path is proven on the eval.
