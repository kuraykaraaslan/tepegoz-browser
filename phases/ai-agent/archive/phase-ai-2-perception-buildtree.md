# Phase AI-2 — Render-DOM Perception (buildDomTree-style)

**Status:** 🟡 In progress (PR1 + PR2a + PR2b code landed: core perception + predicates + typed model + serialization + `href`/attributes; `*[n]` new-element marking; cursor/viewport calibration; **open shadow-DOM + same-origin iframe stitched into one index space** via child-index paths (`resolveNodePath`, unit-tested). **Still out:** closed shadow roots + cross-origin iframes (need per-frame CDP injection). **On-harness measurement** owed — pending the Electron-ABI eval env, same blocker as AI-1's e2e run; the shadow/iframe traversal + coordinate handling are only unit-verified, not yet browser-verified.) · **Depends on:** [AI-1](phase-ai-1-eval-harness.md) · **Track:** [`phases/ai`](README.md)
**Goal:** Replace the agent's **accessibility-tree-only** element snapshot with a **rendered-DOM +
computed-style + geometry** perception (the browser-use/nanobrowser `buildDomTree` technique), ported into
tepegoz's CDP driver. This is the single highest-leverage change: it systematically fixes whole classes of
"the agent couldn't see / find / click it" failures instead of one prose sentence at a time.

## Why (the systematic gap)

`snapshotElements` today reads only `Accessibility.getFullAXTree` and keeps interactable roles
([`apps/desktop/src/main/agent/cdp-driver.electron.ts`](../../../apps/desktop/src/main/agent/cdp-driver.electron.ts)).
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

- [x] `snapshotElements` builds its element list from the rendered DOM (interactivity + occlusion + viewport), keyed by a stable `highlightIndex → { xpath, attributes }` selector map; refs remain valid within a snapshot. _(PR1: render-DOM path default, `TEPEGOZ_PERCEPTION=a11y` falls back; xpath selector map re-resolved lazily at action time.)_
- [x] Each element carries `href` and the relevant attributes in the model-facing serialization; `*[n]` marks new-since-last-state elements. _(PR1: `href`/attrs. PR2a: `*[n]` via per-element identity fingerprint diffed against the previous same-page snapshot — a menu's just-revealed links are flagged; navigation resets, first load marks nothing.)_
- [x] Clicking a ref still goes through the **existing real-gesture human-input adapter** (no pixel-replay; resolve index → xpath → CDP object handle, then the current click/type path). Determinism-first preserved.
- [x] Same-origin iframe + open shadow DOM elements are reachable in one index space. _(PR2b: the script pierces open shadow roots + same-origin iframes into one index; each element is addressed by a child-index `path` re-resolved by `resolveNodePath` — the same algorithm is pure-unit-tested and injected via `.toString()`, so what's tested is what runs. Closed shadow roots + cross-origin iframes remain out (need per-frame CDP injection). Browser-level coordinate/occlusion verification still pends the harness.)_
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** the hidden-nav and occlusion fixtures pass, and the real-site blog scenario improves vs the a11y-only baseline (before/after pass-rate recorded). Held-out set does not regress. _(Fixtures `div-button-nav` + `link-href` and scenarios added; run pending the Electron-ABI eval env — same blocker as AI-1's e2e `pnpm eval`.)_
- [x] **i18n:** none (internal perception). Pure-layer coverage added (`dom-tree.test.ts`, extended `interactable.test.ts`, `build-dom-tree-script.test.ts` syntax guard); self-review.

## Tasks

### Perception core (port into the CDP driver)

- [x] Author the in-page `buildDomTree` script ([`build-dom-tree-script.ts`](../../../apps/desktop/src/main/agent/build-dom-tree-script.ts)); inject into an **isolated world** (untrusted-page-tamper-proof) via `Runtime.evaluate` and return a **serializable flat list** of the indexable nodes — no in-page handles.
- [x] Predicates: `isInteractive` (cursor:pointer + tag whitelist + role/aria + tabindex/contenteditable + inline on*), `isVisible` (box size, not display:none/visibility:hidden/opacity:0), `isTopElement` (`elementFromPoint` centre), `isInViewport` (viewport intersection). Node/emit caps; per-run `WeakMap` caches for rects/styles.
- [x] Attribute capture for interactive candidates (allow-list), incl. `href`.
- [x] iframe recursion (**same-origin**) + shadow-DOM traversal (**open** roots) stitched into one index space via a recursive walk building child-index `path`s; per-root viewport + `getRootNode().elementFromPoint` occlusion. _(Cross-origin re-injection + closed-shadow `attachShadow` patch: still out — PR2c/future.)_

### Typed model + serialization

- [x] Parse the flat list into typed nodes + `paths` selector map + per-element `hashes` ([`dom-tree.ts`](../../../packages/tool-executor/src/dom-tree.ts)); pure + Electron-free (zod boundary at the CDP read site). Frame/shadow-aware `resolveNodePath` ([`dom-path.ts`](../../../packages/tool-executor/src/dom-path.ts)) is pure + unit-tested and injected into the page via `.toString()`. `markNewElements` diffs fingerprints; the driver holds the per-tab previous snapshot (`prevSnapshots`).
- [x] Extend [`packages/tool-executor/src/interactable.ts`](../../../packages/tool-executor/src/interactable.ts) `RawInteractable`/`InteractableElement` with `tag?`, `href?`, `isNew?`, and the attribute allow-list; plumbed through `finalizeElements` / `renderElementsText` and the `BrowserHost.snapshotElements` return type.
- [x] Serialize render-DOM elements as `[index]<tag role=… href=… attr=…>text</tag>` (self-closing when unnamed; `*[index]` for new; attribute values capped; overriding role surfaced, tag-implicit role suppressed); page-controlled text/attrs pass through `sanitizeText`/`sanitizeLabel` (untrusted). Legacy a11y format preserved for the fallback path.

### Click/act mapping (reuse existing)

- [x] index → child-index `path` → CDP resolve (`resolveNodePath` injected into the isolated world → `objectId` handle) → existing `centerOf` + human-input gesture. No new click path; the real-gesture adapter is unchanged (a11y refs still resolve by `backendNodeId`). CDP `getBoxModel` returns top-frame coordinates, so same-origin iframe clicks reuse the same path.

### Tuning

- [x] Token control: viewport-limited default + attribute allow-list; the "expand viewport" knob is wired (`buildDomTreeExpression(viewportExpansionPx)`, default 0 = strictly on-screen; the isTop check is skipped in the expansion band since off-screen points can't be hit-tested).
- [x] Calibrate the cursor heuristic: the `cursor:pointer` branch skips `<body>`/`<html>` and wrapper/overlay-sized regions (> 50% of the viewport), whose real target is a descendant. Final calibration against the fixtures still owed once the harness can run.

## Scope notes

- `CdpDriver` and `MacroCdp` share one `webContents.debugger` attachment (only one active at a time) — keep the injection/read within that constraint.
- The a11y snapshot may remain as a fallback path behind a flag until the render-DOM path is proven on the eval.

## Audited gaps (external review, 2026-07)

The 2026-07 audit confirmed the render-DOM perception is the live default and recognises elements by
role/aria/semantic tag (not CSS class) — but surfaced two shortfalls beyond the already-tracked
closed-shadow / cross-origin work:

- [ ] **`s05` — no locator cascade or action-time occlusion re-check.** Each `ref` resolves to exactly **one**
      address (an a11y `backendNodeId` or a render-DOM child-index path); a stale/failed locate forces a full
      **re-snapshot**, not a second locator for the _same_ element. Occlusion is checked only at **snapshot**
      time (`isTopElement`); at click time `clickElement` does **no** occlusion re-verification
      (`getBoxModel` isn't occlusion-aware) — only `fillElement` re-verifies (via focus retry) — so an
      overlay that appears **between read and click** is not caught. The suggested cascade
      (accessibility → text → semantic → CSS → coordinate) with an **auto-generated alternative selector** on
      failure does not exist. Add: (a) a centre/corner `elementFromPoint` occlusion re-check inside
      `clickElement` before dispatch (throw "occluded — re-read" instead of clicking the overlay), and (b)
      an alternative-locator attempt for the same node before conceding `selector_stale`.
- [ ] **`s04` — the default path bypasses the real accessible name.** The render-DOM `textOf()` derives a
      name from `aria-label → placeholder → alt → innerText → title` but does **not** resolve
      `aria-labelledby` or `<label for=>` association — a strict subset of Chromium's accessible name, which
      the **a11y fallback** (`Accessibility.getFullAXTree`) computes fully. A `labelledby`-only control
      surfaces with a weaker/blank name on the default path. Add `aria-labelledby`/`label-for` resolution to
      `textOf()` (and consider a computed-ARIA-role for composite widgets, e.g. an `aria-checked` div with no
      explicit `role`).
- [ ] **`s23` (minor) — no page summary; refs are positional, not identity-stable.** The model gets
      url/title + a capped element list + raw visible text but **no distilled summary**, and refs are
      reassigned per snapshot (`i+1`, rebuilt every `browser_get_elements`) — the browser-use positional
      `highlightIndex` model, not the stable `E12/E13` the suggestion pictured. The `*[n]` new-element
      marker is the only cross-snapshot signal. _Documented design choice, not a bug_ — listed only so a
      future "distil a one-paragraph page summary" experiment has a home. Low priority.

Also correct the doc's own line 18 overclaim: the interactivity heuristic does **not** classify on
`class`/`data-*` (verified — there is no `className` branch); `data-testid` is captured only as an attribute.
