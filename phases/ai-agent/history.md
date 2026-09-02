# History — v1 measurement record & the build-vs-buy decision (preserved)

This program is v3. It stands on v1 (AI-1…AI-8, the `browser-use`/`nanobrowser` **port**) and v2 (the
M/C/F falsifiable-claim rewrite). The v1 documents with their full dated measurement history live in
`phases/ai/archive/`. That directory was deleted by commit `e900567` (recoverable via
`git show 49396c5:phases/ai/archive/<file>`); [S0](phase-s0-truth-and-repair.md) restores it under
`phases/ai-agent/archive/`. This file preserves the two things that must **never** be lost even if
the archive is mishandled again: the **build-vs-buy decision** and the **honest v1 status**.

## Build vs. buy — `browser-use` and `nanobrowser` (still binding)

Two mature open-source agents were evaluated. The decision governs this program too.

- **`browser-use` — learn from it, do NOT adopt as a runtime dependency.** It is Python (~99%) +
  Playwright: embedding it means a **separate Chromium** and a **Python sidecar**, which bypasses
  tepegoz's own embedded browser (`WebContentsView` + per-partition isolation), its security / policy /
  HITL / Egress-Firewall plane, and its i18n — a packaging, security, and architecture liability for a
  commercial product.
- **`nanobrowser` — a TypeScript/CDP port of browser-use's approach** (the `playwright-highlight-container`
  lineage gives it away). It is the **ready reference** for porting the same proven techniques into
  tepegoz's stack — no new runtime dependency, no second browser.

**Decision:** keep tepegoz's architecture and security posture; **port the proven techniques**
(perception, loop control, action vocabulary, content-security) into our own packages. Real-gesture
human input (the `@tepegoz/human-input` adapter) stays as-is. This is why
[`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) carries the
header _"ported from the browser-use / nanobrowser technique"_ and runs in an **isolated world**.

### Port reference (nanobrowser, local checkout) — for the S-phases that extend the port

- Perception: `chrome-extension/public/buildDomTree.js`, `browser/dom/{service,clickable/service,views,raw_types}.ts`, `browser/page.ts` → informs [S2](phase-s2-perception-v2.md), [S10](phase-s10-vision-escalation.md).
- Loop: `agent/{executor,agents/base,agents/navigator,agents/planner,messages/service}.ts` — note the **Planner / Navigator / Validator** role split; the missing **Replanner** authority is folded into [S3](phase-s3-reliability-actions.md)/[S7](phase-s7-speed.md).
- Actions: `agent/actions/{schemas,builder}.ts` → informs [S3](phase-s3-reliability-actions.md).
- Content-security: `services/guardrails/{index,patterns,sanitizer,types}.ts` → landed as
  [`content-guard.ts`](../../packages/tool-executor/src/content-guard.ts); extended by [S6](phase-s6-safety-control-plane.md).

## Honest v1 status (what actually landed, default-on)

| v1 phase                  | Landed (real, wired, default-on)                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-1 eval harness         | `_electron` driver over the real app; zod scenario registry; ground-truth scorer + secondary judge; `TEPEGOZ_EVAL_REPEAT` k/N; escape metric; per-trial isolation (2026-07-24 five-defect fix) |
| AI-2 perception           | Render-DOM `buildDomTree` default-on: interactivity/occlusion/viewport, open-shadow + same-origin iframes, `*[n]` marking, validation attrs; a11y fallback behind `TEPEGOZ_PERCEPTION`         |
| AI-3 agent loop           | Progress-brain; planner-as-validator completion authority; loop detector (read-exempt); structural page-signature stale guard; 11-kind recovery taxonomy                                       |
| AI-4 action vocabulary    | `scroll_to_text`, `select_option`, fill read-back verification, `browser_validate_form`                                                                                                        |
| AI-5 content security     | Inbound content-guard default-on (NFKC, injection redaction, forged-tag strip, taint); `SECURITY_PREAMBLE`                                                                                     |
| AI-7 navigation grounding | Grounded candidate resolver (no ungrounded URL proposed); SSRF-safe sitemap/robots reader; escape metric + trap fixtures; `/blog` prose deleted                                                |
| AI-8 beyond-the-port      | Network recorder landed + live-proven once (the 507 capture); honesty fix (nothing recommends the blind screenshot tool)                                                                       |

## The 2026-07-24 invalidation (why v1 numbers are suspect)

The first VALID live-harness run (gpt-4o) revealed neither harness nor page-interaction layer worked
end-to-end; **every prior `REPEAT>1` figure was invalidated, including the 2026-07-10 77.8%/40%
headline.** Root causes fixed (all real product bugs): perception blindness on a 0×0 content view; fill
typed into an unfocused input; select-all unreliable when unfocused; recovery budget accumulating across
the whole run; cut-off-vs-fail misclassification. The only carried-over valid numbers were
`form_validation_required` **1/3** and `silent_api_failure` **1/3**. This invalidation is _why_ the
program exists: honest measurement first, capability claims second.

## The v2 → v3 transition

v2 rewrote the track as a falsifiable world-best program (the constitution + the four claim conditions,
both inherited here). v2's own M1 close condition pre-registered a humility clause: _"if the full
baseline disagrees with this plan's failure ranking, re-cut C1..C5 rather than defend the document."_ The
one DoD-model signal that exists (Anthropic escape rate **0%**, failures **on-page** — see
[`eval-results.md`](eval-results.md)) triggered exactly that clause. **This program is that re-cut.** It
inherits v2's constitution and machinery and re-orders the capability work around the measured reality:
on-page competence, perception economy, and the missing substrate (native/streaming/vision), not the
escape gate v2 ranked first.
