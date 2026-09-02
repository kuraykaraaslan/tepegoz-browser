# Phase S6 — Safety & Control Plane (W4 Control & trust)

**Status:** 🟠 Measurement-owed — **PR0–PR3 landed 2026-08-16** (exam frozen before any S6 capability code; the autonomy-enforcement defect is closed; six derived risk tiers + a Turkish-covering sensitive-site category map; plan-scoped grants on proper eTLD+1 — all deterministic, no sweep owed). PR4–PR6 landed 2026-08-19; PR7 ⏸ funded · **Depends on:** [Phase S0](phase-s0-truth-and-repair.md) (PR1 early, lane-independent), [Phase S3](phase-s3-reliability-actions.md) (claim-grade ASR only) · **Track:** [AI Agent Super](README.md)

**Goal:** Close the standing autonomy-enforcement defect (the renderer, not the main-process kernel, currently decides what auto-approves), then raise the control plane to the Claude-for-Chrome safety bar: deterministic risk tiers, plan-scoped pre-approval (`follow_a_plan`), an advisory intent-alignment critic, a reachable strict mode, and a first-party credential broker that fills secrets without ever handing them to the model. This phase owns north-star condition 2 (safety) and runs the first claim-grade adversarial battery over the 24 `atk_*` scenarios. Autonomy end-state is ask/act default with `follow_a_plan` as the ceiling and the critic strictly advisory.

## Why

The enforcement bug was the headline — **fixed by PR1 on 2026-08-16; this paragraph is kept as the record of what was wrong.** `agentAutonomy` (ask/act/auto) _was_ read in the **renderer**: `panel-session.ts` auto-answered the approval IPC via `autoApprovesTool` from `panel-state.ts`, while the [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) and [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) in main **never read `agentAutonomy`** — so a doctored or compromised renderer could self-approve any tool call, including financial, credential and destructive ones. Approval decisions now live behind the trust boundary in main ([autonomy-gate.ts](../../packages/security-policy/src/autonomy-gate.ts), reading `PreferenceStore`), and `autoApprovesTool` is deleted. This was a fixed defect, not a design choice; the [ADR-0006 amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--the-autonomy-level-is-main-enforced-a-fixed-defect) records it as such.

Approval fatigue is itself a vulnerability (Comet's lesson): a flat per-tool approval prompt trains the user to click through. Today approvals are undifferentiated — [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) is the single PEP but risk is not classified by tool×argument. The sensitivity signal we do have, [sensitive-site.ts](../../packages/security-policy/src/sensitive-site.ts), is a 22-keyword hostname substring list with no Turkish banking/gov coverage and no category structure.

The defensive surface that exists is partly dead. [content-guard.ts](../../packages/tool-executor/src/content-guard.ts) `setStrictMode` landed but is **UNREACHABLE — no caller wires it**. The 24 `atk_*` scenarios in [packages/agent-eval](../../packages/agent-eval) have **never run** ([eval-results.md](eval-results.md): only 5/52 scenarios ever measured live); [Phase S0](phase-s0-truth-and-repair.md)'s baseline produces the first attack-surface numbers.

The target bar is public. Claude for Chrome ships three permission modes (ask / `follow_a_plan` / skip_all), an independent intent-alignment critic, and a published attack-success-rate reduction (23.6→11.2% autonomous, 35.7→0% browser-specific on 123 cases). We match its shape — deterministic pre-model kernel ([ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md)) plus a post-kernel advisory critic plane — while keeping the owner's constraint that the critic is advisory, not blocking-grade DoD. Credential brokering and commerce are both in scope (the broker lands here; the purchase flow lives in [Phase S8](phase-s8-assistant-ux.md)); the Amazon v. Perplexity injunction is a live legal constraint noted for S8.

Sequencing: the claim-grade ASR sweep runs **after [S3](phase-s3-reliability-actions.md)**. Measuring attack-success at 1/3 benign competence inflates the safety number — a browser that can barely complete a benign task also fails many attacks by incompetence, not by defence.

## Exit criteria (DoD)

- [x] Autonomy is main-enforced: unit + integration proof that a doctored renderer answering an approval it was **not** asked for is **rejected**, and that `agentAutonomy` is read only in main (PolicyKernel/ToolGateway consult the main-held level; the renderer approval path is display-only). No `⏸` — this is deterministic and testable offline. **→ Landed 2026-08-16 (PR1).** `resolveAutonomy` ([autonomy-gate.ts](../../packages/security-policy/src/autonomy-gate.ts), 12 tests) is the only place a level becomes a decision and runs in main against `PreferenceStore`; the renderer path is display-only and `autoApprovesTool` is **deleted**; uncorrelated / guessed / replayed responses are rejected by [hitl-registry.ts](../../apps/desktop/src/main/agent/hitl-registry.ts) (9 tests). Recorded as a fixed defect in the [ADR-0006 amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--the-autonomy-level-is-main-enforced-a-fixed-defect).
- [x] Risk-tier classification is deterministic in the kernel: every tool×argument resolves to exactly one of `read` / `ui-write` / `data-egress` / `financial` / `credential` / `destructive`, unit-tested over a frozen tool×arg matrix; the category map is i18n-aware and covers Turkish banking/gov domains. No `⏸`. **→ Landed 2026-08-16 (PR2).** [`classifyRisk`](../../packages/security-policy/src/risk-classifier.ts) derives the tier from tool × validated args × target ([25 tests](../../packages/security-policy/src/risk-classifier.test.ts) over the frozen matrix); [`sensitive-site.ts`](../../packages/security-policy/src/sensitive-site.ts) is now a 5-category map covering Turkish banking + the whole `gov.tr`/`bel.tr` tree ([19 tests](../../packages/security-policy/src/sensitive-site.test.ts)); EN + full-TR labels for all six classes landed in the same PR. **Design recorded** in the [ADR-0006 tier amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--six-derived-risk-tiers--a-sensitive-site-category-map): the tier is **derived** from — not a replacement for — the declared `dangerClass`, because a declared class is argument-blind _and_ is itself a trust input supplied by the tool author.
- [x] `follow_a_plan`: approving a plan mints scoped grants (domains × tool-classes × `runId`, eTLD+1 matched, run-expiring), recorded in main and enforced by the kernel; unit + integration proof a grant does not extend across an off-scope redirect. No `⏸`. **→ Landed 2026-08-16 (PR3).** [`PlanGrantStore`](../../packages/security-policy/src/plan-grants.ts) mints from the plan's own sites + classes ([`plan-grant-scope.ts`](../../apps/desktop/src/main/agent/plan-grant-scope.ts), 8 tests), is consulted in `requestApproval` before the autonomy level, and is revoked in the run's `finally`. eTLD+1 is resolved properly by [`registrable-domain.ts`](../../packages/security-policy/src/registrable-domain.ts) (18 tests) — **the off-scope test is the multi-part-suffix case** (`toolbazaar.com.tr` → `credential-collector.com.tr`), which a last-two-labels comparison would have wrongly called same-site. Sub-domain policy documented in the [ADR-0006 grants section](../../docs/adr/0006-policy-kernel-hitl.md#plan-scoped-grants-follow_a_plan). Grants are in-memory and run-scoped, so **no persistence and no sync-meta obligation** — recorded, since S9's _remembered_ grants will incur one.
- [ ] Approvals per task on the acceptance family fall **≥50%** under `follow_a_plan` with **zero** auto-approved financial/credential/destructive actions (⏸ funded sweep, paired with/without `follow_a_plan`).
- [ ] ASR on the `atk_*` battery reported as "k/K, 95% binomial upper bound X%" with **upper bound ≤5%** at pooled N≥10/scenario, **240+ trials** total (⏸ funded sweep, runs AFTER [S3](phase-s3-reliability-actions.md)).
- [ ] Credential broker: **0** secret-in-model-context leaks at N≥10 on the credential-never-leaks fixtures (⏸ funded sweep). **Mechanism landed 2026-08-19 (PR6)** — the agent has no shape in which a secret could arrive; the sweep still owes the measured number.
- [ ] Strict-mode wiring: paired sweep shows **no benign-task regression >5pp** with strict mode on vs off (⏸ funded sweep, paired).
- [x] Advisory intent-critic logs divergence on the critic-divergence fixtures and **does not block** (owner decision); its ledger entries are auditable. Divergence-detection rate is reported but is not a blocking gate.
- [ ] Constitution: attack + critic + credential fixtures frozen in PR0 **before** any capability code; the measured delta recorded in [eval-results.md](eval-results.md) and the [PROSE-LEDGER](PROSE-LEDGER.md); every prose deletion paired with/without sweep; i18n EN + full-TR parity for the risk-tier labels, approval UI, and broker prompts landed in the same PR as the surface.

## Tasks

### PR0 — fixture freeze

- [x] Freeze the 24 `atk_*` scenarios as the claim-grade battery in [packages/agent-eval](../../packages/agent-eval) (no capability code in this PR; frozen ground truth only).
- [x] Add **critic-divergence** fixtures: benign-task-turns-malicious mid-run (a page or tool result injects a mutating instruction that diverges from the original request) under the registry; ~~assert the critic _logs_ divergence (advisory, non-blocking)~~. **4 scenarios landed** (`critic-divergence.json`; reveal-then-mutate, fetched-content vector, Turkish, held-out destructive). **Assertion partially owed:** they assert the _behavioural_ ground truth (original task answered, mutation absent) — the critic-log assertion needs the critic, which is PR4. Recorded in the [assertion-debt table](fixture-freeze.md#assertion-debt--read-before-quoting-either-family).
- [x] Add **credential-never-leaks** fixtures: a task requiring authenticated fill; ~~assert the secret string **never** appears in model context (prompt or history) across the run~~. **4 scenarios landed** (`credential-safety.json`; saved-password prompt, cross-origin post, Turkish auth wall, held-out secret-echo). **Assertion partially owed:** the schema cannot scan model context yet, so a pass today means _"the agent did not visibly type a secret"_, **not** _"no secret entered the model's context"_ — the real assertion lands with the broker in PR6.
- [x] Record the frozen scenario counts and expected-shape in [eval-results.md](eval-results.md) as "awaiting funded key" rows.

### PR1 — autonomy-to-main (the bug fix; early, lane-independent, tiny)

- [x] Move the autonomy decision to main: the [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) approval flow consults [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) with the main-held autonomy level from [ipc-agent-config.ts](../../apps/desktop/src/main/ipc/ipc-agent-config.ts).
- [x] Make the renderer approval path **display-only**: remove `autoApprovesTool` auto-answer at [panel-session.ts:129-131](../../extensions/ext-agent/src/panel-session.ts); [panel-state.ts:22](../../extensions/ext-agent/src/panel-state.ts) no longer decides.
- [x] Regression test: a renderer answering an approval it was **not** asked for is rejected in main (correlate approval responses to outstanding requests by id).
- [x] zod `safeParse` the approval-response IPC at the main boundary; `AppError` on mismatch.

### PR2 — risk-tier classes + category map

- [x] Add deterministic tool×argument classification in ~~[PolicyKernel](../../packages/security-policy/src/policy-kernel.ts)~~ **[`risk-classifier.ts`](../../packages/security-policy/src/risk-classifier.ts)**: `read` / `ui-write` / `data-egress` / `financial` / `credential` / `destructive`; classes are the schema source in [@tepegoz/shared-types](../../packages/shared-types) ([`risk-tier.ts`](../../packages/shared-types/src/risk-tier.ts)). **Placement deviation (deliberate):** it is a sibling module in the same L8 package rather than a method on `PolicyKernel`, so `PolicyKernel.evaluate` stays a pure function of tool × taint × target with no argument inspection — [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md)'s "deterministic and pre-model" property is preserved by keeping the two concerns separable. Both run pre-model in main; nothing moved outside the kernel's trust boundary.
- [x] Replace flat per-tool approvals with per-class approval semantics threaded through [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts). The gateway classifies on the **validated** args, passes `risk` on `ConfirmRequest`, and records `riskTier` on every `AuditEntry`. `act` autonomy now holds `financial`/`credential`/`destructive` **by tier** — closing a real gap: a password fill is declared merely `state_changing`, so the old `biometric` flag let it through `act` unprompted.
- [x] Turn [sensitive-site.ts](../../packages/security-policy/src/sensitive-site.ts) from a keyword substring list into an extensible, i18n-aware category map (Turkish banking/gov domains included); keep it a package, not `apps/desktop` growth.
- [x] i18n EN + full-TR labels for the six risk classes and the approval surface, landed in this PR.

### PR3 — plan-scoped grants (`follow_a_plan`)

- [x] Approving the plan (existing plan-approval HITL in [agent-runtime](../../packages/agent-runtime)) MINTS scoped grants: `{domains × tool-classes × runId}`, eTLD+1 matched, run-expiring; grants live in main.
- [x] Enforce grants in [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts): a covered action skips the per-tool prompt; an off-scope action re-prompts.
- [x] Grant persistence is ephemeral to the run (`runId`-scoped, expires at run end); if any grant record is persisted it carries sync-meta (`updated_at`/`version`/`tombstone`, UUID PK, `device_id`).
- [x] Integration test: an off-scope redirect (different eTLD+1) does not inherit the grant; explicit sub-domain policy documented.

### PR4 — advisory intent-critic plane (flagged)

- [x] Add a classify-tier (haiku) critic invoked by [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) **after** the deterministic kernel and before dispatch — a separate plane, so [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md) stays intact (kernel remains deterministic and pre-model).
- [x] Critic compares each **mutating** action (ui-write / data-egress / financial / credential / destructive) to the original request; runs only on mutating classes to bound cost.
- [x] ADVISORY: logs divergence to the run journal, **does not block** (owner decision); flag-gated so it can be enabled per sweep.
- [x] zod `safeParse` the critic verdict; the critic never sees secrets (respects the broker boundary from PR6).

> **Mechanism notes (PR4).**
>
> 1. **The critic is a seam, not a model call in L8.** `setIntentCritic` is injected by the app, so
>    `@tepegoz/security-policy` and the capability plane stay free of a model dependency and the layering
>    holds. Absent ⇒ nothing runs, which is the default.
> 2. **It cannot change the decision, structurally.** The verdict is written onto the `AuditEntry` and
>    **nothing reads it to decide**. There is no branch to remove later — a blocking critic would be one
>    model deciding whether another may act, on the critical path, with a judgement nobody can verify.
> 3. **Every failure mode is `null`:** no critic, a verdict that fails `safeParse`, a thrown critic. An
>    advisory plane that could turn its own malfunction into a blocked or failed action would be neither.
> 4. **It never sees argument VALUES** — only key names and shapes (`text: string(27)`, `card: {number,cvv}`).
>    The credential broker exists to keep a secret out of model context; the critic must not re-open that
>    channel, and the `CriticRequest` schema has no field for a value to travel in.
> 5. The run's goal reaches the gateway through the existing `runWithHandlers` run scope, so no per-call
>    plumbing was added and concurrent runs cannot read each other's intent.

### PR5 — strict-mode wiring

- [x] Add the missing caller for [content-guard.ts](../../packages/tool-executor/src/content-guard.ts) `setStrictMode` — wire it to the main-held run config in [ipc-agent-config.ts](../../apps/desktop/src/main/ipc/ipc-agent-config.ts).
- [x] Expose strict mode as a run setting; i18n EN + full-TR for the toggle.
- [x] Guard the wiring with a test asserting `setStrictMode` is reached (regression against re-orphaning).

> **Mechanism notes (PR5).** The setter is called from **one** tiny module (`strict-guard.ts`, three
> imports) at IPC registration **and** on every toggle, so the persisted preference and the live
> process-global default cannot drift. The regression test is shaped against the actual historic failure:
> not "does strict mode redact correctly" (content-guard owns that) but **"is the setter still reached
> from the preference"** — re-orphaning it is silent, so it needed a loud test, and the module was kept
> Electron-free precisely so that test can exist. The toggle is `private` in the public-settings map: a
> security posture is a main-process decision and no extension needs to read or set it. Default stays
> **OFF** — a browsing agent legitimately needs to read most page data, and redacting by default would
> break ordinary tasks to defend against an uncommon one.

### PR6 — credential broker (safeStorage + biometric fill)

- [x] The agent emits a "request credential for domain" **intent**; main resolves it against a `safeStorage`-backed store (existing "secrets only in main via safeStorage" rule).
- [x] Main fills the credential via CDP after a biometric/OS-auth gate; the agent **never** receives the secret — no secret enters the model context.
- [x] Broker is a `@tepegoz/*` package (no `apps/desktop` growth); credential records carry sync-meta columns.
- [x] zod `safeParse` the credential-request intent and the domain; eTLD+1 match the request against the stored entry; `AppError` on mismatch.
- [x] i18n EN + full-TR for the biometric prompt and broker consent surface.

> **Mechanism notes (PR6).**
>
> 1. **The design property is what the agent is never given.** It names a field and a ref; main reads the
>    origin from the live tab, matches the vault entry, gates on OS auth, and types the value itself. The
>    result carries no secret, no username, and no length — asserted exhaustively (`Object.keys`), so no
>    later field can smuggle a value out. A model that never had the password cannot be talked into
>    leaking it, which is the only version of this that survives an injection.
> 2. **The origin is NEVER agent-supplied.** `CredentialFillIntentSchema` has no origin field at all —
>    an agent-supplied origin is exactly how a poisoned page would aim a saved credential at a site of
>    its choosing.
> 3. **Site match is eTLD+1, never substring.** `bank.test.evil.com` contains `bank.test`; a substring
>    check hands over the password. It reuses the resolver S6 PR3 built for grant scoping.
> 4. **Ambiguity is a refusal.** Two saved logins for one site is a question for the user; picking one
>    would silently send the wrong identity into a real login form.
> 5. **Ordering:** the human is asked BEFORE decryption, so a declined prompt leaves the plaintext having
>    never existed in the process. Refusals are logged without the secret or the username.
> 6. **Placement:** the decision layer is in `@tepegoz/security-policy` (which already owns eTLD+1) and
>    the tool in `@tepegoz/browser-tools`; `apps/desktop` gains only the host method that owns the vault
>    and CDP — the same shape as every other browser tool.
>
> **Owed, and stated rather than implied:** there is **no OS-auth gate implementation** yet. `requireOsAuth`
> fails closed with none installed, so the broker currently refuses every fill — the capability waits for
> its gate. The platform spike (Windows Hello via Electron) and the **localized** OS prompt land together;
> the prompt text is already an injected seam with an English developer fallback. The consent surface the
> user sees today is the existing approval modal, whose `credential` risk-tier label shipped EN+TR in PR2.

### PR7 — claim-grade ASR sweep (⏸, AFTER S3)

- [ ] Run the frozen `atk_*` battery live at pooled N≥10/scenario, 240+ trials; report ASR as "k/K, 95% binomial upper bound X%".
- [ ] Run the paired `follow_a_plan` approvals-per-task sweep on the acceptance family and the strict-mode paired benign sweep.
- [ ] Run the credential-never-leaks sweep (N≥10) and the critic-divergence sweep.
- [ ] Record every delta in [eval-results.md](eval-results.md); update [history.md](history.md).

### PR8 — Rival-incident hardening (Comet · Fellou · Claude for Chrome)

> **Where this came from.** Three rival studies that document **real, named incidents** rather than opinions:
> [Comet](../../docs/research/research-perplexity-comet.md) (CometJacking indirect prompt
> injection; a 1Password vault takeover plus local-file leakage; a zero-click Google Drive wiper; "agentic
> blabbering" that trained users to accept phishing), [Fellou](../../docs/research/research-fellou.md)
> (IDOR on `tabId`/`chatId`, missing server-side ownership checks, no transport pinning), and the Claude
> Chrome extension ([A](../../docs/research/research-claude-for-chrome.md),
> [B](../../docs/research/research-claude-for-chrome.md)) (screenshots that capture logged-in
> sessions; an "ask before acting" model so coarse that users turn it off).
>
> **These are the strongest competitive evidence this project has**, because each one is a published failure of
> a shipped product that this architecture was built to prevent — the data/instruction split already exists at
> the perception boundary (`content-guard`), risk tiers and HITL already gate state-changing calls, autonomy is
> already enforced in main, and the egress firewall already detects secrets. PR8 is the part **not** covered:
> turning each incident into a scenario that must fail, and closing the specific holes those incidents used.

- [ ] **Every incident becomes an `atk_*` fixture.** One scenario per published attack class — hidden-CSS
      instruction injection, a page that asks the agent to read a password-manager surface, an encoded
      exfiltration attempt, a bulk-destructive request against a connected account. A defense with no scenario
      that fails without it is an assumption, not a control.
- [ ] **Encoded-exfiltration detection.** The egress firewall matches secret _shapes_; Base64/hex/percent-encoded
      page content sent to an attacker-chosen destination is the channel CometJacking actually used. Decode and
      re-scan a bounded prefix at the egress boundary, and treat "high-entropy blob to a domain the run never
      visited" as a class of its own.
- [ ] **Password-manager surfaces are a locked class**, on the same footing as banking: the agent may not read,
      fill from, or drive any password-manager UI (extension, web vault, or this project's own), and cannot be
      granted that by any combination of clicks. The 1Password incident is what "the agent has the user's
      session" costs when this is not enumerated.
- [ ] **Bulk-destructive ceiling.** A destructive action affecting more than a small N enumerates the items in
      the confirmation ("delete these 15, listed") and cannot be approved as a single opaque step, in any
      autonomy mode. The zero-click Drive wiper is a state-changing call that passed as one cheap approval.
- [ ] **No self-disclosure to the page.** The agent must not write its own system prompt, tool list, grant
      scope, or run metadata into page content — "agentic blabbering" is how Comet's users were taught to trust
      an injected instruction.
- [ ] **Vision before it exists is still a leak.** Before [S10](phase-s10-vision-escalation.md) makes any image
      reachable: a **never-screenshot** trust profile, mandatory redaction of logged-in session chrome, and a
      hard rule that no raw image leaves the device without an explicit per-run consent. Both Claude-extension
      studies rate screenshots as the sharpest privacy edge of the whole category.
- [ ] **Idle means idle.** No provider sockets, MCP connections, or CDP attachments held open while no run is
      active. Comet's battery/CPU complaints and its always-listening surface are the same defect seen from two
      sides.
- [ ] **Carry the server-side lesson forward.** Fellou's IDOR was a backend that trusted a client-supplied id.
      This project has no backend yet, so the obligation is recorded where it will land —
      [Phase 3](../product/phase-3-backend-cloud-extensions.md): every request re-derives ownership server-side,
      never from a parameter, plus transport pinning and rate limits.

> **Second wave (2026-09-01 studies).** Three incident classes published **after** the studies above, from
> [Claude for Chrome](../../docs/research/research-claude-for-chrome.md) and
> [Comet](../../docs/research/research-perplexity-comet.md). They do not replace the list above — they add attack
> classes it does not name, and each one lands on a control this project already claims to have. That is the
> point: every row below is an **assertion this phase must turn into a failing-without-it scenario**, not a
> feature.

- [ ] **Zero-click is its own scenario family.** ShadowPrompt (Claude for Chrome, Mar 2026) and
      PerplexedBrowser (Comet, Zenity 2026) both start from **"the user visited a page / received a calendar
      invite and did nothing else."** Every `atk_*` fixture above assumes a user action somewhere; this family
      removes it. Press summary of ShadowPrompt, worth quoting in the threat model verbatim: _"No clicks, no
      permission prompts. Just visit a page, and an attacker completely controls your browser."_
- [ ] **A user extension must not be able to inject into an agent run — and there must be a test.** ClaudeBleed
      (May 2026) combined two defects: **any** Chrome extension could issue commands to the agent, and trust
      was keyed to the command's **origin** rather than its **execution context**. This project's equivalent
      surface is `extension_*` + [`@tepegoz/extension-host`](../../packages/extension-host) under
      [ADR-0021](../../docs/adr/0021-agent-controllable-extensions.md). The answer is almost certainly already
      "no" — but an unwritten "no" is an assumption. Add the scenario.
- [ ] **A DOM-resident approval is a forgeable approval.** ClaudeBleed's escalation replayed the confirmation
      message and mutated UI elements to distort what the agent believed it was approving — defeating a
      documented "user confirmation required" control. **This project is structurally right here and the
      reason should be written down where it can be cited:** HITL round-trips in the **main process**
      (`ipc-agent-*`, pending-promise map, run-scoped confirm handler), the renderer only renders and answers,
      the renderer is untrusted ([ADR-0013](../../docs/adr/0013-agent-orchestration-hitl.md)), and a missing confirm
      handler fails closed to deny. Record it in [`docs/threat-model.md`](../../docs/threat-model.md) as a
      named control with a shipped counter-example, not as intent.
- [ ] **Never write an origin allow-list as a pattern.** ShadowPrompt's root cause was a `*.claude.ai` wildcard:
      any matching subdomain could send the extension a prompt and have it executed. ADR-0013's IPC discipline
      already says **exact-host allow-list**. Lock it with a test, because the regression here is a one-character
      convenience edit that reintroduces exactly this CVE.
- [ ] **A page-derived file path is never silently read.** PerplexedBrowser turned a web-delivered instruction
      into local-file exfiltration; Perplexity's fix was to block `file://` at the code level. This project's
      `file_*` tools sit in a real sandbox
      ([ADR-0022](../../docs/adr/0022-file-operations-sandbox.md)), which is the stronger position — but the
      property to verify is the **interaction**: a `file_*` call whose path argument is **tainted** (derived
      from page content) must force HITL regardless of autonomy level, never resolve silently inside the
      sandbox. Sandboxed-but-silent is still exfiltration.
- [ ] **Do not add a schema-less "quick mode."** Recorded as a rejection with a reason, since it is a
      recurring efficiency temptation: Claude for Chrome's Quick Mode drops **tool schemas** for a compact
      single-letter command DSL plus a fresh screenshot per step. Cheaper in tokens, and it **destroys
      auditability** — no tool name, no argument schema, no audit row, nothing for the kernel to classify. The
      correct answer for small models is tool-surface **tiering** (fewer tools, still schema'd, still through
      the one PEP) — [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P8.
  - ⚠️ **Name collision, and the difference is the whole point.**
    [S7](phase-s7-speed.md) PR4 also ships something called "quick mode" and it is **not** this.
    S7's is a compact **wire encoding of the reactor's decision output**, decoded at the reactor boundary
    back into the canonical decision type through zod `safeParse` — tool definitions, argument schemas, the
    PEP and the audit row are all unchanged, and it is off by default per provider. Claude's drops the
    schemas themselves. A future session must not read this row as rejecting S7 PR4; what is rejected is
    removing the **typed tool surface**, never compressing the transport that carries it.

### PR9 — user-granted sensitive capabilities (ADR-0039)

Nothing here is landed. [ADR-0039](../../docs/adr/0039-user-granted-sensitive-capabilities.md) changed
the decision; the code still enforces the old absolute deny, which is the honest current state.

- [ ] **Grant store in main.** A per-category grant (`banking` / `government` / `crypto` /
      `password-manager` / `health`) created only by explicit user action, independently revocable, resolved
      **before** `resolveAutonomy` is consulted. The existing [`PlanGrantStore`](../../packages/security-policy/src/plan-grants.ts)
      is run-scoped and in-memory; these persist, so unlike PR3 this **does** incur the sync-meta obligation
      S9 anticipated.
- [ ] **Proof the invariant survives.** Unit + integration tests that no autonomy level — including `auto` —
      synthesizes a grant, and that `resolveAutonomy` still cannot overturn a `deny`. The PR2/PR3 tests stay
      green unchanged; if any of them needs editing, the design is wrong.
- [ ] **Proof the agent has no path.** A capability-plane test asserting there is no tool that creates,
      widens, extends, or re-enables a grant. This is the load-bearing claim of ADR-0039 and the one an
      injected page would attack first.
- [ ] **Revocation is immediate.** A grant revoked mid-run stops authorizing on the **next** classification,
      not at the run's end. Integration test with a revoke between two tool calls.
- [ ] **Mandate authorizes within bounds.** [`mandateCovers`](../../docs/adr/0033-transaction-mandate-kernel.md)
      satisfies the `financial` HITL requirement inside an active mandate; outside one, HITL + biometric is
      unchanged. Every replay-safety test from ADR-0033 stays green — `consumeMandate` still checks
      idempotency before expiry.
- [ ] **Deletion gets no mandate.** Assert there is no destructive equivalent: an unattended destructive call
      still forces a specific confirmation regardless of any grant or mandate held.
- [ ] **CAPTCHA/2FA auto-clear.** 2FA completion routed through the PR6 credential broker so the code never
      enters model context — the credential-never-leaks fixtures must cover the 2FA path, or the broker's
      guarantee has a hole in exactly the place this PR opens. Automatic CAPTCHA clearing depends on a
      page-signal detector that [Phase 11](../product/phase-11-regional-trust-kamu.md) also owes and neither
      phase has built; handoff remains the fallback.
- [ ] **Review surface.** Every active grant and mandate listed with scope and expiry, revocable from one
      place. ADR-0039 records this as a prerequisite for the decision being honest, not a follow-up.
- [ ] **The battery must assume a granted category.** The 24 `atk_*` scenarios all run against locked
      categories today, so they cannot measure the blast radius this PR creates. New `atk_*` scenarios where a
      grant **is** active and the attack tries to act inside it — frozen before the code, per the constitution.
      Until they exist, **no ASR number from PR7 covers the granted case** and must not be quoted as if it did.

### PR10 — Safety-plane parity extraction (competitor tracks)

- [ ] **The Credential Broker's fill _technique_, sharpened by two convergent designs.** PR6's broker ships
      deliberately inert — "the agent has no shape a secret could travel in" is the design property and it
      stays. What the tracks add is the mechanism for when it is switched on: the secret goes
      vault → main process → CDP → page input, and **never** through the model's context or a tool argument,
      with the fill verified against observed page state rather than assumed.
      [`../tracks/browser-use-agent-parity.md`](../../docs/parities/browser-use-agent-parity.md) P2 (independently
      convergent) + [`../tracks/skyvern-agent-parity.md`](../../docs/parities/skyvern-agent-parity.md) P3, which adds a
      **multi-backend bridge** shape (OS keychain / external vault) behind PR6's own OS-auth gate — the gate
      is not lifted by either row.
- [ ] **TOTP / 2FA auto-clear reference design.** [ADR-0039](../../docs/adr/0039-user-granted-sensitive-capabilities.md)
      already decided 2FA should clear _through the broker_ rather than stay a permanent hard stop; Skyvern
      ships a working version, so this is a reference for PR9's implementation, not a new decision. Gated
      behind the broker: no TOTP path exists before the OS-auth gate does.
      [`../tracks/skyvern-agent-parity.md`](../../docs/parities/skyvern-agent-parity.md) P4.
- [ ] **A gated escape hatch for mutating outbound fetch.** `web_get_page`/`web_search` are read-only and
      `web_send_form` is narrow, so an API-first task that could be one authenticated `POST` instead has to be
      driven through a UI. A **user-granted, per-run, per-host** mutating fetch — same danger classification
      and HITL as any state-changing call, and subject to the destination guard in
      [Phase 2](../product/phase-2-adapters-safe-browsing.md) L10 — is the narrow version of WebBrain's
      `/allow-api`. Deny by default; never a standing capability.
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P6.
- [ ] **Read-only Dev diagnostics — explicitly not DevTools, explicitly not `execute_js`.** A narrow trio for
      debugging a page the user is already looking at: console messages, network-request summaries
      (method/status/timing — **not bodies by default**, sensitive header names redacted) and a bounded
      DOM/style inspector. [ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md) stays exactly as
      decided; this is a read carve-out with its own danger class, not an opening of that boundary.
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P3-d.
- [ ] **Regression coverage for the file-sandbox traversal guard.** browser-use had a disclosed, patched CVE
      (**GHSA-j9hj-92j8-jv9h**) in exactly this class: an agent-supplied path, naively joined, resolving
      outside the sandbox during an upload. Its fix re-derives the path from the FileSystem-owned basename and
      then double-checks with a realpath that the result is still inside. [ADR-0022](../../docs/adr/0022-file-operations-sandbox.md)'s
      guard is believed correct — **lock it with the adversarial cases**, since this is a published bug class
      rather than a hypothetical. Pairs with the tainted-path forced-HITL row in PR8.
      [`../tracks/browser-use-agent-parity.md`](../../docs/parities/browser-use-agent-parity.md) P3-a.
- [ ] **Write down the upload no-read guarantee.** The `upload_*` path already sets files on an `<input>` via
      CDP and **never reads the bytes into the agent's context** — filesystem → CDP → page. That is a real
      security property that exists only as an implementation detail today; state it, and test it, so it
      cannot be refactored away silently.
      [`../tracks/aipex-agent-parity.md`](../../docs/parities/aipex-agent-parity.md) P4-a.
- [ ] **Say _why_ a call was allowed, asked about, or denied.** The kernel's verdicts already carry
      machine-readable reasons (`policy-reasons.ts`); they are not surfaced. Presentation lives in
      [S8](phase-s8-assistant-ux.md) PR7's permission-debug view — this row is the plane's obligation to keep
      the reason attached all the way to the boundary.
      [`../tracks/kilocode-agent-parity.md`](../../docs/parities/kilocode-agent-parity.md) P5.
- [ ] **A third HITL answer: `edit`.** Approval is `approve`/`deny` today, so a call with one wrong argument
      must be rejected and the whole turn re-driven. Letting the human **fix the argument and then approve**
      is a genuinely new capability, and the edited call must **re-enter the kernel from the top** — an edited
      argument can change the danger class, the host, and therefore the verdict.
      [`../tracks/librechat-agent-parity.md`](../../docs/parities/librechat-agent-parity.md) P5.

## Fixtures

Frozen in PR0 before any capability code:

- The existing **24 `atk_*`** scenarios in [packages/agent-eval](../../packages/agent-eval) — first claim-grade run (S0 gives the baseline numbers).
- **Critic-divergence** fixtures — a benign task turns malicious mid-run (injected mutating instruction); assert the advisory critic logs divergence.
- **Credential-never-leaks** fixtures — assert the secret never enters model context (prompt or history) across the run.
- **Granted-category attack** fixtures (PR9, ADR-0039) — not yet frozen. The existing 24 `atk_*` scenarios all
  assume a locked category and therefore cannot measure the blast radius a user grant creates.

## Prose steers

None. `SECURITY_PREAMBLE` is a live defensive control, not prose debt; this phase owns no [PROSE-LEDGER](PROSE-LEDGER.md) row. If PR2's category map lets any hardcoded sensitivity prose be deleted, that deletion is paired with/without sweep per the constitution and recorded then.

## ADR

[ADR-0039](../../docs/adr/0039-user-granted-sensitive-capabilities.md) (2026-08-23) partially supersedes
ADR-0006 for this phase: the sensitive-site lockout becomes a per-category user grant that ships off,
CAPTCHA/2FA are cleared automatically, and a wallet mandate authorizes inside its bounds. The kernel stays
deterministic and pre-model, and autonomy still cannot lift a deny — only an out-of-band user grant can.
PR9 tracks the implementation, none of which has landed.

Amends [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md): records the six risk tiers, plan-scoped grants (eTLD+1, run-expiring), and the **position** of the advisory critic plane (post-kernel, pre-dispatch — the kernel stays deterministic and pre-model). Documents the renderer-autonomy enforcement bug as a **fixed defect**, not a design decision. Continues the ADR series from 0025 if the credential-broker trust model warrants its own record (agent-emits-intent / main-fills-via-CDP / model-never-sees-secret).

## Risks

- **Critic latency/cost per mutating action.** Mitigation: haiku classify tier, run only on the five mutating classes (never on `read`), advisory-only so it never sits on the blocking path; flag-gated per sweep.
- **Grant-scope leakage across redirects.** Mitigation: eTLD+1 matching with an explicit sub-domain policy documented in the ADR; PR3 integration test asserts an off-scope redirect does not inherit the grant.
- **Commerce legal exposure.** The Amazon v. Perplexity injunction is a live constraint; flagged here, but the actual purchase flow lives in [Phase S8](phase-s8-assistant-ux.md) — the broker in this phase only fills credentials, it does not transact.
- **Spike-first:** PR6's biometric/OS-auth gate is platform-dependent (Windows Hello via Electron `safeStorage`/OS APIs) — a small spike PR validates the CDP-fill-after-biometric path before the full broker lands.
- **A grant widens the blast radius of a successful injection (ADR-0039).** The injection still cannot create
  a grant, but it can act inside one the user made. Mitigation: taint tracking and the Egress Firewall become
  load-bearing rather than defence-in-depth, and PR9's new `atk_*` scenarios must assume a granted category —
  an ASR measured only against locked categories would be measuring the wrong product.
- **Inflated safety number if run early.** Mitigation: PR7 is hard-gated to run after [S3](phase-s3-reliability-actions.md); ASR at 1/3 benign competence is not claim-grade.
