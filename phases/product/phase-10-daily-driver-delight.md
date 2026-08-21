# Phase 10 — Daily-Driver Delight (event-sourcing superpowers)

**Status:** ⬜ Not started · **Estimate:** ~3–4 months · **Depends on:** Phase 1a/1b (Journal folds, local
SLM, plan-preview, Memory + HybridRetriever) + Phase 2b (workspaces, split-view, reading mode) · **Runs in
parallel with Phase 10b**
**Goal:** The reason a normal person switches isn't security theater — it's everyday superpowers competitors
**structurally can't match**. Turn the invisible Journal + local-SLM substrate into visible delight: time-travel
tabs, a privacy-respecting AI tab janitor, highlight-to-memory, a research canvas with provenance, and a
first-run "magic moment" — all honoring local-first and HITL. The demand-side complement to the
deterministic-automation supply.
**Branch examples:** `feat/time-travel-tabs`, `feat/tab-janitor`, `feat/highlight-to-memory`,
`feat/first-run-magic`, `feat/trust-reading-lens`

## Exit criteria (DoD)

- [ ] **Time-Travel Tabs**: scrub a timeline and restore the exact tab set/groups/scroll at any past moment;
      sensitive-site lockout re-applied on restore; no page DOM persisted (URLs + UI state only)
- [ ] **Tab Janitor**: one keystroke proposes group/suspend/bookmark-close as a deterministic editable preview;
      nothing closes without approval; closes are undoable via Time-Travel Tabs
- [ ] **Highlight-to-Memory + Research Canvas**: highlights embed into memory locally with source provenance;
      a deterministic cited export (Markdown/PDF) is produced; only synthesis costs tokens
- [ ] **First-run Magic Moment**: import bookmarks/history → an on-device digest renders with a visible
      "computed locally, 0 tokens, 0 bytes sent" badge; nothing leaves the device
- [ ] **i18n:** en+tr keys added for new surfaces (timeline/snapshots, Tidy preview, highlight/research canvas + export, onboarding import digest, trust-lens badges + Güven Turu)
- [ ] Coverage gate (S78/B85/F85/L78) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L1/L9 — Time-Travel Tabs (point-in-time workspace snapshots)

- [ ] Scrub a timeline → restore the EXACT tab set, scroll positions, and group layout at any past moment; a
      snapshot is just a **fold of `TabOpened`/`TabClosed` events up to a chosen LSN** — no full-DOM storage,
      only URLs + UI state
- [ ] Named auto-snapshots ("before agent run", "before window close") + manual "pin this moment"; restores
      open URLs locally, no cloud
- [ ] _Risk:_ restoring authenticated tabs could re-open sensitive sites → re-apply sensitive-site lockout +
      Policy Kernel on restore; never persist page DOM, only URLs + UI state, redacted per Journal rules

### L7/L3/L1 — Local AI Tab Janitor (with deterministic dry-run preview)

- [ ] A one-keystroke **"Tidy"** command (palette Do-mode): the local SLM clusters open tabs by topic and
      detects duplicates/stale/read tabs, then proposes group/suspend/bookmark-and-close/keep as a
      **deterministic editable PREVIEW** (like the L3 plan preview)
- [ ] Nothing closes until the user approves; every close is a Journal event → undoable via Time-Travel Tabs;
      suspending frees RAM (addresses battery/memory drain). Runs fully offline on the NPU
- [ ] _Risk:_ never auto-suspend tabs with **dirty form state** (detectable via CDP); the dry-run preview means
      the user is the gate

### L2/L9 — Highlight-to-Memory + Split-View Research Canvas (with provenance export)

- [ ] In reading mode, select text → highlight/note; each highlight is a **CAS blob + a Journal event** with
      source URL, embedded via the existing bge-m3 pipeline into memory, shown in the **opt-in** Memory Audit
      Panel; the agent can "summarize what I saved about X" / "draft from my clippings" via HybridRetriever
- [ ] Turn **split-view into a research canvas**: one pane live tabs, the other a local findings board
      aggregating clips from multiple tabs with source attribution + capture LSN; a deterministic export
      produces a **cited Markdown/PDF report** to `~/Downloads`
- [ ] Synthesis is the ONLY model step; collection/arrangement is deterministic and local
      (Atlas screenshots everything; this captures only what you highlight)
- [ ] _Risk:_ highlights/exports may carry PII → local embedding (no PII leaves device), sensitive-site lockout + per-site opt-in, export runs redaction + HITL confirmation before writing to disk

### L7/L9 — First-run "Magic Moment"

- [ ] After the privacy/consent wizard, a one-click import of bookmarks/history from Chrome/Edge; the local SLM,
      **fully on-device**, produces an instant "Here's your browsing in 5 themes" digest, suggests starter
      Watchers ("you check these 3 price pages — watch them?"), and auto-builds Favorites groups
- [ ] Nothing leaves the device; a visible **"computed locally, 0 tokens spent, 0 bytes sent"** badge makes the
      privacy claim tangible; Turkish-first copy
- [ ] _Risk:_ imported history is sensitive → processed only on-device, import opt-in, digest is a local
      projection respecting sensitive-site lockout (no bank/health domains in any shareable digest)

### L10/L8/L9 — Defensive-delight reading lens + "Güven Turu" trust tour

- [ ] A reading-lens overlay using existing AgentThreatShield + Content-Sanitizer signals: badges the current
      page with scam/phishing score, presence of filtered hidden/zero-width/homoglyph content, and a lightweight
      local source-reputation hint; click a badge to see exactly **what was filtered**
- [ ] A persistent **"what does the agent see on this page?"** panel showing the exact sanitized a11y slice sent
      to the model and what was redacted
- [ ] An interactive replayable **"Güven Turu"** onboarding against a bundled sandboxed fixture that triggers
      each safeguard live (a fake injection blocked by the taint tracker, a simulated "delete files" forcing
      HITL, a fake exfil blocked by the egress firewall) — teaches the trust model so users don't disable
      safeguards (the Claude-in-Chrome failure mode)
- [ ] _Risk:_ reputation hints are heuristic/labeled (no false "safe" guarantee per the residual-risk DNA);
      informational — never auto-blocks navigation (stays HITL); the demo is fully sandboxed (bundled fixture,
      never a live site) and journaled as a **tagged demo event** so replay/audit isn't polluted

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/import/export trust boundary; AppError
      contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution trailer**
