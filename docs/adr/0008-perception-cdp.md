# ADR-0008: DOM/a11y-first perception, vision fallback, WebMCP optional

- **Status:** Accepted
- **Date:** 2026-06-30

## Context

Pure-screenshot perception is slow and causes token blowup; pure-DOM breaks on dynamic pages
(execution loops). WebMCP (`navigator.modelContext`) is a W3C draft with ~zero real-world adoption in
2026, so it cannot be the basis of the speed story.

## Decision

Perception is **tiered: DOM + accessibility tree first** (fast, cheap, deterministic via CDP),
**vision only as a fallback** when the DOM is insufficient or the layout changed (not every step).
Automation is driven by an **out-of-process CDP driver**. The real speed advantage comes from
official-API integration adapters + DOM/a11y + screenshot eviction — **not** WebMCP. WebMCP is an
optional, future-ready fast path; Tepegöz may also inject WebMCP into its own sites/internal tools.

## Consequences

- Avoids the screenshot token-blowup, agentic sluggishness, and execution-loop classes at once.
- Background tabs open with `active:false` (no focus stealing); the agent closes what it opens.
- A Content Sanitizer strips hidden/zero-width/bidi/homoglyph injection vectors before model input.

## Update (2026-07-06) — implementation note

CDP/a11y perception is implemented. Tab tools now include list/get/create/update(active)/delete, and
agent-created tabs open in the background by default. `browser_*` tools accept an optional `tabId`, so
the agent can read, snapshot, navigate, and interact with a named browser tab while preserving the
active-tab fallback. `browser_validate_page` provides a lightweight wait + visible-text verification
step after navigation or page interaction. The remaining browser-reliability gap before concurrent
multi-group execution is deeper recovery around these tab-scoped actions.
