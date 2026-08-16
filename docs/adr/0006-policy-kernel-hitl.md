# ADR-0006: Deterministic Policy Kernel + HITL (security-by-design)

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
Every competitor was breached through the model layer: prompt injection (CometJacking, ShadowPrompt)
and excessive agency (1Password vault takeover, zero-click Drive wipe, `file://` leakage). Relying on
model guardrails is insufficient — "polite" phrasing bypasses them.

## Decision
Security is enforced by a **deterministic Policy Kernel that runs BEFORE the model**, not by model
guardrails. Tool calls are classified (`read` / `state_changing` / `destructive` / `financial`);
web-derived data is **tainted** ("untrusted read-only payload"); tainted + state-changing → forced
**HITL** (explicit confirmation, Windows Hello for high-risk). A single **Capability Broker** is the
only path from agent to tools (least-privilege). Sensitive sites (bank/crypto/health/password
managers) are locked out of automation by default. An Egress Firewall blocks exfiltration. LLM
tool-call arguments are treated as untrusted input and zod-validated.

## Consequences
- The whole critical-vulnerability class is closed in deterministic code, model-independent.
- Some autonomy is intentionally gated; UX mitigates with scoped trust profiles + reason codes to
  avoid permission fatigue.
- The same engine evaluates the prompt/rules policy IR (sealed, one-way narrowing) — see ADR-0007.

## Amendment 2026-08-16 — the autonomy level is main-enforced (a fixed defect)

Recorded by [S6-PR1](../../phases/ai-agent-super/phase-s6-safety-control-plane.md). **This documents a
defect that was fixed, not a decision that was taken** — the behaviour below was never intended by this
ADR, and the record exists so it cannot be mistaken for a design choice or reintroduced.

**The defect.** The kernel classified correctly and asked for confirmation, but the *answer* was decided
in the **renderer**: `autoApprovesTool` in the agent panel auto-answered the approval IPC from a
renderer-held `agentAutonomy` value. The kernel and the tool gateway never read `agentAutonomy` at all.
A doctored or compromised renderer could therefore approve its own `financial`, `credential` and
`destructive` calls — routing around the very gate this ADR establishes. The deterministic pre-model
kernel was sound; the decision had simply escaped the trust boundary behind it.

**The rule this ADR now states explicitly.** The renderer is untrusted. It may **display** an approval
and **relay** a human's click; it may never **decide** one. Every input to a security decision is read
in main, from main-held state.

Concretely:

- `AgentAutonomy` is defined in `@tepegoz/shared-types` (the single schema source), not in a UI package.
- `resolveAutonomy` (`@tepegoz/security-policy`) is the only place an autonomy level becomes a decision,
  and it runs in main against `PreferenceStore`.
- **Autonomy can only skip a prompt the kernel raised — it can never overturn a `deny`.** The
  sensitive-site lockout and every other denial stay absolute at all levels.
- **Biometric survives every level except explicit `auto`**: `act` auto-approves routine work but still
  stops for anything the kernel marked high-risk.
- Unknown or reserved levels (including `dangerous`) **fail safe to prompting**, never to more autonomy.
- When autonomy auto-approves, main resolves the request **without sending the IPC at all** — there is
  no outstanding request for a renderer to answer on the user's behalf.
- HITL ids are `randomUUID`, not sequential; responses are correlated against outstanding requests in
  main and settled exactly once, so an uncorrelated, guessed, or replayed response is rejected.

The autonomy gate deliberately sits **outside** the kernel: `PolicyKernel.evaluate` stays a pure
function of tool × taint × target, with no notion of user preference, so this ADR's "deterministic and
pre-model" property is preserved intact.

## Amendment 2026-08-16 — six derived risk tiers + a sensitive-site category map

Recorded by [S6-PR2](../../phases/ai-agent-super/phase-s6-safety-control-plane.md). This ADR's original
classification (`read` / `state_changing` / `destructive` / `financial`) is a **declared** class: the
tool author supplies it at registration, and it cannot see arguments. That is too coarse for consent.
Typing into a search box and typing into a password field are the same declared class, so a flat
per-tool prompt has to describe both as *"a tool wants to change state"* — and an undifferentiated
prompt is what trains a user to click through. Approval fatigue is itself a vulnerability.

**Decision: keep `dangerClass`, add a derived `RiskTier`.** Every gated call is classified in main into
exactly one of six tiers — `read` / `ui-write` / `data-egress` / `financial` / `credential` /
`destructive` (`@tepegoz/shared-types`, the single schema source) — by `classifyRisk`
(`@tepegoz/security-policy`) from the tool **and its validated arguments and target**.

- The declared `dangerClass` is the **floor**; rules can only raise it. **Highest applicable tier
  wins**, so adding a rule can only tighten a classification, never loosen one.
- Deriving rather than replacing matters twice over. A declared class is argument-blind. And it is a
  **trust input** — an extension author, possibly a compromised one, picks it — whereas the derived
  tier is computed in main from the call itself, so a tool that lies about its class is still
  classified on its behaviour.
- Replacing the enum was rejected on top of that: `dangerClass` has ~75 declaration sites across
  packages and extensions, and a wide migration would have bought none of the argument sensitivity
  that was the actual point.
- Classification is pure and deterministic — string and URL tests over already-`safeParse`d args,
  never executed or interpreted — and is frozen in a tool × argument matrix test, so any change to a
  row is a visible diff.
- `act` autonomy now holds `financial` / `credential` / `destructive` **by tier**. The previous
  `biometric` flag followed the declared class, so filling a password field — declared merely
  `state_changing` — used to pass straight through `act`. `auto` is unchanged: it is the level the
  user explicitly chose.

### Plan-scoped grants (`follow_a_plan`)

Approving a plan mints a **grant**: one informed consent covering the routine steps that plan implies,
so the prompts that remain are the ones that deserve a human. A grant is narrow on three axes at once —
**registrable domains** (eTLD+1), **risk tiers the plan actually contained**, and **`runId`** — and is
revoked in the run's `finally`, so it cannot outlive its task. Being run-scoped and in-memory, it is
never persisted; there is no user data at rest and therefore no sync-meta obligation. (Should S9's
*remembered* grants persist one, that record is new user data and must carry `updated_at` / `version` /
`tombstone`, a UUID PK and `device_id`.)

Three things a grant can never do, enforced in the store rather than left to callers: cover `financial`
/ `credential` / `destructive`; overturn a `deny`; or widen after minting — an off-scope action
re-prompts, it does not extend the grant. An approved plan that contains a payment step still grants its
routine steps, and the payment step still prompts.

**Scope boundary: the registrable domain, resolved properly.** Comparing the last two labels of a
hostname — which an earlier draft of the classifier did — is wrong in the *unsafe* direction for
multi-part suffixes: `garanti.com.tr` and `evil.com.tr` both reduce to `com.tr` and would count as the
same site, so one grant would span every `.com.tr` domain in existence, and the cross-site egress signal
would be suppressed on exactly the domains this product cares most about. Resolution uses a **bounded
suffix list** rather than the full Public Suffix List (~10k entries, a moving target, a supply-chain and
freshness liability on a boundary that must be deterministic and auditable); every call site is
**fail-closed**, so an unrecognised suffix yields a narrower-or-equal answer and at worst costs a
prompt.

**Sub-domain policy (explicit):** sub-domains of one registrable domain are the same site —
`accounts.example.com` and `www.example.com` share a grant. Sites genuinely deploy login and checkout on
separate labels, and the boundary an attacker controls is the registrable domain, not the label in front
of it.

**The sensitive-site lockout becomes an extensible category map** (`banking` / `government` / `crypto` /
`password-manager` / `health`) instead of a flat keyword list, for two reasons. A match now carries a
**category**, so a lockout can be explained rather than merely imposed. And the v1 list was entirely
English/US-centric: `garanti.com.tr`, `turkiye.gov.tr`, `sgk.gov.tr` and every other Turkish bank and
public service matched **nothing**, leaving the most sensitive category of site for this product's
primary market silently unlocked. Matching stays hostname-based and over-matching remains the safe
direction; absence from the map is still not a claim that a site is safe.
