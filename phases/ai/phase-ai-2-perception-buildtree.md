# Phase AI-2 — Render-DOM Perception (buildDomTree-style)

**Status:** 🟡 In progress (PR1 + PR2a landed: core perception + predicates + typed model + serialization + xpath→CDP click mapping + `href`/attributes; `*[n]` new-element marking; cursor calibration + viewport-expansion knob. **PR2b remaining:** same-origin iframe + open shadow-DOM stitched into one index space (needs a frame/shadow-aware resolution path — deferred until it can be verified on the real-browser harness). **On-harness measurement** still owed — pending the Electron-ABI eval env, same blocker as AI-1's e2e run.)  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md)  ·  **Track:** [`phases/ai`](README.md)
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
- [x] `snapshotElements` builds its element list from the rendered DOM (interactivity + occlusion + viewport), keyed by a stable `highlightIndex → { xpath, attributes }` selector map; refs remain valid within a snapshot. *(PR1: render-DOM path default, `TEPEGOZ_PERCEPTION=a11y` falls back; xpath selector map re-resolved lazily at action time.)*
- [x] Each element carries `href` and the relevant attributes in the model-facing serialization; `*[n]` marks new-since-last-state elements. *(PR1: `href`/attrs. PR2a: `*[n]` via per-element identity fingerprint diffed against the previous same-page snapshot — a menu's just-revealed links are flagged; navigation resets, first load marks nothing.)*
- [x] Clicking a ref still goes through the **existing real-gesture human-input adapter** (no pixel-replay; resolve index → xpath → CDP object handle, then the current click/type path). Determinism-first preserved.
- [ ] Same-origin iframe + open/closed shadow DOM elements are reachable in one index space. *(PR2b — needs a frame/shadow-aware resolution path, and is unverifiable without the real-browser harness, so deliberately deferred rather than shipped blind.)*
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** the hidden-nav and occlusion fixtures pass, and the real-site blog scenario improves vs the a11y-only baseline (before/after pass-rate recorded). Held-out set does not regress. *(Fixtures `div-button-nav` + `link-href` and scenarios added; run pending the Electron-ABI eval env — same blocker as AI-1's e2e `pnpm eval`.)*
- [x] **i18n:** none (internal perception). Pure-layer coverage added (`dom-tree.test.ts`, extended `interactable.test.ts`, `build-dom-tree-script.test.ts` syntax guard); self-review.

## Tasks

### Perception core (port into the CDP driver)
- [x] Author the in-page `buildDomTree` script ([`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts)); inject into an **isolated world** (untrusted-page-tamper-proof) via `Runtime.evaluate` and return a **serializable flat list** of the indexable nodes — no in-page handles.
- [x] Predicates: `isInteractive` (cursor:pointer + tag whitelist + role/aria + tabindex/contenteditable + inline on*), `isVisible` (box size, not display:none/visibility:hidden/opacity:0), `isTopElement` (`elementFromPoint` centre), `isInViewport` (viewport intersection). Node/emit caps; per-run `WeakMap` caches for rects/styles.
- [x] Attribute capture for interactive candidates (allow-list), incl. `href`.
- [ ] iframe recursion (same-origin) + cross-origin re-injection stitched into one index space; shadow-DOM traversal (force open mode via an `attachShadow` patch on the page). *(PR2b.)*

### Typed model + serialization
- [x] Parse the flat list into typed nodes + `xpaths` selector map + per-element `hashes` ([`dom-tree.ts`](../../packages/tool-executor/src/dom-tree.ts)); pure + Electron-free (zod boundary at the CDP read site). `markNewElements` diffs fingerprints; the driver holds the per-tab previous snapshot (`prevSnapshots`).
- [x] Extend [`packages/tool-executor/src/interactable.ts`](../../packages/tool-executor/src/interactable.ts) `RawInteractable`/`InteractableElement` with `tag?`, `href?`, `isNew?`, and the attribute allow-list; plumbed through `finalizeElements` / `renderElementsText` and the `BrowserHost.snapshotElements` return type.
- [x] Serialize render-DOM elements as `[index]<tag role=… href=… attr=…>text</tag>` (self-closing when unnamed; `*[index]` for new; attribute values capped; overriding role surfaced, tag-implicit role suppressed); page-controlled text/attrs pass through `sanitizeText`/`sanitizeLabel` (untrusted). Legacy a11y format preserved for the fallback path.

### Click/act mapping (reuse existing)
- [x] index → xpath → CDP resolve (`document.evaluate` in the isolated world → `objectId` handle) → existing `centerOf` + human-input gesture. No new click path; the real-gesture adapter is unchanged (a11y refs still resolve by `backendNodeId`).

### Tuning
- [x] Token control: viewport-limited default + attribute allow-list; the "expand viewport" knob is wired (`buildDomTreeExpression(viewportExpansionPx)`, default 0 = strictly on-screen; the isTop check is skipped in the expansion band since off-screen points can't be hit-tested).
- [x] Calibrate the cursor heuristic: the `cursor:pointer` branch skips `<body>`/`<html>` and wrapper/overlay-sized regions (> 50% of the viewport), whose real target is a descendant. Final calibration against the fixtures still owed once the harness can run.

## Scope notes
- `CdpDriver` and `MacroCdp` share one `webContents.debugger` attachment (only one active at a time) — keep the injection/read within that constraint.
- The a11y snapshot may remain as a fallback path behind a flag until the render-DOM path is proven on the eval.
