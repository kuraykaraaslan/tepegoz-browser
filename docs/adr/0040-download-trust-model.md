# ADR-0040: Download trust model — quarantine by default, nothing trusted until it passes, agent downloads always gated

- **Status:** Accepted (quarantine lifecycle + risk classification + release/HITL gate shipped; the Safe-Browsing URL check is speced here but not yet wired — see Consequences)
- **Date:** 2026-08-28
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic Policy Kernel + HITL) · [ADR-0007](0007-capability-plane-mcp.md) (unified Capability/Tool Plane) · **complements** [ADR-0022](0022-file-operations-sandbox.md) (folder-sandboxed file operations) · [ADR-0004](0004-event-sourced-journal.md) (append-only journal, "shown = recorded")
- **Phase:** [Phase 2c — Classic Browser Essentials & Downloads](../../phases/product/phase-2c-classic-browser-essentials.md), L10 (Safe Downloads + Download Manager)

## Context

A browser that saves files is a browser that can be made to save a hostile file. The agentic layer
sharpens this: the agent can be talked into starting a download by page content it did not write, and
a file it saved and then "opened" would be arbitrary code execution driven by an untrusted planner.

The phase's DoD names the properties this has to have: every download quarantined and hash-checked,
executables/scripts force a human confirm, and an **agent-initiated** download is a distinct, tagged,
journaled security class — never the same thing as a user clicking "Save link as".

Binding constraints are unchanged: a single Policy Enforcement Point (`ToolGateway` → `PolicyKernel`),
the `{domain}_{verb}_{noun}` closed-verb tool-naming rule, secrets never in the renderer, and — from
[ADR-0022](0022-file-operations-sandbox.md) — the agent may not write outside a user-approved folder
boundary. The download path must not become a hole in that boundary.

## Decision

**A download is untrusted until proven otherwise. It lands in a private quarantine directory, is
hash-checked and risk-classified there, and only a `release` — gated by HITL for anything risky or
agent-initiated — moves it into the user's Downloads folder. The agent has no filesystem write; it
can only _ask_ for a download through a Policy-Kernel-gated tool.**

### 1. The quarantine lifecycle (`@tepegoz/downloads` + desktop `DownloadService`)

- The `will-download` handler is registered on **every** browsing session, present and future, as a
  **critical** registration: a session the handler cannot attach to is one no tab may be hosted on,
  because the alternative is a partition where files land unscanned and nothing says so. A download
  from a Phase 5 VPN/Tor-bound tab therefore goes through the exact same path as one from a Direct tab.
- The file is written to `userData/Downloads/quarantine/<id>-<name>` — **not** the user's Downloads
  directory, and not a path the page or the agent can name. Status begins `in_progress`.
- On transfer completion the file is SHA-256'd in place and handed to a `DownloadTrustProvider.check({
sha256, filename, mimeType, sourceOrigin })`, which returns `safe` / `unknown` / `blocked`. The
  record moves to `blocked` (verdict `blocked`) or `quarantined` (anything else). **Nothing reaches
  the user's Downloads folder at this point.**
- `release` is the only transition out of quarantine. It refuses a non-quarantined record, refuses a
  `blocked` verdict outright, then moves the file to the final directory (or through a save dialog
  when `downloadAskEachTime` is set). Cancel/fail/clear are terminal and leave nothing in Downloads.

### 2. Risk classification is filename + MIME, and it is advisory to the gate, not the gate itself

`classifyDownloadRisk` returns `executable` / `script` / `archive` / `normal` from the extension
(`.exe .msi .bat .cmd .com .scr .ps1 .app` → executable; `.js .jse .sh .vbs .wsf` → script;
`.7z .bz2 .gz .rar .tar .xz .zip` → archive) with a MIME cross-check. It never blocks on its own — it
raises the bar for the human gate.

### 3. Agent-initiated downloads are a distinct security class

- `DownloadActor` is `user | agent | site`. Provenance travels with every record: `actor`,
  `sourceUrl`, `sourceOrigin`, and — for an agent download — the run's `correlationId` and `taskId`.
- The agent reaches downloads **only** through the `download_*` Capability-Plane tools behind the PEP
  (`download_create_item` is deny-by-default, HITL for the state-changing save, idempotency-keyed).
  There is no agent filesystem-write path and no way for the agent to set its own `actor` — the host
  stamps `actor: 'agent'` when the call comes through the tool.
- `releaseNeedsApproval(record)` forces a human confirm when **any** of: the trust verdict is
  `blocked` (belt-and-braces — `release` already refuses these), the actor is `agent`, or the risk is
  `executable`/`script`. `commandNeedsApproval(record, 'open')` additionally forces one before opening
  anything that is not both `normal` risk and `safe` verdict. So an agent download of a `.zip` from a
  clean origin still cannot leave quarantine without the human, and `retry` re-enters this whole path
  rather than shortcutting it (see [the 2c retry work](../../phases/product/phase-2c-classic-browser-essentials.md)).

### 4. Everything is journaled, redacted, append-only

`DownloadStarted / Progressed / Quarantined / Blocked / Released / Canceled / Failed` are appended to
the Event Journal with `redacted: true`, carrying the download id, filename, status, risk, verdict,
`sourceOrigin`, `taskId`, byte counts and sha256 — never the local absolute path, never file contents
([ADR-0004](0004-event-sourced-journal.md) "shown = recorded"). Live transfer rate / ETA are
explicitly **not** journaled: they are ephemeral and meaningless after the fact.

### 5. The `DownloadTrustProvider` is a seam; Safe Browsing plugs in there

`check()` is an injected interface, defaulting to `unknownTrustProvider` (returns `unknown`). The
Safe-Browsing integration the DoD calls for is a provider implementation that checks the download's
**source URL / origin** against the same Update-API prefix database the browsing session uses
(`@tepegoz/security-policy` `safe-browsing.ts` — `checkUrl` / `resolveVerdict`), mapping `unsafe` →
`blocked`. Content-hash reputation (Chrome's proprietary download-protection service) is **out of
scope** — the public Safe Browsing API does not offer it, and standing up our own is not a v1 bet.

## Alternatives considered

- **Save straight to Downloads, scan in place, delete on a bad verdict.** Rejected: the file exists at
  a user-reachable path in the window between write and verdict, and a crash in that window leaves it
  there for good — the same reasoning that makes history a guard-on-write, not a delete-on-close.
- **Let the agent write files directly, rely on the folder sandbox ([ADR-0022](0022-file-operations-sandbox.md)).**
  Rejected: a download is a network fetch of attacker-influenced bytes, not an edit of a file the user
  already has. It deserves quarantine + hash + verdict, which the file-ops sandbox does not do.
- **Block executables/scripts entirely for the agent.** Rejected as too blunt — a user watching the
  run may legitimately want the agent to fetch an installer. The HITL confirm keeps the human in the
  loop without a hard "no".
- **A bespoke consent UI for download release.** Rejected: reuse the existing agent HITL modal
  ([ADR-0022 §4](0022-file-operations-sandbox.md)); a `release` by a human on their own screen needs
  no modal at all beyond the risk cases above.

## Consequences

**Positive.** The quarantine directory, risk classification, the `release` gate, the agent security
class, provenance, and the redacted audit are all shipped and unit-tested in `@tepegoz/downloads`
plus the desktop `DownloadService`. The trust boundary is a seam, so wiring Safe Browsing later
changes one injected object and no call sites.

**Negative / accepted.** With `unknownTrustProvider` live, **no download is ever auto-`blocked`
today** — every completed transfer settles as `quarantined` with verdict `unknown`, and the active
protections are the release gate + the risk-class HITL, not an automated threat verdict. This is a
strict subset of the intended behaviour (never a wider one): the gap is "we do not yet consult a
threat list", not "we trust the file".

**Owed, and stated rather than implied.** (1) The Safe-Browsing provider implementation + its prefix
database lifecycle (fetch cadence, update, full-hash resolution, and the privacy question of _where_
those requests egress — they must not become a plaintext feed of the user's downloads to a third
party) is a separate piece of work — **[ADR-0043](0043-safe-browsing-service-and-egress.md) now owns
that decision** (direct to Google Safe Browsing v5, on by default, one Settings switch); the provider
implementation itself is still owed there.
(2) "Community blocklist reuse where present" from the DoD is not implemented. (3) Segmented /
accelerated downloads (IDM-parity) keep the assembled file in quarantine until the whole-file hash is
computed — that invariant is asserted here as a requirement for that future work, so acceleration can
never weaken this path.
